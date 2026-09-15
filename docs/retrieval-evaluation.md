# Offline Retrieval Comparison

Dataset version: 1.0.0  
Corpus: 50 synthetic Markdown notes  
Frozen test queries: 25  
Ranking cutoff: Top-3

This is a deterministic offline comparison, not an online A/B test. The labels are synthetic and are intended for regression detection.

## Results

Strategy | Hit@3 | Recall@3 | MRR | nDCG@3 | P50 ms | P95 ms
--- | ---: | ---: | ---: | ---: | ---: | ---:
Keyword heuristic baseline | 1.000 | 1.000 | 0.953 | 0.965 | 1.821 | 4.644
BM25 with title weighting | 1.000 | 1.000 | 0.973 | 0.980 | 0.263 | 0.522

Candidate minus baseline: Hit@3 +0.000, MRR +0.020, nDCG@3 +0.015.

Latency is a local single-process microbenchmark over 2500 samples per strategy. It is useful for regression checks and should not be treated as production latency.

## Per-query ranking changes

- test-ndcg: regressed, reciprocal rank 0.500 -> 0.333
- test-lifecycle: improved, reciprocal rank 0.333 -> 1.000

## Reproduce

```bash
npm ci
npm run eval:retrieval
npm run eval:retrieval:report
```
