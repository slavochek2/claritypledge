---
status: all-done
type: change-request
rank: 1000762.0
changes: p511
tags:
  - redesign
  - p511
  - session-end
  - live
  - realtime
created_date: '2026-04-20'
completed_at: '2026-04-20'
pipeline_ran: [change-request, architect, generate-tests, spec-review, dev, ship]
uat_file: features/uat/p769.md
test_files:
  - src/tests/p769-terminate-session.test.ts
  - e2e/integration/p769-terminate-session-migration.spec.ts
  - e2e/p769-session-end-terminal-authority.spec.ts
  - e2e/a11y/p769-accessibility.spec.ts
---

# P769: Session-end must be terminal and authoritative

> **Redesign of:** [P511: Session Resilience](../23_mar_26/p511_session_resilience.md)
> **What was wrong:** P511 established `cp_active_session` localStorage + React context as the reactive source for rejoin/banner UI, with DB validation as an async safety net. Shipped reality: six signals disagree (React context, `cp_active_session`, sessionStorage `clarity_live_*`, DB `live_state.sessionEnded`, DB `live_state.joinerEnded`, DB `clarity_live_invites.closed_at`) and no single authority was declared. Consequences today: after an author clicks End Session, the partner still sees "Rejoin Session" banners and "Your session is still running" prompts, and clicking Rejoin lands the user on a fresh /live create-session screen with no "session ended" signal.

## Operating Mode

> This spec is an **incremental correction** to P511, not a greenfield design.
> P511 is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P511 (grace period, pagehide = no-op, last_activity_at, dual-channel Realtime + poll, "End" = immediate terminate) are not up for re-examination.

## Problem Statement

P511's core invariants are still right. What's missing is a **declared authority** for "is this session active?". The signals sprawl across three storage layers and three DB fields, and no component gates on the one that actually means "ended" — `live_state.sessionEnded`. The design also never modelled `clarity_live_invites.closed_at`, so letter-sourced partner UI (P745) has no end-of-session signal at all.

The visible user harm (see screenshots Apr 20 17:12–17:14):

- **Author side:** After clicking End Session, the "Waiting for partner…" banner re-appears for ~10s on `/letters`.
- **Partner on /live:** Never receives "Session ended" — continues interacting with a dead session.
- **Partner on /letters refresh:** Sees "In session with {author}" + Rejoin Session button, then "Your session is still running" prompt.
- **Partner clicks Rejoin:** Lands on the fresh `/live` create-session screen with no feedback. User is lost.

P762 (Realtime payload fix, shipped code not yet verified) and P764 (mount race) each fix one path. They do not fix the rejoin-prompt path, the invite-closure omission, the sessionStorage cleanup gap, or the parallel-subscription multiplication. Patching them independently would leave 4+ of 7 inconsistencies live.

## Jobs To Be Done

**Preserved from P511 (unchanged):**

- *"When I accidentally refresh the page during a live session, I want confidence the session is still running, so I can continue the conversation."*
- *"When I need to check something else in the app mid-session, I want to navigate freely and come back."*
- *"When my partner's connection drops, I want to know they'll likely return."*
- *"When I want to intentionally end a session, I want a clear, deliberate action that ends it."*

**Corrected:**

- *"When my partner has ended the session, I want to know it's over — not be offered to 'rejoin' a dead session."*
  P511 covered the author's intent to end. It did not guarantee the partner **observes** the end across every surface where session-liveness UI lives.

- *"When I click Rejoin on a session that has ended, I want an explicit 'session ended' message — not silently land on a fresh create-session screen."*
  P511's error path assumed rejoin failure would be caught gracefully. Shipped behaviour drops the user with no feedback.

**New:**

- *"When the letter-hosted session ends, I want the letter's live banner/overlay to clear too."*
  `clarity_live_invites.closed_at` was not in P511's model. P745 added the letter-overlay surface, which reads invite state — but no End path closes the invite.

## Current State

Shipped state as of 2026-04-20. Source: code-explorer map of writers × readers × 6 state signals.

**Writers × state fields (abbreviated):**

```
Trigger                                 sessionEnded  joinerEnded  invite   cp_active  clarity_live_*  context
──────────────────────────────────────────────────────────────────────────────────────────────────────
Creator End from /live                      ✓             ✗         cond*       ✓          ✓            ✓
Creator End from ActiveSessionBanner        ✓             ✗         cond*       ✓          ✗ (miss)     ✓
Creator Cancel Waiting                      ✗             ✗         cond*       ✓          ✓            ✓
Creator End from RejoinPrompt               ✓             ✗         ✗ (miss)    ✓          ✓            ✓
Joiner End from /live                       ✗             ✓         cond†       ✓          ✓            ✓
Joiner navigates away (pagehide)            ✗             ✗         cond†       ✗          ✗            ✗
```
\* conditional on `session.targetListenerId` (letter-sourced only)
† conditional on letter-sourced joiner path

**Readers × state fields (abbreviated):**

```
Reader                                  sessionEnded  joinerEnded  invite   cp_active  context
─────────────────────────────────────────────────────────────────────────────────────────
ActiveSessionBanner render gate              ✗             ✗         ✗          ✗          ✓ (only)
RejoinPrompt render gate                     ✗             ✗         ✗       reads code    ✗
/live page main subscription                 ✓             ✓         ✗          ✗          ✗
useActiveSession Realtime sub                ✓             ✓         ✗        clear        clear
useActiveSession init + poll (30s)          indirect     indirect     ✗          ✓          writes
rejoinSession Realtime watcher               ✓             ✓         ✗        clear        clear
LetterLiveOverlay close detection            ✗             ✗         ✓          ✗          ✗
LetterLiveBanner showBanner gate             ✗             ✗         ✓          ✗          ✗
Session restore (page load)                  ✓             ✓         ✗        clear        clear
```

**Before — observed user flow:**

```
t=0   Author clicks End Session (on /letters via ActiveSessionBanner)
       ↓
       endClaritySession writes sessionEnded=true to DB
       clearActiveSession() clears localStorage + context
       ↓
t≈0   BUT: sessionStorage clarity_live_* not cleared (banner has no handle)
       cancelLiveInvite called unconditionally (no-op for non-letter)
       ↓
t≈1s  Banner re-renders "Waiting for partner…" — reason TBD
       (possibly: useActiveSession revalidation race)

Partner side:
       Realtime UPDATE fires — P762 fix makes callback do fresh SELECT
       → useActiveSession clears context → banner dismisses (if P762 works)
       BUT: clarity_live_invites.closed_at was never set
       → LetterLiveBanner stays
       → LetterLiveOverlay stays (watches invite→null)

Partner refreshes /letters within ~5s:
       getActiveSessionByCode SELECTs → sees sessionEnded ≤5s after UPDATE
       Sub-100ms race: possible to read stale row as still-live (P764)
       → ActiveSessionBanner reappears for up to 30s poll

Partner lands on /live (either new visit or rejoin click):
       rejoinSession state hydrated from localStorage synchronously
       RejoinPrompt renders immediately — does NOT gate on sessionEnded
       Partner sees "Your session is still running" / Rejoin Session

Partner clicks Rejoin:
       navigate('/live') — already there
       Session is ended → /live falls through to create-session landing
       No "session ended" feedback
```

## Root Cause

**No declared authority.** P511 Decision 3 chose "Context + localStorage" as the reactive storage, with async DB validation as cleanup. It did not specify:

1. Which DB field is canonical for "ended" (`sessionEnded` vs `joinerEnded` vs `invites.closed_at` — three fields, no precedence).
2. Which reader is allowed to render "active-session UI" without a DB liveness check first.
3. What happens when storage layers disagree (context says active, DB says ended).

**Where the gap became visible:**

- `src/app/components/session/active-session-banner.tsx:15` — renders on `activeSessionCode` alone; no `sessionEnded` read.
- `src/app/components/session/rejoin-prompt.tsx` — pure display component; parent (`clarity-live-page.tsx:3775`) renders it immediately from localStorage-hydrated `rejoinSession` state, before async `getActiveSessionByCode` resolves.
- `src/app/pages/clarity-live-page.tsx:2960–2974` — `handleEndFromRejoin` writes `sessionEnded` but **does not** call `cancelLiveInvite` or `completeClaritySession`. `clarity_live_invites` row stays open. `LetterLiveBanner` and `LetterLiveOverlay` are blind to this end.
- `src/app/components/session/active-session-banner.tsx:44` — End Session clears localStorage + context, not sessionStorage. Later `/live` visit hydrates stale `clarity_live_*` before DB check.
- `src/app/data/api.ts:1208–1252` — `subscribeToClaritySession` creates a new channel per call with no ref-counting. Three independent subscriptions exist per session at steady state (`useActiveSession` + `/live` page + rejoin watcher).
- `src/app/components/letters/letter-live-overlay.tsx:15` — P745 spec chose "component import" to keep one context tree. Shipped code uses an iframe. Outer context isolated from inner session writes.

## Redesign

**Declared authority:**

1. **Canonical "is this session ended?" signal:** `clarity_sessions.live_state.sessionEnded === true`.
2. **Canonical "is the letter invite closed?" signal:** `clarity_live_invites.closed_at !== null`.
3. **Termination contract:** Any path that ends a session MUST write `sessionEnded = true` AND (if letter-sourced) set `clarity_live_invites.closed_at`. These two writes form the atomic "end" operation.
4. **Render gate contract:** Any surface that shows "active session" UI (banner, rejoin prompt, /live active UI, letter overlay, letter banner) MUST gate on the canonical signal, not on storage layers alone.
5. **Storage role:** `cp_active_session` localStorage + React context remain the reactive cache for UI responsiveness. They are **displays of DB truth, not sources**. Any read must reconcile against DB within the same paint cycle when possible; mount hydration must show a "checking…" state until reconciliation completes.

**End Session flow — unified:**

```
End Session triggered (from any surface)
  │
  ├─► UPDATE clarity_sessions.live_state.sessionEnded = true
  │
  ├─► UPDATE clarity_live_invites SET closed_at = now()
  │     WHERE session_id = ? AND closed_at IS NULL
  │     (no-op for non-letter sessions; always attempted)
  │
  ├─► clearActiveSession()         ← context + cp_active_session
  ├─► clearStoredSession()         ← sessionStorage clarity_live_*
  │
  └─► Local UI state: sessionEnded = true  (immediate)
```

The caller does not choose which writes to issue — a single `terminateSession(sessionId)` service method performs all of them in order and returns only after the critical writes complete.

**Render gates:**

```
ActiveSessionBanner         renders iff  activeSessionCode && !sessionEnded
RejoinPrompt                renders iff  rejoinSession && !rejoinSession.isEnded
                            (new field on RejoinSessionInfo; populated by DB check)
RejoinPrompt loading state  renders iff  isCheckingRejoin (hydrating → reconciling)
/live active UI             renders iff  session && !sessionEnded
/live ended screen          renders iff  session && sessionEnded  (PartnerLeftScreen exists; widen use)
LetterLiveBanner            renders iff  invite && !invite.closedAt
LetterLiveOverlay           renders iff  invite && !invite.closedAt
```

**After — corrected user flow:**

```
Author clicks End Session (any surface)
  ↓
  terminateSession(sessionId) — atomic 5-op sequence above
  ↓
  Author UI: banner hidden, /live shows PartnerLeftScreen (if on /live)
  ↓
Partner (on /live):
  subscribeToClaritySession UPDATE fires (P762 fresh-SELECT)
  → sessionEnded=true observed → PartnerLeftScreen renders
  
Partner (on /letters):
  useActiveSession Realtime fires → clearActiveSession()
  → Banner hides within ~1s
  
Partner refreshes /letters:
  getActiveSessionByCode returns session with sessionEnded=true
  → context NOT set; banner renders nothing
  
Partner lands on /live (new visit or rejoin click after banner):
  rejoinSession hydration starts → isCheckingRejoin=true
  → getActiveSessionByCode resolves → rejoinSession.isEnded=true
  → show "This session has ended" screen with CTA to /letters
  → never show Rejoin Session button for an ended session

Letter surfaces (partner on /letters reading the letter):
  useOpenLiveInvite receives UPDATE closed_at=now()
  → invite becomes null → LetterLiveBanner hides
  → LetterLiveOverlay closes (existing P745 watcher)
```

## Predecessor Sections Superseded

| Section | P511 said | Status | Replaced by |
|---|---|---|---|
| Decision 3 (storage architecture) | "Context + localStorage … localStorage provides persistence across tab close (required for joiner rejoin flow)" | Structure preserved, authority added | Render-gate contract declaring DB as canonical truth |
| RejoinPrompt rendering | "Landing page detects an active session code in localStorage … Session validity is confirmed async — if invalid, banner disappears without error" | Superseded | RejoinPrompt gates on `sessionEnded` before render (or shows `isCheckingRejoin` state) |
| ActiveSessionBanner cleanup | "On app load or route change, validate session existence before showing banner. If session is expired/ended, silently remove banner and clear stored data." | Extended | `terminateSession` also clears sessionStorage `clarity_live_*`; banner gates on `sessionEnded` |
| End Session side effects | AC: "'End Session' button immediately kills session (no grace period)" | Extended | End Session now also closes `clarity_live_invites.closed_at` atomically |
| Rejoin error path | AC: "Attempting to create a new session while an active session exists shows rejoin prompt (prevents zombie sessions)" | Extended | Rejoin path detects ended-session and shows explicit "this session has ended" screen instead of falling through to create-session landing |
| Decision 2 (dual-channel Realtime + poll) | "Keep existing dual-channel approach … battle-tested" | Channel choice preserved; gap added | Subscription ref-counting for `subscribeToClaritySession` (three parallel channels observed; one canonical channel required per session ID) |
| `clarity_live_invites` | *Not mentioned in P511* | New in scope | Added to the liveness model and End contract |
| LetterLiveOverlay implementation | *Not mentioned in P511 (shipped in P745, which chose component import)* | Out of scope here but acknowledged | Iframe→component migration left to a separate spec unless it's the only way to make the invite-closure contract work end-to-end |

## Requirements

1. **Single termination service.** Introduce `terminateSession(sessionId)` that writes `sessionEnded=true`, closes the invite row, clears storage, clears context. All "End Session" entry points call it. No caller composes its own end sequence.
2. **Render gates.** `ActiveSessionBanner`, `RejoinPrompt`, and `/live` active-UI branches gate on `sessionEnded` read from DB-backed state, not on storage alone.
3. **Ended-session landing screen.** When `/live` mounts or rejoin is attempted on a session where `sessionEnded=true`, render an explicit "This session has ended" screen with a primary CTA navigating to `/letters`. Never fall through to the create-session landing.
4. **Invite closure.** `clarity_live_invites.closed_at` is set whenever a session ends, including from the `RejoinPrompt`'s End path. Confirmed no-op for non-letter sessions.
5. **Subscription ref-counting.** `subscribeToClaritySession` uses a channel registry keyed by `sessionId` (parallel pattern to existing `liveInviteChannels` in api.ts). Multiple callers subscribe to the same channel; first caller opens, last unsubscriber closes.
6. **Storage cleanup symmetry.** `terminateSession` clears both `cp_active_session` (localStorage) and `clarity_live_*` (sessionStorage) regardless of which surface called it.
7. **Rejoin prompt reconciliation.** `RejoinPrompt` shows `isCheckingRejoin=true` from mount until `getActiveSessionByCode` returns. If the DB says ended, never render `RejoinPrompt` — render the ended-session screen instead.
8. **Guest pagehide — unchanged.** P511's "pagehide = no-op" remains. Guests closing a tab still rely on heartbeat-based grace period; this spec does not change that.

## What Stays the Same

- **P511 grace period model.** 120s grace period, creator-only heartbeat, `last_activity_at` as the disconnect signal — unchanged.
- **"End" = immediate terminate semantics.** No new "pause" or "leave" state. One user-visible end action.
- **Pagehide = no-op for session state.** Refresh, navigation, tab-close do not end sessions.
- **`useActiveSession` structure.** Hook still owns Realtime + polling + context reconciliation. The changes are scoped to what gates the banner render and the storage-cleanup symmetry.
- **P745 letter-overlay surface.** LetterLiveBanner and LetterLiveOverlay continue to render from `useOpenLiveInvite`. The correction is upstream — ensuring the invite row gets its `closed_at` set by every end path.
- **P762 Realtime fresh-SELECT fix.** Keep. It is a necessary primitive for reliable UPDATE delivery across REPLICA IDENTITY; this spec depends on it.
- **Navigation layout, visual design, copy for banner and rejoin prompt** — preserved. Only the **render gate** changes, not the visual design.

## Surfaces in Scope

**In scope:**
- `src/app/data/api.ts` — add `terminateSession()`; add subscription ref-counting for `subscribeToClaritySession`.
- `src/app/components/session/active-session-banner.tsx` — gate on `sessionEnded`; call `terminateSession` instead of `endClaritySession`.
- `src/app/components/session/rejoin-prompt.tsx` — accept `isEnded` prop; render ended state; call `terminateSession`.
- `src/app/pages/clarity-live-page.tsx` — unify `confirmExitMeeting`, `handleEndFromRejoin`, `handleCancelWaiting` (for end paths) through `terminateSession`; add ended-session landing screen.
- `src/hooks/use-active-session.ts` — reconcile against DB-canonical `sessionEnded` on reads; do not hydrate banner-visible state from stale storage.
- `src/app/contexts/live-session-context.tsx` — ensure `clearActiveSession` also clears sessionStorage `clarity_live_*` (or expose a clearer `terminateSession` path).
- Unit + E2E coverage for the single-termination contract (happy path, every entry point, symmetric observation on the other party).

**Out of scope:**
- **LetterLiveOverlay iframe → component import.** Acknowledged as an unrelated P745 divergence from its own spec. File separately if needed.
- **P765 LOADED/INSERT reducer race.** Stays as its own spec; independent of the terminal-authority invariant.
- **Heartbeat, grace period, `last_activity_at` behavior.** Unchanged.
- **Guest pagehide write.** P511 decided no-op; unchanged.
- **Visual design, copy, layout of banner/rejoin prompt.** Unchanged.
- **Session creation flow, invite creation flow.** Unchanged.

## Acceptance Criteria

- [ ] Author clicks End Session from ActiveSessionBanner → banner disappears within 1s on author side; partner on /live sees ended screen within 3s; partner on /letters refresh does NOT see banner.
- [ ] Author clicks End Session from /live confirmExitMeeting → partner on /letters reading the original letter sees LetterLiveBanner and LetterLiveOverlay disappear within 3s.
- [ ] Author clicks End Session from RejoinPrompt → partner's letter surfaces clear (invite closed_at is set).
- [ ] Partner lands on /live after author has ended — sees explicit "This session has ended" screen with CTA, never the create-session landing screen.
- [ ] Partner refreshes /letters within 5s of author ending → ActiveSessionBanner does NOT reappear.
- [ ] Partner refreshes /live within 5s of author ending → RejoinPrompt never flashes; ended screen shows immediately after reconciliation (≤1s after mount).
- [ ] A single session has exactly one `subscribeToClaritySession` channel open at steady state (not three).
- [ ] sessionStorage `clarity_live_*` is empty on both parties within 5s of End Session from any entry point.
- [ ] `clarity_live_invites.closed_at` is set for every End Session from every entry point, for letter-sourced sessions.
- [ ] P511 E2E tests (rejoin flow, grace period, heartbeat) continue to pass unchanged.
- [ ] P762 tests pass.
- [ ] Regression: refresh during active session still does NOT end the session (P511 invariant preserved).
- [ ] Regression: guest pagehide does NOT write joinerEnded (P511 invariant preserved).
- [ ] No console errors on any End path.
- [ ] Surfaces listed under "Out of scope" are visually and behaviourally unchanged.

## Related Specs — disposition

- **P762** (Realtime fresh-SELECT fix) — code already in `api.ts` (`cancelled` flag + fresh SELECT on UPDATE). P769 depends on this code being present (it is). P762 stays open for its own browser tests; does NOT block P769.
- **P764** (partner-refresh banner reappears) — superseded by P769. P769's render-gate contract closes the mount-race window P764 was patching. Close P764 with `superseded_by: p769`.
- **P765** (invite reducer LOADED/INSERT race) — orthogonal. Stays as its own spec.
- **P745** (letter-live-overlay iframe) — the iframe vs component-import divergence is acknowledged but out of scope for P769 unless architect finds it blocks the invite-closure contract.

## Technical Architecture

### Technical Analysis

**Reuse Inventory — confirmed by reading source files:**

**`liveInviteChannels` registry** (api.ts:4011–4094): `Map<userId, { channel, handlers: InviteHandler[] }>`. On first call per userId: creates channel, stores entry. Each caller pushes a handler object into `entry.handlers`. Unsubscribe splices the handler in-place (to preserve the array reference the channel closure holds). Last handler triggers `supabase.removeChannel()` + map delete. This is the exact pattern to mirror for session subscriptions.

**`subscribeToClaritySession`** (api.ts:1208–1252): No registry, no ref-counting. Each call creates a new `clarity_session:{sessionId}` channel. Has a `cancelled` flag guard on async re-fetch (added by P762 fix). Three parallel callers exist: `useActiveSession` (use-active-session.ts:84), the `/live` page rejoin watcher (clarity-live-page.tsx:939), and the `/live` page main subscription (clarity-live-page.tsx:~867). All three subscribe independently today.

**`endClaritySession`** (api.ts:1173): SELECT live_state + UPDATE with merge. Sets `sessionEnded:true`, `sessionEndedAt`. Does NOT close invite row.

**`completeClaritySession`** (api.ts:4175): Calls `complete_clarity_session` SECURITY DEFINER RPC. Atomically sets `status='completed'` on session AND `closed_at=now()` on linked invites. Does NOT set `live_state.sessionEnded`. Both writes needed; neither alone is sufficient.

**`cancelLiveInvite`** (api.ts:4161): `UPDATE clarity_live_invites SET closed_at = now() WHERE session_id = ? AND closed_at IS NULL`. Subset of what `completeClaritySession` does — do not use in `terminateSession`; use the RPC.

**`clearSessionJoiner`** (api.ts:1137): Sets `joinerEnded:true`, clears `joiner_name`. Joiner-only path — not part of creator termination.

**`getActiveSessionByCode`** (api.ts:1094–1126): Returns null if `sessionEnded=true` OR `joinerEnded=true` OR grace period expired. This IS the DB check used for reconciliation.

**`clearActiveSession`** (live-session-context.tsx:116): Clears all context state + calls `clearActiveSessionFromStorage()` (localStorage). Does NOT touch sessionStorage.

**`clearStoredSession`** (clarity-live-page.tsx:815–819): Removes all four `STORAGE_KEYS` from sessionStorage. Defined as a local function inside `ClarityLivePage` — not exported.

**`rejoinSession` state** (clarity-live-page.tsx:314–320): Anonymous inline object `{ code, partnerName, guestDisplayName, role, sessionId }`. No named type / interface declared at module level. `isCheckingRejoin` (line 321) already exists and is used correctly on mount — the issue is that after `isCheckingRejoin=false` it immediately renders `RejoinPrompt` without checking if the session is ended.

**`PartnerLeftScreen`** (clarity-live-page.tsx:3534): Already rendered when `sessionEnded=true` after in-session exit. Used as precedent for the ended-session landing screen.

**Three `subscribeToClaritySession` callers:**
1. `useActiveSession` (use-active-session.ts:84) — subscribes after `validateSession()` resolves, clears context on end
2. Rejoin watcher (clarity-live-page.tsx:939) — subscribes when `rejoinSession` is non-null, clears rejoin state on end
3. Main subscription (clarity-live-page.tsx:~867) — subscribes when `session` state is set (in-session, not pre-session)

**Prior decisions relevant to P769:**
- `complete_clarity_session` RPC is the canonical atomic close (decisions.md:927) — use it, never sequence `endClaritySession` + `cancelLiveInvite` separately
- `clarity_sessions` lacks REPLICA IDENTITY FULL; P762 fix (fresh SELECT on UPDATE) must remain — subscription ref-counting cannot break the `cancelled` guard
- P745: `LetterLiveOverlay` is an iframe; invite-closure signal reaches it via the outer `useOpenLiveInvite` watching `clarity_live_invites.closed_at` — no inner context needed
- P743: sessionIdRef pattern (capture from `getActiveSessionByCode` result, not from storage extension) — mirrors what we need for subscription registry

**P762 from INDEX.md:** subscribeToClaritySession does fresh SELECT on every UPDATE; `cancelled` flag guards async callbacks. Subscription ref-counting must preserve this — in-flight SELECTs after last unsubscribe are benign (callback returns early due to no live handlers).

**P745 from INDEX.md:** `mapRecord()` transform must be audited after SELECT conflicts; Sentry over `console.warn`.

**P752 from INDEX.md:** Upload progress `UploadProgressState.state?` surfaces queue state; "Finishing up…" guards zero-total window.

---

### Architecture Decisions

**Decision 1: Where does `terminateSession` live?**
- **Chosen:** `src/app/data/api.ts` alongside `endClaritySession`, `completeClaritySession`, `cancelLiveInvite`.
- **Rationale:** It is a data mutation that sequences existing api.ts functions. The file already owns all session write operations. No new module boundary needed.
- **Trade-off:** api.ts is large (~4200 lines); adding ~30 lines is negligible compared to creating a new module with its own import chain.
- **Alternative rejected:** Separate `src/app/services/session-termination.ts` — adds an indirection layer for a single function with no other collaborators.

**Decision 2: How does `terminateSession` get `clearActiveSession` and `clearStoredSession`?**
- **Chosen:** (b) Expose a hook `useTerminateSession()` in a new `src/hooks/use-terminate-session.ts` that captures `clearActiveSession` from context and returns the composed function. `terminateSessionDb(sessionId)` in api.ts handles DB writes only. The hook owns sessionStorage clearing + context clearing: `const terminate = useTerminateSession()` returns `async (sessionId) => { await terminateSessionDb(sessionId); clearSessionStorage(); clearActiveSession(); }`. `clearStoredSession` logic is extracted from clarity-live-page.tsx into a module-level `clearSessionStorage()` utility inside the hook file.
- **Storage ownership clarified:** sessionStorage clearing lives in the hook (`use-terminate-session.ts`), not in api.ts. api.ts has no `window.sessionStorage` null-guard pattern and must stay browser-agnostic. The hook file guards with `typeof window !== 'undefined'` before accessing sessionStorage (matching the pattern in clarity-live-page.tsx:103).
- **Rationale:** `clearActiveSession` is a React context callback — passing it to a pure api.ts function would make api.ts depend on React. Instead, the hook owns the composition. `clearStoredSession` used nowhere else outside clarity-live-page.tsx.
- **Trade-off:** Two-function split (api.ts for DB, hook for context+storage glue). Callers on clarity-live-page.tsx (which already has `clearActiveSession` via `useLiveSession`) could compose manually, but the hook enforces the contract uniformly.
- **Alternative rejected:** (a) Accept callbacks as parameters — caller must provide them, allowing partial invocations. (c) Move storage primitives to a shared module — would work, but the hook wraps the same thing with less refactoring surface; `clearStoredSession` used nowhere else outside clarity-live-page.tsx.

**Decision 3: Subscription registry shape.**
- **Chosen:** Match `liveInviteChannels` exactly — `Map<sessionId, { channel, handlers: SessionUpdateHandler[] }>` where `SessionUpdateHandler = (session: ClaritySession) => void`. Splice in-place on unsubscribe. Remove channel when `handlers.length === 0`.
- **Rationale:** The pattern is proven, already in the file, and handles the exact problem (multiple callers, one Supabase channel). Reusing it avoids having two competing registry patterns in the same file.
- **Trade-off:** Session subscriptions are keyed by sessionId (UUID) vs invite subscriptions keyed by userId — different key types, same Map shape. The distinction is correct by domain: one active session per tab, one invite subscription per logged-in user.
- **Alternative rejected:** A different shape with WeakRef or AbortController — overengineered for 3 callers.

**Decision 4: Ended-session screen — new component or branch in clarity-live-page.tsx?**
- **Chosen:** New component `src/app/components/session/session-ended-screen.tsx`. Import it into clarity-live-page.tsx.
- **Rationale:** clarity-live-page.tsx is ~3900 lines. The ended screen is a standalone presentational component with its own copy ("This session has ended"), CTA, and potentially accessible role. Embedding it as a branch adds ~40 lines inline in a file already hard to navigate. New component keeps it testable in isolation.
- **Alternative rejected:** Reuse `PartnerLeftScreen` — it covers the in-session "creator exited" case (shows transcription state, upload progress, "Start New"). The rejoin-landing ended screen is a different context: user never had a live session state, no upload, simpler message.
- **CTA behaviour (resolved):**
  - **Letter-sourced session** (`session.sourceLetterId` is set): no screen shown — navigate directly back to the letter URL. No intermediate screen; the conversation context is there.
  - **Non-letter session**: show `SessionEndedScreen` with heading "This session has ended" (no body text), single CTA "Start a Clarity Session" → `/live`. Matches `PartnerLeftScreen` CTA for consistency.

**Decision 5: `isEnded` flag on `RejoinSessionInfo`.**
- **Chosen:** Parent component renders different UI based on DB check result (no prop change on `RejoinPrompt`). `rejoinSession` state becomes null (cleared) and a separate `isSessionEnded` boolean is set when `getActiveSessionByCode` returns null for a code that existed in storage. The ended screen is rendered in the same conditional block where `RejoinPrompt` currently lives.
- **"Storage had a code" detection:** Capture the session code from `sessionStorage.getItem(STORAGE_KEYS.SESSION_CODE)` synchronously at component mount (before any async check). Store it in a local `const pendingCode = ...` before `isCheckingRejoin` async path begins. When `getActiveSessionByCode(pendingCode)` resolves to null, set `isSessionEnded = true`. This avoids the race where `useActiveSession` has already cleared the storage key by the time the check returns.
- **Rationale:** `RejoinPrompt` is a pure display component for an active session. Adding `isEnded` to its interface conflates two distinct states into one component. Parent-level branching keeps components single-purpose.
- **Alternative rejected:** Add `isEnded` prop to `RejoinPrompt` — blurs its responsibility; the component currently has no DB knowledge and should stay that way.

**Decision 6: Race with P762 fresh-SELECT — in-flight SELECTs after last unsubscribe.**
- **Chosen:** Extend the existing `cancelled` flag pattern. When the registry removes the last handler and calls `supabase.removeChannel()`, set a `cancelled` flag on the entry before deleting it from the map. In-flight SELECTs check `cancelled` before invoking any handler. Since handlers are spliced out first, even without the flag the callbacks would dispatch to an empty array — benign no-op.
- **Rationale:** The `cancelled` flag already exists per-channel in the current (unregistried) implementation. When moving to a registry, the flag moves to be per-entry. In-flight SELECTs after unsubscribe are harmless: `handlers.forEach(h => h(session))` on an empty array is a no-op. The flag is a belt-and-suspenders guard consistent with P762's approach.
- **Alternative rejected:** AbortController — overkill; the Supabase client fetch can't be aborted after it's started, and the no-op path is safe.

---

### Security Review

**RLS Policies:**
- ✅ `clarity_sessions` UPDATE policy (`clarity_sessions_creator_update`) covers both `creator_profile_id` and `target_listener_id` in USING and WITH CHECK — the `live_state.sessionEnded` write passes RLS for creator and letter-sourced joiner. Migration: `supabase/migrations/20260415120000_p703_rls_fixes.sql`.
- ✅ `clarity_live_invites` UPDATE policy (`live_invites_participant_update`) allows creator and `target_user_id` to set `closed_at`. Migration: `supabase/migrations/20260414100001_p703_letter_sourced_live.sql`.
- ⚠️ **Atomicity gap (critical).** The spec's "atomic 5-op sequence" is actually sequential across two DB calls (`endClaritySession` direct UPDATE + `completeClaritySession` RPC). Network failure between them leaves `sessionEnded=true` with `closed_at=NULL` (or vice versa) — letter surfaces stay open. **Mitigation (applied to Build Sequence):** Extend `complete_clarity_session` RPC to also patch `live_state.sessionEnded=true` via `jsonb ||` merge in the same plpgsql transaction, and route `terminateSessionDb` through the single RPC. Existing RPC is SECURITY DEFINER with explicit participant auth check.

**Authentication:**
- ✅ All termination writes go through the authenticated Supabase client; unauthenticated callers blocked at RLS.
- ✅ `complete_clarity_session` RPC checks `auth.uid() IN (creator_profile_id, joiner_profile_id, target_listener_id)` before acting.
- ✅ No new unauthenticated endpoints or anonymous RPCs.

**Authorization:**
- ⚠️ **Silent no-op on unauthorized direct UPDATE.** A non-participant authenticated user calling `endClaritySession` receives HTTP 200 with 0 rows — the client can't distinguish "wrote 0 rows" from success. **Mitigation (applied to Build Sequence):** Route `terminateSessionDb` exclusively through the extended `complete_clarity_session` RPC, which raises an explicit exception for unauthorized callers. Eliminates the direct UPDATE path entirely.
- ✅ Render-gate changes are purely UI — no new server-side access paths.
- ✅ Subscription ref-counting respects existing RLS on `clarity_sessions` SELECT; non-participants receive no events regardless of channel shape.

**Input Validation:**
- ✅ `sessionId` is a UUID; Postgres rejects malformed UUIDs at type level.
- ✅ `closed_at = now()` is server-generated; no free-text input reaches termination path.

**Data Protection:**
- ✅ `cp_active_session` localStorage keys (`code`, `partnerName`, `role`, `timestamp`, optional `guestDisplayName`) — none are secrets. Clearing is hygiene, not confidentiality.
- ✅ `clarity_live_*` sessionStorage keys — most sensitive is `clarity_live_session_id` (UUID). Symmetric clearing on termination closes any same-origin tab reuse window.
- ✅ `AuthContext.tsx:184–185` reads `clarity_live_session_id` on auth callback; `terminateSessionDb` clearing sessionStorage before any auth re-read is safe (stale read resolves to null, no action).
- ✅ No PII beyond display names in either storage layer.

**Risks / mitigations applied to Build Sequence:**
1. Atomicity gap → extend RPC, route through single call (Build Sequence step 0.5 added; step 3 simplified).
2. Silent no-op on unauthorized UPDATE → same mitigation as (1).
3. `complete_clarity_session` has a service-role bypass branch (`auth.uid() IS NULL`) — intentional for E2E tests. No change; noted for awareness.

---

### Implementation Approach

**Worktree recommended:** This spec touches 7 src files (api.ts, 2 components, 1 context, 1 hook, 1 new hook, 1 new component) plus test coverage — isolated worktree prevents `main` pollution during multi-session implementation.

#### Build Sequence

1. **Extend `complete_clarity_session` RPC to also set `sessionEnded`** — create `supabase/migrations/YYYYMMDDHHMMSS_p769_complete_clarity_session_sets_session_ended.sql` that `CREATE OR REPLACE FUNCTION complete_clarity_session` adding a `jsonb ||` merge to patch `live_state` with `{sessionEnded: true, sessionEndedAt: now()}` in the same plpgsql transaction as the existing `status='completed'` write and the `closed_at=now()` write on linked invites. Preserves the existing SECURITY DEFINER + participant auth check + service-role bypass branch. Idempotent: re-running on an already-ended session merges the same keys, no-op. Addresses Security Review atomicity gap — one transaction, all three writes, or none.

2. **Extract `clearSessionStorage` utility** — pull the `clearStoredSession` logic (sessionStorage key removal) out of `clarity-live-page.tsx` into `src/hooks/use-terminate-session.ts` as a module-level function. Pure extraction, no behavior change.

3. **Add subscription registry to api.ts** — introduce `claritySessionChannels: Map<sessionId, {channel, handlers, cancelled}>` mirroring `liveInviteChannels`. Refactor `subscribeToClaritySession` to use it. Preserve the `cancelled` flag per-entry. No callers change yet — same external API, same return type.

4. **Add `terminateSessionDb(sessionId)` to api.ts** — new exported async function: calls `completeClaritySession(sessionId)` (extended RPC from step 1 now handles all three writes atomically: session `status='completed'`, `live_state.sessionEnded=true`, `clarity_live_invites.closed_at=now()`). Clears sessionStorage via the extracted utility from step 2. Returns `Promise<void>`, throws on DB error. Single RPC call — no sequencing of `endClaritySession` + `completeClaritySession`. Addresses Security Review "silent no-op on unauthorized direct UPDATE" — RPC raises an explicit exception for non-participants; direct UPDATE path is eliminated from the termination flow.

5. **Create `useTerminateSession` hook** (`src/hooks/use-terminate-session.ts`) — imports `terminateSessionDb`, `useLiveSession` (for `clearActiveSession`). Returns `terminateSession(sessionId: string)` which awaits `terminateSessionDb` then calls `clearActiveSession()`.

6. **Create `SessionEndedScreen` component** (`src/app/components/session/session-ended-screen.tsx`) — presentational: heading "This session has ended" (no body text), single CTA "Start a Clarity Session" → `/live`. Accepts optional `letterUrl?: string` prop: when provided, replaces the CTA with a direct `navigate(letterUrl)` call (no screen shown — letter-sourced callers pass this and skip rendering the screen entirely by navigating before mount). No other props beyond optional `className`.

7. **Update `ActiveSessionBanner`** — import `useTerminateSession`. In `handleEndSession`: replace `endClaritySession` + `cancelLiveInvite` + `clearActiveSession` sequence with `const terminate = useTerminateSession(); await terminate(session.id)`. Render gate: banner hides because `clearActiveSession()` sets `activeSessionCode = null` (local, ~0ms) — no additional DB-backed gate needed on the banner. The 1s AC is met by this path.

8. **Update `clarity-live-page.tsx` rejoin hydration** — at mount, capture `const pendingCode = sessionStorage.getItem(STORAGE_KEYS.SESSION_CODE)` synchronously before async check begins. Set `isCheckingRejoin=true`. When `getActiveSessionByCode(pendingCode)` resolves to null and `pendingCode` was non-null: set `isSessionEnded=true` and `setRejoinSession(null)`. Render `SessionEndedScreen` (or navigate to letter if letter-sourced) in the rejoin block when `isSessionEnded=true`. Replace `handleEndFromRejoin` to call `useTerminateSession()` result instead of direct `endClaritySession`.

9. **Update `confirmExitMeeting` in clarity-live-page.tsx** — replace the `endClaritySession` + conditional `completeClaritySession` sequence with a single `terminateSessionDb(session.id)` call. Remove the `if (session.targetListenerId)` guard — the extended RPC handles all three writes atomically in one transaction; guard is obsolete because the RPC short-circuits the invite update when no matching `clarity_live_invites` row exists (no-op for non-letter sessions).

10. **Update `handleCancelWaiting`** — keep `cancelLiveInvite` call (this is not a session-ended path, just a waiting-room cancel; `sessionEnded` should NOT be set). Only ensure `clearStoredSession` and `clearActiveSession` are called. No `terminateSession` here.

11. **Update `rejoinSession` watcher subscription** (clarity-live-page.tsx:939) — after registry refactor, this caller still works unchanged (same external API). Verify it unsubscribes correctly in the cleanup.

12. **Write unit tests** — `use-terminate-session` (RPC call + clearActiveSession called); `subscribeToClaritySession` ref-counting (3 subscribe calls = 1 channel; last unsubscribe removes channel); `SessionEndedScreen` renders CTA linking to `/letters`; extended RPC smoke test via Supabase test DB (all three writes applied in one call).

13. **Write E2E canary** — author ends session from `ActiveSessionBanner`; verify partner's `/live` shows ended screen; verify `clarity_live_invites.closed_at` is set AND `live_state.sessionEnded=true` AND `status='completed'` (all three in a single transaction trail).

#### Files to Create

1. `supabase/migrations/YYYYMMDDHHMMSS_p769_complete_clarity_session_sets_session_ended.sql` — `CREATE OR REPLACE FUNCTION complete_clarity_session` extending it to also merge `{sessionEnded: true, sessionEndedAt: now()}` into `live_state` in the same transaction

2. `src/hooks/use-terminate-session.ts` — `terminateSessionDb` (wraps extended RPC) + `clearSessionStorage` utility + `useTerminateSession` hook

3. `src/app/components/session/session-ended-screen.tsx` — "This session has ended" screen with `/letters` CTA

#### Files to Modify

1. `src/app/data/api.ts` — add `claritySessionChannels` registry, refactor `subscribeToClaritySession` to use it, add `terminateSessionDb` (single-RPC wrapper)
2. `src/app/components/session/active-session-banner.tsx` — replace `endClaritySession` + `cancelLiveInvite` sequence with `useTerminateSession()`
3. `src/app/pages/clarity-live-page.tsx` — add `isSessionEnded` state, render `SessionEndedScreen` in rejoin block, update `handleEndFromRejoin`, update `confirmExitMeeting` (single `terminateSessionDb` call, remove `targetListenerId` guard), extract `clearStoredSession` references to use shared utility
4. `src/hooks/use-active-session.ts` — verify unsubscribe still works after registry refactor (likely no code change, just test coverage)
5. `src/app/contexts/live-session-context.tsx` — no change required; `clearActiveSession` contract is unchanged

## Test Coverage Strategy

**What's Tested:**
- ✅ Subscription registry ref-counting (unit, T5–T7) — 3 callers → 1 channel; last unsubscriber removes channel; in-flight callbacks after unsubscribe are no-ops. Runnable immediately; fail before registry refactor.
- ✅ `useTerminateSession` hook (unit canary, T1–T4) — RPC call, clearActiveSession ordering, sessionStorage clear, error propagation. Wrapped in `describe.skip`; `/dev` unskips after creating `src/hooks/use-terminate-session.ts`.
- ✅ `SessionEndedScreen` component (unit canary) — heading rendered, CTA links to /letters. Wrapped in `describe.skip`; `/dev` unskips after creating component file.
- ✅ `complete_clarity_session` RPC extension (integration, 12 tests) — existence, atomic 3-write (status + sessionEnded + closed_at), invite closure, idempotency, non-participant auth rejection.
- ✅ Author ends from ActiveSessionBanner → banner disappears ≤1s; partner on /live sees ended screen within 3s (E2E).
- ✅ Author ends from /live → `invite.closed_at` set (E2E).
- ✅ Partner lands on /live after session ended → ended screen, never create-session (E2E).
- ✅ Partner refreshes /letters after end → no banner (E2E).
- ✅ sessionStorage cleared on both parties within 5s (E2E).
- ✅ Subscription channel count canary — 1 channel, not 3 (E2E).
- ✅ Regression: refresh during active session does NOT set sessionEnded (E2E).
- ✅ Regression: guest pagehide does NOT write joinerEnded (E2E).
- ✅ RejoinPrompt no-flash; ended screen shows ≤1s after mount (E2E).
- ✅ Accessibility: heading level, Tab/Enter keyboard, no-Rejoin guard, aria-live (A11y).

**What's NOT Tested:**
- ❌ LetterLiveBanner/LetterLiveOverlay disappearing in real browser (depends on iframe P745 surface — covered by UAT-2 manual check; iframe isolation makes automated assertion unreliable).
- ❌ Race window between invite.closed_at write and Realtime delivery to LetterLiveBanner — timing-sensitive; covered by UAT-2.
- ❌ Subscription ref-counting under network failure / channel recreation — out of scope for initial coverage.

**Test Pyramid:**
```
        /\
       /  \   11 E2E
      /____\
     / 12 INT \
    /__________\
   / 17 UNIT   \
```

Total: 40 automated tests + 12 UAT scenarios (40+ acceptance checkboxes)
Estimated run time: ~3–4 min (E2E two-party tests dominate)
