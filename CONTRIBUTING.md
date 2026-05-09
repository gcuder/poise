# Contributing

## Adding a new agent adapter

The core harness is agent-agnostic. Adding a new agent means adding one
directory — the core doesn't change.

```
templates/agents/<agent-name>/
├── ADAPTER.md          # required — describes what this adapter provides
└── ...                 # agent-specific config files
```

### ADAPTER.md format

```markdown
# <Agent Name> Adapter

## What this provides
- list of files generated and what each does

## What it requires
- agent CLI / dependencies the user needs installed

## Entry file
Which file the agent reads first (AGENTS.md, CLAUDE.md, etc.)

## Hook mechanism
How post-write enforcement is wired up for this agent

## Known limitations
Anything the adapter can't yet do
```

### Guidelines

- **Hooks must output remediation messages** that can be read by the agent.
  A hook that silently fails or prints a generic error is not useful.
- **Commands are optional** but preferred where the agent supports them.
  They allow garbage collection (`/sync-docs`) and plan creation (`/plan`)
  to be triggered from within the agent session.
- **Don't modify core templates** to support a specific agent. If a core
  template needs to be agent-aware, it's a sign the feature belongs in
  the adapter layer.

## Improving the generator (SKILL.md)

The SKILL.md is the generator logic. Changes to it affect all agents.

- Phase 1 (Discovery) changes: be careful not to add questions that slow
  down generation for obvious cases. Most repos have a clear layer model.
- Phase 2 (Generation) changes: test with at least two different language
  stacks before submitting.
- Remediation messages: any improvement to specificity is welcome. The
  quality of the linter output directly affects agent self-correction rate.

## Testing

There is no automated test suite for the generator (it's a prompt, not code).
Before submitting a PR:

1. Run the generator on a real repo in your target language
2. Run `make check-arch` on the output
3. Verify the AGENTS.md is under 100 lines
4. Verify every violation in `check-arch` output has a REMEDIATION line

## License

All contributions are licensed under Apache 2.0.
