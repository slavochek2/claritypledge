---
status: week
type: bug
rank: 1000943
severity: low
workstream: reliability
date_reported: '2026-07-08'
created_date: '2026-07-08'
tags: [linkify, edge-case, low-priority]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P984: linkify dangerous-scheme skip branch silently drops glued text

## Summary

In `linkifyUrls` (`src/app/utils/linkify.ts`), the dangerous-scheme skip branch (lines ~93-100) has an off-by-one guard bug: when a dangerous-scheme match (`javascript:`, `blob:`, etc.) starts exactly at `lastIndex` (no gap — glued directly onto the end of a prior match), the branch's `if (start > lastIndex)` guard is false, so the matched text is silently dropped from the output entirely instead of being pushed as plain text.

## Root Cause

Discovered as a sibling of the P983 fix: a new branch added in P983 (bare-domain-glued-to-word-char skip) copied this same guard pattern (`if (start > lastIndex) { nodes.push(text.slice(lastIndex, start + url.length)); }`) and hit the identical bug when `start === lastIndex`. The guard should be `if (start + url.length > lastIndex)` — it needs to fire whenever there's ANY new content to push (gap-only, url-only, or gap+url), not only when there's a gap before the match.

The dangerous-scheme branch itself was never fixed (P983 is scoped to the Safari lookbehind crash only) — this ticket tracks that pre-existing instance.

## Reproduction Steps

1. Construct a string where a dangerous-scheme match begins exactly where a previous match's `lastIndex` ends — e.g. two matches glued with zero gap between them, the second being a `javascript:`/`blob:`/`vbscript:`/`data:` scheme.
2. Call `linkifyText(text)`.
3. Observe: the glued dangerous-scheme text segment is missing entirely from the returned node array (not rendered as a link, but also not rendered as plain text).

**Reproduction rate:** 100% for the specific adjacency condition; requires a somewhat contrived input (no realistic user-content example identified during P983 investigation — this is a theoretical/edge-case gap, not an observed production symptom).

## Expected Behavior

Any text matched by `URL_PATTERN` that is intentionally skipped (not linkified) should still appear in the output as a plain-text node — nothing from the original string should silently vanish.

## Actual Behavior

When `start === lastIndex` for a skipped dangerous-scheme match, `text.slice(lastIndex, start + url.length)` is never pushed, so that substring disappears from the rendered output.

## Affected Files

- `src/app/utils/linkify.ts:93-100` — dangerous-scheme skip branch, guard condition `if (start > lastIndex)`

## Severity

**Low** — narrow edge case requiring two specific match types glued with zero separating characters; no known real-world trigger. Fix is a one-line guard correction (same pattern as the P983 fix for the sibling branch), low risk.

## Fix Approach

Change the guard from `if (start > lastIndex)` to `if (start + url.length > lastIndex)`, mirroring the fix applied to the P983 bare-domain-glued branch. Add a regression test constructing the exact adjacency condition (a dangerous-scheme match immediately following a prior linkified match with zero gap) and asserting the dangerous-scheme text still appears as a plain-text node in the output.

## Acceptance Criteria

- [ ] New test: dangerous-scheme match glued with zero gap onto a prior match's tail still appears as plain text in `linkifyText` output
- [ ] Existing `src/tests/linkify.test.ts` dangerous-scheme tests still pass unchanged
- [ ] `npm run build` clean
