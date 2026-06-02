<div align="center">

# ⚡ poise

### Stop babysitting your coding agent.

**One command turns any repo into a guided environment for Claude Code, Codex, or OpenCode** — `AGENTS.md`, boundary linters, plan gates, and feedback hooks, all generated and tailored to your codebase.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/agents-Claude%20Code%20·%20Codex%20·%20OpenCode-8A2BE2.svg)](#-supported-agents)
[![Harness engineering](https://img.shields.io/badge/built%20for-harness%20engineering-000.svg)](https://openai.com/index/harness-engineering/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## The problem

Your coding agent is smart, but it doesn't *know your repo*. It imports across layers you've kept separate. It reaches for the package you've banned. It writes a 900-line file. It rewrites half the codebase before you've agreed on a plan. You spend your day reviewing drift instead of shipping.

The fix isn't a better prompt. It's a better **harness** — the rules the agent reads, the lints it can't cross, and the feedback it gets the moment it writes.

> **Architecture beats prompting.** In [OpenAI's harness engineering work](https://openai.com/index/harness-engineering/), changing *only the harness* — same model, same prompts — moved a coding agent from **Top 30 to Top 5** on Terminal Bench.

**poise generates that harness for you.** Point it at any codebase; it reads your structure, infers your layer model, and writes the whole thing — in minutes, not a weekend.

---

## 🚀 Quickstart

```bash
git clone https://github.com/gcuder/poise.git
cd poise
make install
```

Then, in **any repo**, just ask your agent:

```
> generate harness for this repo
```

It reads your code, shows you a plan, waits for your **yes**, and writes the harness. That's it.

<details>
<summary><code>make install</code> — what it does</summary>

Copies the skill into every supported agent's skills directory in one shot:

- `~/.claude/skills/poise/` — picked up by both **Claude Code** and **OpenCode** (OpenCode reads `.claude/skills/` natively).
- `~/.codex/skills/poise/` — picked up by **Codex** (honors `$CODEX_HOME`). Codex loads skill metadata on launch, so **restart Codex** after installing.

Keeping it fresh:

```bash
make sync          # re-copy after a git pull (restarts Codex if you use it)
make install-check # report which install dirs are in sync, drifted, or missing
make uninstall     # remove both install dirs (prompts unless FORCE=1)
```

Prefer not to install? Hand `poise/SKILL.md` to any agent directly:

```
Implement the harness generator according to: <contents of poise/SKILL.md>
```

</details>

---

## ✨ What you get

A four-layer harness, tailored to your repo's language and framework:

```
┌──────────────────────────────────────────────────────────┐
│  AGENTS.md       table of contents       ← read first     │
│  docs/           architecture, plans, ADRs, references    │
│  linters         arch + style, with REMEDIATION: lines    │
│  hooks           format → lint → arch → style + plan gate  │
└──────────────────────────────────────────────────────────┘
```

<details>
<summary>Full file tree — everything poise writes</summary>

### Core (every agent)

```
AGENTS.md                       # 100-line table of contents
Makefile                        # check, check-arch, check-style, gc, plan targets
lefthook.yml                    # pre-commit + pre-push gates, post-merge gc sweep
scripts/
├── check_architecture.py       # boundary linter with remediation messages
├── check_style.py              # golden-principles linter (size, logging, naming, components)
├── gc_static.py                # deterministic doc-gardening sweep (read-only)
├── _plans.py                   # shared active-plan parser
├── session_brief.py            # SessionStart brief: rules + active plan
├── require_plan.py             # plan gate: block multi-file edits until a plan exists
├── nudge_plan.py               # directive plan reminder + re-surfaces active plan
└── nudge_docs.py               # docs-update reminder for wide-touching sessions
tests/
├── test_architecture.py        # structural arch tests enforced in CI
└── test_style.py               # structural style tests enforced in CI
docs/
├── architecture.md             # layer diagram + module responsibilities
├── conventions.md              # coding patterns + style invariants (✅/❌ examples)
├── workflows.md                # setup, test, lint, deploy
├── quality.md                  # known gaps + tech-debt tracker
├── decisions/                  # ADRs — one per architectural constraint
├── exec-plans/{active,completed}/  # execution plans as repo artifacts
├── product-specs/              # feature specs before implementation
└── references/                 # external docs, runbooks, dashboards
```

### Claude Code adapter

```
.claude/
├── settings.json               # hook registration
├── hooks/                      # session_start, post_write, pre_bash,
│                               #   plan-gate, exit_plan_mode, nudges, stop checks
└── commands/                   # /sync-docs, /plan
```

### Codex adapter

```
WORKFLOW.md                     # Symphony-compatible workflow definition
.codex/                         # config.toml + SessionStart / UserPromptSubmit / Stop hooks
```

### OpenCode adapter

```
.opencode/
├── opencode.json               # instructions + permissions
├── plugins/harness.ts          # post-write hooks (format → lint → arch)
└── commands/                   # /sync-docs, /plan
```

</details>

---

## 🎯 The killer feature: linters that teach

Most lints just yell. poise writes lints that **tell the agent exactly how to fix the problem** — every violation ends in a `REMEDIATION:` line. The agent reads it and self-corrects, no human in the loop.

**`check_architecture.py`** — layer boundaries, restricted & forbidden packages:

```
BOUNDARY VIOLATION api/recipes.py:14
  'api/' imports from 'db/' (downstream layer).
  Layer rule: schemas → db → storage → pipeline → services → api
  REMEDIATION: Move data access logic to services/recipes.py.
               Import from services.recipes, not from db directly.
               See docs/architecture.md#layer-model.
```

**`check_style.py`** — the "golden principles" from the OpenAI article: file-size ceilings, banned logging, naming, component structure:

```
STYLE VIOLATION services/recipes.py:412
  File is 412 lines, ceiling is 400.
  REMEDIATION: Split this file into smaller modules along a clear seam
               (one type per file, one concern per module).
               See docs/conventions.md#file-size.
```

---

## 🔒 Getting the agent to actually follow it

Generating a harness is easy. Making the agent *obey* it is the hard part — advisory text alone gets ignored. poise drives compliance in three escalating layers, logic shared in `scripts/` with thin per-adapter hooks:

| Layer | What it does | Posture |
|---|---|---|
| **1. SessionStart brief** | Injects the enforced rules (from `AGENTS.md`) + the live plan into context every session — the agent never has to *choose* to read them. | Always on |
| **2. Directive nudges** | Re-surfaces the active plan each turn; for multi-step prompts with no plan, prints an imperative "write one first." Reminds you to update docs after wide-touching sessions. | Prints, never blocks |
| **3. The plan gate** | The one hard gate: blocks edits once a task touches >2 source files with no plan in `docs/exec-plans/active/`. Anything under `docs/` is exempt, so small changes stay frictionless. | Blocks |

Every layer is a single env var away from off (`POISE_BRIEF=0`, `POISE_NUDGE_PLAN=0`, `POISE_GATE=0`). Nudges-first by default — the plan gate is the deliberate exception, because the advisory nudge alone doesn't change behavior.

---

## 🤖 Supported agents

| Agent | Entry | Hooks | Commands |
|---|---|---|---|
| [Claude Code](https://claude.ai/code) | `AGENTS.md` + `CLAUDE.md` | `.claude/settings.json` — SessionStart / Pre+PostToolUse / UserPromptSubmit / Stop | `.claude/commands/` |
| [Codex](https://openai.com/codex) | `AGENTS.md` | `.codex/config.toml` + `WORKFLOW.md` (Symphony-compatible) | — |
| [OpenCode](https://opencode.ai) | `AGENTS.md` | `.opencode/plugins/harness.ts` — tool.execute / session.idle | `.opencode/commands/` |

All agents share the same core harness. Agent-specific files are purely additive — [add a new one](CONTRIBUTING.md) with a single directory.

---

## How it works

poise is a `SKILL.md` — a structured protocol any coding agent can follow. Three phases:

1. **Discover** — reads your repo, infers the layer model, flags restricted/forbidden packages.
2. **Confirm** — shows you a summary and **waits for approval** before writing anything.
3. **Generate** — fills every template and produces the harness.

And after generation, `/sync-docs` keeps it healthy: a deep doc-gardening sweep, with its deterministic baseline (ticked-off plans, stale rows, broken links) extracted into `scripts/gc_static.py` and run automatically by lefthook on every merge.

---

## Plays well with Symphony

[Symphony](https://github.com/openai/symphony) orchestrates agents across issues. The harness is what those agents operate *inside*. They compose:

```
Symphony          dispatch loop — picks up issues, runs agents
  └── harness     what agents see and are constrained by
        └── docs  on-demand context loaded per task
```

> Symphony's README: *"Symphony works best in codebases that have adopted harness engineering."* This generates that harness.

---

## Contributing

Adding a new agent means adding **one directory** — the core harness doesn't change:

```
templates/agents/<agent-name>/
├── ADAPTER.md          # what this adapter provides + requirements
└── ...                 # agent-specific config files
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

---

## License

[Apache 2.0](LICENSE) — same as Symphony.

<div align="center">

---

**If poise saves you a review cycle, give it a ⭐ — it helps other people find it.**

</div>
