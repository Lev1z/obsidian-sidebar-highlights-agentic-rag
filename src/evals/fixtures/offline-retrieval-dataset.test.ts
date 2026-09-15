import { OFFLINE_RETRIEVAL_DATASET } from './offline-retrieval-dataset';

describe('offline retrieval dataset', () => {
    it('contains the promised corpus and query counts', () => {
        expect(OFFLINE_RETRIEVAL_DATASET.documents).toHaveLength(50);
        expect(OFFLINE_RETRIEVAL_DATASET.cases).toHaveLength(40);
        expect(OFFLINE_RETRIEVAL_DATASET.cases.filter(item => item.split === 'development')).toHaveLength(15);
        expect(OFFLINE_RETRIEVAL_DATASET.cases.filter(item => item.split === 'test')).toHaveLength(25);
    });

    it('uses unique ids, unique paths, and valid relevance labels', () => {
        const paths = OFFLINE_RETRIEVAL_DATASET.documents.map(item => item.filePath);
        const ids = OFFLINE_RETRIEVAL_DATASET.cases.map(item => item.id);
        expect(new Set(paths).size).toBe(paths.length);
        expect(new Set(ids).size).toBe(ids.length);

        const knownPaths = new Set(paths);
        for (const item of OFFLINE_RETRIEVAL_DATASET.cases) {
            expect(item.relevantFilePaths.length).toBeGreaterThan(0);
            for (const relevantPath of item.relevantFilePaths) {
                expect(knownPaths.has(relevantPath)).toBe(true);
            }
        }
    });
});
