import { extractRetrievalSnippet } from './keyword-retrieval';
import {
    RetrievalDocument,
    RetrievalOptions,
    RetrievalResult,
    RetrievalStrategy
} from './retrieval-types';

export interface Bm25Config {
    k1: number;
    b: number;
    titleWeight: number;
    phraseBoost: number;
}

const DEFAULT_CONFIG: Bm25Config = {
    k1: 1.2,
    b: 0.75,
    titleWeight: 2.5,
    phraseBoost: 1.5
};

const ENGLISH_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this',
    'to', 'was', 'what', 'when', 'where', 'which', 'with'
]);

export function tokenizeBm25Text(text: string): string[] {
    const segments = text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
    const tokens: string[] = [];

    for (const segment of segments) {
        if (/^[\u4e00-\u9fff]+$/.test(segment)) {
            if (segment.length === 1) {
                tokens.push(segment);
                continue;
            }
            for (let index = 0; index < segment.length - 1; index++) {
                tokens.push(segment.slice(index, index + 2));
            }
            continue;
        }

        if (segment.length >= 2 && !ENGLISH_STOP_WORDS.has(segment)) {
            tokens.push(segment);
        }
    }
    return tokens;
}

function extractTitleText(document: RetrievalDocument): string {
    const fileName = document.filePath
        .split('/')
        .pop()
        ?.replace(/\.md$/i, '')
        .replace(/[-_]+/g, ' ') ?? '';
    const headings = document.content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^#{1,2}\s+/.test(line))
        .slice(0, 20)
        .map(line => line.replace(/^#{1,2}\s+/, '').trim());
    return [fileName, ...headings].join(' ');
}

function termFrequencies(tokens: string[]): Map<string, number> {
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    return frequencies;
}

interface PreparedDocument {
    source: RetrievalDocument;
    titleText: string;
    titleTerms: Map<string, number>;
    bodyTerms: Map<string, number>;
    weightedLength: number;
}

function prepareDocument(document: RetrievalDocument, titleWeight: number): PreparedDocument {
    const titleText = extractTitleText(document);
    const titleTokens = tokenizeBm25Text(titleText);
    const bodyTokens = tokenizeBm25Text(document.content);
    return {
        source: document,
        titleText,
        titleTerms: termFrequencies(titleTokens),
        bodyTerms: termFrequencies(bodyTokens),
        weightedLength: Math.max(1, bodyTokens.length + titleTokens.length * titleWeight)
    };
}

export class Bm25RetrievalStrategy implements RetrievalStrategy {
    readonly id = 'bm25-title-v1';
    readonly displayName = 'BM25 with title weighting';
    private readonly config: Bm25Config;

    constructor(config: Partial<Bm25Config> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    rank(query: string, documents: RetrievalDocument[], options: RetrievalOptions): RetrievalResult[] {
        const queryTokens = [...new Set(tokenizeBm25Text(query))];
        if (queryTokens.length === 0 || documents.length === 0 || options.topK <= 0) {
            return [];
        }

        const prepared = documents
            .filter(document => document.content.trim().length > 0)
            .map(document => prepareDocument(document, this.config.titleWeight));
        if (prepared.length === 0) return [];

        const averageLength = prepared.reduce((sum, document) => sum + document.weightedLength, 0) / prepared.length;
        const documentFrequency = new Map<string, number>();
        for (const token of queryTokens) {
            const count = prepared.filter(document =>
                document.titleTerms.has(token) || document.bodyTerms.has(token)
            ).length;
            documentFrequency.set(token, count);
        }

        const normalizedQuery = query.trim().toLowerCase();
        const results: RetrievalResult[] = [];
        for (const document of prepared) {
            let score = 0;
            for (const token of queryTokens) {
                const titleFrequency = document.titleTerms.get(token) ?? 0;
                const bodyFrequency = document.bodyTerms.get(token) ?? 0;
                const weightedFrequency = titleFrequency * this.config.titleWeight + bodyFrequency;
                if (weightedFrequency === 0) continue;

                const matchingDocuments = documentFrequency.get(token) ?? 0;
                const inverseDocumentFrequency = Math.log(
                    1 + (prepared.length - matchingDocuments + 0.5) / (matchingDocuments + 0.5)
                );
                const lengthNormalization = this.config.k1 * (
                    1 - this.config.b + this.config.b * document.weightedLength / averageLength
                );
                score += inverseDocumentFrequency * (
                    weightedFrequency * (this.config.k1 + 1)
                ) / (weightedFrequency + lengthNormalization);
            }

            if (normalizedQuery && document.titleText.toLowerCase().includes(normalizedQuery)) {
                score += this.config.phraseBoost;
            }
            if (score <= 0) continue;

            results.push({
                filePath: document.source.filePath,
                snippet: extractRetrievalSnippet(document.source.content, query, queryTokens),
                score
            });
        }

        return results
            .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
            .slice(0, options.topK);
    }
}

export const bm25RetrievalStrategy = new Bm25RetrievalStrategy();
