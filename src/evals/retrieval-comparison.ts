import { evaluateRetrieval, RetrievalEvaluationSummary } from './retrieval-metrics';
import { OfflineRetrievalDataset } from './fixtures/offline-retrieval-dataset';
import { RetrievalStrategy } from '../services/retrieval/retrieval-types';

export interface LatencySummary {
    sampleCount: number;
    p50Milliseconds: number;
    p95Milliseconds: number;
}

export interface StrategyEvaluation {
    strategyId: string;
    strategyName: string;
    metrics: RetrievalEvaluationSummary;
    latency: LatencySummary;
}

function percentile(sortedValues: number[], percentileValue: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1)
    );
    return sortedValues[index];
}

export async function evaluateStrategy(
    dataset: OfflineRetrievalDataset,
    strategy: RetrievalStrategy,
    options: { k?: number; split?: 'development' | 'test'; latencyRuns?: number } = {}
): Promise<StrategyEvaluation> {
    const k = options.k ?? 3;
    const split = options.split ?? 'test';
    const latencyRuns = options.latencyRuns ?? 20;
    const cases = dataset.cases.filter(item => item.split === split);
    const metrics = await evaluateRetrieval(
        cases,
        async (query, limit) => strategy
            .rank(query, dataset.documents, { topK: limit })
            .map(result => result.filePath),
        k
    );

    const durations: number[] = [];
    for (let run = 0; run < latencyRuns; run++) {
        for (const item of cases) {
            const startedAt = performance.now();
            strategy.rank(item.query, dataset.documents, { topK: k });
            durations.push(performance.now() - startedAt);
        }
    }
    durations.sort((left, right) => left - right);

    return {
        strategyId: strategy.id,
        strategyName: strategy.displayName,
        metrics,
        latency: {
            sampleCount: durations.length,
            p50Milliseconds: percentile(durations, 0.5),
            p95Milliseconds: percentile(durations, 0.95)
        }
    };
}
