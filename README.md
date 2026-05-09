# harness

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
┌─────────────────────────────────────────────┐
│  AGENTS.md          table of contents        │ ← what every agent reads first
│  docs/              architecture, plans, ADRs │ ← on-demand context
│  boundary linter    remediation messages      │ ← mechanical enforcement
│  hooks              format → lint → arch      │ ← feedback at write time
└─────────────────────────────────────────────┘
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
cp -r . ~/.claude/skills/harness

# In any repo
claude
> generate harness for this repo
```

### With OpenCode

```bash
# Install globally (OpenCode reads .claude/skills/ natively)
cp -r . ~/.claude/skills/harness

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
Makefile                        # check-arch, gc, plan targets
lefthook.yml                    # pre-commit / pre-push quality gates
scripts/check_architecture.py   # boundary linter with remediation messages
tests/test_architecture.py      # structural tests enforced in CI
docs/
├── architecture.md             # layer diagram + module responsibilities
├── conventions.md              # coding patterns with ✅/❌ examples
├── workflows.md                # setup, test, lint, deploy
├── quality.md                  # known gaps + tech debt tracker
├── decisions/                  # ADRs — one per architectural constraint
├── exec-plans/                 # execution plans as repo artifacts
│   ├── active/
│   └── completed/
└── product-specs/              # feature specs before implementation
```

### Claude Code adapter

```
.claude/
├── settings.json               # hook registration
├── hooks/
│   ├── post_write.sh           # format → lint → arch check (PostToolUse)
│   └── pre_bash.sh             # block destructive commands (PreToolUse)
└── commands/
    ├── sync-docs.md            # /project:sync-docs — garbage collection
    └── plan.md                 # /project:plan — execution plan creation
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

## The boundary linter

The most important output. Every architecture violation includes a
`REMEDIATION:` line that tells the agent exactly what to do:

```
BOUNDARY VIOLATION api/recipes.py:14
  'api/' imports from 'db/' (downstream layer).
  Layer rule: schemas → db → storage → pipeline → services → api
  REMEDIATION: Move data access logic to services/recipes.py.
               Import from services.recipes, not from db directly.
               See docs/architecture.md#layer-model.
```

This is not a blocking error message — it's a teaching tool. The agent reads
it and self-corrects without human intervention.

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
