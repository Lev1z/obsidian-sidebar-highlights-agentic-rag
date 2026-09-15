import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { OFFLINE_RETRIEVAL_DATASET } from './fixtures/offline-retrieval-dataset';
import { evaluateStrategy, StrategyEvaluation } from './retrieval-comparison';
import { bm25RetrievalStrategy } from '../services/retrieval/bm25-retrieval';
import { keywordRetrievalStrategy } from '../services/retrieval/keyword-retrieval';

function fixed(value: number): string {
    return value.toFixed(3);
}

function delta(candidate: number, baseline: number): string {
    const difference = candidate - baseline;
    return `${difference >= 0 ? '+' : ''}${fixed(difference)}`;
}

function renderRow(evaluation: StrategyEvaluation): string {
    const metrics = evaluation.metrics;
    return [
        evaluation.strategyName,
        fixed(metrics.hitRateAtK),
        fixed(metrics.meanRecallAtK),
        fixed(metrics.meanReciprocalRank),
        fixed(metrics.meanNormalizedDiscountedCumulativeGainAtK),
        fixed(evaluation.latency.p50Milliseconds),
        fixed(evaluation.latency.p95Milliseconds)
    ].join(' | ');
}

function changedCases(baseline: StrategyEvaluation, candidate: StrategyEvaluation): string[] {
    const candidateCases = new Map(candidate.metrics.cases.map(item => [item.id, item]));
    return baseline.metrics.cases.flatMap(item => {
        const other = candidateCases.get(item.id);
        if (!other || other.reciprocalRank === item.reciprocalRank) return [];
        const direction = other.reciprocalRank > item.reciprocalRank ? 'improved' : 'regressed';
        return [
            `- ${item.id}: ${direction}, reciprocal rank ${fixed(item.reciprocalRank)} -> ${fixed(other.reciprocalRank)}`
        ];
    });
}

function renderReport(baseline: StrategyEvaluation, candidate: StrategyEvaluation): string {
    const baselineMetrics = baseline.metrics;
    const candidateMetrics = candidate.metrics;
    const changes = changedCases(baseline, candidate);
    return `# Offline Retrieval Comparison\n\n` +
        `Dataset version: ${OFFLINE_RETRIEVAL_DATASET.version}  \n` +
        `Corpus: ${OFFLINE_RETRIEVAL_DATASET.documents.length} synthetic Markdown notes  \n` +
        `Frozen test queries: ${baselineMetrics.caseCount}  \n` +
        `Ranking cutoff: Top-${baselineMetrics.k}\n\n` +
        `This is a deterministic offline comparison, not an online A/B test. The labels are synthetic and are intended for regression detection.\n\n` +
        `## Results\n\n` +
        `Strategy | Hit@3 | Recall@3 | MRR | nDCG@3 | P50 ms | P95 ms\n` +
        `--- | ---: | ---: | ---: | ---: | ---: | ---:\n` +
        `${renderRow(baseline)}\n` +
        `${renderRow(candidate)}\n\n` +
        `Candidate minus baseline: Hit@3 ${delta(candidateMetrics.hitRateAtK, baselineMetrics.hitRateAtK)}, ` +
        `MRR ${delta(candidateMetrics.meanReciprocalRank, baselineMetrics.meanReciprocalRank)}, ` +
        `nDCG@3 ${delta(candidateMetrics.meanNormalizedDiscountedCumulativeGainAtK, baselineMetrics.meanNormalizedDiscountedCumulativeGainAtK)}.\n\n` +
        `Latency is a local single-process microbenchmark over ${baseline.latency.sampleCount} samples per strategy. ` +
        `It is useful for regression checks and should not be treated as production latency.\n\n` +
        `## Per-query ranking changes\n\n` +
        `${changes.length > 0 ? changes.join('\n') : '- No reciprocal-rank changes.'}\n\n` +
        `## Reproduce\n\n` +
        '```bash\n' +
        `npm ci\n` +
        `npm run eval:retrieval\n` +
        `npm run eval:retrieval:report\n` +
        '```\n';
}

async function main(): Promise<void> {
    const evaluationOptions = { k: 3, split: 'test' as const, latencyRuns: 100 };
    const baseline = await evaluateStrategy(
        OFFLINE_RETRIEVAL_DATASET,
        keywordRetrievalStrategy,
        evaluationOptions
    );
    const candidate = await evaluateStrategy(
        OFFLINE_RETRIEVAL_DATASET,
        bm25RetrievalStrategy,
        evaluationOptions
    );
    const report = renderReport(baseline, candidate);

    const writeIndex = process.argv.indexOf('--write');
    if (writeIndex !== -1) {
        const requestedPath = process.argv[writeIndex + 1] ?? 'docs/retrieval-evaluation.md';
        const outputPath = resolve(process.cwd(), requestedPath);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, report, 'utf8');
        console.info(`Wrote offline retrieval report to ${outputPath}`);
    } else {
        console.info(report);
    }

    const candidatePassed =
        candidate.metrics.hitRateAtK >= baseline.metrics.hitRateAtK &&
        candidate.metrics.meanReciprocalRank >= baseline.metrics.meanReciprocalRank &&
        candidate.metrics.meanNormalizedDiscountedCumulativeGainAtK >=
            baseline.metrics.meanNormalizedDiscountedCumulativeGainAtK;
    if (!candidatePassed) {
        throw new Error('BM25 candidate regressed one or more frozen ranking metrics.');
    }
}

void main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
