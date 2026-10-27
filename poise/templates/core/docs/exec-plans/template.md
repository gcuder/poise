---
type: Exec Plan
title: <Title>
description: <one line — what done looks like>
tags: [<tag>, <tag>]
status: draft
affects: [<module>, <module>]
generated:
  by: human:<you>
  at: <timestamp>
---

# <Title>

<!-- Fill every section with concrete content. Where a section truly does not
apply, write `none` and one sentence on why. Decide before you code: the plan
is approved only when Decisions is filled and Open questions is empty. -->

## Summary

<!-- 2–3 sentences for a human reader: what changes, why, and what users or
developers will notice when it is done. -->

## Context

<!-- The problem and what prompted it. Link the product spec, ADR, or
docs/quality.md item. -->

## Scope

In:
- <what this plan delivers>

Out:
- <what this plan deliberately does not cover>

## Approach

<!-- The chosen design in 1–3 paragraphs. Name the key mechanism, where it
lives, and how the pieces connect. -->

## Decisions

<!-- One row per non-obvious choice, decided now, with the option turned down. -->

| Question | Choice | Why | Rejected |
|----------|--------|-----|----------|
| <what had to be decided> | <what we do> | <reason> | <alternative and why not> |

## Open questions

<!-- Must be empty before approval. Resolve each one, or mark it
`assumed: <the assumption>` and proceed on that basis. -->

none

## Changes

<!-- One bullet per file or module. Say what changes and which existing
function or utility it reuses. -->

- `path/to/file` — <what changes>; reuses `<existing function>`

## Steps

<!-- Keep each checkbox line short; put details in indented sub-bullets.
Only top-level `- [ ]` lines count as steps. -->

- [ ] <short action>
  - files: `path/a`, `path/b`
  - done when: <a check someone can run or see>

## Risks

| Risk | Mitigation |
|------|------------|
| <what could go wrong> | <how we prevent or detect it> |

## Verification

<!-- Commands to run and the result to expect, then any manual checks. -->

- `make test` — passes, including <new test name>

## Decision log

<!-- Filled during work: decisions made after approval. -->

| Date | Decision | Rationale |
|------|----------|-----------|
