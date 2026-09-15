import { Bm25RetrievalStrategy, tokenizeBm25Text } from './bm25-retrieval';

describe('BM25 retrieval strategy', () => {
    const strategy = new Bm25RetrievalStrategy();

    it('uses rare discriminating terms instead of raw repetition alone', () => {
        const results = strategy.rank('retrieval reciprocal rank', [
            {
                filePath: 'target.md',
                content: '# Ranking Metrics\nReciprocal rank measures the first relevant retrieval result.'
            },
            {
                filePath: 'repetition.md',
                content: '# Retrieval Notes\nretrieval retrieval retrieval retrieval retrieval'
            },
            {
                filePath: 'other.md',
                content: '# Cooking\nSeasonal vegetables and soup.'
            }
        ], { topK: 2 });

        expect(results[0].filePath).toBe('target.md');
    });

    it('gives title matches more weight than body-only matches', () => {
        const results = strategy.rank('request cancellation', [
            {
                filePath: 'body.md',
                content: '# Networking\nA request can support cancellation.'
            },
            {
                filePath: 'title.md',
                content: '# Request Cancellation\nAbort work when the dialog closes.'
            }
        ], { topK: 2 });

        expect(results[0].filePath).toBe('title.md');
    });

    it('tokenizes Chinese text as overlapping bigrams', () => {
        expect(tokenizeBm25Text('文件过滤规则')).toEqual(['文件', '件过', '过滤', '滤规', '规则']);
        const results = strategy.rank('文件过滤', [
            { filePath: 'privacy.md', content: '# 文件过滤规则\n排除私人笔记。' },
            { filePath: 'other.md', content: '# 网络请求\n处理超时。' }
        ], { topK: 1 });
        expect(results[0].filePath).toBe('privacy.md');
    });

    it('returns no results for empty input and respects topK', () => {
        expect(strategy.rank('', [{ filePath: 'a.md', content: '# A' }], { topK: 3 })).toEqual([]);
        expect(strategy.rank('ranking', [
            { filePath: 'a.md', content: '# Ranking' },
            { filePath: 'b.md', content: '# Ranking' }
        ], { topK: 1 })).toHaveLength(1);
    });
});
