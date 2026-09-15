import { AIService, AgentStatusUpdate } from './AIService';

jest.mock('obsidian', () => ({ TFile: class TFile {} }), { virtual: true });

interface MockFile {
    path: string;
}

function createVault(notes: Record<string, string>) {
    const files: MockFile[] = Object.keys(notes).map(path => ({ path }));
    return {
        getMarkdownFiles: () => files,
        cachedRead: async (file: MockFile) => notes[file.path],
        getAbstractFileByPath: (path: string) => files.find(file => file.path === path) ?? null,
        read: async (file: MockFile) => notes[file.path]
    };
}

describe('AIService', () => {
    it('treats whitespace-only API keys as missing', () => {
        const service = new AIService({ apiKey: '   ', model: 'model', baseUrl: 'https://example.com/v1' });
        expect(service.hasApiKey()).toBe(false);
    });

    it('reports a missing key without making a request', async () => {
        const service = new AIService({ apiKey: '', model: 'model', baseUrl: 'https://example.com/v1' });
        await expect(service.checkConnection()).resolves.toEqual({
            ok: false,
            message: expect.stringContaining('API Key')
        });
    });

    it('uses local retrieval and emits observable fallback status', async () => {
        const vault = createVault({
            'rag.md': '# Retrieval-Augmented Generation\nRAG retrieves relevant notes before generation.',
            'unrelated.md': '# Cooking\nBread and soup.'
        });
        const statuses: AgentStatusUpdate[] = [];
        const service = new AIService({ apiKey: '', model: 'model', baseUrl: 'https://example.com/v1' });

        const result = await service.runAgenticWorkflow({
            selectedText: 'Retrieval-Augmented Generation',
            query: 'How does RAG retrieve notes?',
            lengthMode: 'short',
            vault: vault as never,
            onStatus: status => statuses.push(status)
        });

        expect(result.usedFallback).toBe(true);
        expect(result.fallbackReason).toBe('missing_api_key');
        expect(result.retrievals[0]?.filePath).toBe('rag.md');
        expect(result.finalAnswer).toContain('rag.md');
        expect(result.prerequisites).toHaveLength(3);
        expect(statuses).toEqual(expect.arrayContaining([
            expect.objectContaining({ phase: 'observation' }),
            expect.objectContaining({ phase: 'thought' })
        ]));
    });

    it('returns an empty result for an empty goal', async () => {
        const service = new AIService({ apiKey: '', model: 'model', baseUrl: 'https://example.com/v1' });
        const result = await service.runAgenticWorkflow({
            selectedText: ' ',
            query: ' ',
            lengthMode: 'medium',
            vault: createVault({}) as never
        });

        expect(result).toEqual({
            finalAnswer: '',
            prerequisites: [],
            retrievals: [],
            usedFallback: false
        });
    });

    it('keeps excluded files out of local retrieval', async () => {
        const vault = createVault({
            'private/secret.md': '# Secret Project\nconfidential launch plan',
            'public/overview.md': '# Project Overview\npublic launch plan'
        });
        const service = new AIService({
            apiKey: '',
            model: 'model',
            baseUrl: 'https://example.com/v1',
            fileFilters: [{ path: 'private', mode: 'exclude' }]
        });

        const results = await service.searchNotes('launch plan', vault as never);

        expect(results.map(result => result.filePath)).toEqual(['public/overview.md']);
    });

    it('keeps Excalidraw Markdown out of retrieval when configured', async () => {
        const vault = createVault({
            'diagram.excalidraw.md': '# Architecture Diagram\nagent retrieval architecture',
            'architecture.md': '# Architecture\nagent retrieval architecture'
        });
        const service = new AIService({
            apiKey: '',
            model: 'model',
            baseUrl: 'https://example.com/v1',
            excludeExcalidraw: true
        });

        const results = await service.searchNotes('agent retrieval architecture', vault as never);

        expect(results.map(result => result.filePath)).toEqual(['architecture.md']);
    });
});
