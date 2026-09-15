export interface FileFilterRule {
    path: string;
    mode: 'exclude' | 'include';
}

function normalizePath(path: string): string {
    return path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function pathMatches(filePath: string, filterPath: string): boolean {
    return filePath === filterPath || filePath.startsWith(`${filterPath}/`);
}

/**
 * Include rules act as an allowlist. A matching include rule takes precedence
 * over an exclude rule so a child path can be restored inside an excluded tree.
 */
export function isPathExcludedByFilters(filePath: string, filters?: FileFilterRule[]): boolean {
    if (!filters || filters.length === 0) {
        return false;
    }

    const normalizedFilePath = normalizePath(filePath);
    let hasIncludeFilters = false;
    let matchesIncludeFilter = false;
    let matchesExcludeFilter = false;

    for (const filter of filters) {
        const normalizedFilterPath = normalizePath(filter.path);
        if (!normalizedFilterPath) {
            continue;
        }

        if (filter.mode === 'include') {
            hasIncludeFilters = true;
        }

        if (!pathMatches(normalizedFilePath, normalizedFilterPath)) {
            continue;
        }

        if (filter.mode === 'include') {
            matchesIncludeFilter = true;
        } else {
            matchesExcludeFilter = true;
        }
    }

    if (matchesIncludeFilter) {
        return false;
    }
    if (hasIncludeFilters) {
        return true;
    }
    return matchesExcludeFilter;
}

export function isExcludedMarkdownPath(
    filePath: string,
    filters?: FileFilterRule[],
    excludeExcalidraw = false
): boolean {
    const normalized = normalizePath(filePath).toLowerCase();
    if (excludeExcalidraw && normalized.endsWith('.excalidraw.md')) {
        return true;
    }
    return isPathExcludedByFilters(filePath, filters);
}
