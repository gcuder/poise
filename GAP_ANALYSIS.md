# Gap Analysis — poise vs. OpenAI's harness engineering article

Cross-references the harness pieces OpenAI describes in
[harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)
against the current contents of this repo (`SKILL.md`, the templates under
`poise/templates/`, and the README).

## What the harness already covers

- **AGENTS.md as table of contents** — `templates/core/AGENTS.md.tmpl`, ≤100 lines, enforced.
- **Layered dependency model** — inferred per stack in `SKILL.md` §1.3, generated into `docs/architecture.md` and `scripts/check_architecture.py`.
- **Boundary linter with `REMEDIATION:` lines** — `scripts/check_architecture.py.tmpl` + `tests/test_architecture.py.tmpl`.
- **Restricted / forbidden package enforcement** — covered in discovery (§1.5, §1.6) + linter.
- **Exec-plans + product-specs** — `docs/exec-plans/{active,completed}` + `docs/product-specs/` scaffolded; auto-promotion via `exit_plan_mode.sh` and `stop_check_plans.sh` hooks.
- **ADRs** — `docs/decisions/` + ADR template.
- **PostToolUse / PreToolUse hooks** — format → lint → arch and bash safety.
- **Quality / tech-debt tracker** — `docs/quality.md`.
- **Doc garbage collection** — `/sync-docs` command.

## What's missing vs. the OpenAI article

Ordered roughly by how mechanically enforceable they are (i.e. how well they fit poise's "generate me a harness" remit).

### 1. "Golden principles" / taste-invariant linters beyond layer boundaries

The article calls out four specific invariants enforced by custom lints:

- structured-logging format (e.g. no bare `print` / `console.log`, required fields)
- naming conventions for schemas and types
- **file-size limits** (per-file LOC ceiling)
- component-structure rules

`check_architecture.py.tmpl` only enforces dependency direction + restricted/forbidden packages. There's no `check_style.py` / `check_size.py` / `check_logging.py` equivalent, and no test file pinning them. **This is the biggest gap** — it's the most-cited mechanical control in the article.

### 2. `docs/references/`

The article's AGENTS.md TOC points at four sibling dirs: `design-docs/`, `product-specs/`, `exec-plans/`, **`references/`**. poise generates the first three (calling design-docs "decisions/"); `references/` (external links, runbooks, vendor docs the agent can load on demand) is absent.

### 3. Doc-gardening as an agent, not a manual command

Poise has `/sync-docs` as a slash command the human triggers. The article frames doc gardening as a *background agent that opens cleanup PRs autonomously*. There's no scheduled job / GitHub Action / `lefthook` post-merge entry that runs the sweep automatically.

### 4. Background cleanup / pattern-drift agents

Same shape as (3) but for code: continuous processes that detect drift from golden principles and open auto-mergeable refactor PRs. Not generated.

### 5. Provider interfaces for cross-cutting concerns

`SKILL.md` §1.4 records `CROSS_CUTTING` modules but only uses them to *exempt* them from the layer check. The article describes provider-interface scaffolding (explicit injection points) so cross-cutting code enters the architecture deliberately. No template enforces or even documents this.

### 6. Per-worktree / sandboxed verification surface

Per-worktree isolated app instances, CDP/DOM access, queryable local logs/metrics/traces. Mostly infra-not-harness, but a *harness generator* could at least emit:

- a `make worktree-up` / `make worktree-down` target,
- a smoke-test recipe wired into the post-write hook for UI changes.

None of that exists.

### 7. Codex-specific surface beyond `WORKFLOW.md`

The Codex adapter ships one file. The article (and related Codex docs) describe **Skills** and **Sub-agents** as first-class Codex primitives. Poise doesn't emit any `.codex/` skills or sub-agent configs — Codex support is much thinner than Claude Code support.

### 8. Merge-gate posture

The article explicitly recommends *minimal blocking gates + agent-to-agent review + tolerance for post-merge fixes*. `lefthook.yml.tmpl` is presumably the opposite (gates at pre-commit/pre-push). Worth a `docs/workflows.md` section calling out the trade-off, or a "gates: strict | minimal" knob during discovery.

### 9. No verification that the article's headline claim survives

The README cites the Top-30→Top-5 Terminal Bench result. Poise doesn't ship even a toy eval harness or a way for a team to measure that the generated harness actually moved the needle for their repo.

## Suggested priority

If you only do one thing: **(1)** add a second linter family for size / logging / naming, with `REMEDIATION:` lines, generated alongside `check_architecture.py`. That's the part of the article poise advertises ("OpenAI-style harness") but doesn't actually generate.

## Sources

- [Harness engineering: leveraging Codex in an agent-first world (OpenAI)](https://openai.com/index/harness-engineering/)
- [Harness Engineering: How OpenAI Ships Without Writing Code (SWE Quiz)](https://www.swequiz.com/articles/openai-harness-engineering)
- [Harness engineering — engineering.fyi mirror](https://www.engineering.fyi/article/harness-engineering-leveraging-codex-in-an-agent-first-world)
- [Agent Skills – Codex (OpenAI Developers)](https://developers.openai.com/codex/skills)
- [Subagents – Codex (OpenAI Developers)](https://developers.openai.com/codex/subagents)
- [Hooks – Codex (OpenAI Developers)](https://developers.openai.com/codex/hooks)
