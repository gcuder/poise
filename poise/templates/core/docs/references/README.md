# References

External pointers an agent can load on demand: vendor SDK docs, runbooks,
internal wikis, dashboards, links to discussions that ground a decision.

This directory exists so AGENTS.md can stay short. Anything that lives
behind a URL or in an external system goes here, not in AGENTS.md and not
in code comments.

## What belongs here

- Vendor / SDK reference pages for restricted packages
- Runbooks (oncall, incident response, deploy rollback)
- Dashboards (Grafana, Sentry, BigQuery saved queries)
- Internal wiki / Notion / Confluence links by topic
- Long-form discussions that ground a current decision

## What does *not* belong here

- Anything that should be in code → put it in code.
- Anything that should be a decision → write an ADR in `docs/decisions/`.
- Anything that should be a convention → put it in `docs/conventions.md`.
- Anything that should be a spec → put it in `docs/product-specs/`.

## Layout

One markdown file per topic. Suggested seeds (the generator fills these
based on `RESTRICTED_PACKAGES` discovered in Phase 1):

| Topic | File |
|---|---|
{{REFERENCES_SEED_ROWS}}
<!-- Example rows the generator emits:
| Anthropic SDK | [anthropic.md](anthropic.md) |
| Cloud Run     | [cloud-run.md](cloud-run.md) |
-->

Each file: one-line intro + a flat list of links. Keep it scannable.
