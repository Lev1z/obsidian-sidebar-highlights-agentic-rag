export interface RetrievalDocument {
    filePath: string;
    content: string;
}

export interface RetrievalResult {
    filePath: string;
    snippet: string;
    score: number;
}

export interface RetrievalOptions {
    topK: number;
}

export interface RetrievalStrategy {
    readonly id: string;
    readonly displayName: string;
    rank(
        query: string,
        documents: RetrievalDocument[],
        options: RetrievalOptions
    ): RetrievalResult[];
}
