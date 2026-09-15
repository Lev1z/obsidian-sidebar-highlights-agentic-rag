import { AIService } from '../services/AIService';
import { evaluateRetrieval, RetrievalEvaluationCase } from './retrieval-metrics';

jest.mock('obsidian', () => ({ TFile: class TFile {} }), { virtual: true });

interface MockFile {
    path: string;
}

const NOTES: Record<string, string> = {
    'ai/rag.md': '# Retrieval-Augmented Generation\nRAG retrieves relevant external knowledge before language-model generation.',
    'ai/kv-cache.md': '# KV Cache\nKey-value cache accelerates autoregressive transformer inference by reusing attention states.',
    'search/bm25.md': '# BM25 Ranking\nBM25 is a sparse keyword retrieval algorithm based on term frequency and document length.',
    'security/prompt-injection.md': '# Prompt Injection\nRetrieved notes are untrusted input and may contain instructions that attempt to redirect an agent.',
    'tools/obsidian.md': '# Obsidian Vault\nAn Obsidian vault stores notes as local Markdown files.',
    'misc/cooking.md': '# Cooking\nBread, soup, and seasonal vegetables.',
    'misc/travel.md': '# Travel\nRail timetables and hotel reservations.'
};

const CASES: RetrievalEvaluationCase[] = [
    { id: 'rag', query: 'retrieval augmented generation external knowledge', relevantFilePaths: ['ai/rag.md'] },
    { id: 'kv-cache', query: 'key value cache transformer inference', relevantFilePaths: ['ai/kv-cache.md'] },
    { id: 'bm25', query: 'BM25 sparse keyword ranking', relevantFilePaths: ['search/bm25.md'] },
    { id: 'prompt-injection', query: 'prompt injection untrusted retrieved notes', relevantFilePaths: ['security/prompt-injection.md'] },
    { id: 'obsidian', query: 'Obsidian vault local Markdown files', relevantFilePaths: ['tools/obsidian.md'] }
];

function createVault(notes: Record<string, string>) {
    const files: MockFile[] = Object.keys(notes).map(path => ({ path }));
    return {
        getMarkdownFiles: () => files,
        cachedRead: async (file: MockFile) => notes[file.path]
    };
}

describe('local retrieval benchmark', () => {
    it('meets the checked-in baseline at Top-3', async () => {
        const service = new AIService({
            apiKey: '',
            model: 'offline-evaluation',
            baseUrl: 'https://example.com/v1',
            maxFilesToScan: 100,
            topK: 3
        });
        const vault = createVault(NOTES);
        const summary = await evaluateRetrieval(
            CASES,
            async (query, k) => (await service.searchNotes(query, vault as never, { topK: k }))
                .map(result => result.filePath),
            3
        );

        console.info(
            `[retrieval-eval] cases=${summary.caseCount} hit@3=${summary.hitRateAtK.toFixed(2)} ` +
            `recall@3=${summary.meanRecallAtK.toFixed(2)} mrr=${summary.meanReciprocalRank.toFixed(2)}`
        );
        expect(summary.hitRateAtK).toBeGreaterThanOrEqual(0.9);
        expect(summary.meanRecallAtK).toBeGreaterThanOrEqual(0.9);
        expect(summary.meanReciprocalRank).toBeGreaterThanOrEqual(0.9);
    });
});
