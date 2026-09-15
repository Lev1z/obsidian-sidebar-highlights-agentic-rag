// {}做占位符，告诉LangChain模板长这个样
import { TFile, Vault } from 'obsidian';
import { PromptTemplate } from '@langchain/core/prompts';
import { AIRequestError, OpenAICompatibleClient } from './OpenAICompatibleClient';
import { FileFilterRule, isExcludedMarkdownPath } from '../utils/file-filter';
import { keywordRetrievalStrategy, tokenizeKeywordText } from './retrieval/keyword-retrieval';
import { RetrievalDocument, RetrievalResult } from './retrieval/retrieval-types';

export type { RetrievalResult } from './retrieval/retrieval-types';

export interface AgentStatusUpdate {
    phase: 'thought' | 'action' | 'observation';
    text: string;
}

export interface AgentWorkflowInput {
    selectedText: string;
    query: string;
    lengthMode: 'short' | 'medium';
    vault: Vault;
    // onStatus：实时通讯管道
    onStatus?: (status: AgentStatusUpdate) => void;
    signal?: AbortSignal;
}

export interface AgentWorkflowResult {
    finalAnswer: string;
    prerequisites: string[];
    retrievals: RetrievalResult[];
    usedFallback?: boolean;
    fallbackReason?: string;
}

export interface AIConnectionCheckResult {
    ok: boolean;
    message: string;
}

interface AIServiceConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
    maxFilesToScan?: number;
    topK?: number;
    requestTimeoutMs?: number;
    maxRetries?: number;
    fileFilters?: FileFilterRule[];
    excludeExcalidraw?: boolean;
}

export class AIService {
    private config: AIServiceConfig;
    private client: OpenAICompatibleClient;

    // 构造函数
    constructor(config: AIServiceConfig) {
        this.config = {
            // ...展开运算符，快速创建新对象，保留config的所有内容
            ...config,
            maxFilesToScan: config.maxFilesToScan ?? 200, // ??：空值合并，没传参数就取右边值
            topK: config.topK ?? 6,
            fileFilters: config.fileFilters ?? [],
            excludeExcalidraw: config.excludeExcalidraw ?? true
        };
        this.client = new OpenAICompatibleClient(this.config);
    }

    updateConfig(config: Partial<AIServiceConfig>): void {
        this.config = {
            ...this.config,
            ...config
        };
        this.client.updateConfig(config);
    }

    hasApiKey(): boolean {
        // ?.：可选链操作符，左边有值就继续执行.trim()，否则停住返回undefined
        // .trim()：去掉空格 
        // !!：强制转为布尔值
        return !!this.config.apiKey?.trim();
    }

    /**
     * Run the same local retrieval used by the agent without calling a model.
     * This public boundary keeps evaluation and regression tests deterministic.
     */
    async searchNotes(
        query: string,
        vault: Vault,
        options?: { maxFilesToScan?: number; topK?: number }
    ): Promise<RetrievalResult[]> {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            return [];
        }
        return this.retrieveRelevantContext(normalizedQuery, vault, options);
    }

    // async异步处理，Promise保证返回符合<此格式>的结果
    async checkConnection(): Promise<AIConnectionCheckResult> {
        if (!this.hasApiKey()) {
            return {
                ok: false,
                message: 'AI API Key 未配置，当前会走本地 fallback 模板。'
            };
        }

        try {
            const prompt = '请回复 OK';
            // await：等待后方这个返回Promise的函数
            const response = (await this.callChatCompletionWithOptions(prompt, {
                systemPrompt: 'You are a test assistant. Reply with one short word.',
                temperature: 0
            })).trim();

            if (!response) {
                return {
                    ok: false,
                    message: '连接成功但模型返回空内容，请检查模型名是否可用。'
                };
            }

            return {
                ok: true,
                message: `连接成功，模型响应: ${response.slice(0, 60)}`
            };
        } catch (error) {
            // ts的类型检查
            const message = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                message: `连接失败: ${message}`
            };
        }
    }

    async getExplanation(text: string, vault: Vault): Promise<string> {
        const highlightedText = text.trim();
        if (!highlightedText) {
            return '';
        }

        const retrievals = await this.retrieveRelevantContext(highlightedText, vault);
        const context = this.formatContext(retrievals);

        const promptTemplate = PromptTemplate.fromTemplate(
            '你是一个助手。基于以下上下文：\n{context}\n\n请简要解释词汇：{highlightedText}。请给出 Short, Medium, Long 三种长度的解释。'
        );

        const prompt = await promptTemplate.format({
            context,
            highlightedText
        });

        // If API key is not configured, return a deterministic local fallback.
        if (!this.config.apiKey) {
            return this.buildLocalFallback(highlightedText, retrievals);
        }

        try {
            // prompt传给callChatCompletion()
            const responseText = await this.callChatCompletion(prompt);
            if (!responseText.trim()) {
                return this.buildLocalFallback(highlightedText, retrievals);
            }
            return responseText.trim();
        } catch (error) {
            console.error('AIService.getExplanation failed, using fallback:', error);
            return this.buildLocalFallback(highlightedText, retrievals);
        }
    }

    async runAgenticWorkflow(input: AgentWorkflowInput): Promise<AgentWorkflowResult> {
        const selectedText = input.selectedText.trim();
        const userQuery = input.query.trim();
        const goal = `${selectedText}\n${userQuery}`.trim();

        if (!goal) {
            return {
                finalAnswer: '',
                prerequisites: [],
                retrievals: [],
                usedFallback: false
            };
        }

        const status = input.onStatus;
        const emit = (phase: AgentStatusUpdate['phase'], text: string): void => {
            if (!status) return;
            try {
                status({ phase, text }); // 把状态传给UI
            } catch (error) {
                console.warn('AIService status callback failed:', error);
            }
        };

        try {
            const hasApiKey = this.hasApiKey();
            // 没API用兜底模式
            if (!hasApiKey) {
                emit('observation', 'No API key configured. I can reason with local retrieval and return fallback answer.');
                const fallbackQueries = this.buildSearchQueryFallback(selectedText, userQuery);
                const coreConcept = this.deriveCoreConceptFromQueries(fallbackQueries, selectedText, userQuery);
                const retrievals = await this.retrieveByQueries(fallbackQueries, input.vault, {
                    topK: Math.max(this.config.topK ?? 6, 8),
                    maxFilesToScan: this.config.maxFilesToScan
                }).catch(() => []);

                emit('thought', '当前未配置 API Key，已使用本地检索和通用兜底策略生成结果。');
                emit('observation', `本地检索命中 ${retrievals.length} 条。`);

                const prerequisites = this.buildPrerequisiteFallback(coreConcept, userQuery);
                const fallbackText = this.buildLocalFallback(coreConcept, retrievals);
                const finalAnswer = input.lengthMode === 'short'
                    ? this.extractLabeledSegment(fallbackText, 'Short')
                    : this.extractLabeledSegment(fallbackText, 'Medium');

                return {
                    finalAnswer,
                    prerequisites,
                    retrievals,
                    usedFallback: true,
                    fallbackReason: 'missing_api_key'
                };
            }

            // 有API进入正式Agent模式
            const workflow = await this.runUniversalToolCallingWorkflow(
                selectedText,
                userQuery,
                input.lengthMode,
                input.vault,
                emit,
                input.signal
            );

            return {
                finalAnswer: workflow.finalAnswer,
                prerequisites: workflow.prerequisites,
                retrievals: workflow.retrievals,
                usedFallback: false
            };
        } catch (error) {
            if (error instanceof AIRequestError && error.code === 'aborted') {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            emit('observation', `Workflow error: ${message}. Falling back to local answer.`);

            const fallbackQueries = this.buildSearchQueryFallback(selectedText, userQuery);
            const coreConcept = this.deriveCoreConceptFromQueries(fallbackQueries, selectedText, userQuery);
            const retrievals = await this.retrieveByQueries(fallbackQueries, input.vault, {
                topK: this.config.topK,
                maxFilesToScan: this.config.maxFilesToScan
            }).catch(() => []);

            const prerequisites = this.buildPrerequisiteFallback(coreConcept, userQuery);
            const fallbackText = this.buildLocalFallback(coreConcept, retrievals);
            const finalAnswer = input.lengthMode === 'short'
                ? this.extractLabeledSegment(fallbackText, 'Short')
                : this.extractLabeledSegment(fallbackText, 'Medium');

            return {
                finalAnswer,
                prerequisites,
                retrievals,
                usedFallback: true,
                fallbackReason: `workflow_error:${message}`
            };
        }
    }

    // 学多吃不透，先看到这了:0
    private async runUniversalToolCallingWorkflow(
        selectedText: string,
        userQuery: string,
        lengthMode: 'short' | 'medium',
        vault: Vault,
        emit: (phase: AgentStatusUpdate['phase'], text: string) => void,
        signal?: AbortSignal
    ): Promise<{ finalAnswer: string; prerequisites: string[]; retrievals: RetrievalResult[] }> {
        const retrievalMap = new Map<string, RetrievalResult>();
        const noteSnapshots = new Map<string, string>();
        const traces: string[] = [];
        const maxSteps = 6;

        for (let step = 1; step <= maxSteps; step++) {
            const prompt = this.buildToolCallingStepPrompt(
                selectedText,
                userQuery,
                lengthMode,
                step,
                maxSteps,
                traces,
                [...retrievalMap.values()],
                [...noteSnapshots.entries()].map(([path, content]) => ({ path, content }))
            );

            const raw = await this.callChatCompletionWithOptions(prompt, {
                systemPrompt: this.buildUniversalAgentSystemPrompt(),
                temperature: 0.2,
                signal
            });
            const decision = this.parseToolDecision(raw);

            if (decision.thought) {
                emit('thought', decision.thought);
            }

            if (decision.type === 'tool_call' && decision.toolName === 'search_notes') {
                const keywords = (decision.toolArgs.keywords || decision.toolArgs.query || `${selectedText} ${userQuery}`).trim();
                emit('action', `search_notes(keywords="${keywords}")`);

                const results = await this.vaultSearchTool(keywords, vault, {
                    topK: Math.max(this.config.topK ?? 6, 8),
                    maxFilesToScan: this.config.maxFilesToScan
                });
                this.mergeRetrievalResults(retrievalMap, results);

                const observation = this.formatSearchObservation(keywords, results);
                traces.push(`Tool search_notes("${keywords}") => ${observation}`);
                emit('observation', observation);
                continue;
            }

            if (decision.type === 'tool_call' && decision.toolName === 'get_note_content') {
                const path = (decision.toolArgs.path || decision.toolArgs.filePath || '').trim();
                emit('action', `get_note_content(path="${path}")`);

                const note = await this.getNoteContentTool(path, vault);
                if (note.ok) {
                    noteSnapshots.set(note.path, note.content);
                }

                traces.push(`Tool get_note_content("${path}") => ${note.message}`);
                emit('observation', note.message);
                continue;
            }

            const retrievals = [...retrievalMap.values()]
                .sort((a, b) => b.score - a.score)
                .slice(0, Math.max(this.config.topK ?? 6, 8));
            let finalAnswer = (decision.finalAnswer || '').trim();
            if (!finalAnswer) {
                const concept = this.deriveCoreConceptFromQueries(
                    this.buildSearchQueryFallback(selectedText, userQuery),
                    selectedText,
                    userQuery
                );
                const fallbackText = this.buildLocalFallback(concept, retrievals);
                finalAnswer = lengthMode === 'short'
                    ? this.extractLabeledSegment(fallbackText, 'Short')
                    : this.extractLabeledSegment(fallbackText, 'Medium');
            }

            if (retrievals.length === 0 && !finalAnswer.includes('本地笔记未提供相关信息')) {
                finalAnswer = `${finalAnswer}\n\n本地笔记未提供相关信息，我已基于通用知识进行解释。`;
            }

            const concept = this.deriveCoreConceptFromQueries(
                this.buildSearchQueryFallback(selectedText, userQuery),
                selectedText,
                userQuery
            );
            const parsedPrerequisites = this.sanitizePrerequisites(decision.prerequisites, concept);
            const prerequisites = this.buildPrerequisitesFromFallback(parsedPrerequisites, concept, userQuery);

            return {
                finalAnswer,
                prerequisites: prerequisites.slice(0, 3),
                retrievals
            };
        }

        const fallbackQueries = this.buildSearchQueryFallback(selectedText, userQuery);
        const coreConcept = this.deriveCoreConceptFromQueries(fallbackQueries, selectedText, userQuery);
        const retrievals = await this.retrieveByQueries(fallbackQueries, vault, {
            topK: this.config.topK,
            maxFilesToScan: this.config.maxFilesToScan
        }).catch(() => []);

        return {
            finalAnswer: this.buildToollessFallback(coreConcept, lengthMode, retrievals),
            prerequisites: this.buildPrerequisiteFallback(coreConcept, userQuery),
            retrievals
        };
    }

    private buildUniversalAgentSystemPrompt(): string {
        return [
            '你是一个全能知识助手。用户高亮了一段文字并提出了问题。',
            '你的任务是利用用户的本地笔记提供深度解释。',
            '你可以调用的工具只有两个：',
            '1) search_notes(keywords): 在知识库里做模糊检索',
            '2) get_note_content(path): 读取某篇笔记全文',
            '工作流程：分析领域 -> 必要时检索 -> 判断相关性 -> 无关就忽略 -> 本地无信息则诚实说明并使用通用知识。',
            '最终输出必须包含：深度解释 + 3 个前置知识点（DFS）。',
            '每一轮你都必须只输出 JSON，不要输出其他文字。'
        ].join('\n');
    }

    private buildToolCallingStepPrompt(
        selectedText: string,
        userQuery: string,
        lengthMode: 'short' | 'medium',
        step: number,
        maxSteps: number,
        traces: string[],
        retrievals: RetrievalResult[],
        notes: Array<{ path: string; content: string }>
    ): string {
        const retrievalSummary = retrievals.length === 0
            ? '无检索结果'
            : retrievals
                .slice(0, 8)
                .map((item, idx) => `${idx + 1}. ${item.filePath} | score=${item.score.toFixed(2)}\n${item.snippet.slice(0, 260)}`)
                .join('\n\n');

        const noteSummary = notes.length === 0
            ? '无全文读取结果'
            : notes
                .slice(0, 3)
                .map((item, idx) => `${idx + 1}. ${item.path}\n${item.content.slice(0, 1500)}`)
                .join('\n\n');

        const traceSummary = traces.length === 0
            ? '暂无历史动作'
            : traces.slice(-6).join('\n');

        const lengthRule = lengthMode === 'short'
            ? '最终回答用 2-3 句话，信息密度高。'
            : '最终回答用 4-7 句话，并给一个简短例子。';

        return [
            `Step: ${step}/${maxSteps}`,
            '请在本轮只做一个决策：调用一个工具，或者直接给最终答案。',
            '',
            `Selected text: ${selectedText || '（空）'}`,
            `User query: ${userQuery || '（空）'}`,
            `Length rule: ${lengthRule}`,
            '',
            'Tool history:',
            traceSummary,
            '',
            'Search results summary:',
            retrievalSummary,
            '',
            'Loaded note content summary:',
            noteSummary,
            '',
            '只允许返回以下 JSON 结构之一：',
            '{"type":"tool_call","thought":"...","tool_name":"search_notes","tool_args":{"keywords":"..."}}',
            '{"type":"tool_call","thought":"...","tool_name":"get_note_content","tool_args":{"path":"..."}}',
            '{"type":"final","thought":"...","final_answer":"...","prerequisites":["...","...","..."]}',
            '如果本地笔记无相关信息，final_answer 中必须明确出现“本地笔记未提供相关信息”。',
            '不要输出 Markdown，不要输出代码块，只返回单个 JSON 对象。'
        ].join('\n');
    }

    private parseToolDecision(raw: string): {
        type: 'tool_call' | 'final';
        thought: string;
        toolName: 'search_notes' | 'get_note_content' | null;
        toolArgs: Record<string, string>;
        finalAnswer: string;
        prerequisites: string[];
    } {
        try {
            const obj = this.parseJsonObjectFromModel(raw);
            const typeRaw = String(obj.type || '').toLowerCase();
            const thought = String(obj.thought || '').trim();
            const toolName = this.normalizeToolName(String(obj.tool_name || '').trim());

            const rawToolArgs = typeof obj.tool_args === 'object' && obj.tool_args
                ? obj.tool_args as Record<string, unknown>
                : {};
            const toolArgs: Record<string, string> = {};
            for (const [key, value] of Object.entries(rawToolArgs)) {
                if (value === null || value === undefined) continue;
                toolArgs[key] = String(value).trim();
            }

            const prerequisites = Array.isArray(obj.prerequisites)
                ? obj.prerequisites.map(item => String(item).trim()).filter(Boolean)
                : [];

            if (typeRaw === 'tool_call' && toolName) {
                return {
                    type: 'tool_call',
                    thought,
                    toolName,
                    toolArgs,
                    finalAnswer: '',
                    prerequisites
                };
            }

            return {
                type: 'final',
                thought,
                toolName: null,
                toolArgs,
                finalAnswer: String(obj.final_answer || '').trim(),
                prerequisites
            };
        } catch {
            return {
                type: 'final',
                thought: '模型返回了非结构化输出，直接作为最终答案处理。',
                toolName: null,
                toolArgs: {},
                finalAnswer: raw.trim(),
                prerequisites: []
            };
        }
    }

    private parseJsonObjectFromModel(raw: string): Record<string, unknown> {
        const cleaned = raw.trim();
        const withoutFence = cleaned.startsWith('```')
            ? cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
            : cleaned;

        try {
            return JSON.parse(withoutFence) as Record<string, unknown>;
        } catch {
            const firstBrace = withoutFence.indexOf('{');
            const lastBrace = withoutFence.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace <= firstBrace) {
                throw new Error('No JSON object found');
            }

            const sliced = withoutFence.slice(firstBrace, lastBrace + 1);
            return JSON.parse(sliced) as Record<string, unknown>;
        }
    }

    private normalizeToolName(name: string): 'search_notes' | 'get_note_content' | null {
        const lower = name.toLowerCase();
        if (lower === 'search_notes') {
            return 'search_notes';
        }
        if (lower === 'get_note_content') {
            return 'get_note_content';
        }
        return null;
    }

    private mergeRetrievalResults(target: Map<string, RetrievalResult>, additions: RetrievalResult[]): void {
        for (const item of additions) {
            const existing = target.get(item.filePath);
            if (!existing || item.score > existing.score) {
                target.set(item.filePath, item);
            }
        }
    }

    private async getNoteContentTool(
        inputPath: string,
        vault: Vault
    ): Promise<{ ok: boolean; path: string; content: string; message: string }> {
        const requestedPath = inputPath.trim().replace(/^['"]|['"]$/g, '');
        if (!requestedPath) {
            return {
                ok: false,
                path: '',
                content: '',
                message: 'get_note_content 缺少 path 参数。'
            };
        }

        if (this.isFileExcluded(requestedPath)) {
            return {
                ok: false,
                path: requestedPath,
                content: '',
                message: `笔记被文件过滤规则排除: ${requestedPath}`
            };
        }

        const abstractFile = vault.getAbstractFileByPath(requestedPath);
        if (!(abstractFile instanceof TFile)) {
            return {
                ok: false,
                path: requestedPath,
                content: '',
                message: `未找到笔记: ${requestedPath}`
            };
        }

        try {
            const content = (await vault.cachedRead(abstractFile)).replace(/\r\n/g, '\n');
            const clipped = content.slice(0, 6000);
            return {
                ok: true,
                path: abstractFile.path,
                content: clipped,
                message: `已读取 ${abstractFile.path}，内容长度 ${content.length}`
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                path: abstractFile.path,
                content: '',
                message: `读取失败 ${abstractFile.path}: ${message}`
            };
        }
    }

    private formatSearchObservation(keywords: string, results: RetrievalResult[]): string {
        if (results.length === 0) {
            return `search_notes("${keywords}") 无命中。`;
        }

        const top = results
            .slice(0, 3)
            .map(item => `${item.filePath}(${item.score.toFixed(1)})`)
            .join(' | ');
        return `search_notes("${keywords}") 命中 ${results.length} 条，Top: ${top}`;
    }

    private buildToollessFallback(
        coreConcept: string,
        lengthMode: 'short' | 'medium',
        retrievals: RetrievalResult[]
    ): string {
        const fallback = this.buildLocalFallback(coreConcept, retrievals);
        const extracted = lengthMode === 'short'
            ? this.extractLabeledSegment(fallback, 'Short')
            : this.extractLabeledSegment(fallback, 'Medium');

        if (retrievals.length === 0 && !extracted.includes('本地笔记未提供相关信息')) {
            return `${extracted}\n\n本地笔记未提供相关信息，我已基于通用知识进行解释。`;
        }

        return extracted;
    }

    private buildPrerequisitesFromFallback(
        parsed: string[],
        coreConcept: string,
        query: string
    ): string[] {
        if (parsed.length >= 3) {
            return parsed.slice(0, 3);
        }

        const fallback = this.buildPrerequisiteFallback(coreConcept, query);
        return this.sanitizePrerequisites([...parsed, ...fallback], coreConcept).slice(0, 3);
    }

    private async generateSearchQueries(selectedText: string, userQuery: string): Promise<string[]> {
        const fallback = this.buildSearchQueryFallback(selectedText, userQuery);
        if (!this.hasApiKey()) {
            return fallback;
        }

        const promptTemplate = PromptTemplate.fromTemplate(
            [
                '你是资深 AI 检索工程师。',
                '请根据用户高亮文本与提问，生成 3 条可用于知识库检索的 Search Queries。',
                '要求：',
                '1) 查询要有技术深度，覆盖定义、机制、工程实践或边界条件。',
                '2) 避免空泛词，优先保留关键术语（可中英混合）。',
                '3) 必须严格返回 JSON：{{"queries":["...","...","..."]}}',
                '4) 不要输出任何额外文字。',
                '',
                'Selected text: {selectedText}',
                'User query: {userQuery}'
            ].join('\n')
        );

        const prompt = await promptTemplate.format({ selectedText, userQuery });
        try {
            const raw = await this.callChatCompletionWithOptions(prompt, {
                systemPrompt: '你擅长生成高质量检索查询，只输出合法 JSON。',
                temperature: 0.15
            });
            const parsed = this.sanitizeSearchQueries(this.parseSearchQueriesJson(raw));
            if (parsed.length >= 3) {
                return parsed.slice(0, 3);
            }
        } catch (error) {
            console.error('AIService.generateSearchQueries failed, using fallback:', error);
        }

        return fallback;
    }

    private parseSearchQueriesJson(raw: string): string[] {
        const cleaned = raw.trim();
        const jsonText = cleaned.startsWith('```')
            ? cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
            : cleaned;

        const parsed = JSON.parse(jsonText) as { queries?: unknown };
        if (!Array.isArray(parsed.queries)) {
            return [];
        }

        return parsed.queries
            .map(item => String(item).trim())
            .filter(item => item.length > 0);
    }

    private sanitizeSearchQueries(candidates: string[]): string[] {
        const deduped: string[] = [];
        const seen = new Set<string>();

        for (const candidate of candidates) {
            const normalized = candidate
                .replace(/\s+/g, ' ')
                .replace(/^[-*\d.)\s]+/, '')
                .trim();
            if (!normalized) continue;
            const key = normalized.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(normalized.slice(0, 120));
        }

        return deduped;
    }

    private buildSearchQueryFallback(selectedText: string, userQuery: string): string[] {
        const cleanedSelected = selectedText
            .replace(/==|%%|\[\^[^\]]+\]|\^\[[^\]]*\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const merged = `${cleanedSelected} ${userQuery}`.trim();
        const tokens = this.tokenize(merged).slice(0, 8);
        const anchor = tokens.slice(0, 3).join(' ') || userQuery.trim() || cleanedSelected || '技术概念';

        return this.sanitizeSearchQueries([
            `${anchor} definition mechanism`,
            `${anchor} architecture tradeoff`,
            `${anchor} failure mode optimization`
        ]).slice(0, 3);
    }

    private deriveCoreConceptFromQueries(searchQueries: string[], selectedText: string, userQuery: string): string {
        const merged = `${searchQueries.join(' ')} ${selectedText} ${userQuery}`;
        const tokens = this.tokenize(merged).slice(0, 12);
        if (tokens.length === 0) {
            return '未知概念';
        }

        const englishCandidates = tokens.filter(token => /[a-z]/i.test(token));
        if (englishCandidates.length > 0) {
            return [...englishCandidates].sort((a, b) => b.length - a.length)[0];
        }

        return tokens[0].slice(0, 48);
    }

    private async retrieveByQueries(
        queries: string[],
        vault: Vault,
        options?: { maxFilesToScan?: number; topK?: number }
    ): Promise<RetrievalResult[]> {
        const merged = new Map<string, RetrievalResult>();
        const perQueryTopK = Math.max(options?.topK ?? this.config.topK ?? 6, 6);

        for (const query of queries) {
            const retrievals = await this.vaultSearchTool(query, vault, {
                topK: perQueryTopK,
                maxFilesToScan: options?.maxFilesToScan ?? this.config.maxFilesToScan
            });

            for (const item of retrievals) {
                const existing = merged.get(item.filePath);
                if (!existing || item.score > existing.score) {
                    merged.set(item.filePath, item);
                }
            }
        }

        return [...merged.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, options?.topK ?? this.config.topK ?? 6);
    }

    private async retrieveRelevantContext(
        query: string,
        vault: Vault,
        options?: { maxFilesToScan?: number; topK?: number }
    ): Promise<RetrievalResult[]> {
        const markdownFiles = vault.getMarkdownFiles().filter(file => !this.isFileExcluded(file.path));
        const maxFilesToScan = options?.maxFilesToScan ?? this.config.maxFilesToScan ?? 200;
        const topK = options?.topK ?? this.config.topK ?? 6;
        const filesToScan = markdownFiles.slice(0, maxFilesToScan);
        const documents: RetrievalDocument[] = [];

        for (const file of filesToScan) {
            try {
                documents.push({
                    filePath: file.path,
                    content: await vault.cachedRead(file)
                });
            } catch (error) {
                console.warn(`AIService.retrieveRelevantContext skipped file: ${file.path}`, error);
            }
        }

        return keywordRetrievalStrategy.rank(query, documents, { topK });
    }

    private isFileExcluded(filePath: string): boolean {
        return isExcludedMarkdownPath(
            filePath,
            this.config.fileFilters,
            this.config.excludeExcalidraw
        );
    }

    private async vaultSearchTool(
        query: string,
        vault: Vault,
        options?: { maxFilesToScan?: number; topK?: number }
    ): Promise<RetrievalResult[]> {
        return this.retrieveRelevantContext(query, vault, options);
    }

    private formatContext(results: RetrievalResult[]): string {
        if (results.length === 0) {
            return '未检索到相关上下文。';
        }

        return results
            .map((result, index) => {
                return [
                    `Context ${index + 1} | File: ${result.filePath}`,
                    result.snippet
                ].join('\n');
            })
            .join('\n\n---\n\n');
    }

    private tokenize(text: string, limit = 16): string[] {
        return tokenizeKeywordText(text, limit);
    }

    private async callChatCompletion(prompt: string): Promise<string> {
        return this.callChatCompletionWithOptions(prompt);
    }

    private async callChatCompletionWithOptions(
        prompt: string,
        options?: { systemPrompt?: string; temperature?: number; signal?: AbortSignal }
    ): Promise<string> {
        return this.client.createChatCompletion(prompt, options);
    }

    private async dfsTool(
        coreConcept: string,
        query: string,
        retrievals: RetrievalResult[]
    ): Promise<string[]> {
        if (!this.config.apiKey) {
            return this.buildPrerequisiteFallback(coreConcept, query);
        }

        const context = this.formatContext(retrievals.slice(0, 4));
        const promptTemplate = PromptTemplate.fromTemplate(
            [
                '你是学习路径规划助手。',
                '请输出 3 条“相关搜索”标签，用于下一轮继续追问。',
                '每条必须是：短语（如“机器码原理”）或短问题（如“CPU如何执行指令？”）。',
                '每条必须严格控制在 10 个字以内。',
                '严禁输出长句、解释、定义、背景介绍。',
                '必须严格返回 JSON，格式为：{{"prerequisites":["...","...","..."]}}。',
                '不要输出任何额外文字。',
                '',
                'Core concept: {coreConcept}',
                'User query: {query}',
                'Context:',
                '{context}'
            ].join('\n')
        );

        const prompt = await promptTemplate.format({
            coreConcept,
            query,
            context
        });

        try {
            const raw = await this.callChatCompletionWithOptions(prompt, {
                systemPrompt: '你擅长提炼前置知识图谱，请只输出可解析 JSON。',
                temperature: 0.1
            });
            const parsed = this.sanitizePrerequisites(this.parsePrerequisiteJson(raw), coreConcept);
            if (parsed.length >= 3) {
                return parsed.slice(0, 3);
            }
        } catch (error) {
            console.error('AIService.dfsTool failed, using fallback:', error);
        }

        return this.buildPrerequisiteFallback(coreConcept, query);
    }

    private parsePrerequisiteJson(raw: string): string[] {
        const cleaned = raw.trim();
        const jsonText = cleaned.startsWith('```')
            ? cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
            : cleaned;

        const parsed = JSON.parse(jsonText) as { prerequisites?: unknown };
        if (!Array.isArray(parsed.prerequisites)) {
            return [];
        }

        return parsed.prerequisites
            .map(item => String(item).trim())
            .filter(item => item.length > 0);
    }

    private sanitizePrerequisites(candidates: string[], coreConcept: string): string[] {
        const conceptLower = coreConcept.toLowerCase();
        const genericWords = ['是什么', '这是什么', '介绍', '概述', '定义', '基础定义'];

        const filtered = candidates
            .map(item => this.normalizePrerequisiteCandidate(item))
            .filter(item => item.length > 1)
            .filter(item => this.isValidPrerequisiteTag(item))
            .filter(item => !genericWords.some(word => item.includes(word)))
            .filter(item => !item.toLowerCase().includes(conceptLower));

        const deduped: string[] = [];
        const seen = new Set<string>();
        for (const item of filtered) {
            const key = item.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }

        return deduped;
    }

    private normalizePrerequisiteCandidate(item: string): string {
        return item
            .replace(/^[-*\d.)\s]+/, '')
            .replace(/^\s*(Q|Question|相关搜索)\s*[:：]\s*/i, '')
            .replace(/["“”'‘’]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private isValidPrerequisiteTag(item: string): boolean {
        // Keep recommendations concise and clickable as search tags.
        if (item.length > 10) {
            return false;
        }

        // Reject long explanatory sentences.
        if (/[，。；;！!]/.test(item)) {
            return false;
        }

        return true;
    }

    private buildPrerequisiteFallback(coreConcept: string, query: string): string[] {
        const defaults = [
            '概念定义与边界',
            '关键机制或因果链',
            '实践约束与评估方法'
        ];

        const seed = this.tokenize(`${coreConcept} ${query}`).slice(0, 3);
        return this.sanitizePrerequisites([...seed, ...defaults], coreConcept).slice(0, 3);
    }

    private async buildRetrievalAssessmentThought(
        coreConcept: string,
        query: string,
        searchQueries: string[],
        retrievals: RetrievalResult[]
    ): Promise<string> {
        if (!this.hasApiKey()) {
            return this.buildRetrievalAssessmentFallback(coreConcept, searchQueries, retrievals);
        }

        const context = this.formatContext(retrievals.slice(0, 4));
        const promptTemplate = PromptTemplate.fromTemplate(
            [
                '你是一个技术研究员，请先评估当前检索资料质量。',
                '请输出 2-4 句中文，语气自然，作为 Agent 的 Thought。',
                '要覆盖：资料覆盖度、可信度、盲区、接下来回答策略。',
                '不要使用列表，不要输出 JSON。',
                '',
                'Core concept: {coreConcept}',
                'User query: {query}',
                'Search queries: {searchQueries}',
                'Context:',
                '{context}'
            ].join('\n')
        );

        const prompt = await promptTemplate.format({
            coreConcept,
            query,
            searchQueries: searchQueries.join(' | '),
            context
        });

        try {
            const thought = (await this.callChatCompletionWithOptions(prompt, {
                systemPrompt: '你擅长做检索质量评估，输出精炼、可执行。',
                temperature: 0.25
            })).trim();

            return thought || this.buildRetrievalAssessmentFallback(coreConcept, searchQueries, retrievals);
        } catch (error) {
            console.error('AIService.buildRetrievalAssessmentThought failed, using fallback:', error);
            return this.buildRetrievalAssessmentFallback(coreConcept, searchQueries, retrievals);
        }
    }

    private buildRetrievalAssessmentFallback(
        coreConcept: string,
        searchQueries: string[],
        retrievals: RetrievalResult[]
    ): string {
        const topFiles = retrievals.slice(0, 3).map(item => item.filePath).join(' | ') || '无';
        if (retrievals.length === 0) {
            return `当前关于 ${coreConcept} 的本地资料几乎为空，检索词为 ${searchQueries.join(' | ')}。我会转为基于通用大模型知识解释其机制与工程意义，并明确哪些结论属于推断。`;
        }

        if (retrievals.length < 3) {
            return `当前检索已命中 ${retrievals.length} 条资料，覆盖面偏窄但可用于建立骨架，来源主要是 ${topFiles}。我会先锚定核心机制，再补充常见误区和工程权衡，避免只做定义复述。`;
        }

        return `当前检索命中 ${retrievals.length} 条且具备一定交叉验证空间，来源集中在 ${topFiles}。我会优先抽取共识机制，再结合你的提问补充边界条件与落地实践，让答案更有可操作性。`;
    }

    private async generateFinalAnswer(
        coreConcept: string,
        query: string,
        lengthMode: 'short' | 'medium',
        retrievals: RetrievalResult[],
        prerequisites: string[],
        searchQueries: string[]
    ): Promise<string> {
        const context = this.formatContext(retrievals);
        const hasLocalContext = retrievals.length > 0;
        const lengthInstruction = lengthMode === 'short'
            ? '请用 2-3 句话，句句有信息增量。'
            : '请用 4-7 句话，并给出 1 个贴近工程实践的小例子。';

        const promptTemplate = hasLocalContext
            ? PromptTemplate.fromTemplate(
                [
                    '你是一名技术博主，擅长把复杂概念讲透并讲出工程价值。',
                    '请结合检索到的 Context 输出有干货的解释，避免空泛套话。',
                    '可以自然引用来源（例如 [File: 路径]），但不要机械罗列。',
                    '请重点说明：核心机制、为什么现在重要、常见误区/坑点。',
                    '',
                    'Core concept: {coreConcept}',
                    'User query: {query}',
                    'Length rule: {lengthInstruction}',
                    'DFS prerequisites: {prerequisites}',
                    'Search queries: {searchQueries}',
                    '',
                    'Context:',
                    '{context}'
                ].join('\n')
            )
            : PromptTemplate.fromTemplate(
                [
                    '你是一名技术博主。当前没有检索到本地 Context。',
                    '请自主发挥，解释该概念在当下大模型浪潮中的意义。',
                    '回答必须主动连接 Transformer、Scaling Law、训练/推理成本、数据与工具链中的至少两个维度。',
                    '输出要有观点、有机制分析、有现实约束，不要写成百科定义。',
                    '',
                    'Core concept: {coreConcept}',
                    'User query: {query}',
                    'Length rule: {lengthInstruction}',
                    'DFS prerequisites: {prerequisites}',
                    'Search queries: {searchQueries}'
                ].join('\n')
            );

        const prompt = await promptTemplate.format({
            coreConcept,
            query,
            lengthInstruction,
            prerequisites: prerequisites.join(' | '),
            searchQueries: searchQueries.join(' | '),
            context
        });

        console.debug('[AIService] Final prompt context length:', context.length);
        console.debug('[AIService] Final prompt context content:\n', context);
        console.debug('[AIService] Final prompt preview:\n', prompt.slice(0, 2000));

        if (!this.config.apiKey) {
            const fallback = this.buildLocalFallback(coreConcept, retrievals);
            return lengthMode === 'short'
                ? this.extractLabeledSegment(fallback, 'Short')
                : this.extractLabeledSegment(fallback, 'Medium');
        }

        try {
            const answer = (await this.callChatCompletionWithOptions(prompt, {
                temperature: 0.2
            })).trim();

            return answer || '这个概念的价值需要放进“模型能力增长曲线、成本曲线和工程约束”三条主线里看，才不会停留在术语层。';
        } catch (error) {
            console.error('AIService.generateFinalAnswer failed, using fallback:', error);
            const fallback = this.buildLocalFallback(coreConcept, retrievals);
            return lengthMode === 'short'
                ? this.extractLabeledSegment(fallback, 'Short')
                : this.extractLabeledSegment(fallback, 'Medium');
        }
    }

    private extractLabeledSegment(text: string, label: 'Short' | 'Medium'): string {
        const regex = new RegExp(`^${label}\\s*[:：]\\s*(.*)$`, 'im');
        const match = text.match(regex);
        return match?.[1]?.trim() || text.replace(/\s+/g, ' ').trim();
    }

    private buildLocalFallback(highlightedText: string, retrievals: RetrievalResult[]): string {
        const topContext = retrievals.slice(0, 2).map(item => `${item.filePath}`).join(' | ') || '无';

        const hasLocalContext = retrievals.length > 0;
        return [
            hasLocalContext
                ? `Short: ${highlightedText} 是一个技术概念。根据本地笔记，核心可先抓定义与机制，并结合 [File: ${retrievals[0].filePath}] 理解其真实使用场景。`
                : `Short: ${highlightedText} 不只是术语，它在大模型时代的价值要放进 Transformer 机制与 Scaling Law 带来的能力-成本权衡里一起看。`,
            hasLocalContext
                ? `Medium: ${highlightedText} 在你的知识库命中文件为 ${topContext}。优先关注检索片段里的机制描述和术语边界，并将结论落到一个具体任务中验证。`
                : `Medium: ${highlightedText} 在当前大模型语境下，建议从四个维度理解：它如何嵌入 Transformer 类架构、是否符合 Scaling Law 的收益区间、训练/推理成本是否可接受、以及在真实产品中的失效边界。这样比单纯定义更有决策价值。`,
            hasLocalContext
                ? `Long: ${highlightedText} 的学习路径可以按“概念定义 -> 关键机制 -> 工程实现 -> 失败模式”推进。本地资料来源：${topContext}。先抽取可验证结论，再通过最小示例检验是否真正掌握。`
                : `Long: ${highlightedText} 的完整解释应覆盖：1）在 Transformer 生态中的角色与信息流位置；2）在 Scaling Law 视角下收益是否随数据/参数继续增长；3）训练与推理阶段的算力、延迟、内存成本；4）常见失败模式与可落地优化。把这四层串起来，才是真正可用的技术理解。`
        ].join('\n\n');
    }
}
