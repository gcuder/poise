# Claude Code Adapter

## What this provides

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Registers PostToolUse and PreToolUse hooks |
| `.claude/hooks/post_write.sh` | Runs format → lint → arch check after every file write |
| `.claude/hooks/pre_bash.sh` | Blocks destructive commands before execution (exit 2 = unconditional) |
| `.claude/commands/sync-docs.md` | `/project:sync-docs` — garbage collection sweep |
| `.claude/commands/plan.md` | `/project:plan` — guided execution plan creation |

## What it requires

- `claude` CLI installed and authenticated (`claude --version`)
- `lefthook` installed for pre-commit hooks (`brew install lefthook && lefthook install`)
- Language-appropriate formatter and linter on PATH (ruff, eslint, golangci-lint, etc.)

## Entry file

Claude Code reads `CLAUDE.md` in addition to `AGENTS.md`. The generator creates
`CLAUDE.md` as a one-line redirect:

```markdown
# See AGENTS.md
```

This ensures Claude Code sessions always land on the shared entry file.

## Hook mechanism

**PostToolUse**: fires after every `Write`, `Edit`, or `MultiEdit` tool call.
Runs `post_write.sh` with the modified file path. Output is injected into
Claude's context window — remediation messages are read automatically.

**PreToolUse**: fires before every `Bash` tool call.
Exit code `2` is an unconditional block — Claude cannot override it.
Used to prevent destructive commands (production DB drops, mass deletes, etc.)

## Commands

Custom slash commands in `.claude/commands/` are invoked as `/project:<name>`.

- `/project:sync-docs` — read-only garbage collection sweep, produces drift report
- `/project:plan` — reads architecture + quality docs, creates a checked-in plan

## Known limitations

- Hook scripts are bash — Windows users will need WSL or adaptation
- `$CLAUDE_TOOL_INPUT_FILE_PATH` env var is set by Claude Code at hook invocation;
  verify the variable name matches your Claude Code version if hooks don't fire
