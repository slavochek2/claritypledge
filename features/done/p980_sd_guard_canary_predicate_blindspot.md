---
status: done
type: task
rank: 1000944
severity: medium
workstream: C1
date_reported: '2026-06-30'
created_date: '2026-06-30'
tags: [security, p952-class, security-definer, test-coverage, regression-guard, canary]
delivery_stage: ship
pipeline_ran: [create-bug]
---

# P980: sd-guard-completeness canary is blind to predicate/return-gate scoping drops (P952-class false-negative)

## Summary

The generalized P952-class canary `src/tests/sd-guard-completeness.test.ts` (committed `5607aaa1`) gives false confidence: it extracts only `RAISE EXCEPTION` message strings and the single token `p878_relationship_scope`, so it cannot see dropped scoping guards expressed as WHERE predicates, `IN`-whitelists, JOIN scopes, or `RETURN`-based gates. **Proven: the canary runs green against the current tree, which contains three confirmed live regressions** (P977, P978, P979) of exactly that shape. The guard meant to stop this class is structurally blind to most of it.

## Root Cause

`sd-guard-completeness.test.ts` tracks two guard kinds (lines 17-22, 44-48):
1. `RAISE EXCEPTION 'message'` — the message string must persist in the latest definition.
2. `CRITICAL_TOKENS = ['p878_relationship_scope']` — must persist.

The original P952 case (`seal_and_send_letter`) is caught only because it dropped **both** a RAISE message (`Recipient is not in your relationship scope`) and the p878 token. Guards that scope row visibility without a RAISE and without that token are invisible. The three regressions this audit confirmed are all that shape:

| Spec | Function | Dropped clause | Why the canary misses it |
|---|---|---|---|
| P977 | `get_letter_position_stories` | `AND sp.author_id IN (v_sender_id, v_receiver_id)` | WHERE whitelist; vars `v_sender_id`/`v_receiver_id` still present in the new body → no distinctive lost token; no RAISE |
| P978 | `reveal_prediction_by_token` | `IF NOT EXISTS (… letter_story_snapshots … listener_id …) THEN RETURN NULL` | RETURN-gate, not RAISE; tokens `listener_id`/`letter_story_snapshots` not tracked |
| P979 | `update_delivery_status_by_token` | `IF v_new_rank <= v_current_rank THEN RETURN true` | RETURN-gate; tokens `v_new_rank`/`v_current_rank` not tracked |

**Evidence:** `npx vitest run sd-guard-completeness` → 1 passed, against a tree where prod-verification confirmed all three guards are absent (see P977/P978/P979 specs).

## Reproduction Steps

1. On the current branch (all three regressions live in `supabase/migrations/`), run `npx vitest run sd-guard-completeness`.
2. Observe: the canary passes (green) — it does not flag `get_letter_position_stories`, `reveal_prediction_by_token`, or `update_delivery_status_by_token`.

**Reproduction rate:** 100%.

## Expected Behavior

The canary fires (red) when a SECURITY DEFINER function's latest definition drops a scoping guard any prior version had — including WHERE-whitelist, JOIN-scope, and RETURN-gate guards, not only `RAISE EXCEPTION` messages and the p878 token.

## Actual Behavior

The canary passes despite three live scoping-guard drops, because its extraction heuristics see only RAISE messages and one token.

## Affected Files

- `src/tests/sd-guard-completeness.test.ts` — guard extraction (`extractGuards`, `CRITICAL_TOKENS`) is too narrow
- (reference) `src/tests/p975-letter-scope-gate.test.ts` — the per-function pinned-predicate pattern to mirror for whitelist drops

## Severity

**Medium** — no direct user-facing failure, but it is a security-regression *detection* gap that already let three real regressions through undetected. Closing it is the durable fix for the whole P952 class; leaving it means the next predicate-shaped drop ships silently again.

## Fix Approach

Two complementary mechanisms (verify each FIRES before trusting it — epistemic gate 7):

1. **Broaden `CRITICAL_TOKENS`** to stable scope-bearing identifiers that, once a function uses them, must persist (with `KNOWN_INTENTIONAL_REMOVALS` entries for legitimate drops): candidates — `listener_id`, `letter_story_snapshots`, `_is_letter_participant`, `_is_letter_sender`, `_is_letter_receiver`, `_is_delivery_receiver`. This catches P978 (lost `listener_id` + `letter_story_snapshots`) and P979 (lost `v_new_rank`/`v_current_rank` — add those too, or fold into mechanism 2). The token rule only fires when a function that *had* the token loses it, so functions that keep it (e.g. `get_letter_results` keeps `listener_id`) do not false-positive. Run the full canary after each token addition and triage any new failures into real-drop vs intentional-removal.

2. **Add a `CRITICAL_PREDICATES` guard kind** (normalized-whitespace substrings, each tied to its function) for WHERE-whitelist drops with no distinctive lost token — e.g. `get_letter_position_stories` → `author_id IN (v_sender_id, v_receiver_id)`. These are in-canary per-function pins. Alternatively/additionally add a dedicated `p977-position-stories-author-scope.test.ts` mirroring `p975-letter-scope-gate.test.ts`.

**Sequencing (the dependency that makes this valuable):** land the canary extension FIRST so it goes RED against the current tree — proving it now catches P977/P978/P979 — then fix those three (each turning a specific assertion green). Do not fix the three before the canary can see them, or the regression guard is never exercised against a real failure.

## Acceptance Criteria

- [ ] After extension, `npx vitest run sd-guard-completeness` (plus any new per-function pin) **fails** against the current pre-fix tree, naming `get_letter_position_stories`, `reveal_prediction_by_token`, and `update_delivery_status_by_token`
- [ ] Each of P977/P978/P979's fix flips exactly its own assertion from red to green
- [ ] No false positives: the full SECURITY DEFINER function set passes after the three real drops are restored; every intentional drop has a documented `KNOWN_INTENTIONAL_REMOVALS` entry
- [ ] The added tokens/predicates are documented in the canary header so a future maintainer knows why each is tracked
