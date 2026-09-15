import { RetrievalEvaluationCase } from '../retrieval-metrics';
import { RetrievalDocument } from '../../services/retrieval/retrieval-types';

export interface OfflineRetrievalCase extends RetrievalEvaluationCase {
    split: 'development' | 'test';
}

export interface OfflineRetrievalDataset {
    version: string;
    description: string;
    documents: RetrievalDocument[];
    cases: OfflineRetrievalCase[];
}

const document = (filePath: string, title: string, body: string): RetrievalDocument => ({
    filePath,
    content: `# ${title}\n${body}`
});

const documents: RetrievalDocument[] = [
    document('ai/rag-grounding.md', 'Grounding Answers with RAG', 'Retrieval augmented generation lets an agent ground answers in external knowledge before generation.'),
    document('ai/chunking.md', 'Chunking Long Notes', 'Split long Markdown notes into overlapping segments before retrieval so useful context is not lost at boundaries.'),
    document('ai/embeddings.md', 'Embedding Search', 'Dense vectors represent semantic meaning and support similarity search when wording differs.'),
    document('ai/hybrid-search.md', 'Hybrid Search', 'Combine sparse keyword ranking with dense vector similarity and merge both result lists.'),
    document('ai/reranking.md', 'Cross Encoder Reranking', 'A cross encoder scores the query and each candidate together after the first retrieval stage.'),
    document('ai/query-expansion.md', 'Query Expansion', 'Generate related search terms and alternate wording before retrieving documents.'),
    document('ai/hallucination.md', 'Grounded Answer Checks', 'Verify generated claims against retrieved evidence and report when context is insufficient.'),
    document('ai/context-window.md', 'Context Window Budget', 'Limit retrieved passages so prompts fit the model context window without hiding the user question.'),
    document('ai/tool-calling.md', 'Agent Tool Calling', 'The agent chooses search_notes or get_note_content, observes the result, and then continues reasoning.'),
    document('ai/kv-cache.md', 'KV Cache', 'Key value attention states are reused to accelerate autoregressive transformer inference.'),
    document('search/bm25.md', 'BM25 Sparse Ranking', 'BM25 uses term frequency, inverse document frequency, and document length normalization.'),
    document('search/mrr.md', 'Mean Reciprocal Rank', 'Reciprocal rank rewards systems when the first relevant result appears near the top.'),
    document('search/hit-rate.md', 'Hit Rate at K', 'Hit Rate checks whether at least one relevant document appears in the first K results.'),
    document('search/recall.md', 'Recall at K', 'Recall measures how many labelled relevant documents were retrieved in the first K results.'),
    document('search/ndcg.md', 'Normalized Discounted Cumulative Gain', 'nDCG rewards relevant results near the top and supports more than one relevant document.'),
    document('search/overview.md', 'Retrieval Ranking Overview', 'retrieval ranking retrieval ranking retrieval ranking compares common search approaches and ranking output.'),
    document('testing/unit-tests.md', 'Unit Tests', 'Check one function or class in isolation with small controlled inputs and expected outputs.'),
    document('testing/integration-tests.md', 'Integration Tests', 'Check whether modules work together across a real boundary such as a service and a vault adapter.'),
    document('testing/mocks.md', 'Mock Services', 'Replace an external API with a controllable fake response to test failures without network cost.'),
    document('testing/ci.md', 'Continuous Integration', 'GitHub Actions installs dependencies, builds the plugin, and runs tests for every pull request.'),
    document('testing/coverage.md', 'Code Coverage', 'Coverage reports which statements, branches, functions, and lines were executed by tests.'),
    document('testing/flaky-tests.md', 'Flaky Test Diagnosis', 'A flaky test sometimes passes and sometimes fails because of time, shared state, randomness, or network dependencies.'),
    document('testing/fake-timers.md', 'Deterministic Backoff Tests', 'A fake clock advances retry delays and jitter deterministically without waiting for real time.'),
    document('testing/regression.md', 'Regression Test', 'Keep a fixed example for a repaired bug so a future change cannot silently reintroduce it.'),
    document('testing/test-pyramid.md', 'Test Pyramid', 'Use many fast unit tests, fewer integration tests, and a small number of end to end tests.'),
    document('network/timeout.md', 'Request Timeout', 'Stop a request after a fixed deadline so the interface does not wait forever.'),
    document('network/cancellation.md', 'Request Cancellation', 'Abort in-flight work when the user closes the dialog or starts a replacement request.'),
    document('network/retry.md', 'Retry Policy', 'Retry temporary HTTP failures for a limited number of attempts and never retry permanent authentication errors.'),
    document('network/backoff.md', 'Exponential Backoff with Jitter', 'Increase the delay between request retry attempts and add jitter to avoid synchronized traffic spikes.'),
    document('network/rate-limit.md', 'HTTP Rate Limiting', 'A 429 response indicates too many requests; Retry-After tells the client when to try again.'),
    document('network/authentication.md', 'API Authentication', 'A 401 response usually means the API key is missing, invalid, or sent to the wrong endpoint.'),
    document('network/response-validation.md', 'Response Schema Validation', 'Check JSON structure and require choices zero message content before using a model response.'),
    document('network/latency.md', 'P95 Request Latency', 'The 95th percentile shows a slow-tail response time that averages can hide.'),
    document('network/overview.md', 'Request Retry Guide', 'request retry request retry request retry describes general network requests and retry behavior.'),
    document('obsidian/vault.md', 'Obsidian Vault', 'A vault stores local Markdown files and folders that Obsidian indexes for plugins.'),
    document('obsidian/frontmatter.md', 'YAML Frontmatter', 'Properties at the beginning of a note store structured metadata between triple dashes.'),
    document('obsidian/wikilinks.md', 'Obsidian Wikilinks', 'Double brackets connect notes by title and may include aliases or heading references.'),
    document('obsidian/plugin-lifecycle.md', 'Plugin Lifecycle', 'Register commands and views during onload, then release resources and events during onunload.'),
    document('obsidian/command-palette.md', 'Command Palette', 'Registered plugin commands let users trigger actions from the Obsidian command palette.'),
    document('obsidian/excalidraw.md', 'Excalidraw Notes', 'Drawing files may contain large generated Markdown blocks and can be excluded from retrieval.'),
    document('privacy/local-first.md', 'Local First Retrieval', 'Search and relevance scoring stay inside the vault; only selected context is sent to the configured model.'),
    document('privacy/file-filters.md', 'Include and Exclude File Filters', 'File privacy rules prevent excluded paths from entering search_notes and get_note_content results.'),
    document('privacy/secrets.md', 'Secret Handling', 'API keys belong in plugin settings and must never appear in source control, logs, or test fixtures.'),
    document('privacy/overview.md', 'Plugin File Management', 'plugin file plugin file plugin file operations organize local notes and folders.'),
    document('performance/scan-limit.md', 'Vault Scan Limit', 'Cap the number of Markdown files scanned per query to bound local retrieval latency.'),
    document('performance/indexing.md', 'Incremental Search Index', 'Update an index when a note changes instead of reading every file for every query.'),
    document('misc/cooking.md', 'Cooking Notes', 'Bread, soup, seasonal vegetables, and oven temperatures.'),
    document('misc/travel.md', 'Travel Plans', 'Rail timetables, hotel reservations, and walking routes.'),
    document('misc/books.md', 'Reading List', 'Fiction, history, and design books to read this year.'),
    document('misc/meetings.md', 'Meeting Notes', 'Weekly agenda items, decisions, owners, and follow-up dates.')
];

const developmentCases: OfflineRetrievalCase[] = [
    { id: 'dev-rag', split: 'development', query: 'how can an agent ground answers in external knowledge', relevantFilePaths: ['ai/rag-grounding.md'] },
    { id: 'dev-chunking', split: 'development', query: 'split long notes with overlap before retrieval', relevantFilePaths: ['ai/chunking.md'] },
    { id: 'dev-embedding', split: 'development', query: 'dense vectors for semantic similarity search', relevantFilePaths: ['ai/embeddings.md'] },
    { id: 'dev-hybrid', split: 'development', query: 'combine sparse keywords and dense vectors', relevantFilePaths: ['ai/hybrid-search.md'] },
    { id: 'dev-rerank', split: 'development', query: 'cross encoder second stage candidate scoring', relevantFilePaths: ['ai/reranking.md'] },
    { id: 'dev-query-expansion', split: 'development', query: 'generate alternate wording before search', relevantFilePaths: ['ai/query-expansion.md'] },
    { id: 'dev-mrr', split: 'development', query: 'retrieval ranking first relevant reciprocal', relevantFilePaths: ['search/mrr.md'] },
    { id: 'dev-hit-rate', split: 'development', query: 'whether one relevant result appears in top k', relevantFilePaths: ['search/hit-rate.md'] },
    { id: 'dev-recall', split: 'development', query: 'fraction of labelled relevant documents retrieved', relevantFilePaths: ['search/recall.md'] },
    { id: 'dev-unit-test', split: 'development', query: 'check one function in isolation', relevantFilePaths: ['testing/unit-tests.md'] },
    { id: 'dev-mock', split: 'development', query: 'fake external api failures without network cost', relevantFilePaths: ['testing/mocks.md'] },
    { id: 'dev-timeout', split: 'development', query: 'stop request after fixed deadline', relevantFilePaths: ['network/timeout.md'] },
    { id: 'dev-cancel', split: 'development', query: 'abort request when user closes dialog', relevantFilePaths: ['network/cancellation.md'] },
    { id: 'dev-vault', split: 'development', query: 'local markdown folder indexed by Obsidian', relevantFilePaths: ['obsidian/vault.md'] },
    { id: 'dev-local-first', split: 'development', query: 'keep search scoring inside vault and send selected context', relevantFilePaths: ['privacy/local-first.md'] }
];

const testCases: OfflineRetrievalCase[] = [
    { id: 'test-grounded-checks', split: 'test', query: 'verify generated claims against retrieved evidence', relevantFilePaths: ['ai/hallucination.md'] },
    { id: 'test-context-budget', split: 'test', query: 'fit retrieved passages within model context window', relevantFilePaths: ['ai/context-window.md'] },
    { id: 'test-tool-call', split: 'test', query: 'agent chooses search notes then observes tool result', relevantFilePaths: ['ai/tool-calling.md'] },
    { id: 'test-kv-cache', split: 'test', query: 'reuse attention states during transformer inference', relevantFilePaths: ['ai/kv-cache.md'] },
    { id: 'test-bm25', split: 'test', query: 'term frequency inverse document frequency length normalization', relevantFilePaths: ['search/bm25.md'] },
    { id: 'test-ndcg', split: 'test', query: 'ranking metric discounts relevant results lower in list', relevantFilePaths: ['search/ndcg.md'] },
    { id: 'test-integration', split: 'test', query: 'test modules together across service vault boundary', relevantFilePaths: ['testing/integration-tests.md'] },
    { id: 'test-ci', split: 'test', query: 'github actions build and test every pull request', relevantFilePaths: ['testing/ci.md'] },
    { id: 'test-coverage', split: 'test', query: 'which branches functions and lines tests executed', relevantFilePaths: ['testing/coverage.md'] },
    { id: 'test-flaky', split: 'test', query: 'test fails intermittently because randomness shared state', relevantFilePaths: ['testing/flaky-tests.md'] },
    { id: 'test-fake-clock', split: 'test', query: 'deterministic retry jitter test with fake clock', relevantFilePaths: ['testing/fake-timers.md'] },
    { id: 'test-regression', split: 'test', query: 'fixed bug example prevents future reintroduction', relevantFilePaths: ['testing/regression.md'] },
    { id: 'test-pyramid', split: 'test', query: 'many unit fewer integration minimal end to end tests', relevantFilePaths: ['testing/test-pyramid.md'] },
    { id: 'test-retry', split: 'test', query: 'limited attempts for temporary http failures', relevantFilePaths: ['network/retry.md'] },
    { id: 'test-backoff', split: 'test', query: 'network request retry exponential jitter traffic spikes', relevantFilePaths: ['network/backoff.md'] },
    { id: 'test-rate-limit', split: 'test', query: '429 retry after too many requests', relevantFilePaths: ['network/rate-limit.md'] },
    { id: 'test-auth', split: 'test', query: '401 invalid api key wrong endpoint', relevantFilePaths: ['network/authentication.md'] },
    { id: 'test-schema', split: 'test', query: 'validate json choices message content', relevantFilePaths: ['network/response-validation.md'] },
    { id: 'test-p95', split: 'test', query: 'slow tail latency hidden by average', relevantFilePaths: ['network/latency.md'] },
    { id: 'test-frontmatter', split: 'test', query: 'structured note properties between triple dashes', relevantFilePaths: ['obsidian/frontmatter.md'] },
    { id: 'test-wikilink', split: 'test', query: 'double bracket note link with alias heading', relevantFilePaths: ['obsidian/wikilinks.md'] },
    { id: 'test-lifecycle', split: 'test', query: 'register on load release events on unload', relevantFilePaths: ['obsidian/plugin-lifecycle.md'] },
    { id: 'test-excalidraw', split: 'test', query: 'exclude generated drawing markdown from retrieval', relevantFilePaths: ['obsidian/excalidraw.md'] },
    { id: 'test-file-filter', split: 'test', query: 'plugin file privacy exclude paths from ai tools', relevantFilePaths: ['privacy/file-filters.md'] },
    { id: 'test-scan-limit', split: 'test', query: 'cap markdown files per query to bound retrieval latency', relevantFilePaths: ['performance/scan-limit.md'] }
];

export const OFFLINE_RETRIEVAL_DATASET: OfflineRetrievalDataset = {
    version: '1.0.0',
    description: 'Synthetic, deterministic Obsidian Agentic RAG corpus with development and frozen test queries.',
    documents,
    cases: [...developmentCases, ...testCases]
};
