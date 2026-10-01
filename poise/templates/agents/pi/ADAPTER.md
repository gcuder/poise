# Pi Adapter

## What this provides

| Generated file | Purpose |
|---|---|
| `.pi/extensions/harness.ts` | Native session brief, prompt reminders, edit gate, command guard, post-write feedback, and end-of-run reminders |
| `.pi/hooks/archive_plans.py` | Archives fully checked plans using the core `_plans.py` parser; never overwrites history |
| `.pi/prompts/plan.md` | `/plan <task>` — create a versioned plan and ask for approval |
| `.pi/prompts/sync-docs.md` | `/sync-docs` — read-only drift audit |

## What it requires

- Pi **0.99.2 or newer** (`@earendil-works/pi-coding-agent` API). Older builds
  using `@mariozechner/pi-coding-agent` are not supported by this template.
- Node.js 22.19+ (Pi requirement), Python 3.10+, Git, and the repository's
  formatter/linter executables on PATH.
- Review and trust the generated project resources. Start Pi from the repo
  root and grant project trust, then `/reload` after generation. For automation
  use a reviewed saved trust decision or `pi --approve -p "<task>"`.
  Project extensions do not run when trust is declined or extensions disabled.
- No Bun, extension compilation step, npm runtime dependency, or settings-file
  changes are needed. Pi supplies the imported API and file mutation queue.

## Entry file

Pi reads `AGENTS.md` natively. Do not replace Pi's system prompt or create a
second entry file. The extension refreshes rules and the current active plan
before each user run so resume, branching, and compaction do not leave stale
plan information as the only guidance.

## Hook mechanism

| Pi event | Behavior |
|---|---|
| `session_start` | Runs `session_brief.py`; persists a visible custom message in model context |
| `before_agent_start` | Returns a context message with fresh brief and `nudge_plan.py` output |
| `tool_call` | Gates built-in `write`/`edit` via `require_plan.py --pretooluse`; guards `bash`/`powershell` command strings |
| `tool_result` | After successful `write`/`edit`, runs ordered formatter/linter commands, architecture and style checks; appends output to the tool result |
| `agent_before_settle` | On successful completion, archives finished plans and appends a docs reminder, without requesting another model turn |

Scripts receive JSON on stdin, run from the harness root, and inherit the
`POISE_*` escape hatches. Hook failures are model-visible; gate failures block
rather than silently permitting edits. Cancellation and timeouts kill the hook
process. Output is bounded (12,000 characters) to protect context and memory.

Gate invocations are serialized to prevent parallel tool calls losing updates
in the shared Python state file. State keys include the root and Pi session ID,
so unrelated repositories/sessions do not share the gate count. Counts remain
session-scoped (including attempted blocked paths), not task-scoped: start a
new Pi session for an unrelated task. Switching transcript branches does not
reset the gate. Checks are serialized and use Pi's file-mutation queue for the
formatted file so built-in writes cannot race the formatter on that path.

## Generator configuration

Fill `PI_CHECKS_JSON` with an ordered JSON array of format/lint command specs:

```json
[
  {"extensions": [".py"], "command": "ruff", "args": ["format", "{file}"]},
  {"extensions": [".py"], "command": "ruff", "args": ["check", "{file}"]}
]
```

Examples for other stacks:
- TypeScript: `npx prettier --write {file}`, then `npx eslint {file}`.
- Go: `gofmt -w {file}`, then the repo's `golangci-lint run` command.
- Rust: `rustfmt {file}`, then the repo's `cargo clippy` command.

Express each command as `command` plus separate argv strings. Never inject
shell snippets. Prefer existing repo commands/tool versions. Checks should
lint without auto-fixes; the formatter is the intentional file mutation.
Include required package/workspace arguments, and use `[]` only when no
formatter/linter exists (tell the user what enforcement is missing).

Fill `DANGEROUS_PATTERNS_TS` and `SECRET_PATTERNS_TS` with additional JavaScript
regex literals appropriate to the deployment target/secret conventions, or
empty strings. Do not include literal credentials. Add a Secrets section to
`docs/conventions.md` so guard remediation anchors resolve.

Fill `PI_ARCH_CHECK_JSON` with one architecture command spec. For Python:

```json
{"extensions": [".py"], "command": "python3", "args": ["scripts/check_architecture.py", "{file}"]}
```

The core architecture checker inspects **Python imports only**. For non-Python
repos, generate the language-specific architecture checker and configure that
command, or use `null` and report architecture enforcement as unavailable.
Unsupported source file types produce an explicit model-visible coverage gap,
not a misleading successful no-op scan. The core style checker can inspect
other source extensions when configured accordingly.

## Known limitations

- This is a workflow guard, **not a sandbox**. Arbitrary shell commands,
  custom/MCP tools, direct filesystem access, and user `!` shell commands can
  bypass the edit gate and post-write checks. Regex command guards are heuristic,
  not a security boundary. Keep lefthook's commit gate and CI checks installed.
- The adapter only gates/formats paths within its harness root; paths outside
  it are left alone. It does not override other extensions or permissions.
- Queues coordinate this extension runtime and Pi's built-in mutations, not
  independent Pi processes or external editors. Whole-project formatter/linter
  commands that mutate additional files are discouraged.
- Reminders are advisory. End-of-run reminders reach subsequent model context;
  they do not force a continuation or guarantee immediate docs changes.
- Archival requires active/completed directories on the same filesystem. A
  collision or filesystem error leaves the active plan intact and prints
  remediation. Plans with no checkboxes or unfinished steps are never archived.
- Start Pi at the root for normal project resource discovery. Explicit loading
  from a subdirectory (`pi -e /repo/.pi/extensions/harness.ts`) is supported by
  the adapter's path handling, but prompt/resource discovery remains Pi's job.

Upstream references: [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md),
[project trust](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md),
[prompt templates](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/prompt-templates.md).
