import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const adapter = join(repo, 'poise/templates/agents/pi');
export async function render(source, replacements = {}) {
  const text = await readFile(source, 'utf8');
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in replacements)) throw new Error(`Unfilled placeholder ${name} in ${source}`);
    return replacements[name];
  });
}
export const extensionValues = {
  REPO_NAME: 'fixture', PI_CHECKS_JSON: '[]', DANGEROUS_PATTERNS_TS: '', SECRET_PATTERNS_TS: '',
  PI_ARCH_CHECK_JSON: JSON.stringify({ extensions: ['.py'], command: 'python3', args: ['scripts/check_architecture.py', '{file}'] }),
};
export async function fixture(t, values = {}, transform = (source) => source) {
  // Inside repo so the rendered extension resolves the actual Pi dev dependency.
  // Space and apostrophe exercise argv paths and JSON stdin (not shell quoting).
  const root = await mkdtemp(join(repo, ".pi-test-space '"));
  const sessions = new Set();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    for (const session of sessions) {
      const hash = createHash('sha256').update(root + '\0' + session).digest('hex');
      await rm(join(tmpdir(), `poise-plan-gate-pi-${hash}.json`), { force: true });
    }
  });
  const put = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  for (const name of ['_plans.py', 'session_brief.py', 'require_plan.py', 'nudge_plan.py', 'nudge_docs.py']) {
    await put(`scripts/${name}`, await render(join(repo, `poise/templates/core/scripts/${name}.tmpl`), { REPO_NAME: 'fixture' }));
  }
  const common = { REPO_NAME: 'fixture' };
  await put('scripts/check_architecture.py', await render(join(repo, 'poise/templates/core/scripts/check_architecture.py.tmpl'), {
    ...common, LAYER_MODEL_COMMENT: 'primitive → service', CROSS_CUTTING_LIST: '',
    LAYERS_LIST: "'primitive', 'service',", CROSS_CUTTING_SET: '',
    FORBIDDEN_PACKAGES_DICT: "'forbidden_sdk': 'Use the approved SDK; see docs/conventions.md#dependencies',",
    RESTRICTED_PACKAGES_DICT: '',
  }));
  await put('scripts/check_style.py', await render(join(repo, 'poise/templates/core/scripts/check_style.py.tmpl'), {
    ...common, FILE_EXTENSION: 'py', MAX_FILE_LINES: '400',
    BANNED_LOGGING_CALLS_LIST: '(r"\\bprint\\s*\\(", "print()"),',
    LOGGER_HINT: 'use structured logging', NAMING_RULES_LIST: '', COMPONENT_RULES_LIST: '',
    SOURCE_EXTENSIONS_SET: '".py", ".ts", ".tsx", ".go", ".rs"',
  }));
  await put('.pi/hooks/archive_plans.py', await render(join(adapter, '.pi/hooks/archive_plans.py.tmpl'), common));
  await put('.pi/extensions/harness.ts', transform(await render(join(adapter, '.pi/extensions/harness.ts.tmpl'), { ...extensionValues, ...values })));
  await put('AGENTS.md', '# Fixture\n\n## Read before you act\n- Read docs/architecture.md\n\n## Non-negotiable rules\n- Respect the layer model\n');
  await mkdir(join(root, 'docs/exec-plans/active'), { recursive: true });
  const handlers = new Map();
  const messages = [];
  const factory = (await import(pathToFileURL(join(root, '.pi/extensions/harness.ts')).href)).default;
  factory({ on: (event, handler) => handlers.set(event, handler), sendMessage: (message) => messages.push(message) });
  const randomSession = randomUUID();
  const ctx = { cwd: root, sessionManager: { getSessionId: () => { sessions.add(randomSession); return randomSession; } }, signal: undefined };
  const call = (toolName, path, context = ctx) => {
    sessions.add(context.sessionManager.getSessionId());
    return handlers.get('tool_call')({ toolName, input: { path } }, context);
  };
  return { root, put, handlers, messages, ctx, call };
}
