export interface RetrievalEvaluationCase {
    id: string;
    query: string;
    relevantFilePaths: string[];
}

export interface RetrievalCaseResult {
    id: string;
    query: string;
    retrievedFilePaths: string[];
    hitAtK: number;
    precisionAtK: number;
    recallAtK: number;
    reciprocalRank: number;
    normalizedDiscountedCumulativeGainAtK: number;
}

export interface RetrievalEvaluationSummary {
    caseCount: number;
    k: number;
    hitRateAtK: number;
    meanPrecisionAtK: number;
    meanRecallAtK: number;
    meanReciprocalRank: number;
    meanNormalizedDiscountedCumulativeGainAtK: number;
    cases: RetrievalCaseResult[];
}

export async function evaluateRetrieval(
    cases: RetrievalEvaluationCase[],
    retrieve: (query: string, k: number) => Promise<string[]>,
    k = 5
): Promise<RetrievalEvaluationSummary> {
    if (!Number.isInteger(k) || k <= 0) {
        throw new Error('k must be a positive integer.');
    }
    if (cases.length === 0) {
        throw new Error('At least one retrieval evaluation case is required.');
    }

    const results: RetrievalCaseResult[] = [];
    for (const item of cases) {
        if (item.relevantFilePaths.length === 0) {
            throw new Error(`Evaluation case "${item.id}" has no relevant files.`);
        }

        const retrievedFilePaths = (await retrieve(item.query, k)).slice(0, k);
        const relevant = new Set(item.relevantFilePaths);
        const relevantRetrieved = retrievedFilePaths.filter(path => relevant.has(path));
        const firstRelevantIndex = retrievedFilePaths.findIndex(path => relevant.has(path));
        const discountedCumulativeGain = retrievedFilePaths.reduce((sum, path, index) =>
            sum + (relevant.has(path) ? 1 / Math.log2(index + 2) : 0), 0);
        const idealResultCount = Math.min(relevant.size, k);
        let idealDiscountedCumulativeGain = 0;
        for (let index = 0; index < idealResultCount; index++) {
            idealDiscountedCumulativeGain += 1 / Math.log2(index + 2);
        }

        results.push({
            id: item.id,
            query: item.query,
            retrievedFilePaths,
            hitAtK: relevantRetrieved.length > 0 ? 1 : 0,
            precisionAtK: relevantRetrieved.length / k,
            recallAtK: relevantRetrieved.length / relevant.size,
            reciprocalRank: firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1),
            normalizedDiscountedCumulativeGainAtK: discountedCumulativeGain / idealDiscountedCumulativeGain
        });
    }

    const mean = (select: (item: RetrievalCaseResult) => number): number =>
        results.reduce((sum, item) => sum + select(item), 0) / results.length;

    return {
        caseCount: results.length,
        k,
        hitRateAtK: mean(item => item.hitAtK),
        meanPrecisionAtK: mean(item => item.precisionAtK),
        meanRecallAtK: mean(item => item.recallAtK),
        meanReciprocalRank: mean(item => item.reciprocalRank),
        meanNormalizedDiscountedCumulativeGainAtK: mean(item => item.normalizedDiscountedCumulativeGainAtK),
        cases: results
    };
}
