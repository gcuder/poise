# OpenCode Adapter

## What this provides

| File | Purpose |
|------|---------|
| `.opencode/opencode.json` | Points OpenCode at `AGENTS.md`; sets permissions |
| `.opencode/plugins/harness.ts` | Post-write hooks: format → lint → arch check |
| `.opencode/commands/sync-docs.md` | `/sync-docs` — garbage collection sweep |
| `.opencode/commands/plan.md` | `/plan` — guided execution plan creation |

## What it requires

- OpenCode installed (`curl -fsSL https://opencode.ai/install | bash`)
- Bun installed (OpenCode uses Bun to run plugins: `brew install bun`)
- Language-appropriate formatter and linter on PATH

## Entry file

OpenCode reads `AGENTS.md` natively. For teams migrating from Claude Code, OpenCode also supports `CLAUDE.md` as a fallback — `AGENTS.md` takes precedence if both exist.

The core harness generates `AGENTS.md` as the universal entry file.
No additional entry file needed for OpenCode.

## Hook mechanism

OpenCode uses a TypeScript plugin system. The `harness.ts` plugin
subscribes to `tool.execute.after` events and fires after every file
write (`write`, `edit`, `apply_patch` tools).

Output from the plugin is surfaced in the OpenCode session context —
remediation messages are visible to the agent.

## Skills

OpenCode loads skills from `.opencode/skills/*/SKILL.md` and also from `.claude/skills/*/SKILL.md` natively.

This means the harness generator skill itself (`~/.claude/skills/harness/`)
is automatically available in OpenCode sessions without any additional setup.

## Commands

Custom commands are defined as markdown files in `.opencode/commands/`. The markdown file name becomes the command name — `sync-docs.md` creates `/sync-docs`.

## Known limitations

- The plugin runs via Bun — ensure Bun is installed before using OpenCode sessions
- `tool.execute.after` fires after the tool completes, not before — the agent
  may see a violation after writing a file rather than being blocked pre-write
- For pre-execution blocking, use `tool.execute.before` in the plugin and
  throw an error to cancel the operation (see plugin comments)
