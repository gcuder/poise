# Execution Plans

Plans are first-class repository artifacts — checked in, versioned, updated
as work progresses. Agents start fresh each session; plans are how complex
work survives across sessions without losing context.

## Structure

```
docs/exec-plans/
├── active/      # work in progress
└── completed/   # done — kept for reference
```

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

1. Move the file from `active/` to `completed/`
2. Add a `Completed` date at the top
3. Update `docs/quality.md` if the plan addressed known debt
