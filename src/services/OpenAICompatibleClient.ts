export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenAICompatibleClientConfig {
    apiKey: string;
    model: string;
    baseUrl: string;
    requestTimeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    fetchImpl?: FetchLike;
}

export interface ChatCompletionOptions {
    systemPrompt?: string;
    temperature?: number;
    signal?: AbortSignal;
}

export type AIRequestErrorCode =
    | 'invalid_config'
    | 'http_error'
    | 'timeout'
    | 'aborted'
    | 'network_error'
    | 'invalid_response';

export class AIRequestError extends Error {
    constructor(
        message: string,
        public readonly code: AIRequestErrorCode,
        public readonly status?: number,
        public readonly retryable: boolean = false
    ) {
        super(message);
        this.name = 'AIRequestError';
    }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;

export class OpenAICompatibleClient {
    private config: Required<Omit<OpenAICompatibleClientConfig, 'fetchImpl'>>;
    private fetchImpl: FetchLike;

    constructor(config: OpenAICompatibleClientConfig) {
        this.config = this.normalizeConfig(config);
        this.fetchImpl = config.fetchImpl ?? ((input, init) => {
            if (typeof globalThis.fetch !== 'function') {
                throw new AIRequestError('Fetch API is unavailable in this environment.', 'invalid_config');
            }
            return globalThis.fetch(input, init);
        });
    }

    updateConfig(config: Partial<OpenAICompatibleClientConfig>): void {
        this.config = this.normalizeConfig({ ...this.config, ...config });
        if (config.fetchImpl) {
            this.fetchImpl = config.fetchImpl;
        }
    }

    async createChatCompletion(prompt: string, options: ChatCompletionOptions = {}): Promise<string> {
        const endpoint = this.buildEndpoint();
        const systemPrompt = options.systemPrompt ?? '你是 Obsidian 笔记助手。输出简洁、结构清晰。';
        const temperature = options.temperature ?? 0.2;
        const requestBody = JSON.stringify({
            model: this.config.model,
            temperature,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ]
        });

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            const response = await this.fetchWithTimeout(endpoint, requestBody, options.signal);

            if (response.ok) {
                return this.parseContent(response);
            }

            const retryable = this.isRetryableStatus(response.status);
            if (retryable && attempt < this.config.maxRetries) {
                await this.delay(this.getRetryDelayMs(response, attempt), options.signal);
                continue;
            }

            const detail = this.sanitizeErrorBody(await response.text());
            const suffix = detail ? `: ${detail}` : '';
            throw new AIRequestError(
                `Chat completion failed (${response.status})${suffix}`,
                'http_error',
                response.status,
                retryable
            );
        }

        throw new AIRequestError('Chat completion failed after retries.', 'network_error', undefined, true);
    }

    private normalizeConfig(config: OpenAICompatibleClientConfig): Required<Omit<OpenAICompatibleClientConfig, 'fetchImpl'>> {
        return {
            apiKey: config.apiKey,
            model: config.model,
            baseUrl: config.baseUrl,
            requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
            maxRetries: Math.max(0, Math.floor(config.maxRetries ?? DEFAULT_MAX_RETRIES)),
            retryBaseDelayMs: Math.max(0, config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS)
        };
    }

    private buildEndpoint(): string {
        const baseUrl = this.config.baseUrl.trim().replace(/\/+$/, '');
        if (!baseUrl) {
            throw new AIRequestError('AI Base URL is empty.', 'invalid_config');
        }

        let parsed: URL;
        try {
            parsed = new URL(baseUrl);
        } catch {
            throw new AIRequestError('AI Base URL is invalid.', 'invalid_config');
        }

        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new AIRequestError('AI Base URL must use HTTP or HTTPS.', 'invalid_config');
        }

        if (!this.config.model.trim()) {
            throw new AIRequestError('AI model name is empty.', 'invalid_config');
        }

        return `${baseUrl}/chat/completions`;
    }

    private async fetchWithTimeout(endpoint: string, body: string, externalSignal?: AbortSignal): Promise<Response> {
        if (externalSignal?.aborted) {
            throw new AIRequestError('AI request was cancelled.', 'aborted');
        }

        const controller = new AbortController();
        let timedOut = false;
        const abortFromExternal = (): void => controller.abort();
        externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, this.config.requestTimeoutMs);

        try {
            return await this.fetchImpl(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.apiKey}`
                },
                body,
                signal: controller.signal
            });
        } catch (error) {
            if (timedOut) {
                throw new AIRequestError(
                    `AI request timed out after ${this.config.requestTimeoutMs} ms.`,
                    'timeout',
                    undefined,
                    true
                );
            }

            if (externalSignal?.aborted) {
                throw new AIRequestError('AI request was cancelled.', 'aborted');
            }

            const detail = error instanceof Error ? error.message : String(error);
            throw new AIRequestError(`AI network request failed: ${detail}`, 'network_error', undefined, true);
        } finally {
            clearTimeout(timeoutId);
            externalSignal?.removeEventListener('abort', abortFromExternal);
        }
    }

    private async parseContent(response: Response): Promise<string> {
        let data: unknown;
        try {
            data = await response.json();
        } catch {
            throw new AIRequestError('AI endpoint returned invalid JSON.', 'invalid_response');
        }

        const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
            ?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
            throw new AIRequestError('AI endpoint response is missing message content.', 'invalid_response');
        }

        return content;
    }

    private isRetryableStatus(status: number): boolean {
        return status === 408 || status === 409 || status === 429 || status >= 500;
    }

    private getRetryDelayMs(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number(retryAfter);
            if (Number.isFinite(seconds) && seconds >= 0) {
                return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
            }

            const retryAt = Date.parse(retryAfter);
            if (Number.isFinite(retryAt)) {
                return Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_DELAY_MS);
            }
        }

        return Math.min(this.config.retryBaseDelayMs * (2 ** attempt), MAX_RETRY_DELAY_MS);
    }

    private delay(ms: number, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) {
            return Promise.reject(new AIRequestError('AI request was cancelled.', 'aborted'));
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            const onAbort = (): void => {
                clearTimeout(timeoutId);
                reject(new AIRequestError('AI request was cancelled.', 'aborted'));
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    private sanitizeErrorBody(body: string): string {
        return body.replace(/\s+/g, ' ').trim().slice(0, 500);
    }
}
