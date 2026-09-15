import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'obsidian-retrieval-eval-'));
const outputFile = join(temporaryDirectory, 'retrieval-comparison.cjs');

try {
    await build({
        entryPoints: ['src/evals/run-retrieval-comparison.ts'],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        outfile: outputFile,
        logLevel: 'silent'
    });

    const result = spawnSync(process.execPath, [outputFile, ...process.argv.slice(2)], {
        cwd: process.cwd(),
        stdio: 'inherit'
    });
    process.exitCode = result.status ?? 1;
} finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
}
