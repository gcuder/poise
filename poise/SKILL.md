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

### 1.8 Identify agent(s) in use

Ask the user which coding agent(s) they use:
- Claude Code
- Codex
- OpenCode
- Other (describe)
- Multiple (list them)

Record as `AGENTS` = list of agent names.

### 1.9 Confirm before generating

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

#### Makefile
Use: `templates/core/Makefile.tmpl`
If a Makefile already exists, add harness targets without removing existing ones.

#### lefthook.yml
Use: `templates/core/lefthook.yml.tmpl`
Adapt format/lint commands to `LANGUAGE`.

#### docs/architecture.md
Write from scratch using `LAYER_MODEL` and `RAW_MODULES`.
Include: ASCII layer diagram, module responsibility table, external
dependencies table, cross-cutting section.
Use: `templates/core/docs/architecture.md.tmpl`

#### docs/conventions.md
Write from scratch using `LANGUAGE`, `FRAMEWORK`, `RESTRICTED_PACKAGES`.
Include ✅/❌ code examples for each restricted package boundary.
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

#### docs/exec-plans/ and docs/product-specs/
Copy as-is (language-agnostic).
Sources: `templates/core/docs/exec-plans/`, `templates/core/docs/product-specs/`

---

### 2.2 Agent adapters (per agent in AGENTS list)

#### Claude Code
Generate if `AGENTS` includes Claude Code.
Source directory: `templates/agents/claude-code/`

Files:
- `.claude/settings.json` — hook registration
- `.claude/hooks/post_write.sh` — format → lint → arch check (PostToolUse)
- `.claude/hooks/pre_bash.sh` — block destructive commands (PreToolUse)
- `.claude/hooks/exit_plan_mode.sh` — write approved plan to `docs/exec-plans/active/` (PostToolUse on ExitPlanMode)
- `.claude/hooks/stop_check_plans.sh` — move fully-checked plans to `docs/exec-plans/completed/` (Stop)
- `.claude/commands/sync-docs.md` — garbage collection sweep
- `.claude/commands/plan.md` — manual fallback when plan mode isn't used

Adapt `post_write.sh` to `LANGUAGE`:
- Python: `ruff format` + `ruff check` + `python scripts/check_architecture.py`
- TypeScript: `prettier --write` + `eslint --fix` + `npx ts-node scripts/check_architecture.ts`
- Go: `gofmt -w` + `golangci-lint run`
- Rust: `rustfmt` + `cargo clippy`

Also add to `pre_bash.sh` any `DEPLOY_TARGET`-specific dangerous commands.

#### Codex
Generate if `AGENTS` includes Codex.
Source directory: `templates/agents/codex/`

Files:
- `WORKFLOW.md` — Symphony-compatible workflow definition

The WORKFLOW.md documents the agent's expected workflow: read AGENTS.md,
check exec-plans/active/, implement, run quality checks, do not open PR.
This file is versioned with the code so teams can evolve it.

#### OpenCode
Generate if `AGENTS` includes OpenCode.
Source directory: `templates/agents/opencode/`

Files:
- `.opencode/opencode.json` — instructions config pointing to AGENTS.md
- `.opencode/plugins/harness.ts` — post-write hooks
- `.opencode/commands/sync-docs.md` — garbage collection
- `.opencode/commands/plan.md` — execution plan creation

Note: OpenCode natively reads `.claude/skills/` — the harness generator
skill itself is already available to OpenCode without additional setup.

---

## Phase 3 — Handoff

```
## Harness Generated

{{N}} files created.

Install pre-commit hooks:
  {{HOOK_INSTALL_CMD}}

Run the architecture check (expect violations — they're useful signal):
  {{CHECK_ARCH_CMD}}

Commit the harness:
  git add AGENTS.md .claude/ .opencode/ docs/ scripts/ tests/test_architecture.py lefthook.yml Makefile
  git commit -m "chore: add agent harness"

Run garbage collection whenever docs feel stale:
  make gc

Known limitations:
- docs/quality.md is empty — populate it with known debt
- docs/product-specs/ is empty — add a spec before each new feature
- The layer model was inferred — verify it matches how the team thinks about the code
- Architecture violations will appear on first check-arch run — this is expected
```

---

## Notes for the generating agent

- **AGENTS.md must stay under 100 lines.** If it's longer, move content to docs/.
- **Remediation messages are the highest-value output.** A linter that says "violation"
  wastes a context window turn. A linter that says "import from X instead, see docs/Y"
  enables self-correction in the same turn.
- **Infer, don't invent.** The layer model must reflect actual code structure,
  not an ideal. Violations after the first `check-arch` are expected and useful.
- **One ADR per real decision.** Don't write ADRs for obvious things. Write them
  for decisions that will confuse a future agent.
- **The harness should feel lightweight.** If anything feels heavy or bureaucratic,
  it belongs in docs/, not in the entry file.
