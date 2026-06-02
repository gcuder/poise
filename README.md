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
| [Claude Code](https://claude.ai/code) | `AGENTS.md` + `CLAUDE.md` | `.claude/settings.json` (SessionStart / PostToolUse / PreToolUse / UserPromptSubmit / Stop) | `.claude/commands/` |
| [Codex](https://openai.com/codex) | `AGENTS.md` | `.codex/config.toml` (SessionStart / UserPromptSubmit / Stop) + `WORKFLOW.md` (Symphony-compatible) | — |
| [OpenCode](https://opencode.ai) | `AGENTS.md` | `.opencode/plugins/harness.ts` (tool.execute / session.idle / event) | `.opencode/commands/` |

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

```bash
git clone https://github.com/gcuder/poise.git
cd poise
make install
```

`make install` copies the skill into every supported agent's skills directory in one shot:

- `~/.claude/skills/poise/` — picked up by both **Claude Code** and **OpenCode** (OpenCode reads `.claude/skills/` natively).
- `~/.codex/skills/poise/` — picked up by **Codex** (honors `$CODEX_HOME` if set). Codex reloads skill metadata on launch only, so **restart Codex** after install.

Then, in any repo:

```
> generate harness for this repo
```

### Updating after a `git pull`

```bash
make sync          # re-copy into both install dirs, restart Codex if you use it
make install-check # report which install dirs are in sync, drifted, or missing
make uninstall     # remove both install dirs (prompts unless FORCE=1)
```

### Using the skill without installing it

Pass `SKILL.md` directly to any agent:

```
Implement the harness generator according to: <contents of poise/SKILL.md>
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
├── _plans.py                   # shared active-plan parser (- [ ] / - [x] convention)
├── session_brief.py            # SessionStart brief: rules (from AGENTS.md) + active plan
├── require_plan.py             # plan gate: block multi-file edits until a plan exists
├── nudge_plan.py               # directive plan reminder + re-surfaces the active plan
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
│   ├── session_start.sh        # inject harness brief: rules + active plan (SessionStart)
│   ├── post_write.sh           # format → lint → arch check (PostToolUse)
│   ├── pre_bash.sh             # block destructive commands (PreToolUse)
│   ├── pre_write_plan_gate.sh  # block multi-file edits until a plan exists (PreToolUse)
│   ├── exit_plan_mode.sh       # auto-write approved plan to docs/exec-plans/active/
│   ├── user_prompt_submit.sh   # plan directive + active-plan re-surface (UserPromptSubmit)
│   ├── stop_check_plans.sh     # auto-move fully-checked plans to completed/
│   └── stop_nudge.sh           # docs-update nudge (Stop)
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

## Following the harness

Generating a harness is easy; getting the agent to *follow* it is the hard
part. Advisory text alone gets ignored, so poise drives compliance in three
escalating layers — all sharing logic in `scripts/`, with per-adapter hooks as
thin shims.

**1. Guaranteed context — the SessionStart brief.** `session_brief.py` runs at
session start (Claude Code / Codex `SessionStart`; OpenCode best-effort + native
`AGENTS.md` instructions). It extracts the enforced rules from `AGENTS.md` at
runtime and lists any active execution plan with its remaining steps, so the
agent *always* has the rules and the live plan in context — it doesn't have to
choose to read them. Silence with `POISE_BRIEF=0`.

**2. Directive nudges.** `nudge_plan.py` (UserPromptSubmit / closest) re-surfaces
the active plan every turn and, for multi-step prompts with no plan, prints an
imperative instruction to create one *before* editing — no "shift-tab", no
"consider". `nudge_docs.py` (Stop / `session.idle`) reminds the agent to update
docs when a session touched many source files and none. Both exit 0 — they
print, they don't block. Disable with `POISE_NUDGE_PLAN=0` / `POISE_NUDGE_DOCS=0`.

**3. The plan gate (the one hard gate).** `require_plan.py` blocks edits once a
task touches more than two source files with no plan in `docs/exec-plans/active/`
— at edit time on Claude Code (`PreToolUse`) and OpenCode (`tool.execute.before`),
and at commit time everywhere via lefthook (`--staged`, the backstop for Codex).
Anything under `docs/` is exempt, so small changes and writing the plan itself
stay frictionless. It's the deliberate exception to the harness's nudges-first
posture, because the advisory plan nudge alone doesn't change behaviour. Disable
with `POISE_GATE=0`.

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
