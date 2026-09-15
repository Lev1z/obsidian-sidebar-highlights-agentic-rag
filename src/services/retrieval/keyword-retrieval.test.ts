import { keywordRetrievalStrategy, scoreKeywordDocument } from './keyword-retrieval';

describe('keyword retrieval strategy', () => {
    it('prefers an exact heading match over repeated body terms', () => {
        const results = keywordRetrievalStrategy.rank('retry policy', [
            { filePath: 'body.md', content: '# Networking\nretry retry retry policy details' },
            { filePath: 'heading.md', content: '# Retry Policy\nBackoff and limits.' }
        ], { topK: 2 });

        expect(results.map(result => result.filePath)).toEqual(['heading.md', 'body.md']);
    });

    it('returns a useful snippet around the matching line', () => {
        const result = scoreKeywordDocument('rate limit', {
            filePath: 'api.md',
            content: '# API\nAuthentication\nThe server applies a rate limit.\nRetry later.'
        });

        expect(result?.snippet).toContain('The server applies a rate limit.');
    });

    it('ignores empty and unrelated documents', () => {
        expect(scoreKeywordDocument('retrieval', { filePath: 'empty.md', content: '' })).toBeNull();
        expect(scoreKeywordDocument('retrieval', { filePath: 'other.md', content: '# Cooking\nSoup.' })).toBeNull();
    });

    it('uses file paths as a stable tie breaker', () => {
        const results = keywordRetrievalStrategy.rank('same token', [
            { filePath: 'z.md', content: '# Same token' },
            { filePath: 'a.md', content: '# Same token' }
        ], { topK: 2 });

        expect(results.map(result => result.filePath)).toEqual(['a.md', 'z.md']);
    });
});
