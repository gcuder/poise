# Execution Plans

Plans are first-class repository artifacts — checked in, versioned, updated
as work progresses. Agents start fresh each session; plans are how complex
work survives across sessions without losing context.

## Structure

```
docs/exec-plans/
├── active/      # work in progress (status: draft)
├── completed/   # done — kept for reference (status: stable)
├── log.md       # newest-first completion history
└── template.md
```

Each plan is an OKF concept: frontmatter with `type: Exec Plan`, `title`,
`description`, `status`, `affects` and `generated: {by, at}`. Plans approved
in plan mode also carry `verified` by the approving human.

## When to create a plan

| Create a plan | Work directly |
|---|---|
| Spans more than one agent session | Single-session bug fix |
| Touches more than two modules | Single-file change |
| Requires an architectural decision | Documentation update |
| Introduces a new dependency | Adding a test |

## Creating a plan

```bash
make plan name=<slug>
```

## Completing a plan

Tick every `- [ ]` step. The agent hook (`scripts/archive_plans.py`) then
moves the file to `completed/`, sets `status: stable` and `completed_at`, and
adds an entry to `log.md`. Update `docs/quality.md` if the plan addressed
known debt.

<!-- okf:listing -->
