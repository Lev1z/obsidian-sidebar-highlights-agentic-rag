import {
    RetrievalDocument,
    RetrievalOptions,
    RetrievalResult,
    RetrievalStrategy
} from './retrieval-types';

export function tokenizeKeywordText(text: string, limit = 16): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/)
        .map(token => token.trim())
        .filter(token => token.length >= 2)
        .slice(0, limit);
}

function extractHeadingLines(content: string): string[] {
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^#{1,2}\s+/.test(line))
        .slice(0, 20)
        .map(line => line.replace(/^#{1,2}\s+/, '').trim());
}

function buildBigrams(text: string): string[] {
    const source = text.trim();
    const result: string[] = [];
    for (let index = 0; index < source.length - 1; index++) {
        result.push(source.slice(index, index + 2));
    }
    return result;
}

function diceCoefficient(left: string, right: string): number {
    if (left === right) {
        return 1;
    }
    if (!left || !right) {
        return 0;
    }
    if (left.length < 2 || right.length < 2) {
        return left === right ? 1 : 0;
    }

    const leftBigrams = buildBigrams(left);
    const rightBigrams = buildBigrams(right);
    if (leftBigrams.length === 0 || rightBigrams.length === 0) {
        return 0;
    }

    const used = new Array<boolean>(rightBigrams.length).fill(false);
    let overlap = 0;
    for (const leftBigram of leftBigrams) {
        for (let index = 0; index < rightBigrams.length; index++) {
            if (!used[index] && leftBigram === rightBigrams[index]) {
                overlap++;
                used[index] = true;
                break;
            }
        }
    }
    return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function bestFuzzySimilarity(token: string, candidates: string[]): number {
    if (!token || candidates.length === 0) {
        return 0;
    }

    let best = 0;
    for (const candidate of candidates) {
        if (!candidate || candidate.length < 2) continue;
        best = Math.max(best, diceCoefficient(token, candidate));
        if (best >= 0.95) break;
    }
    return best;
}

function countOccurrences(text: string, token: string): number {
    let count = 0;
    let fromIndex = 0;
    while (true) {
        const index = text.indexOf(token, fromIndex);
        if (index === -1) break;
        count++;
        fromIndex = index + token.length;
    }
    return count;
}

export function extractRetrievalSnippet(
    content: string,
    query: string,
    queryTokens: string[]
): string {
    const lines = content.split('\n');
    const lowerQuery = query.toLowerCase();
    let bestLineIndex = -1;
    let bestLineScore = -1;

    for (let index = 0; index < lines.length; index++) {
        const lowerLine = lines[index].toLowerCase();
        let lineScore = lowerLine.includes(lowerQuery) ? 5 : 0;
        for (const token of queryTokens) {
            if (token && lowerLine.includes(token)) lineScore++;
        }
        if (lineScore > bestLineScore) {
            bestLineScore = lineScore;
            bestLineIndex = index;
        }
    }

    if (bestLineIndex === -1) {
        return lines.slice(0, 6).join('\n').slice(0, 500);
    }
    const start = Math.max(0, bestLineIndex - 2);
    const end = Math.min(lines.length, bestLineIndex + 3);
    return lines.slice(start, end).join('\n').slice(0, 600);
}

export function scoreKeywordDocument(
    query: string,
    document: RetrievalDocument
): RetrievalResult | null {
    const content = document.content.replace(/\r\n/g, '\n');
    if (!content.trim()) return null;

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryTokens = tokenizeKeywordText(query);
    const headingText = extractHeadingLines(content).join(' \n ').toLowerCase();
    const headingTokens = tokenizeKeywordText(headingText);
    const bodyTokens = tokenizeKeywordText(lowerContent, 400);
    let score = 0;

    if (headingText.includes(lowerQuery)) score += 12;
    if (lowerContent.includes(lowerQuery)) score += 7;

    for (const token of queryTokens) {
        const headingOccurrences = countOccurrences(headingText, token);
        if (headingOccurrences > 0) {
            score += Math.min(headingOccurrences, 3) * 3;
        }

        const bodyOccurrences = countOccurrences(lowerContent, token);
        if (bodyOccurrences > 0) {
            score += Math.min(bodyOccurrences, 4);
        }

        if (bestFuzzySimilarity(token, headingTokens) >= 0.82) {
            score += 2.5;
            continue;
        }
        if (bestFuzzySimilarity(token, bodyTokens) >= 0.78) score += 1.2;
    }

    if (score < 2) return null;
    return {
        filePath: document.filePath,
        snippet: extractRetrievalSnippet(content, query, queryTokens),
        score
    };
}

export const keywordRetrievalStrategy: RetrievalStrategy = {
    id: 'keyword-v1',
    displayName: 'Keyword heuristic baseline',
    rank(query: string, documents: RetrievalDocument[], options: RetrievalOptions): RetrievalResult[] {
        return documents
            .map(document => scoreKeywordDocument(query, document))
            .filter((result): result is RetrievalResult => result !== null)
            .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
            .slice(0, options.topK);
    }
};
