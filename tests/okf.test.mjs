import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { repo, render } from './fixtures.mjs';

// Real Python scripts against rendered templates in a throwaway git repo.
const core = join(repo, 'poise/templates/core');
const SCRIPTS = ['_okf.py', '_plans.py', 'check_okf.py', 'archive_plans.py', 'capture_plan.py', 'migrate_okf.py', 'gc_static.py', 'session_brief.py', 'nudge_plan.py'];

async function loose(source, values = {}) {
  const text = await readFile(source, 'utf8');
  return text
    .replace(/\{\{proposed \| accepted \| superseded\}\}/g, 'accepted')
    .replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => values[name] ?? `filled-${name.toLowerCase()}`);
}

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'poise-okf-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  for (const name of SCRIPTS) {
    await put(`scripts/${name}`, await render(join(core, `scripts/${name}.tmpl`), { REPO_NAME: 'fixture' }));
  }
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'dev@example.com');
  git('config', 'user.name', 'Dev');
  const py = (args, env = {}, input = '') => spawnSync('python3', args, {
    cwd: root, encoding: 'utf8', input, env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
  });
  const read = (path) => readFile(join(root, path), 'utf8');
  const okf = (code) => {
    const result = py(['-c', `import sys, json; sys.path.insert(0, "scripts"); import _okf\n${code}`]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  return { root, put, git, py, read, okf };
}

async function freshBundle(w) {
  const values = {
    REPO_NAME: 'fixture', POISE_VERSION: '1.1.0', GENERATED_AT: '2026-01-31T14:05:00Z',
    QUALITY_STALE_AFTER: '2999-01-01T00:00:00Z', ONE_LINE_SUMMARY: 'Use the approved SDK only.',
    NUMBER: '001', TITLE: 'Approved SDK',
  };
  const files = {
    'docs/index.md': 'docs/index.md.tmpl',
    'docs/architecture.md': 'docs/architecture.md.tmpl',
    'docs/conventions.md': 'docs/conventions.md.tmpl',
    'docs/workflows.md': 'docs/workflows.md.tmpl',
    'docs/quality.md': 'docs/quality.md.tmpl',
    'docs/decisions/001-approved-sdk.md': 'docs/decisions/ADR-template.md',
    'docs/exec-plans/index.md': 'docs/exec-plans/index.md',
    'docs/exec-plans/template.md': 'docs/exec-plans/template.md',
    'docs/product-specs/index.md': 'docs/product-specs/index.md',
    'docs/product-specs/template.md': 'docs/product-specs/template.md',
    'docs/references/index.md': 'docs/references/index.md',
  };
  for (const [dest, source] of Object.entries(files)) await w.put(dest, await loose(join(core, source), values));
  await mkdir(join(w.root, 'docs/exec-plans/active'), { recursive: true });
  await mkdir(join(w.root, 'docs/exec-plans/completed'), { recursive: true });
}

test('a freshly generated docs/ tree is a conformant OKF bundle', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  const before = w.py(['scripts/check_okf.py', '--fail-on-any']);
  assert.equal(before.status, 1);
  assert.match(before.stdout, /OKF_INDEX_STALE: docs\/index.md/);
  assert.doesNotMatch(before.stdout, /OKF_(NO_|BAD_|LEGACY)/);
  w.py(['scripts/check_okf.py', '--write-index']);
  const after = w.py(['scripts/check_okf.py', '--fail-on-any']);
  assert.equal(after.status, 0, after.stdout);
  assert.match(after.stdout, /conformant/);
  for (const doc of ['architecture', 'conventions', 'workflows', 'quality', 'decisions/001-approved-sdk']) {
    assert.match(await w.read(`docs/${doc}.md`), /^---\n[\s\S]*\ntags: \[filled-tags\]\n[\s\S]*?\n---\n/, doc);
  }
  const root = await w.read('docs/index.md');
  assert.match(root, /^---\nokf_version: "0.2"\n---/);
  assert.match(root, /- \[Architecture\]\(architecture.md\) — Layer model/);
  assert.match(root, /- \[decisions\/\]\(decisions\/index.md\)/);
  assert.match(await w.read('docs/references/index.md'), /^# References[\s\S]*External pointers[\s\S]*<!-- okf:listing -->/);
});

test('frontmatter round-trips, keeps unknown keys, and derives trust and staleness per OKF', async (t) => {
  const w = await workspace(t);
  const out = JSON.parse(w.okf(`
text = """---
type: Metric
title: "Revenue: net"
tags: [finance, kpi]
custom_key: keep me
generated:
  by: poise/1.1.0
  at: 2026-01-31T14:05:00Z
verified:
  by: human:dev@example.com
  at: 2026-02-01T00:00:00Z
stale_after: 2000-01-01T00:00:00Z
---

# Body
"""
meta, body = _okf.split(text)
again, body2 = _okf.split(_okf.join(meta, body))
print(json.dumps({
  "same": again == meta and body2 == body,
  "tags": meta["tags"], "custom": meta["custom_key"], "title": meta["title"],
  "events": _okf.verified_events(meta), "tier": _okf.trust_tier(meta),
  "machine": _okf.trust_tier({"verified": [{"by": "ci/1.0", "at": "x"}]}),
  "none": _okf.trust_tier({}), "stale": _okf.is_stale(meta),
  "fresh": _okf.is_stale({"stale_after": "2999-01-01T00:00:00Z"}),
}))`));
  assert.equal(out.same, true);
  assert.deepEqual(out.tags, ['finance', 'kpi']);
  assert.equal(out.custom, 'keep me');
  assert.equal(out.title, 'Revenue: net');
  assert.deepEqual(out.events, [{ by: 'human:dev@example.com', at: '2026-02-01T00:00:00Z' }]);
  assert.equal(out.tier, 'human-reviewed');
  assert.equal(out.machine, 'machine-confirmed');
  assert.equal(out.none, 'unverified');
  assert.equal(out.stale, true);
  assert.equal(out.fresh, false);
});

test('approved plan is captured as a human-verified draft exec plan', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  w.py(['scripts/check_okf.py', '--write-index']);
  await w.put('plan-src.md', '# Ship the Widget API\n\n## Context\n\nCustomers need widgets.\n\n## Steps\n- [ ] build\n');
  const result = w.py(['scripts/capture_plan.py', '--source', 'plan-src.md', '--by', 'claude-code/plan-mode']);
  assert.match(result.stdout, /active plan: docs\/exec-plans\/active\/ship-the-widget-api.md/);
  assert.match(result.stdout, /add `tags: \[\.\.\.\]` to its frontmatter/);
  assert.match(result.stdout, /plan is missing: Summary, Approach, Decisions, Verification\./);
  assert.doesNotMatch(result.stdout, /open question/);
  const plan = await w.read('docs/exec-plans/active/ship-the-widget-api.md');
  assert.match(plan, /^---\ntype: Exec Plan\ntitle: Ship the Widget API\ndescription: Customers need widgets.\nstatus: draft\n/);
  assert.match(plan, /generated:\n  by: claude-code\/plan-mode\n  at: \d{4}-\d{2}-\d{2}T/);
  assert.match(plan, /verified:\n  - by: human:dev@example.com\n/);
  assert.match(plan, /\n# Ship the Widget API\n/);
  assert.match(await w.read('docs/exec-plans/index.md'), /## active\n- \[Ship the Widget API\]\(active\/ship-the-widget-api.md\)/);
  const brief = w.py(['-c', 'import sys; sys.path.insert(0, "scripts"); import _plans; print(_plans.brief_active())']);
  assert.match(brief.stdout, /- Ship the Widget API \(docs\/exec-plans\/active\/ship-the-widget-api.md\) — 0\/1 done/);
});

test('a decision-first plan passes the section check and counts only top-level steps', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  await w.put('plan-src.md', [
    '# Add search', '', '## Summary', '', 'Users can search posts.', '',
    '## Approach', '', 'Postgres full-text index.', '',
    '## Decisions', '', '| Question | Choice | Why | Rejected |', '|---|---|---|---|', '| Engine | Postgres | in stack | Elastic: new service |', '',
    '## Open questions', '', '<!-- resolve before approval -->', '- assumed: English only', '- Paginate results?', '',
    '## Steps', '', '- [x] Add index', '  - files: `db/schema.sql`', '  - done when: migration runs',
    '- [ ] Add endpoint', '  - files: `api/search.py`', '  - done when: `make test` passes', '',
    '## Verification plan', '', '- `make test`', '',
  ].join('\n'));
  const result = w.py(['scripts/capture_plan.py', '--source', 'plan-src.md']);
  assert.doesNotMatch(result.stdout, /plan is missing/);
  assert.match(result.stdout, /1 open question\(s\) unresolved/);
  const brief = w.py(['-c', 'import sys; sys.path.insert(0, "scripts"); import _plans; print(_plans.brief_active())']);
  assert.match(brief.stdout, /— 1\/2 done\n    \[ \] Add endpoint\n?$/);
});

test('plan mode gets the template shape; other prompts stay quiet', async (t) => {
  const w = await workspace(t);
  const planning = w.py(['scripts/nudge_plan.py'], {}, JSON.stringify({ permission_mode: 'plan', prompt: 'fix the typo' }));
  assert.match(planning.stdout, /POISE: you are planning\. Write the plan with these sections from docs\/exec-plans\/template\.md: Summary, Context, Scope, Approach, Decisions, Open questions, Changes, Steps, Risks, Verification, Decision log\./);
  const normal = w.py(['scripts/nudge_plan.py'], {}, JSON.stringify({ permission_mode: 'default', prompt: 'fix the typo' }));
  assert.equal(normal.stdout, '');
});

test('finished plans are archived as stable with a log entry; legacy plans gain frontmatter', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  w.py(['scripts/check_okf.py', '--write-index']);
  await w.put('docs/exec-plans/active/okf.md', '---\ntype: Exec Plan\ntitle: OKF plan\nstatus: draft\n---\n\n# OKF plan\n- [x] done\n');
  await w.put('docs/exec-plans/active/legacy.md', '**Status**: active\n**Created**: 2026-01-02\n\n# Legacy plan\n\n## Steps\n- [x] done\n');
  await w.put('docs/exec-plans/active/pending.md', '---\ntype: Exec Plan\n---\n\n# Pending\n- [x] a\n- [ ] b\n');
  const result = w.py(['scripts/archive_plans.py']);
  assert.match(result.stdout, /archived completed plan to docs\/exec-plans\/completed\/okf.md/);
  const done = await w.read('docs/exec-plans/completed/okf.md');
  assert.match(done, /status: stable\n/);
  assert.match(done, /completed_at: \d{4}-\d{2}-\d{2}T/);
  const legacy = await w.read('docs/exec-plans/completed/legacy.md');
  assert.match(legacy, /^---\ntype: Exec Plan\ntitle: Legacy plan\n/);
  assert.doesNotMatch(legacy, /\*\*Status\*\*/);
  assert.match(legacy, /# Legacy plan\n\n## Steps\n- \[x\] done\n$/);
  assert.ok(await w.read('docs/exec-plans/active/pending.md'));
  const log = await w.read('docs/exec-plans/log.md');
  assert.match(log, /^# Exec plan log\n\n## \d{4}-\d{2}-\d{2}\n- \*\*Completion\*\*: \[/);
  assert.match(log, /\[OKF plan\]\(completed\/okf.md\)/);
  assert.match(await w.read('docs/exec-plans/index.md'), /## completed\n[\s\S]*\[OKF plan\]\(completed\/okf.md\)/);
  const check = w.py(['scripts/check_okf.py', '--fail-on-any']);
  assert.equal(check.status, 0, check.stdout);
});

test('gc sweep reports expired stale_after and resolves bundle-absolute links', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  await w.put('docs/references/old.md', '---\ntype: Reference\ntitle: Old\nstale_after: 2001-01-01T00:00:00Z\n---\n\n# Old\n\n[arch](/architecture.md) [gone](/missing.md)\n');
  w.py(['scripts/check_okf.py', '--write-index']);
  const result = w.py(['scripts/gc_static.py']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /OKF_STALE: docs\/references\/old.md/);
  assert.match(result.stdout, /BROKEN_LINK: docs\/references\/old.md → \/missing.md/);
  assert.doesNotMatch(result.stdout, /→ \/architecture.md/);
});

test('gc sweep ignores link-shaped text inside code', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  await w.put('docs/references/code.md', '---\ntype: Reference\ntitle: Code\n---\n\n# Code\n\n```python\nreturn BUILDERS[body.name](body)\n```\n\nInline `f[x](y)` too. [gone](missing.md)\n');
  w.py(['scripts/check_okf.py', '--write-index']);
  const result = w.py(['scripts/gc_static.py']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /BROKEN_LINK: docs\/references\/code.md → missing.md/);
  assert.doesNotMatch(result.stdout, /→ body/);
  assert.doesNotMatch(result.stdout, /→ y/);
});

test('index regeneration keeps the hand-written intro above the listing marker', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  await w.put('docs/product-specs/index.md', '# Product Specs\n\nOur custom intro.\n\n<!-- okf:listing -->\n\nstale listing\n');
  await w.put('docs/product-specs/widgets.md', '---\ntype: Product Spec\ntitle: Widgets\ndescription: Widget CRUD.\n---\n\n# Widgets\n');
  w.py(['scripts/check_okf.py', '--write-index']);
  const index = await w.read('docs/product-specs/index.md');
  assert.match(index, /^# Product Specs\n\nOur custom intro.\n\n<!-- okf:listing -->\n\n## Files\n/);
  assert.match(index, /- \[Widgets\]\(widgets.md\) — Widget CRUD./);
  assert.doesNotMatch(index, /stale listing/);
});

test('pre-commit staging picks up index listings that hooks rewrote after the last commit', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  w.py(['scripts/check_okf.py', '--write-index']);
  w.git('add', '-A');
  w.git('commit', '-qm', 'docs');
  // A plan appears outside the agent's commit (e.g. archived by the Stop hook).
  await w.put('docs/exec-plans/completed/done.md', '---\ntype: Exec Plan\ntitle: Done\ndescription: Finished.\nstatus: stable\n---\n\n# Done\n');
  w.git('add', 'docs/exec-plans/completed/done.md');
  const result = w.py(['scripts/check_okf.py', '--stage']);
  assert.equal(result.status, 0, result.stderr);
  const staged = w.git('diff', '--cached', '--name-only').stdout;
  assert.match(staged, /docs\/exec-plans\/index.md/);
  assert.equal(w.git('diff', '--name-only').stdout, '');
  assert.match(await w.read('docs/exec-plans/index.md'), /- \[Done\]\(completed\/done.md\) — Finished./);
});

test('index listings skip dotfiles such as gitignored gc reports', async (t) => {
  const w = await workspace(t);
  await freshBundle(w);
  await w.put('docs/.gc-report-2026-10-19.md', '# GC report\n');
  w.py(['scripts/check_okf.py', '--write-index']);
  assert.doesNotMatch(await w.read('docs/index.md'), /gc-report/);
  const after = w.py(['scripts/check_okf.py', '--fail-on-any']);
  assert.equal(after.status, 0, after.stdout);
});

test('session brief lists findings from the newest gc report only', async (t) => {
  const w = await workspace(t);
  await w.put('docs/.gc-report-20261001.md', '## OKF conformance\n- OLD_FINDING: docs/a.md\n');
  await w.put('docs/.gc-report-20261021.md', '## Stale plans (mtime)\n- (none)\n\n## OKF conformance\n- OKF_INDEX_STALE: docs/exec-plans/index.md\n\nTotal findings: 1\n');
  const startup = w.py(['scripts/session_brief.py'], {});
  assert.equal(startup.status, 0, startup.stderr);
  assert.match(startup.stdout, /Doc-gardening findings \(1, from docs\/.gc-report-20261021.md\)/);
  assert.match(startup.stdout, /- OKF_INDEX_STALE: docs\/exec-plans\/index.md/);
  assert.doesNotMatch(startup.stdout, /OLD_FINDING|\(none\)/);

  await w.put('docs/.gc-report-20261022.md', '## OKF conformance\n- (none)\n\nTotal findings: 0\n');
  const clean = w.py(['scripts/session_brief.py']);
  assert.doesNotMatch(clean.stdout, /Doc-gardening/);
});

async function legacyTree(w) {
  await w.put('docs/architecture.md', '# Architecture\n\n## Overview\n\nA web app.\n');
  await w.put('docs/quality.md', '# Quality\n\nCurrent state of the codebase.\n');
  await w.put('docs/decisions/001-no-orm.md', '# ADR 001: No ORM\n\n**Date**: 2025-05-01\n**Status**: superseded\n\n---\n\n## Context\n\nWe used raw SQL.\n');
  await w.put('docs/exec-plans/README.md', '# Execution Plans\n\nPlans are first-class repository artifacts.\n');
  await w.put('docs/exec-plans/template.md', '# <Title>\n\n**Status**: active\n**Created**: <date>\n**Affects**: <modules>\n\n## Goal\n');
  await w.put('docs/exec-plans/active/auth.md', '**Status**: active\n**Created**: 2026-03-04\n\n# Add auth\n\n**Affects**: api, db\n\n## Goal\n\nUsers can log in.\n\n## Steps\n- [x] schema\n- [ ] routes\n');
  await w.put('docs/exec-plans/completed/search.md', '**Completed**: 2026-02-10\n**Status**: active\n**Created**: 2026-01-20\n\n# Search\n\n## Steps\n- [x] index\n');
  await w.put('docs/product-specs/README.md', '# Product Specs\n\nFeature specifications.\n');
  await w.put('docs/references/README.md', '# References\n\nExternal pointers.\n');
  await w.put('docs/notes/random.md', '# Random notes\n');
  w.git('add', '-A');
  w.git('commit', '-qm', 'legacy docs');
}

const snapshot = async (root) => {
  const out = {};
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out[path.slice(root.length)] = await readFile(path, 'utf8');
    }
  };
  await walk(join(root, 'docs'));
  return out;
};

test('legacy docs migrate to OKF: dry run is read-only, apply is conformant and idempotent', async (t) => {
  const w = await workspace(t);
  await legacyTree(w);
  const legacyCheck = w.py(['scripts/check_okf.py']);
  assert.equal(legacyCheck.status, 0);
  assert.match(legacyCheck.stdout, /OKF_LEGACY: docs\/exec-plans\/active\/auth.md[^\n]*REMEDIATION: run `make migrate-docs`/);

  const before = await snapshot(w.root);
  const dry = w.py(['scripts/migrate_okf.py']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\+\+\+ b\/docs\/exec-plans\/active\/auth.md/);
  assert.match(dry.stdout, /UNCLASSIFIED: docs\/notes\/random.md/);
  assert.match(dry.stdout, /Dry run — nothing written/);
  assert.deepEqual(await snapshot(w.root), before);

  const applied = w.py(['scripts/migrate_okf.py', '--apply']);
  assert.equal(applied.status, 0, applied.stderr);
  const plan = await w.read('docs/exec-plans/active/auth.md');
  assert.match(plan, /^---\ntype: Exec Plan\ntitle: Add auth\ndescription: Users can log in.\nstatus: draft\naffects:\n  - api\n  - db\ngenerated:\n  by: process:poise-migrate\n  at: 2026-03-04T00:00:00Z\n---\n/);
  assert.ok(plan.endsWith('# Add auth\n\n## Goal\n\nUsers can log in.\n\n## Steps\n- [x] schema\n- [ ] routes\n'));
  assert.doesNotMatch(plan, /verified/);
  const done = await w.read('docs/exec-plans/completed/search.md');
  assert.match(done, /status: stable\n/);
  assert.match(done, /completed_at: 2026-02-10T00:00:00Z/);
  const adr = await w.read('docs/decisions/001-no-orm.md');
  assert.match(adr, /decision_status: superseded\nstatus: deprecated\n/);
  assert.match(adr, /at: 2025-05-01T00:00:00Z/);
  assert.match(await w.read('docs/architecture.md'), /^---\ntype: Architecture\n[\s\S]*at: \d{4}-\d{2}-\d{2}T/);
  assert.match(await w.read('docs/exec-plans/index.md'), /^# Execution Plans\n\nPlans are first-class repository artifacts.\n\n<!-- okf:listing -->/);
  await assert.rejects(stat(join(w.root, 'docs/exec-plans/README.md')), { code: 'ENOENT' });
  assert.match(w.git('status', '--short').stdout, /R[ M] docs\/exec-plans\/README.md -> docs\/exec-plans\/index.md/);
  assert.match(await w.read('docs/exec-plans/log.md'), /## 2026-02-10\n- \*\*Completion\*\*: \[Search\]\(completed\/search.md\)/);
  assert.match(await w.read('docs/index.md'), /^---\nokf_version: "0.2"\n---/);

  // Only the unclassified file remains; classify it and the bundle conforms.
  const check = w.py(['scripts/check_okf.py', '--fail-on-any']);
  assert.match(check.stdout, /OKF_NO_FRONTMATTER: docs\/notes\/random.md/);
  await w.put('docs/notes/random.md', '---\ntype: Note\n---\n\n# Random notes\n');
  w.py(['scripts/check_okf.py', '--write-index']);
  const final = w.py(['scripts/check_okf.py', '--fail-on-any']);
  assert.equal(final.status, 0, final.stdout);

  const settled = await snapshot(w.root);
  const again = w.py(['scripts/migrate_okf.py', '--apply']);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Migrated 0 concept\(s\), 0 index file\(s\)/);
  assert.deepEqual(await snapshot(w.root), settled);
});
