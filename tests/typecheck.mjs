import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo, adapter, render, extensionValues } from './fixtures.mjs';

const root = await mkdtemp(join(repo, '.pi-test-typecheck-'));
try {
  const extension = join(root, '.pi/extensions/harness.ts');
  await mkdir(join(root, '.pi/extensions'), { recursive: true });
  await writeFile(extension, await render(join(adapter, '.pi/extensions/harness.ts.tmpl'), extensionValues));
  const result = spawnSync(process.execPath, [
    join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--skipLibCheck', extension,
  ], { cwd: repo, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
