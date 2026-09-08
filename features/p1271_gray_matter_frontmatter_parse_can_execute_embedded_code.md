---
status: week
type: bug
rank: 1000079
severity: medium
workstream: spec-schema
date_reported: '2026-09-08'
created_date: '2026-09-08'
drafted_by: sonnet
exec_model: sonnet
exec_effort: low
tags: [tooling, security, dependencies]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1271: `gray-matter`'s frontmatter parsing can execute embedded code via a language-tag switch

## Summary

Every script that parses a spec's YAML frontmatter with a bare `matter(content)` call (no explicit
`{ language: 'yaml' }` option) inherits `gray-matter`'s language-tag auto-detection, which can
select a non-YAML parse engine capable of executing content from the file. This is independent of
YAML parsing itself — the underlying YAML library was separately confirmed safe against unsafe-tag
attacks.

## Root Cause

`gray-matter`'s engine selection is driven by a tag on the same line as the frontmatter's opening
delimiter, rather than being pinned to YAML by every caller. Found incidentally during P1238's
adversarial review while auditing `tools/kanban/scripts/validate-features.ts` for other unhandled
failure surfaces. Verified live in this session — mechanism, POC, and blast-radius detail are kept
out of this public spec; see `.private/docs/security-log.md` (2026-09-08 entry) for specifics.

## Impact

Today's affected inputs are repo-controlled feature specs under `features/`, so this is not a
live/authenticated/anon-reachable production surface. But this repo is public (AGPL) and takes
outside contributions, so a crafted spec file submitted in a PR is a realistic path to running code
on the machine of anyone who clones the repo and runs the affected scripts locally.

## Reproduction

Under investigation for a public-safe repro fixture — the live POC used to confirm this is
withheld per `.private/docs/security-log.md`.

## Affected Files

- `tools/kanban/scripts/validate-features.ts` — confirmed call site
- Any other script in this repo calling `gray-matter`'s `matter()` without `{ language: 'yaml' }` —
  not yet enumerated; a repo-wide grep for `matter(` is the first step of the fix

## Severity

**Medium** — local dev-tooling code execution, not a live production surface, but a realistic path
via outside contributions to a public repo.

## Fix Approach

Pass `{ language: 'yaml' }` explicitly to every `matter()` call in this repo, forcing the YAML
engine regardless of any embedded language tag. Enumerate call sites with a grep before fixing.

## Acceptance Criteria

- [ ] Every `matter()` call site in the repo passes `{ language: 'yaml' }` (or an equivalent pin)
- [ ] A regression test proves a frontmatter block naming a non-YAML language tag is parsed as
      plain YAML (or rejected), not executed
- [ ] `./scripts/validate-features.sh` and any other affected script still pass their existing
      test suites after the fix

## Non-Goals

- Do NOT attempt to sanitize or allowlist language tags — pinning the engine is the fix; there is
  no legitimate use of a non-YAML frontmatter engine in this repo today.
