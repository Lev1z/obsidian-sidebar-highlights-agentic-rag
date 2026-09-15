import { isExcludedMarkdownPath, isPathExcludedByFilters } from './file-filter';

describe('file filters', () => {
    it('allows every path when no filters exist', () => {
        expect(isPathExcludedByFilters('notes/a.md')).toBe(false);
        expect(isPathExcludedByFilters('notes/a.md', [])).toBe(false);
    });

    it('excludes a folder and all descendants with normalized separators', () => {
        const filters = [{ path: 'private\\journal', mode: 'exclude' as const }];
        expect(isPathExcludedByFilters('private/journal/today.md', filters)).toBe(true);
        expect(isPathExcludedByFilters('private/other.md', filters)).toBe(false);
    });

    it('treats include filters as an allowlist', () => {
        const filters = [{ path: 'shared', mode: 'include' as const }];
        expect(isPathExcludedByFilters('shared/project.md', filters)).toBe(false);
        expect(isPathExcludedByFilters('private/project.md', filters)).toBe(true);
    });

    it('lets an include rule override a broader exclusion', () => {
        const filters = [
            { path: 'work', mode: 'exclude' as const },
            { path: 'work/public', mode: 'include' as const }
        ];
        expect(isPathExcludedByFilters('work/public/readme.md', filters)).toBe(false);
        expect(isPathExcludedByFilters('work/private/plan.md', filters)).toBe(true);
    });

    it('ignores empty filter paths', () => {
        expect(isPathExcludedByFilters('notes/a.md', [{ path: ' ', mode: 'exclude' }])).toBe(false);
    });

    it('can exclude Excalidraw Markdown files independently', () => {
        expect(isExcludedMarkdownPath('drawings/plan.excalidraw.md', [], true)).toBe(true);
        expect(isExcludedMarkdownPath('drawings/plan.md', [], true)).toBe(false);
        expect(isExcludedMarkdownPath('drawings/plan.excalidraw.md', [], false)).toBe(false);
    });
});
