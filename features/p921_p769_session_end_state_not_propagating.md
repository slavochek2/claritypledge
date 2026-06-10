---
status: in-progress
type: bug
rank: 1000789.0
severity: high
workstream: live
date_reported: '2026-06-10'
created_date: '2026-06-10'
tags: [e2e, test-infra, live-session, session-end, p769, regression]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p921-reproduce.spec.ts
  root_cause: "NOT one propagation gap — three distinct causes + one red herring. (1) Heading/screen mismatch: in-session & join-via-link ended paths render PartnerLeftScreen ('Session ended'), tests assert SessionEndedScreen ('This session has ended') — detection WORKS, partner sees an ended screen [@110/@279/@647]. (2) Remote-end detection sets sessionEnded but never clearStoredSession() [@401]. (3) confirmExitMeeting sequences terminate() after a 5s upload await + transcription await; immediate nav aborts the RPC [@700]. The savedAt→timestamp seed (P899) is a RED HERRING — all 5 fail identically with valid seeds (verified on w4)."
  confidence: high
  surfaces_in_scope: [cold-link-ended-screen-routing-@279-@647, storage-clear-on-remote-end-@401, end-session-rpc-survives-nav-@700]
  surfaces_test_fix_only: [in-session-end-heading-@110 -- app already correct ('Session ended'); update test assertion]
  founder_decision: "Cause 1 path-dependent: cold link/refresh to ended session -> SessionEndedScreen ('This session has ended'); partner-ends-mid-session -> PartnerLeftScreen ('Session ended'). One /fix for all three causes."
  reproduced_at: '2026-06-10'
---

# P921: p769 session-end state does not propagate — 5 ended-state tests fail (serial + parallel)

## Summary

The full `e2e/p769-session-end-terminal-authority.spec.ts` suite fails **5 tests, identically in parallel AND serial** (`--workers=1`): **5 failed / 7 passed** (verified 2026-06-10, both retries failed → 100% reproduction).

**`/reproduce` verdict (2026-06-10): the original framing is FALSIFIED.** This is NOT "one runtime propagation gap." It is **three distinct root causes + one red herring**, and the headline ("session-end does not propagate to the partner") is **largely false** — for 3 of the 5 tests the ended state DOES propagate and render; the tests just assert the wrong screen's copy.

- **The `savedAt`→`timestamp` seed (P899) is a RED HERRING.** Running the suite from `w4` (P899's branch, valid `timestamp` seeds, relevant app code identical to main per `git diff w4..main` on `clarity-live-page.tsx`/`api.ts`/`live-session-context.tsx`) reproduces **the same 5 failures**. The seed only moves @110's failure *point* (main: host banner button absent at `:142`; w4: partner heading at `:151`); it never makes any test pass. The spec's earlier "ruled out: seed fixed" is correct that the seed isn't *the* cause — but wrong to imply the remaining 5 are one bug.

## Failing tests (main-branch line refs, 2026-06-10)

| Test | Fails at | Cause |
|------|----------|-------|
| @110 author ends from banner → partner sees ended screen | partner heading `:151` (main w/ stale seed: host button `:142`) | **1** heading mismatch |
| @279 partner opens /live/{code} already-ended → ended screen | ended heading `:306` | **1** heading mismatch |
| @647 partner refreshes /live ≤5s → no Rejoin flash; ended ≤3s | ended heading `:687` | **1** heading mismatch |
| @401 host+guest empty clarity_live_* sessionStorage within 5s | host keys persist `:441` | **2** storage not cleared on remote end |
| @700 (P775) creator clicks End Session then navigates | `waitForDBStateKey sessionEnded=true` DB poll `:730` | **3** RPC aborted by nav |

Passing ended-related tests for contrast: @347 (ended-session banner correctly hidden), @736 (P775 joiner — explicitly does NOT assert sessionEnded; joiner path uses clearSessionJoiner + cancelLiveInvite, not terminate).

## Root Cause

Confirmed via two-party trace + a dedicated canary (`e2e/p921-reproduce.spec.ts`, both tests FAIL pre-fix for the right reason). The 5 failures map to **3 causes**, by cluster:

### Cause 1 — Ended-screen heading/routing mismatch (`@110`, `@279`, `@647`) — PROD-SAFE

Two ended screens exist with **different copy by design**:
- **`PartnerLeftScreen`** (`live-mode-view.tsx:286`) — rendered when in-session `sessionEnded` state flips → heading **"Session ended"**. Long-standing since the original Live commit (`a6857d07`), NOT a regression.
- **`SessionEndedScreen`** (`session-ended-screen.tsx:16`) — rendered only on the `sessionEndedOnLoad` cold-LANDING path (`/live` with no code) → heading **"This session has ended"** + Go-to-Letters link.

All three tests assert the `SessionEndedScreen` text `/this session has ended/i`, but their paths render `PartnerLeftScreen`:
- `@110`: guest is live; host ends → guest poll detects → `PartnerLeftScreen`.
- `@279`/`@647`: partner opens/refreshes `/live/{code}` (join-via-link). Auto-join SUCCEEDS on the ended session (`joinClaritySession` has **no `sessionEnded` guard** — same-name rejoin returns the ended row), view→`live`, poll detects → `PartnerLeftScreen`.

**Trace evidence (cold join-via-link to an ended session):** partner page shows `"Session ended"` (count **1**), `"This session has ended"` (count **0**); console: `[Join] Mic granted, joining session…` → `Session already has a joiner` → `[Join] Session joined, transitioning to live view`. **Detection works — the partner DOES see an ended screen.** It is not a propagation failure; the tests assert the wrong screen's copy.

→ **FOUNDER DECISION (copy/UX), see Open Questions.** Either (A) route in-session/join-via-link ended paths to `SessionEndedScreen` (unify on "This session has ended" + Go-to-Letters) — app fix; or (B) accept `PartnerLeftScreen` "Session ended" as correct and update the 3 tests — test fix.

### Cause 2 — Remote-detected session-end never clears local `clarity_live_*` sessionStorage (`@401`) — minor, prod-safe-ish

`clarity-live-page.tsx` clears storage only on the LOCAL End-Session button path (`confirmExitMeeting`, `clearStoredSession()` @ `:3502`). The two **remote-end detection sites** — realtime (`:1162-1178`) and poll (`:1343-1361`) — set `sessionEndedRef`/`setSessionEnded(true)` but **never call `clearStoredSession()`**. So a tab that learns of the end from the *other* party keeps `clarity_live_session_id` + `clarity_live_session_code`. Violates the P769 "session-end clears storage on both sides" invariant. Decision-free app fix. (Canary `P921-A` reproduces it; DB end lands ✓, host keys persist.)

### Cause 3 — End Session + immediate navigation aborts the `sessionEnded` DB write (`@700`) — the GENUINE propagation failure

In `confirmExitMeeting` the partner-notifying RPC `terminate()` (→ `complete_clarity_session`, sets `sessionEnded`) is sequenced at `:3554`, **after** `await Promise.race([stopAndUploadRecording(), 5s])` (`:3506`) and `await createTranscriptionJob()` (`:3515`). A full-page nav immediately after the click tears down the JS context before `terminate()` runs → `live_state.sessionEnded` is never written → the partner is never notified and keeps polling an "active" session. Decision-free app fix (fire the terminate/sessionEnded write BEFORE the upload await, or via a nav-surviving mechanism). (Canary `P921-B` reproduces it; `waitForDBStateKey sessionEnded=true` times out after 12s.)

### Ruled out (carried from create-bug, all still valid)
- **Test-DB migration drift** — FALSIFIED (RPC is the correct P769 version).
- **Stale dev server** — FALSIFIED (Playwright boots its own server).
- **P893 parallel-load race** — FALSIFIED (fails identically at `--workers=1`).
- **p892 `abecd6d5` / p827 regression** — FALSIFIED. `abecd6d5` touched the celebration round-flush in `confirmExitMeeting`, not ended-detection or storage-clearing. Causes 1–3 are long-standing, not recent regressions.

## Reproduction Steps

```bash
cd <cp-root>   # or a worktree
npx playwright test e2e/p769-session-end-terminal-authority.spec.ts --workers=1 --reporter=list > /tmp/p921.log 2>&1
grep -E "[0-9]+ (passed|failed)" /tmp/p921.log   # → 5 failed, 7 passed
```
Reproduction rate: 100% (serial and parallel, 2026-06-10).

## Suspects

FALSIFIED as regression sources (`/reproduce`): `abecd6d5` (p892) touched the celebration round-flush, not ended-detection/storage. p827 series did not touch `joinClaritySession`, the heading copy, or the terminate sequencing. Causes 1–3 are long-standing gaps newly *exposed* by the P769 tests, not regressions — no bisect target.

## Severity

**Re-scoped by `/reproduce` — prod impact is LOW-to-MODERATE, not High.**
- **Cause 1 (heading, @110/@279/@647):** PROD-SAFE. The partner DOES see a terminal "Session ended" screen; only the screen *type*/copy differs from what the tests assert. Cosmetic at most.
- **Cause 2 (storage, @401):** Minor. Stale `clarity_live_*` keys on a tab notified of a remote end; overwritten on the next session start. No user-visible break observed.
- **Cause 3 (RPC abort, @700):** The only genuine propagation failure, and edge-case-bound: only when a user clicks End Session and *immediately* navigates/closes within the upload window. In the normal path the user stays on the page and the RPC fires after upload. Moderate impact in that edge case (partner not notified).

Recommend dropping `severity: high` → `medium` once the founder confirms Cause 1's direction.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx:286` — `PartnerLeftScreen` heading "Session ended" (Cause 1)
- `src/app/components/session/session-ended-screen.tsx:16` — `SessionEndedScreen` "This session has ended" (Cause 1)
- `src/app/pages/clarity-live-page.tsx` — remote-end detection sites `:1162-1178` (realtime) / `:1343-1361` (poll) missing `clearStoredSession()` (Cause 2); `confirmExitMeeting` `:3460-3589` terminate-after-await sequencing (Cause 3); join-via-link auto-join `:3284`
- `src/app/data/api.ts:932` — `joinClaritySession` has no `sessionEnded` guard (Cause 1 contributor)
- `e2e/p921-reproduce.spec.ts` — canary (Causes 2 & 3); `e2e/p769-session-end-terminal-authority.spec.ts` — the 5 originals

## Resolved Decisions

**[Cause 1 ended-screen routing — RESOLVED 2026-06-10, founder]** **Path-dependent:**
- Cold link / refresh to an **already-ended** session (`/live/{code}`, no live tab) → **`SessionEndedScreen`** ("This session has ended" + Go-to-Letters). App fix → fixes @279, @647.
- Partner **ends mid-session** (a live tab learns the other party ended) → keep **`PartnerLeftScreen`** ("Session ended", shows upload progress). The app is already correct here → @110 is a **test fix** (assert "Session ended", not "This session has ended").
- `joinClaritySession` (`api.ts:932`) should **short-circuit an already-ended session** so the cold-link path renders `SessionEndedScreen` instead of rejoining a dead room.

**[Scope — RESOLVED]** One `/fix` handles all three causes (same `/live` files + same test suite).

## Fix checklist (for /fix)
- **Cause 1 (app):** cold-load `/live/{code}` of an ended session → `SessionEndedScreen`. Guard `joinClaritySession` (or the auto-join path) against `live_state.sessionEnded`/`joinerEnded`. Then update @110's assertion to "Session ended".
- **Cause 2 (app):** add `clearStoredSession()` at the two remote-end detection sites (`clarity-live-page.tsx` realtime `:1162-1178`, poll `:1343-1361`).
- **Cause 3 (app):** fire `terminate()` / the `sessionEnded` write BEFORE the `stopAndUploadRecording()` + `createTranscriptionJob()` awaits in `confirmExitMeeting` (or via a nav-surviving path).

## Acceptance Criteria

- [x] Root cause identified and framed as hypothesis + disproof (per epistemic gates) — **3 causes confirmed, seed red herring falsified**
- [x] Prod-impact determined — **LOW-MODERATE; only Cause 3 is a genuine (edge-case) propagation failure**
- [x] Founder decision on Cause 1 — **path-dependent (recorded above)**
- [x] Failing canary written + runs + FAILS pre-fix for the right reason (`e2e/p921-reproduce.spec.ts` — P921-A storage, P921-B RPC-nav, P921-C cold-link routing; all 3 fail)
- [ ] `npx playwright test e2e/p769-session-end-terminal-authority.spec.ts --workers=1` passes (5 green) after `/fix` (with @110 assertion updated to "Session ended")
