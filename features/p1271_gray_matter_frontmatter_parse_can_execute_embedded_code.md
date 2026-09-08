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
delivery_stage: dev
pipeline_ran: [create-bug, fix, adversarial-review]
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

`tools/kanban/server/__tests__/frontmatter-engine.test.ts` is the public-safe fixture. It asserts
the vulnerability directly: a bare `matter()` call on a frontmatter block carrying a non-YAML
language tag sets a global that only the block's own body could set. The same block through the
pinned wrapper throws and sets nothing.

## Affected Files

Repo-wide grep for `gray-matter` — all call sites are under `tools/kanban/`:

- `tools/kanban/lib/frontmatter.ts` — NEW: the pinned wrapper, the only place `gray-matter` is imported for real use
- `tools/kanban/server/api.ts` — 11 parse sites + 3 stringify sites, migrated
- `tools/kanban/scripts/validate-features.ts` — confirmed call site, migrated
- `tools/kanban/server/__tests__/scanner-smoke.test.ts` — migrated
- `tools/kanban/server/__tests__/frontmatter-engine.test.ts` — NEW: regression fixture; imports `gray-matter` directly on purpose, to demonstrate the unpinned behavior

## Severity

**Medium** — local dev-tooling code execution, not a live production surface, but a realistic path
via outside contributions to a public repo.

## Fix Approach

**The approach this spec was filed with does not work, and that correction is the main finding.**
`{ language: 'yaml' }` does NOT force the YAML engine: `gray-matter`'s `parseMatter` assigns
`file.language` from the option and then *overwrites* it with the inline tag whenever one is
present. Verified in `node_modules/gray-matter/index.js`, and asserted as a test in the fixture —
a `{ language: 'yaml' }` parse of the payload still executes it.

Pinning has to happen at the engine table instead. `tools/kanban/lib/frontmatter.ts` wraps
`gray-matter` and replaces every non-YAML engine with one that throws, so a tagged block fails
closed two ways: our thrower fires for engines gray-matter ships (`javascript`/`js`/`json`), and
gray-matter's own "engine is not registered" fires for anything else. Untagged frontmatter — every
real file in this repo — parses as YAML, unchanged. All call sites now import the wrapper.

## Acceptance Criteria

- [x] Every `matter()` call site in the repo goes through the pinned wrapper — `grep -rn gray-matter`
      over `tools/kanban/{lib,server,scripts}` leaves only `lib/frontmatter.ts` and the fixture that
      demonstrates the unpinned behavior on purpose
- [x] A regression test proves a frontmatter block naming a non-YAML language tag is rejected, not
      executed — 13/13 pass, including the two that show the unpinned parse *does* execute it, and
      the prototype-key and BOM cases the adversarial review turned up
- [x] Round-trip fidelity on the real corpus: 399 spec files under `features/` parsed and
      re-serialized through both the old and new paths — **0 byte-diffs, 0 new throws**
- [x] No regression in the existing suites: same-directory before/after run is 14 failing files
      before and 14 after, identical set, zero new (the 14 are pre-existing: P1238's unshipped
      validator fix plus a co-tenant's in-flight `KANBAN_OPEN_DRY_RUN` work). `tsc --noEmit`: 16
      pre-existing errors before and after, zero new.

## Adversarial Review (2026-09-08)

2 of 2 reviewers reported — bypass lens and blast-radius lens, no lens uncovered.

**Two real holes, both in the first version of the fix, both closed and both now carrying a
regression test.** Each was reproduced locally before being acted on, not taken on the reviewer's
word.

1. **Prototype-chain tag (found in-session, before the reviewers).** Overriding the engine table
   is not sufficient on its own. gray-matter resolves engines with `options.engines[name]` on a
   plain object, so `---constructor`, `---toString`, `---valueOf`, `---hasOwnProperty` resolve to
   inherited functions off `Object.prototype` and **parse cleanly instead of throwing** — fail-open.
   A null-prototype table does not help; `lib/defaults.js` re-merges through `Object.assign({}, …)`.
   Closed by refusing the tag before gray-matter sees it.

2. **BOM bypass (reviewer, HIGH).** A leading U+FEFF made the tag check's `startsWith('---')`
   return early, while gray-matter strips the BOM in `toFile()` and still extracts the tag — so
   `BOM + '---constructor'` parsed silently into attacker-shaped junk. The general lesson: **the
   pre-check must normalize its input exactly as the library does, or the gap between the two
   layers is the bypass.** Closed by stripping the BOM before the delimiter test.

**Not real / already owned elsewhere:**

- A tagged file now throws where the old code silently executed it, and
  `scripts/validate-features.ts` had no try/catch — so one hostile file would abort the whole run.
  Verified as **already fixed on `feature/p1238-validate-features-crash`** (commit `5d431b3d3`),
  which wraps that loop in a generic `catch` that catches `FrontmatterEngineError` too. Not
  duplicated here.
  **Merge dependency:** P1238 and this change edit the same lines of `validate-features.ts` — P1238
  adds the try/catch around a bare `matter(content)`, this change swaps the call for
  `parseFrontmatter`. Whichever lands second must keep BOTH, not pick a side.
- js-yaml `__proto__` prototype pollution — tested, not exploitable; the key lands as a safe own
  property.
- YAML formatting drift from the new options object — refuted by measurement (see AC 3).

## Non-Goals

- Do NOT attempt to sanitize or allowlist language tags — pinning the engine is the fix; there is
  no legitimate use of a non-YAML frontmatter engine in this repo today.
