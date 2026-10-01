import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverAndLoadExtensions, withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { fixture } from './fixtures.mjs';

const eventFor = (path) => ({ toolName: 'write', input: { path }, isError: false, content: [] });
const output = (result) => result?.content?.map((part) => part.text).join('\n') ?? '';

test('Pi discovers and loads the generated TypeScript extension with its real jiti loader', async (t) => {
  const f = await fixture(t);
  const agentDir = join(f.root, 'empty-agent-dir');
  await mkdir(agentDir);
  const loaded = await discoverAndLoadExtensions([], f.root, agentDir);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.deepEqual([...loaded.extensions[0].handlers.keys()].sort(), [
    'agent_before_settle', 'before_agent_start', 'session_start', 'tool_call', 'tool_result',
  ]);
  // Loading only registers hooks; no unbound runtime actions/processes execute.
  const gate = loaded.extensions[0].handlers.get('tool_call')[0];
  await gate({ toolName: 'write', input: { path: 'a.py' } }, f.ctx);
  await gate({ toolName: 'write', input: { path: 'b.py' } }, f.ctx);
  const blocked = await gate({ toolName: 'write', input: { path: 'c.py' } }, f.ctx);
  assert.equal(blocked.block, true);
});

test('post-write formatter participates in Pi file-mutation queue', async (t) => {
  const f = await fixture(t);
  await f.put('source.py', 'x = 1\n');
  let release;
  let acquired;
  const ready = new Promise((resolve) => { acquired = resolve; });
  const lock = withFileMutationQueue(join(f.root, 'source.py'), async () => {
    acquired();
    await new Promise((resolve) => { release = resolve; });
  });
  await ready;
  let finished = false;
  const result = f.handlers.get('tool_result')(eventFor('source.py'), f.ctx).then((value) => {
    finished = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(finished, false);
  release();
  await lock;
  assert.match(output(await result), /Architecture check passed/);
});

test('running hooks are cancellable and timeout failures remain model-visible', async (t) => {
  const checks = [{ extensions: ['.py'], command: 'python3', args: ['-c', 'import time; time.sleep(30)'] }];
  const f = await fixture(t, { PI_CHECKS_JSON: JSON.stringify(checks) },
    (source) => source.replace('const TIMEOUT_MS = 120_000;', 'const TIMEOUT_MS = 300;'));
  await f.put('source.py', 'x = 1\n');
  const controller = new AbortController();
  const pending = f.handlers.get('tool_result')(eventFor('source.py'), { ...f.ctx, signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  const cancelled = await pending;
  assert.match(output(cancelled), /hook cancelled/);
  assert.match(output(cancelled), /REMEDIATION/);
  const timedOut = await f.handlers.get('tool_result')(eventFor('source.py'), f.ctx);
  assert.match(output(timedOut), /timed out/);
  assert.match(output(timedOut), /Architecture check passed/);
});

test('language-specific architecture configuration runs instead of the Python-only checker', async (t) => {
  const f = await fixture(t, { PI_ARCH_CHECK_JSON: JSON.stringify({
    extensions: ['.ts', '.tsx'], command: 'python3', args: ['ts_arch_fixture.py', '{file}'],
  }) });
  await f.put('ts_arch_fixture.py', 'import sys\nassert sys.argv[1].endswith(".tsx")\nprint("TS BOUNDARY VIOLATION: REMEDIATION: import from the service layer")\nsys.exit(1)\n');
  await f.put('source.tsx', 'export const value = 1;\n');
  const result = await f.handlers.get('tool_result')(eventFor('source.tsx'), f.ctx);
  assert.match(output(result), /TS BOUNDARY VIOLATION/);
  assert.doesNotMatch(output(result), /Architecture check passed/);
});
