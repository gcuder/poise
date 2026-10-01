import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixtures.mjs';

const text = (result) => result?.content?.filter((part) => part.type === 'text').map((part) => part.text).join('\n') ?? '';
const toolResult = (path, extra = {}) => ({
  toolName: 'write', input: { path }, isError: false,
  content: [{ type: 'text', text: 'Original write result' }], details: { original: true }, ...extra,
});
const settle = (outcome = 'completed') => ({ outcome, entries: [], continue: false });

// Tests invoke native handlers with the actual Pi runtime queue and execute real
// Python scripts. No model/API key, UI mocks, shell execution, or paid requests.
test('session brief and prompt nudge reach model context without replacing the system prompt', async (t) => {
  const f = await fixture(t);
  await f.handlers.get('session_start')({}, f.ctx);
  assert.match(f.messages[0].content, /POISE HARNESS BRIEF/);
  assert.equal(f.messages[0].display, true);
  const result = await f.handlers.get('before_agent_start')({ prompt: 'Implement a new feature across all files in this whole codebase', systemPrompt: 'keep me' }, f.ctx);
  assert.match(result.message.content, /Respect the layer model/);
  assert.match(result.message.content, /Before editing any files/);
  assert.equal(result.systemPrompt, undefined);
  await f.put('docs/exec-plans/active/work.md', '# Work\n- [x] first\n- [ ] next\n');
  const resumed = await f.handlers.get('before_agent_start')({ prompt: 'continue' }, f.ctx);
  assert.match(resumed.message.content, /next/);
  assert.match(resumed.message.content, /active plan/);
});

test('parallel edits cannot bypass the third-source-file gate; docs and plans stay writable', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(['one.py', 'two.ts', 'three.go', 'four.rs'].map((path) => f.call('write', path)));
  assert.equal(results.filter((r) => r?.block).length, 2);
  assert.match(results[2].reason, /Create docs\/exec-plans\/active/);
  assert.equal(await f.call('edit', 'docs/exec-plans/active/plan.md'), undefined);
  assert.equal(await f.call('write', 'config.json'), undefined);
  await f.put('docs/exec-plans/active/plan.md', '# Plan\n- [ ] implement\n');
  assert.equal(await f.call('write', 'three.go'), undefined);
});

test('repeat edits count once; session IDs isolate state; missing gate fails closed', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) assert.equal(await f.call('edit', 'one.py'), undefined);
  assert.equal(await f.call('write', 'two.py'), undefined);
  assert.equal((await f.call('write', 'three.py')).block, true);
  const other = { ...f.ctx, sessionManager: { getSessionId: () => 'another-session' } };
  assert.equal(await f.call('write', 'three.py', other), undefined);
  await unlink(join(f.root, 'scripts/require_plan.py'));
  const broken = await f.call('write', 'another.py');
  assert.equal(broken.block, true);
  assert.match(broken.reason, /REMEDIATION/);
});

test('input paths are relative to ctx.cwd; symlink escapes and outside paths are left alone', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, 'nested'), { recursive: true });
  const nested = { ...f.ctx, cwd: join(f.root, 'nested') };
  await f.call('write', 'one.py', nested);
  await f.call('write', 'two.py', nested);
  assert.equal((await f.call('write', 'three.py', nested)).block, true);
  assert.equal(await f.call('write', '../outside.py'), undefined);
  await symlink(join(f.root, '..'), join(f.root, 'escape'));
  assert.equal(await f.call('write', 'escape/outside.py'), undefined);
  assert.equal(await f.call('write', 'escape/new/nested/outside.py'), undefined);
});

test('command guards block without echoing credentials; safe bash is unaffected', async (t) => {
  const f = await fixture(t);
  const handler = f.handlers.get('tool_call');
  for (const command of ['rm -rf /', 'rm -fr /*', 'rm -rf *', 'DROP DATABASE prod', 'cat .env']) {
    assert.equal((await handler({ toolName: 'bash', input: { command } }, f.ctx)).block, true);
  }
  const secret = await handler({ toolName: 'bash', input: { command: 'echo password=VERY_SECRET_LITERAL' } }, f.ctx);
  assert.doesNotMatch(secret.reason, /VERY_SECRET_LITERAL/);
  assert.equal(await handler({ toolName: 'bash', input: { command: 'git status' } }, f.ctx), undefined);
  assert.equal((await handler({ toolName: 'powershell', input: { command: 'DROP TABLE prod' } }, f.ctx)).block, true);
});

test('post-write checks are ordered, argv-safe, and preserve original tool content and success', async (t) => {
  const checks = [
    { extensions: ['.py'], command: 'python3', args: ['formatter.py', '{file}'] },
    { extensions: ['.py'], command: 'python3', args: ['linter.py', '{file}'] },
  ];
  const f = await fixture(t, { PI_CHECKS_JSON: JSON.stringify(checks) });
  await f.put('formatter.py', 'import pathlib, sys\np = pathlib.Path(sys.argv[1])\np.write_text(p.read_text() + "# formatted\\n")\n');
  await f.put('linter.py', 'import pathlib, sys\nassert pathlib.Path(sys.argv[1]).read_text().endswith("# formatted\\n")\nprint("REMEDIATION: fake lint issue")\nsys.exit(1)\n');
  const name = "source file 'quotes.py";
  await f.put(name, 'import forbidden_sdk\nprint("bad")\n');
  const result = await f.handlers.get('tool_result')(toolResult(name, { structuredContent: { preserved: true } }), f.ctx);
  assert.match(text(result), /Original write result/);
  assert.match(text(result), /fake lint issue/);
  assert.match(text(result), /Forbidden import/);
  assert.match(text(result), /STYLE VIOLATION/);
  assert.match(text(result), /REMEDIATION/);
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, { preserved: true });
  assert.match(await readFile(join(f.root, name), 'utf8'), /# formatted/);
  assert.equal(await f.handlers.get('tool_result')(toolResult(name, { isError: true }), f.ctx), undefined);
});

test('formatter failure does not suppress subsequent lint or structural checks', async (t) => {
  const f = await fixture(t, { PI_CHECKS_JSON: JSON.stringify([
    { extensions: ['.ts'], command: 'poise-missing-formatter-fixture', args: ['{file}'] },
    { extensions: ['.ts'], command: 'python3', args: ['-c', 'print("NEXT CHECK RAN")'] },
  ]) });
  await f.put('source.ts', 'const x = 1;\n');
  const result = await f.handlers.get('tool_result')(toolResult('source.ts'), f.ctx);
  assert.match(text(result), /cannot run poise-missing-formatter-fixture/);
  assert.match(text(result), /NEXT CHECK RAN/);
  assert.match(text(result), /Style check passed/i);
  assert.match(text(result), /architecture boundaries are NOT checked/);
});

test('cancelled gate blocks, cancelled checks report failure, verbose output is bounded', async (t) => {
  const f = await fixture(t, { PI_CHECKS_JSON: JSON.stringify([
    { extensions: ['.py'], command: 'python3', args: ['-c', 'print("x" * 100000)'] },
  ]) });
  const controller = new AbortController();
  controller.abort();
  assert.equal((await f.call('write', 'source.py', { ...f.ctx, signal: controller.signal })).block, true);
  await f.put('source.py', 'x = 1\n');
  const result = await f.handlers.get('tool_result')(toolResult('source.py'), f.ctx);
  assert.ok(text(result).length < 12_100);
  assert.match(text(result), /truncated/);
});

test('end-of-run archives only finished plans, never overwrites, and never forces a continuation', async (t) => {
  const f = await fixture(t);
  await f.put('docs/exec-plans/active/done.md', '# Done\n- [x] done\n');
  await f.put('docs/exec-plans/active/unfinished.md', '# Pending\n- [x] done\n- [ ] next\n');
  await f.put('docs/exec-plans/active/empty.md', '# Draft\n');
  await f.put('docs/exec-plans/active/collision.md', '# New\n- [x] done\n');
  await f.put('docs/exec-plans/completed/collision.md', '# Historical\n');
  assert.equal(await f.handlers.get('agent_before_settle')(settle('aborted'), f.ctx), undefined);
  const result = await f.handlers.get('agent_before_settle')(settle(), f.ctx);
  assert.equal(result.continue, undefined);
  assert.match(result.entries[0].content, /archived completed plan/);
  assert.match(result.entries[0].content, /both plans were preserved/);
  assert.equal(await readFile(join(f.root, 'docs/exec-plans/completed/collision.md'), 'utf8'), '# Historical\n');
  for (const name of ['unfinished', 'empty', 'collision']) {
    assert.ok(await readFile(join(f.root, `docs/exec-plans/active/${name}.md`), 'utf8'));
  }
  await assert.rejects(readFile(join(f.root, 'docs/exec-plans/active/done.md')), { code: 'ENOENT' });
});

test('docs nudge is model-visible but advisory, and escape hatches are honored', async (t) => {
  const f = await fixture(t);
  await f.put('scripts/nudge_docs.py', 'print("POISE_NUDGE: update docs")\n');
  const result = await f.handlers.get('agent_before_settle')(settle(), f.ctx);
  assert.match(result.entries[0].content, /update docs/);
  assert.equal(result.continue, undefined);
  const keys = ['POISE_BRIEF', 'POISE_NUDGE_PLAN', 'POISE_GATE', 'POISE_NUDGE_DOCS'];
  const old = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) process.env[key] = '0';
    await f.handlers.get('session_start')({}, f.ctx);
    assert.equal(f.messages.length, 0);
    assert.equal(await f.handlers.get('before_agent_start')({ prompt: 'implement across all files' }, f.ctx), undefined);
    await unlink(join(f.root, 'scripts/require_plan.py'));
    assert.equal(await f.call('write', 'source.py'), undefined);
    assert.equal(await f.handlers.get('agent_before_settle')(settle(), f.ctx), undefined);
  } finally {
    keys.forEach((key, index) => old[index] === undefined ? delete process.env[key] : process.env[key] = old[index]);
  }
});
