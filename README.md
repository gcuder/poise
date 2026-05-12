# poise

> Generate a complete agent harness for any repository, with any coding agent.

---

## What is harness engineering?

Harness engineering is the practice of designing the environment your coding
agent operates inside — not prompting the model, but controlling what it sees,
what it's allowed to do, and how it gets feedback.

The key insight from [OpenAI's harness engineering post](https://openai.com/index/harness-engineering/):
changing only the harness — same model, same prompts — moved a coding agent
from Top 30 to Top 5 on Terminal Bench. Architecture beats prompting.

A harness has four layers:

```
┌──────────────────────────────────────────────────────────┐
│  AGENTS.md       table of contents                        │ ← what every agent reads first
│  docs/           architecture, plans, ADRs, references    │ ← on-demand context
│  linters         arch + style with remediation messages   │ ← mechanical enforcement
│  hooks           format → lint → arch → style + post-merge│ ← feedback at write time
└──────────────────────────────────────────────────────────┘
```

This repo is a **generator** — give it any codebase and it produces a harness
tailored to that repo's language, framework, and layer model.

---

## Supported agents

| Agent | Entry file | Hooks | Commands |
|---|---|---|---|
| [Claude Code](https://claude.ai/code) | `AGENTS.md` + `CLAUDE.md` | `.claude/settings.json` (PostToolUse / PreToolUse) | `.claude/commands/` |
| [Codex](https://openai.com/codex) | `AGENTS.md` | `WORKFLOW.md` (Symphony-compatible) | — |
| [OpenCode](https://opencode.ai) | `AGENTS.md` | `.opencode/plugins/harness.ts` | `.opencode/commands/` |

All agents share the same core harness. Agent-specific files are additive.

---

## How it works

The generator is a `SKILL.md` — a structured protocol that any coding agent
can follow to build the harness for your repo.

**Three phases:**

1. **Discover** — reads your repo structure, infers the layer model, identifies
   restricted/forbidden packages
2. **Confirm** — presents a summary and waits for your approval before writing
   anything
3. **Generate** — fills all templates and produces the harness

---

## Quickstart

### With Claude Code

```bash
# Install globally
cp -r poise ~/.claude/skills/poise

# In any repo
claude
> generate harness for this repo
```

### With OpenCode

```bash
# Install globally (OpenCode reads .claude/skills/ natively)
cp -r poise ~/.claude/skills/poise

# In any repo
opencode
> generate harness for this repo
```

### With any agent

Pass `SKILL.md` directly:

```
Implement the harness generator according to: <contents of SKILL.md>
```

---

## What gets generated

### Core (every agent)

```
AGENTS.md                       # 100-line table of contents
Makefile                        # check, check-arch, check-style, gc, plan targets
lefthook.yml                    # pre-commit + pre-push gates, post-merge gc sweep
scripts/
├── check_architecture.py       # boundary linter with remediation messages
├── check_style.py              # golden-principles linter (size, logging, naming, components)
├── gc_static.py                # deterministic doc-gardening sweep (read-only)
├── nudge_plan.py               # plan-mode reminder on multi-step prompts
└── nudge_docs.py               # docs-update reminder when sessions touch many files
tests/
├── test_architecture.py        # structural arch tests enforced in CI
└── test_style.py               # structural style tests enforced in CI
docs/
├── architecture.md             # layer diagram + module responsibilities
├── conventions.md              # coding patterns + style invariants with ✅/❌ examples
├── workflows.md                # setup, test, lint, deploy
├── quality.md                  # known gaps + tech debt tracker
├── decisions/                  # ADRs — one per architectural constraint
├── exec-plans/                 # execution plans as repo artifacts
│   ├── active/
│   └── completed/
├── product-specs/              # feature specs before implementation
└── references/                 # external docs, runbooks, dashboards
```

### Claude Code adapter

```
.claude/
├── settings.json               # hook registration
├── hooks/
│   ├── post_write.sh           # format → lint → arch check (PostToolUse)
│   ├── pre_bash.sh             # block destructive commands (PreToolUse)
│   ├── exit_plan_mode.sh       # auto-write approved plan to docs/exec-plans/active/
│   └── stop_check_plans.sh     # auto-move fully-checked plans to completed/
└── commands/
    ├── sync-docs.md            # /sync-docs — garbage collection
    └── plan.md                 # /plan — manual fallback (plan mode is the default)
```

### Codex adapter

```
WORKFLOW.md                     # Symphony-compatible workflow definition
```

### OpenCode adapter

```
.opencode/
├── opencode.json               # instructions + permissions config
├── plugins/
│   └── harness.ts              # post-write hooks (format → lint → arch)
└── commands/
    ├── sync-docs.md            # /sync-docs — garbage collection
    └── plan.md                 # /plan — execution plan creation
```

---

## The linters

The most important output. Two linters, same shape: every violation ends in
a `REMEDIATION:` line that tells the agent exactly what to do.

**`check_architecture.py`** — layer boundaries, restricted packages, forbidden packages:

```
BOUNDARY VIOLATION api/recipes.py:14
  'api/' imports from 'db/' (downstream layer).
  Layer rule: schemas → db → storage → pipeline → services → api
  REMEDIATION: Move data access logic to services/recipes.py.
               Import from services.recipes, not from db directly.
               See docs/architecture.md#layer-model.
```

**`check_style.py`** — golden-principle invariants the OpenAI article calls out:
file-size ceiling, banned logging calls, naming conventions, component structure:

```
STYLE VIOLATION services/recipes.py:412
  File is 412 lines, ceiling is 400.
  REMEDIATION: Split this file into smaller modules along a clear seam
               (one type per file, one concern per module).
               See docs/conventions.md#file-size.
```

These aren't blocking error messages — they're teaching tools. The agent reads
the remediation and self-corrects without human intervention.

## Doc gardening

`/sync-docs` is the deep, judgment-required sweep an agent runs. Its
deterministic baseline — fully-ticked plans, stale rows, broken doc links —
is extracted into `scripts/gc_static.py` and run automatically by lefthook
on every merge, writing a gitignored `docs/.gc-report-YYYYMMDD.md` for the
next agent session to pick up.

## Nudges

Plan mode and doc updates are human-triggered in every coding agent — you
can't make Claude Code or Codex enter plan mode on its own. So the harness
ships two advisory nudges instead of hard gates:

- `nudge_plan.py` is called by each agent's UserPromptSubmit (or closest)
  hook. If your prompt looks multi-step (refactor / migrate / across the
  codebase / long), it prints a short reminder to enter plan mode so the
  approved plan lands in `docs/exec-plans/active/`.
- `nudge_docs.py` is called by each agent's Stop / `session.idle` hook.
  If the session touched many source files without updating any docs, it
  reminds the agent to consider `docs/quality.md`, a new ADR, an exec-plan
  update, or a conventions example.

Both exit 0 always — they print, they don't block. Disable per session
with `POISE_NUDGE_PLAN=0` / `POISE_NUDGE_DOCS=0`. The logic lives in
`scripts/` and is shared across all three agents; per-adapter hook files
are thin shims.

---

## Relationship to Symphony

[Symphony](https://github.com/openai/symphony) orchestrates agents across issues.
This harness is what agents operate inside. They compose:

```
Symphony          dispatch loop — picks up issues, runs agents
  └── harness     what agents see and are constrained by
        └── docs  on-demand context loaded per task
```

Symphony's README: *"Symphony works best in codebases that have adopted
harness engineering."* This generates that harness.

---

## Contributing

Adding support for a new agent means adding one directory:

```
templates/agents/<agent-name>/
├── ADAPTER.md          # what this adapter provides + requirements
└── ...                 # agent-specific config files
```

The core harness doesn't change. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache 2.0 — same as Symphony.
