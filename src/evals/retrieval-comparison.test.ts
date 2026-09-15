import { OFFLINE_RETRIEVAL_DATASET } from './fixtures/offline-retrieval-dataset';
import { evaluateStrategy } from './retrieval-comparison';
import { keywordRetrievalStrategy } from '../services/retrieval/keyword-retrieval';
import { bm25RetrievalStrategy } from '../services/retrieval/bm25-retrieval';

describe('offline retrieval comparison', () => {
    it('compares the production baseline and BM25 on the frozen test split', async () => {
        const baseline = await evaluateStrategy(OFFLINE_RETRIEVAL_DATASET, keywordRetrievalStrategy, {
            k: 3,
            split: 'test',
            latencyRuns: 2
        });
        const candidate = await evaluateStrategy(OFFLINE_RETRIEVAL_DATASET, bm25RetrievalStrategy, {
            k: 3,
            split: 'test',
            latencyRuns: 2
        });

        console.info(
            `[offline-retrieval] split=test cases=${baseline.metrics.caseCount} ` +
            `baseline_mrr=${baseline.metrics.meanReciprocalRank.toFixed(3)} ` +
            `candidate_mrr=${candidate.metrics.meanReciprocalRank.toFixed(3)} ` +
            `baseline_ndcg@3=${baseline.metrics.meanNormalizedDiscountedCumulativeGainAtK.toFixed(3)} ` +
            `candidate_ndcg@3=${candidate.metrics.meanNormalizedDiscountedCumulativeGainAtK.toFixed(3)}`
        );
        expect(baseline.metrics.caseCount).toBe(25);
        expect(candidate.metrics.caseCount).toBe(25);
        expect(candidate.metrics.hitRateAtK).toBeGreaterThanOrEqual(baseline.metrics.hitRateAtK);
        expect(candidate.metrics.meanReciprocalRank).toBeGreaterThanOrEqual(baseline.metrics.meanReciprocalRank);
        expect(candidate.metrics.meanNormalizedDiscountedCumulativeGainAtK).toBeGreaterThanOrEqual(
            baseline.metrics.meanNormalizedDiscountedCumulativeGainAtK
        );
    });
});
