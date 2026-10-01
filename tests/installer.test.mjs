import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo } from './fixtures.mjs';

test('installer supports Pi agent-dir override, paths with spaces, sync/status/uninstall, and no partial overwrite', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'poise installer '));
  t.after(() => rm(home, { recursive: true, force: true }));
  const piDir = join(home, 'custom pi');
  const codexDir = join(home, 'custom codex');
  const command = (target, ...args) => spawnSync('make', [target, ...args], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, HOME: home, CODEX_HOME: codexDir, PI_CODING_AGENT_DIR: piDir },
  });
  const dests = [join(home, '.claude/skills/poise'), join(codexDir, 'skills/poise'), join(piDir, 'skills/poise')];
  const installed = command('install');
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  for (const dest of dests) {
    assert.match(await readFile(join(dest, 'SKILL.md'), 'utf8'), /#### Pi/);
    await access(join(dest, 'templates/agents/pi/.pi/extensions/harness.ts.tmpl'));
  }
  assert.match(command('install-check').stdout, /Pi[\s\S]*in sync/);
  // Install refuses if ANY target exists before writing another target.
  await rm(dests[0], { recursive: true });
  assert.notEqual(command('install').status, 0);
  await assert.rejects(access(dests[0]));
  await writeFile(join(dests[2], 'SKILL.md'), 'drift');
  assert.match(command('install-check').stdout, /Pi[\s\S]*drifted/);
  assert.equal(command('sync').status, 0);
  assert.match(command('install-check').stdout, /Pi[\s\S]*in sync/);
  await mkdir(join(piDir, 'skills/unrelated'), { recursive: true });
  await writeFile(join(piDir, 'skills/unrelated/keep'), 'keep');
  assert.equal(command('uninstall', 'FORCE=1').status, 0);
  for (const dest of dests) await assert.rejects(access(dest));
  await access(join(piDir, 'skills/unrelated/keep'));
});
