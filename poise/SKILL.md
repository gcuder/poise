---
name: harness-generator
description: >
  Generate a complete agent harness for any repository. Produces AGENTS.md,
  a boundary linter with remediation messages, structural tests, exec-plans,
  product-specs, and agent-specific hooks. Trigger: "generate harness",
  "set up harness", "build harness", "scaffold harness".
---

# harness-generator

Generate a complete OpenAI-style agent harness for any repository.
Works with Claude Code, Codex, OpenCode, or any coding agent.

---

## Phase 1 — Discovery

Read before writing anything. Do not generate files until Phase 2 is confirmed.

### 1.1 Read root files

Read: `README.md`, `pyproject.toml` / `package.json` / `Cargo.toml` / `go.mod`,
any existing `AGENTS.md` or `CLAUDE.md`, `Makefile` / `justfile`,
`.github/workflows/*.yml` (first two).

Record:
- `REPO_NAME` — package / repo name
- `LANGUAGE` — Python / TypeScript / Go / Rust / other
- `FRAMEWORK` — FastAPI / Express / gin / axum / other
- `EXISTING_COMMANDS` — build, test, lint, deploy commands already defined
- `DEPLOY_TARGET` — Cloud Run / k8s / Vercel / Lambda / unknown

### 1.2 Scan top-level directories

List all top-level directories (skip `.git`, `node_modules`, `.venv`, `dist`,
`build`, `.worktrees`). Read 2–3 representative files per directory to infer
its purpose. Record as `RAW_MODULES` = list of (dir_name, inferred_purpose).

### 1.3 Infer the layer model

Derive an ordered dependency chain where imports flow strictly forward.

Common patterns:

| Stack | Layer model |
|---|---|
| Python / FastAPI | `schemas → db → storage → pipeline → services → api` |
| TypeScript / Express | `types → models → repositories → services → controllers → routes` |
| Go | `domain → repository → service → handler` |
| Rust / Axum | `domain → persistence → application → web` |

If the repo doesn't match, ask: which directories contain the most primitive
types with no internal imports? Those are layer 0. Work upward.

Record as `LAYER_MODEL` = ordered list of module names.

### 1.4 Identify cross-cutting modules

Which directories are imported freely by multiple layers?
(auth, config, core, logging, middleware, shared, utils)
Record as `CROSS_CUTTING`.

### 1.5 Identify restricted packages

Packages that must only be used in one specific layer:

| Package type | Usually restricted to |
|---|---|
| LLM client (anthropic, openai, google.generativeai) | pipeline / LLM layer |
| DB ORM (sqlalchemy, prisma, gorm, diesel) | db / repository layer |
| Cloud storage (google.cloud.storage, boto3, @aws-sdk/s3) | storage layer |
| Secret manager | config / settings layer |

Record as `RESTRICTED_PACKAGES` = list of (package, allowed_layer, remediation_hint).

### 1.6 Identify forbidden packages

Packages that must never appear in the main app (e.g. heavy ML inference
libraries that belong in a separate service).
Record as `FORBIDDEN_PACKAGES` = list of (package, reason, alternative).

### 1.7 Read test setup

Test runner (pytest / jest / go test / cargo test), test location,
test command. Record as `TEST_RUNNER`, `TEST_COMMAND`.

### 1.8 Style invariants

Prompt the user for the four "golden principles" the OpenAI harness
article describes. Defaults are pre-filled per `LANGUAGE`; the user
can accept all defaults with one word.

1. **`MAX_FILE_LINES`** — per-file LOC ceiling. Default `400`.

2. **`BANNED_LOGGING_CALLS`** — list of `(regex, label)`. Defaults:

   | Language | Defaults |
   |---|---|
   | Python     | `(r"\bprint\s*\(", "print()")` |
   | TypeScript | `(r"\bconsole\.(log\|debug\|info)\s*\(", "console.*()")` |
   | Go         | `(r"\bfmt\.Print(ln\|f)?\s*\(", "fmt.Print*()")` |
   | Rust       | `(r"\bprintln!\s*\(", "println!()")` |

3. **`LOGGER_HINT`** — one sentence telling the agent what to use
   instead (e.g. `"use logging.getLogger(__name__) with structured fields"`).
   Default: derive from `LANGUAGE`; ask user to confirm.

4. **`NAMING_RULES`** — optional list of `{"glob", "symbol_regex", "check", "hint"}`.
   Skip if the user has no naming convention to enforce.

5. **`COMPONENT_RULES`** — optional list of `{"glob", "required", "hint"}`.
   Skip if the user has no component-structure rule.

Record as `STYLE_INVARIANTS`.

### 1.9 References seed

For each `RESTRICTED_PACKAGE` discovered in §1.5, propose a row for
`docs/references/README.md` pointing at the package's homepage / SDK
docs URL. Confirm with the user (they may add/remove rows).

Record as `REFERENCES_SEED_ROWS`.

### 1.10 Identify agent(s) in use

Ask the user which coding agent(s) they use:
- Claude Code
- Codex
- OpenCode
- Other (describe)
- Multiple (list them)

Record as `AGENTS` = list of agent names.

### 1.11 Confirm before generating

Present this summary and **wait for explicit confirmation**:

```
## Harness Discovery Summary

Repo:     {{REPO_NAME}}
Language: {{LANGUAGE}} / {{FRAMEWORK}}
Agent(s): {{AGENTS}}

Layer model:
  {{LAYER_MODEL_ARROWS}}

Cross-cutting: {{CROSS_CUTTING}}

Restricted packages:
  {{PACKAGE}} → only in {{LAYER}}

Forbidden packages:
  {{PACKAGE}} — {{REASON}}

Style invariants:
  Max file lines:   {{MAX_FILE_LINES}}
  Banned logging:   {{BANNED_LOGGING_CALLS_SUMMARY}}
  Logger to use:    {{LOGGER_HINT}}
  Naming rules:     {{NAMING_RULES_SUMMARY or "(none)"}}
  Component rules:  {{COMPONENT_RULES_SUMMARY or "(none)"}}

References to seed:
  {{REFERENCES_SEED_SUMMARY or "(none)"}}

Existing commands:
  test:   {{TEST_CMD}}
  lint:   {{LINT_CMD}}
  deploy: {{DEPLOY_CMD}}

Does this look right? Any corrections before I generate?
```

**Do not proceed until the user confirms.**

---

## Phase 2 — Generation

Generate files in order. After each file, state what was generated and why
one key decision was made. Reference the template files in `templates/`.

### 2.1 Core files (always generated)

#### AGENTS.md
Use: `templates/core/AGENTS.md.tmpl`

Fill all `{{PLACEHOLDERS}}`. Keep under 100 lines.
If content exceeds 100 lines, move it to `docs/`.

The template's `## Read before you act` and `## Non-negotiable rules` H2
sections are extracted verbatim at runtime by `scripts/session_brief.py` and
injected at session start — keep both headings exactly as written so the brief
finds them.

Note: Claude Code also reads `CLAUDE.md`. If the agent list includes
Claude Code, create `CLAUDE.md` as a one-line redirect:
```markdown
# See AGENTS.md
```

#### scripts/check_architecture.py
Use: `templates/core/scripts/check_architecture.py.tmpl`

Fill `LAYERS`, `CROSS_CUTTING`, `RESTRICTED_PACKAGES`, `FORBIDDEN_PACKAGES`.

**Critical**: every violation must include a `REMEDIATION:` line with:
- What is wrong
- What to do instead (specific module/function to use)
- Where to read more (specific docs file + section)

Generic remediation messages defeat the purpose. Be specific.

#### tests/test_architecture.py
Use: `templates/core/tests/test_architecture.py.tmpl`

Write one test per restricted package, one per forbidden package.
Each assertion error must include a remediation instruction.

#### scripts/check_style.py
Use: `templates/core/scripts/check_style.py.tmpl`

Fill `MAX_FILE_LINES`, `BANNED_LOGGING_CALLS`, `LOGGER_HINT`, and
(if provided) `NAMING_RULES` and `COMPONENT_RULES` from `STYLE_INVARIANTS`.
Fill `SOURCE_EXTENSIONS` from `LANGUAGE` (`{".py"}`, `{".ts", ".tsx"}`, etc.).

Every violation must include a `REMEDIATION:` line, same convention as
`check_architecture.py`.

#### tests/test_style.py
Use: `templates/core/tests/test_style.py.tmpl`

Write one test per `BANNED_LOGGING_CALL`, one per `NAMING_RULE`, one per
`COMPONENT_RULE`. If `NAMING_RULES` / `COMPONENT_RULES` are empty, omit
those test sections (the `{{...}}` blocks become empty).

#### scripts/gc_static.py
Use: `templates/core/scripts/gc_static.py.tmpl`

Copy as-is — script is language-agnostic. Only `{{REPO_NAME}}` to fill.

#### scripts/nudge_plan.py and scripts/nudge_docs.py
Use: `templates/core/scripts/nudge_plan.py.tmpl`,
     `templates/core/scripts/nudge_docs.py.tmpl`

Copy as-is — both scripts are agent-agnostic. Only `{{REPO_NAME}}` to fill.
These are the shared logic that all three adapters' prompt-time / stop-time
hooks delegate to. Advisory only — exit 0 always.

`nudge_plan.py` does two jobs every turn: it re-surfaces any active plan (so
the agent keeps following it) and, when there is none and the prompt looks
multi-step, prints an imperative directive to create one before editing. It
imports `scripts/_plans.py`.

#### scripts/_plans.py, scripts/session_brief.py, scripts/require_plan.py
Use: `templates/core/scripts/_plans.py.tmpl`,
     `templates/core/scripts/session_brief.py.tmpl`,
     `templates/core/scripts/require_plan.py.tmpl`

Copy as-is — agent-agnostic. Only `{{REPO_NAME}}` to fill.

- `_plans.py` — shared active-plan parser. Single source of truth for reading
  `docs/exec-plans/active/` and the `- [ ]` / `- [x]` convention (same anchors
  the `stop_check_plans.sh` hook greps). Imported by the three scripts below.
- `session_brief.py` — the **SessionStart brief**. Extracts the `Read before
  you act` + `Non-negotiable rules` sections from `AGENTS.md` at runtime and
  appends any active plan with its remaining steps. This is the guarantee that
  rules + plan reach context every session. Adapters with a session-start
  event call it; exit 0 always. Disable with `POISE_BRIEF=0`.
- `require_plan.py` — the **plan gate** (ON by default). `--pretooluse` blocks
  edits (exit 2) once a task touches more than two source files with no active
  plan; `--staged` is the lefthook commit-time backstop (exit 1). Everything
  under `docs/` is exempt, so writing the plan is never blocked. Disable with
  `POISE_GATE=0`. This is a deliberate gate — the harness's default posture is
  nudges, but plan-before-edit is enforced because advisory plan nudges alone
  get ignored.

#### Makefile
Use: `templates/core/Makefile.tmpl`
If a Makefile already exists, add harness targets without removing existing ones.

#### lefthook.yml
Use: `templates/core/lefthook.yml.tmpl`
Adapt format/lint commands to `LANGUAGE`. The `plan-gate` pre-commit command
(`python3 scripts/require_plan.py --staged`) is the agent-agnostic backstop for
the plan gate — keep it (it covers agents without an edit-time hook, e.g. Codex).

#### docs/architecture.md
Write from scratch using `LAYER_MODEL` and `RAW_MODULES`.
Include: ASCII layer diagram, module responsibility table, external
dependencies table, cross-cutting section.
Use: `templates/core/docs/architecture.md.tmpl`

#### docs/conventions.md
Write from scratch using `LANGUAGE`, `FRAMEWORK`, `RESTRICTED_PACKAGES`,
and `STYLE_INVARIANTS`. Include ✅/❌ code examples for each restricted
package boundary AND for each enabled style invariant (file size, logging,
naming, components). The `See docs/conventions.md#…` anchors emitted by
both linters must resolve to a section in this file.
Use: `templates/core/docs/conventions.md.tmpl`

#### docs/workflows.md
Write from scratch using `EXISTING_COMMANDS`, `DEPLOY_TARGET`.
Use: `templates/core/docs/workflows.md.tmpl`

#### docs/quality.md
Empty known gaps table. Add one entry per `FORBIDDEN_PACKAGE`.
Use: `templates/core/docs/quality.md.tmpl`

#### docs/decisions/ — seed ADRs
Write one ADR for each `FORBIDDEN_PACKAGE` or significant architectural
constraint discovered in Phase 1. Number sequentially: `001-slug.md`.
Use: `templates/core/docs/decisions/ADR-template.md`

#### docs/exec-plans/, docs/product-specs/, docs/references/
Copy as-is (language-agnostic). For `references/README.md`, fill
`{{REFERENCES_SEED_ROWS}}` from `REFERENCES_SEED` recorded in §1.9
(one row per restricted package, or "(none)" if no seeds).
Sources: `templates/core/docs/exec-plans/`,
         `templates/core/docs/product-specs/`,
         `templates/core/docs/references/`

---

### 2.2 Agent adapters (per agent in AGENTS list)

#### Claude Code
Generate if `AGENTS` includes Claude Code.
Source directory: `templates/agents/claude-code/`

Files:
- `.claude/settings.json` — hook registration (SessionStart / PostToolUse / PreToolUse / UserPromptSubmit / Stop)
- `.claude/hooks/session_start.sh` — print the harness brief (rules + active plan) via `session_brief.py` (SessionStart)
- `.claude/hooks/post_write.sh` — format → lint → arch check → style check (PostToolUse)
- `.claude/hooks/pre_bash.sh` — block destructive commands (PreToolUse on Bash)
- `.claude/hooks/pre_write_plan_gate.sh` — plan gate via `require_plan.py` (PreToolUse on Write/Edit/MultiEdit)
- `.claude/hooks/exit_plan_mode.sh` — write approved plan to `docs/exec-plans/active/` (PostToolUse on ExitPlanMode)
- `.claude/hooks/user_prompt_submit.sh` — plan directive + active-plan re-surface via `nudge_plan.py` (UserPromptSubmit)
- `.claude/hooks/stop_check_plans.sh` — move fully-checked plans to `docs/exec-plans/completed/` (Stop)
- `.claude/hooks/stop_nudge.sh` — docs-update nudge via `nudge_docs.py` (Stop)
- `.claude/commands/sync-docs.md` — garbage collection sweep
- `.claude/commands/plan.md` — manual fallback when plan mode isn't used

Adapt `post_write.sh` to `LANGUAGE`. Each language block chains
format → lint → arch check → style check:
- Python: `ruff format` + `ruff check` + `check_architecture.py` + `check_style.py`
- TypeScript: `prettier --write` + `eslint --fix` + `check_architecture.ts` + `check_style.ts`
- Go: `gofmt -w` + `golangci-lint run` + arch + style equivalents
- Rust: `rustfmt` + `cargo clippy` + arch + style equivalents

Also add to `pre_bash.sh` any `DEPLOY_TARGET`-specific dangerous commands.

#### Codex
Generate if `AGENTS` includes Codex.
Source directory: `templates/agents/codex/`

Files:
- `WORKFLOW.md` — Symphony-compatible workflow definition
- `.codex/config.toml` — registers SessionStart + UserPromptSubmit + Stop hooks
- `.codex/hooks/session_start.sh` — harness brief (calls `scripts/session_brief.py`)
- `.codex/hooks/user_prompt_submit.sh` — plan directive + active-plan re-surface (calls `scripts/nudge_plan.py`)
- `.codex/hooks/stop_nudge.sh` — docs-update nudge (calls `scripts/nudge_docs.py`)

The WORKFLOW.md documents the agent's expected workflow: read AGENTS.md,
check exec-plans/active/, implement, run quality checks, do not open PR.
This file is versioned with the code so teams can evolve it.

The hooks share logic with the Claude Code adapter via the scripts/
directory — Codex calls the same `session_brief.py` / `nudge_plan.py` /
`nudge_docs.py` so behaviour stays consistent across agents. The plan gate is
enforced for Codex via the lefthook `plan-gate` (commit-time); Codex also has
`PreToolUse` if you want edit-time blocking.

#### OpenCode
Generate if `AGENTS` includes OpenCode.
Source directory: `templates/agents/opencode/`

Files:
- `.opencode/opencode.json` — instructions config pointing to AGENTS.md
- `.opencode/plugins/harness.ts` — post-write hooks (format → lint → arch → style);
  `tool.execute.before` plan gate (calls `scripts/require_plan.py`) + bash guard;
  best-effort `event` brief (`session_brief.py`) and plan nudge (`nudge_plan.py`);
  `session.idle` docs nudge (`nudge_docs.py`)
- `.opencode/commands/sync-docs.md` — garbage collection
- `.opencode/commands/plan.md` — execution plan creation

Note: OpenCode natively reads `.claude/skills/` — the harness generator
skill itself is already available to OpenCode without additional setup.

Note: OpenCode has no first-class `UserPromptSubmit` or `SessionStart`. The
plan nudge and the brief are wired to the generic `event` hook on a best-effort
basis; the guaranteed path for rules is the native `instructions: ["AGENTS.md"]`
(which carries the "Read before you act" block). The plan GATE, however, is
real here — `tool.execute.before` throws to block edits. See
`templates/agents/opencode/ADAPTER.md` for the linked upstream issue.

---

## Phase 3 — Handoff

```
## Harness Generated

{{N}} files created.

Install pre-commit / post-merge hooks:
  {{HOOK_INSTALL_CMD}}

Run the architecture + style checks (expect violations — they're useful signal):
  {{CHECK_ARCH_CMD}}
  {{CHECK_STYLE_CMD}}

Verify the session brief + plan gate:
  - Start a fresh agent session — you should see the POISE HARNESS BRIEF
    (rules + any active plan). If a plan is active, it lists remaining steps.
  - Try editing a 3rd source file with no active plan — the gate blocks it
    with a remediation pointing at docs/exec-plans/active/.

Escape hatches (per session, env vars):
  POISE_BRIEF=0        # silence the SessionStart brief
  POISE_NUDGE_PLAN=0   # silence the plan nudge
  POISE_NUDGE_DOCS=0   # silence the docs nudge
  POISE_GATE=0         # disable the plan gate (edit-time + commit-time)

Add gc-report ignore:
  echo "docs/.gc-report-*.md" >> .gitignore

Commit the harness:
  git add AGENTS.md .claude/ .opencode/ docs/ scripts/ tests/ lefthook.yml Makefile .gitignore
  git commit -m "chore: add agent harness"

Garbage collection:
  - Lefthook's post-merge hook runs `scripts/gc_static.py` automatically
    on every merge and writes `docs/.gc-report-YYYYMMDD.md` (gitignored).
  - Run `/sync-docs` in your agent for the judgment-required passes.
  - `make gc` runs both.

Known limitations:
- docs/quality.md is empty — populate it with known debt
- docs/product-specs/ is empty — add a spec before each new feature
- docs/references/ is seeded but thin — flesh out per restricted package
- The layer model was inferred — verify it matches how the team thinks about the code
- Architecture and style violations will appear on first check run — this is expected
```

---

## Notes for the generating agent

- **AGENTS.md must stay under 100 lines.** If it's longer, move content to docs/.
- **Remediation messages are the highest-value output.** A linter that says "violation"
  wastes a context window turn. A linter that says "import from X instead, see docs/Y"
  enables self-correction in the same turn. This applies to *both* the architecture
  and style linters — every violation must end in `REMEDIATION: …`.
- **Infer, don't invent.** The layer model must reflect actual code structure,
  not an ideal. Violations after the first `check-arch` / `check-style` are
  expected and useful.
- **One ADR per real decision.** Don't write ADRs for obvious things. Write them
  for decisions that will confuse a future agent.
- **Naming and component rules are opt-in.** If the user has no convention to
  enforce, leave `NAMING_RULES` / `COMPONENT_RULES` empty — the linter skips
  the check rather than inventing rules.
- **gc_static.py exits 0 by default.** Never gate merges on it; it's a report,
  not a check. The lefthook post-merge hook runs it for visibility, not enforcement.
- **The SessionStart brief is the guarantee.** Advisory nudges get ignored;
  the brief makes the enforced rules + the active plan unavoidably present in
  context every session. Keep it compact (≤40 lines) — it reads the short rule
  bullets out of AGENTS.md and points to docs/ for detail; heavy content stays
  in docs/, surfaced by pointer.
- **The plan gate is the one deliberate gate.** Default posture is nudges, but
  plan-before-edit is enforced (`require_plan.py`, ON) because the advisory plan
  nudge alone doesn't change behaviour. It only triggers past two source files
  and exempts docs/, so small changes and writing the plan itself stay frictionless.
  Every gate/brief/nudge has an env escape hatch (`POISE_GATE`/`POISE_BRIEF`/`POISE_NUDGE_*`).
- **The harness should feel lightweight.** If anything feels heavy or bureaucratic,
  it belongs in docs/, not in the entry file.
