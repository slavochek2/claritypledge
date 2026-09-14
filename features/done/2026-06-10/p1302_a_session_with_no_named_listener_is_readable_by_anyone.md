---
status: all-done
type: bug
rank: 96
severity: critical
workstream: platform
date_reported: 2026-09-11
date_resolved: 2026-09-11
root_cause: "clarity_sessions SELECT and UPDATE policies (and the child-table visibility function) admitted every row with no named listener to any caller, because account-less guests had no identity for the policy to test"
resolution: "access is identity OR, for open rooms, the room code presented in an x-clarity-room-code request header (client sends the codes it holds); anon UPDATE limited to guest columns on live rooms; patch_live_state guest arm requires the code; guest surfaces without realtime poll by code"
created_date: 2026-09-11
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [rls, privacy, security]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/integration/p1302-session-select-scope.spec.ts
  root_cause: "clarity_sessions SELECT and UPDATE policies admit every row with no named listener to any caller; the account-less guest flow is the only legitimate user of that branch"
  confidence: high
  surfaces_in_scope: [clarity_sessions-select, clarity_sessions-update, session-child-tables]
  reproduced_at: 2026-09-11
completed_at: 2026-09-14
---

# P1302: A session with no named listener is readable without signing in

## Summary

The `clarity_sessions` row policies treat "no named listener" as "public". Almost every session has
no named listener, so almost every session is readable by an unauthenticated caller — creator name,
free-text note, live session state — and, through the identical branch on the UPDATE policy, its
live state is **overwritable** by one. Verified against production 2026-09-11 (read side, count-only)
and reproduced on test by the canary (read and write side).

## Severity

**Critical** — real user content and real names, reachable with no account, on production, for
about five months; plus an integrity hole on the same rows. The blast radius is every session that
was not created from a letter.

## Root Cause

The SELECT policy's first branch is an unconditional pass whenever the target-listener column is
unset. That column is populated only on the letter-sourced creation path, so the branch that reads
like a narrow "open room" case describes almost the whole table. The UPDATE policy carries the same
branch verbatim, and the child tables' shared visibility function (P1207) mirrors it, so a room's
transcript is exposed the same way.

**Why the branch exists, which the first draft of this spec missed:** it is how **guests** work. A
guest joins /live by room code with a name only (P396) — no account, so no `auth.uid()` for a policy
to test. Every guest read and direct write rides that branch. P1057 and P1207 both document it as
intended ("the anonymous /live flow", "a standing founder requirement"). The requirement is real,
but it is *guests can join and participate without an account*. The policy encoded it as *everyone
can read everything*, because it had no way to tell a guest from a stranger.

Three things made it survive review:

1. **It reads as a tightening.** The migration that introduced it replaced a blanket
   everyone-can-read policy and frames itself as a restriction. It is — for letter-sourced sessions.
2. **Column grants mask it.** A bare `select=*` is refused (it includes the grant-protected code
   column), which makes the table look protected on a casual probe. A narrow column list succeeds.
3. **It was recorded as a requirement.** Two migrations and one decision describe the open branch
   as deliberate, so every later reviewer read it as a constraint to preserve, not a defect.

## Invariants

- A caller with no account must not be able to read a session's participant names, notes, state or
  child content **unless it presents that session's room code** — the capability a guest already
  holds and that `claim_joiner_seat` / `get_session_by_code` already accept. *(Amended 2026-09-11:
  the original wording forbade the guest flow itself.)*
- "Absence of a named recipient" must never be treated as "intended to be public". Access is always
  a positive assertion: an identity match, or a presented room code.
- **Reading by code is role-agnostic; writing by code is not.** A signed-in participant is always a
  party (a joiner becomes one through `claim_joiner_seat`), so the code write path belongs to
  account-less guests alone. Otherwise any account holding a published event code could write a
  room's creator-owned columns, which `anon`'s column REVOKE does not cover.
- A **directed** session stays two-party: presenting its code grants no row access.
- The row and its children answer to one predicate. Restating it per table is how P1207's leak
  happened.
- Column-level grants are defence in depth, never the access-control decision.

## Reproduction Steps

1. Take the publishable client key that ships in the browser bundle. No account, no sign-in.
2. Request the sessions table over the REST API with an explicit, narrow column list.
3. Observe: rows come back, with a total count in the response range header.
4. PATCH one of those rows' live state with the same key. Observe: the write persists.

**Reproduction rate:** 100%. First canary run 2026-09-11 against test, before any fix: **6 failed,
10 passed** — every exploit canary then written (A1–A6) failed, every legitimate-access control
(C1–C10) passed. The canary has since grown (A7–A13, C11–C16) as the two reviews found more to
pin; those later cases were added against the fix and are not part of that first red run. Exact columns, counts and request shapes are deliberately NOT recorded in this public repo
while the issue is live — see `.private/docs/security-log.md` 2026-09-11.

## Expected Behavior

A caller **reads** a session only if they created it, hold its seat, are its named listener, or —
for an open room — present its room code. A caller **writes** only as one of those three parties,
or as an account-less guest presenting the code of an open room that has not ended.

## Actual Behavior

Any caller, signed in or not, reads a substantial majority of all rows and their live turns, and
can overwrite their live state.

## Solution

**One predicate, two positive assertions**, inside the existing `SECURITY DEFINER`
`can_read_clarity_session()` — so the SELECT policy, the UPDATE policy (USING and WITH CHECK) and
every child table share it, and no new anon-executable function exists:

1. **Identity** — `auth.uid()` is the creator, the seated joiner, or the named listener.
2. **Room code** — the session is open (no named listener) **and** its code is among those the
   request presents in the `x-clarity-room-code` header. PostgREST exposes request headers to SQL;
   the code is the same bearer capability the join and poll RPCs already accept.

**The SELECT policy carries the same predicate inline, on the row's own columns.** INSERT …
RETURNING — every `.insert().select()`, `createClaritySession` included — checks the SELECT policy
against the *new* row, which a function re-reading the row by id cannot see from its statement
snapshot. The first revision did exactly that and refused every creator their own new session;
the integration suite caught it on test before the branch was committed (canary C14 now pins it),
and migration `…120100_p1302_b` re-creates the policy for the one database that applied that
revision. The header parse is an uncorrelated subquery, so it runs once per statement.

**No "open invite" branch.** Production only invites a directed session's own listener
(`start-clarity-session-button.tsx`), whom identity already admits; the invite INSERT policy
accepts any recipient of the letter, so an invite branch would let a creator open a directed session
to a third party (red-team finding 2).

**The code is bounded as a capability, not just matched as a predicate:**

- **Reads:** at most two codes are parsed per request, so a request tests two guesses — about twice
  the existing one-code RPC, never a batch.
- **Writes:** a signed-in caller writes only as a **party** — identity, never a code. A code grants
  writes to an account-less guest alone, on an open room that has not ended. Belt and braces at the
  privilege layer too: `anon` keeps UPDATE only on the columns a guest writes (`state`,
  `live_state` + `mode`, `demo_status` — every client write site, enumerated), and the creator's and
  server's columns are revoked from it. Without the identity restriction the REVOKE would not be
  enough on its own, because `authenticated` keeps those columns (code review, H1).
- **Child writes:** the child tables' INSERT policies gate on "this session is not cancelled",
  evaluated as the caller. Once a foreign row is invisible that guard reads true for a row the
  caller cannot see, so each INSERT is now scoped to `can_read_clarity_session(session_id)` as well
  (code review, M3).
- **`patch_live_state`:** its guest arm authorized on the session id alone; it now requires the
  presented code too. Session ids are not secret — event practice rooms publish theirs.

The UPDATE policy keeps its existing P520 (`status <> 'cancelled'`) and P1047
(`creator_profile_id IS NOT NULL`) terms; only the access branch changes.

**Client:** the browser attaches the header on REST requests only, carrying the codes the tab has
legitimately obtained. Every path that yields a session with a code already funnels through one
mapper (`mapSessionFromDb`), which registers it. The header is sent to our own REST endpoint and
nowhere else.

**Realtime:** guests stop receiving `postgres_changes` for their room — Realtime evaluates RLS from
the JWT alone and never sees a request header. Every guest surface has a code-keyed poll through a
`SECURITY DEFINER` RPC instead: the live page (1 s, existing), the demo page (2 s, **added** — it had
none, red-team finding 1), the rejoin prompt (5 s, existing) and the active-session banner (30 s,
existing). Signed-in participants keep realtime; a signed-in joiner, who previously matched only
through the open branch, now matches by identity (canary C13).

**Deploy order:** client first (the header is inert against the current policy), then the
migration — and **not immediately**. The tabs that break are guest tabs opened on the old bundle
and still open when the migration lands, so a short gap maximises them. Leave at least one session
length between the client deploy and the apply, and count guest rooms with recent
`last_activity_at` just before applying. The migration carries `requires-frontend`, re-pointed
after ship at the on-main client commit (a branch SHA is orphaned by the cherry-pick —
decisions.md 2026-09-09). The custom header passes the CORS preflight on both test and prod
gateways (checked 2026-09-11).

### Reader and writer audit (enumerated before the migration was written)

| Site | Caller | Admitted by |
|---|---|---|
| `getUserSessions` (sessions list) | creator / signed-in joiner | identity |
| `subscribeToClaritySession` realtime + re-fetch | signed-in participant | identity |
| same, for a guest | guest | none — falls back to that surface's code-keyed poll (above) |
| live page poll, demo page poll, `getClaritySession`, `getActiveSessionByCode` | anyone holding the code | `SECURITY DEFINER` RPC — unaffected |
| `claim_joiner_seat`, `get_room_code_for_invite`, `update_last_activity` | as today | `SECURITY DEFINER` — unaffected |
| `patch_live_state` | participant, or guest presenting the code | identity, or guest arm + code on a live room (changed) |
| `clarity_live_turns` / `clarity_ideas` / `clarity_demo_rounds` INSERT | signed-in participant | `can_read_clarity_session(session_id)` + the existing not-cancelled guard (changed) |
| `updateClaritySessionLiveState` (full overwrite) | creator / joiner / guest | identity or room code |
| `endClaritySession`, `updateDemoFlowState`, `updateClarityDemoStatus`, `updateClaritySessionState` | participant or guest | identity or room code (guest: guest columns only, live rooms only) |
| `useOpenLiveInvite` enrichment, `getOpenLiveInviteForUser` embed | invitee = the directed session's listener | identity |
| `getOpenInviteForSender` `!inner` embed | creator | identity |
| `getLiveTurns`, `getClarityIdeas`, `getDemoRounds`, `clarity_verifications` | participant or guest | `can_read_clarity_session` → same predicate |
| `session_transcripts`, `transcription_jobs`, `event_practice_rooms` UPDATE, live-invite policies | creator / joiner | identity (their subqueries run as the caller) |
| `check_session_not_private` trigger (invoker) | transcript writer — service role | bypasses RLS |
| `gcs-signed-url` edge function | service client | bypasses RLS |

### Alternatives Considered

- **A visibility column (this spec's first draft).** Rejected: no reader needs a session visible to
  someone who is neither a party nor a code holder, and it does not answer the guest question — it
  either breaks guests or leaves them public.
- **Guest RPC-only path** — route every guest read and write through code-keyed `SECURITY DEFINER`
  RPCs. Rejected on correctness: each RPC restates authorization, the drift surface P1207 exists to
  close, and any site missed fails silently as a zero-row read or write.
- **Anonymous sign-in for guests** — gives guests an `auth.uid()`, so realtime works too. Rejected
  on stability: it changes what the `authenticated` role means across every policy that reads it as
  "has an account", needs a production Auth config change, and collides with in-flight guest-seat
  work.
- **A minted per-guest JWT.** Rejected on security and runtime complexity: a new signing-secret
  surface, an edge function and a token lifecycle, for a latency gain the 1-second poll already
  bounds.
- **A code-keyed write RPC for guests, header branch SELECT-only** (red-team finding 8). Rejected
  on runtime complexity: the column REVOKE plus the ended-room bound give the guest the same write
  scope — four columns, live rooms only — with no new function, and no second authorization
  statement to keep in step with the row policy.

## Risks / Non-Goals

- **MITIGATE — guests lose realtime.** Every guest surface polls by code instead (live 1 s, demo
  2 s — added here, rejoin prompt 5 s, banner 30 s). Guest volume on prod is low (security log).
  Broadcast-based realtime for guests is not in scope.
- **MITIGATE — a guest tab running the old bundle** when the migration lands: its direct
  full-overwrite write and child reads come back empty until reload. Mitigated by the deploy order
  above: wait at least one session length after the client deploy, not the minimum.
- **ACCEPT — some codes are public by design.** Event practice-room codes go to every visitor of a
  public event page (P1057, founder decision D-A). Such a visitor can read the room and write its
  guest columns while it is live — which is what joining it already allows. Unchanged exposure class.
- **ACCEPT — guessing.** One request tests at most two codes, against open rooms only: about twice
  the existing one-code `get_session_by_code` guess.
- **ACCEPT — policy cost.** Measured on test (846 rows) against the final shape, where the SELECT
  policy tests the row's own columns and parses the header once per statement: an anon full scan
  returning nothing takes 0.37–1.18 s, against 0.58–0.79 s for a service-role read of every row.
  Not an amplifier. (The earlier by-id function form measured 0.43–0.82 s against a 1.5–2.1 s
  service-role baseline — same conclusion, different run.)
- **NOT VERIFIED — the guest flow driven end-to-end in a browser.** Stated rather than ticked. The
  creator half of /live cannot be driven in a browser at all today (creating a session needs a
  verified signed-in host; P1232's spec records the flow as broken repo-wide, and
  `creator-detects-joiner.spec.ts` duly times out before reaching any join step — reproduced here,
  pre-existing). A guest-only spec that seeds the room server-side
  (`e2e/p1302-guest-live-browser.spec.ts`) got the guest to resolve and RENDER the room in a real
  browser — the creator's name was visible, which the old policy is not needed for — but the seat
  claim did not land, and a second attempt changed the failure rather than explaining it. Left
  `test.fixme` with that note rather than patched blind or deleted. The guest capabilities
  themselves are covered deterministically by the integration canary; what is unverified is the
  full browser journey. Prod item 3 below is the real check.
- **ACCEPT — test and prod do not reach the final state by the same route, and equivalence is not
  provable from the repo.** The test database applied an earlier revision of the first migration
  (migration tracking never re-applies an edited file, and that revision exists nowhere in git), so
  the later migrations are what bring it to the final state; production applies the four in order,
  fresh, and lands there directly. What the green test run does pin — because the canaries exercise
  them directly — is the column revokes (A8), the header parse (A10, C5), the inline SELECT policy
  (C14) and `patch_live_state`'s guest arm (A7, C12). Stated rather than asserted as equivalence.
- **DEFER — the room code also reaches analytics and error telemetry** (38 explicit payloads plus
  the /live URL). Pre-existing, separate class. **Filed as P1304.**

## Acceptance Criteria

Verified on **test**; the production half of each is listed under Post-deploy verification below,
because it cannot be true before the apply this spec is not authorised to perform.

- [x] An unauthenticated request with no room code returns zero rows — canary A1; the anon
      count-only probe on test went 748 → 0
- [x] A signed-in user cannot read a session they neither created nor were named in — proven with
      two real accounts, not with one account and an argument (A2)
- [x] Neither an unauthenticated caller nor a signed-in stranger can overwrite a session's live
      state (A4, A5) — nor can a signed-in caller who merely presents the room code (A8b)
- [x] A session's child content follows the same rule, for reads (A6, C7) and for writes (A12)
- [x] A presented room code grants access only to that open room, never to a directed one
      (A3, C8), and only two codes are read per request (A10)
- [x] A code grants a guest's writes only: not the creator's columns or status (A8), and not on a
      room whose session has ended (A9, A11)
- [x] Every legitimate reader in the client still works — enumerated BEFORE the migration was
      written (table above), each re-checked after: C1–C13 green, plus the whole edited
      clarity_sessions integration set (110 passed / 1 pre-existing P1269 failure / 2 skipped)
- [x] The guest path is covered deterministically at the integration layer — a guest presenting the
      code reads its room (C5), writes it (C6), reads its child content (C7) and patches live state
      (C12); one presenting nothing, or the wrong code, gets nothing (A1, A3)
- [x] A signed-in creator can still create a session and read it back in the same request (C14) —
      the case the first revision broke and the suite caught before commit
- [x] A signed-in participant keeps realtime (C13); an anon subscriber receives nothing (A13)
- [x] The regression test drives the unauthenticated path, and was watched to FAIL against the
      current policy before the fix landed — first run: 6 failed, 10 passed
- [x] No session is readable by a caller who is neither a party nor a code holder — access is a
      positive assertion, never inferred from an empty column *(amended from "whatever sessions are
      genuinely public are public because a column says so": no session needs to be public to a
      non-holder, measured by the audit above)*
- [x] `.private/docs/security-log.md` records the window, and whether access logs can say if it
      was ever exercised (they cannot, for the exposure period — retention is days, the window was
      months)

## Post-deploy verification

Prose, not checkboxes: none of it can be performed before the prod apply, and the apply is the
founder's call. Run all four immediately after it.

1. An unauthenticated request for this table with no room code returns zero rows **on production**
   (the same count-only probe that measured 240 rows reachable).
2. `has_column_privilege('anon','public.clarity_sessions','status','UPDATE')` is false on prod. A
   table-level UPDATE grant to `anon` would make the column REVOKE a no-op, and prod grants can
   drift from the migration history — P1046 removed exactly such a drift.
3. A guest joins a live room on prod and sees the other participant's state change.
4. `./scripts/git-ops.sh publish-spec p1302` — lifts the embargo once the above hold.

## Disclosure

`embargo`. Live, unauthenticated, unfixed, on production. Publishes via
`./scripts/git-ops.sh publish-spec p1302` once the fix is confirmed live on prod.

## Origin

Found 2026-09-11 while adversarially reviewing P1236. A reviewer cited this table's SELECT
policy as globally readable, sourcing the ORIGINAL schema — a policy that had since been
replaced. Checking the live database rather than accepting the citation is what turned a stale
claim into a real finding, and also corrected it: the reviewer said "any authenticated user",
and the truth is "anyone at all".

Not P1236's defect. P1236 is what caused someone to look.
