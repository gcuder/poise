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

The generator protocol is a prompt; adapter behavior and installation have
automated regression tests. Run them with Node.js 22.19+ and Python 3.10+:

```bash
npm ci --ignore-scripts
make test
```

The suite renders the Pi templates, invokes native handlers with real Python
scripts and Pi's mutation queue, exercises installation in isolated temporary
directories, and typechecks the extension against the pinned Pi 0.99.2 API.
It requires no model credentials and does not modify personal installs.
The pinned upstream Pi 0.99.2 test dependency currently shrinkwraps
`brace-expansion` 5.0.9, which `npm audit` flags for denial-of-service issues.
This is a dev-only upstream dependency, not shipped in generated harnesses;
use trusted fixture inputs and update the pin when upstream fixes it. Do not
hide the finding by changing only the lockfile: upstream's shrinkwrap can
still install the old version.

Before submitting a PR:

1. Run `make sync` (restart Codex / run `/reload` in Pi) so your edits are picked up by the agent you're testing with.
2. Run the generator on a real repo in your target language.
3. Run `make check-arch` on the output.
4. Verify the AGENTS.md is under 100 lines.
5. Verify every violation in `check-arch` output has a REMEDIATION line.
6. For Pi, trust the generated project, `/reload`, verify the session brief,
   third-source-file block, model-visible lint feedback, `/plan`, `/sync-docs`,
   completed-plan archival, and all `POISE_*` escape hatches. Test print/RPC
   mode without UI. Never claim non-Python architecture coverage from the
   Python-only core checker.

## License

All contributions are licensed under Apache 2.0.
