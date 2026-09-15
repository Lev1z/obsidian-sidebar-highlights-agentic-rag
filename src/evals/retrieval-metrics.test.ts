import { evaluateRetrieval, RetrievalEvaluationCase } from './retrieval-metrics';

const cases: RetrievalEvaluationCase[] = [
    { id: 'one', query: 'first', relevantFilePaths: ['a.md'] },
    { id: 'two', query: 'second', relevantFilePaths: ['b.md', 'c.md'] }
];

describe('evaluateRetrieval', () => {
    it('calculates ranking metrics at K', async () => {
        const rankings: Record<string, string[]> = {
            first: ['x.md', 'a.md', 'z.md'],
            second: ['b.md', 'x.md', 'c.md']
        };

        const summary = await evaluateRetrieval(cases, async query => rankings[query], 3);

        expect(summary.caseCount).toBe(2);
        expect(summary.hitRateAtK).toBe(1);
        expect(summary.meanPrecisionAtK).toBeCloseTo(0.5);
        expect(summary.meanRecallAtK).toBe(1);
        expect(summary.meanReciprocalRank).toBeCloseTo(0.75);
        expect(summary.meanNormalizedDiscountedCumulativeGainAtK).toBeCloseTo(0.7753, 4);
        expect(summary.cases[0].reciprocalRank).toBe(0.5);
        expect(summary.cases[0].normalizedDiscountedCumulativeGainAtK).toBeCloseTo(0.6309, 4);
    });

    it('scores a miss as zero', async () => {
        const summary = await evaluateRetrieval(
            [{ id: 'miss', query: 'missing', relevantFilePaths: ['target.md'] }],
            async () => ['other.md'],
            1
        );

        expect(summary.hitRateAtK).toBe(0);
        expect(summary.meanPrecisionAtK).toBe(0);
        expect(summary.meanRecallAtK).toBe(0);
        expect(summary.meanReciprocalRank).toBe(0);
        expect(summary.meanNormalizedDiscountedCumulativeGainAtK).toBe(0);
    });

    it('rejects invalid K values', async () => {
        await expect(evaluateRetrieval(cases, async () => [], 0)).rejects.toThrow('positive integer');
        await expect(evaluateRetrieval(cases, async () => [], 1.5)).rejects.toThrow('positive integer');
    });

    it('requires at least one case', async () => {
        await expect(evaluateRetrieval([], async () => [], 3)).rejects.toThrow('At least one');
    });

    it('requires every case to declare relevant files', async () => {
        await expect(evaluateRetrieval(
            [{ id: 'invalid', query: 'query', relevantFilePaths: [] }],
            async () => [],
            3
        )).rejects.toThrow('has no relevant files');
    });
});
