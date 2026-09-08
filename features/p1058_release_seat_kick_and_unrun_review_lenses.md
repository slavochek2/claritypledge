---
status: week
type: task
disclosure: public
rank: 1
created_date: '2026-08-12'
tags: [security, clarity-sessions, rls, adversarial-review]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1058: `release_joiner_seat` is an unauthenticated global kick, and three P1053 review lenses never ran

## Problem

**Situation:** P1053 closed a critical hole where any signed-in user could write themselves into
`clarity_sessions.joiner_profile_id` on a stranger's room and read that pair's stored transcript.
It shipped `claim_joiner_seat` / `release_joiner_seat` (SECURITY DEFINER) plus a column REVOKE,
across migrations `20260812150000`–`20260812200000`.

**Complication:** The review that was supposed to validate that work did not finish. Of five
planned adversarial lenses, **one completed** — three were interrupted, one died on an API error.
That single lens found **three** real, reproducible transcript-disclosure holes (F1, F2, F3). A
**fourth** (F5) was then found *by accident*, during unrelated verification, not by any review:
the occupancy guard was failing **open** on every guest-held seat because plpgsql skips an `IF`
whose condition is NULL. Nothing was looking for that class. Separately, a **fifth** issue (F4)
was raised as a reviewer claim and has never been reproduced.

**Question:** Two things. Is F4 real? And what do the three unrun lenses find — particularly the
fail-open lens, given that the one fail-open defect that surfaced (F5) was found by luck?

The hit rate is the argument here. Four confirmed defects came out of roughly one lens's worth of
review. That is not evidence the surface is clean; it is evidence it is under-reviewed.

## Appetite

Medium blast radius — F4's fix would touch `release_joiner_seat`, which sits on the live guest
leave path (`clarity-live-page.tsx`, `AuthContext`). The audit itself has zero blast radius until
it recommends something. Reversible: any fix is a `CREATE OR REPLACE` in a new migration.
**Decision density: potentially high** — AD3 deliberately accepted that any anon id-holder may
release an anonymously-held seat ("the same exposure `patch_live_state` has accepted since P671").
Closing F4 may mean revisiting that acceptance, which is a founder call, not an implementation
detail.

## Approach

Three phases, in order. **Phase 1 gates the rest** — do not design a fix for a defect that has not
been reproduced.

### Phase 1 — Reproduce F4, or close it

**F4 as claimed (UNVERIFIED — this is a reviewer's claim, not a finding):**
`release_joiner_seat(p_session_id uuid)` is `GRANT EXECUTE` to `anon` and takes a session id. The
anon SELECT policy on `clarity_sessions` publishes ids. So an unauthenticated caller holding any
id can evict the seated guest — product-wide, by enumeration.

Write a canary on test that attempts exactly this from an anon client. Then classify honestly:

- **Reproduces** → denial of service, **no data disclosure** (the row's `joiner_profile_id` is
  untouched by a release, and a guest seat carries none anyway). Continue to a fix.
- **Does not reproduce** → say so plainly, record why the claim was wrong, and close this half of
  the spec. A retracted finding is a good outcome, not a failure.

Note the precedent for getting this wrong in the cheap direction: the same review's *top* finding
claimed a migration "exists nowhere in this repo" and inferred an unauthorized prod deploy. It was
a worktree artifact — the file was on `main`. Absence in a working tree is not absence in the repo.

### Phase 2 — The fail-open audit (highest priority, do this even if F4 evaporates)

Audit **every boolean condition** in `claim_joiner_seat`, `release_joiner_seat` and
`complete_clarity_session`, across all P1053 migrations, for operands that can be NULL. For each,
classify: does NULL make it fail **open** or fail **closed**?

**A blanket grep is not sufficient, and this is the crux.** The identical expression
`joiner_profile_id = auth.uid()` is:

- **fail-OPEN** inside an `IF` — NULL is not true, plpgsql skips the branch, and a skipped refusal
  guard is an allow. This was F5.
- **fail-CLOSED** inside a `WHERE` — NULL excludes the row, yielding zero updated rows and a
  raised exception. This is `release_joiner_seat` today, and it is correct there.

So the audit must classify by **construct**, not by predicate text. Deliverable: a table of every
condition, its NULL-reachable operands, the construct it sits in, and the fail direction.

### Phase 3 — Run the three lenses that never ran

Per `/slava:think:adversarial-review`, with the artifact being the full P1053 diff
(`feature/p1053-server-side-join-authorization`, migrations `20260812150000`–`20260812200000`,
plus the `api.ts` cutover):

1. **Fail-open / operational** — highest priority; Phase 2 is its opening move. Extend beyond
   NULL: what happens when a dependency is missing, slow, or returns empty? Is the wrong default
   the dangerous one?
2. **Race / TOCTOU** — the `SELECT … FOR UPDATE` row lock is implemented and has a canary, but
   that canary asserts an invariant that holds whether or not the two requests actually overlapped
   inside the database. The lock has never been *proven* to engage under contention.
3. **Evasion / blast-radius** — how do you get the wrong outcome *past* these guards? Alternate
   code paths, the RPCs' interaction with `patch_live_state`, enumeration, concurrency, hostile
   input.

Give each lens the P1053 reassurances to attack by name, and require reproduction on test before
any finding is reported as real.

## Risks / Non-Goals

### Risks

- **The AD3 acceptance may be load-bearing.** Requiring identity on `release_joiner_seat` breaks
  the anonymous guest leave path outright — a guest has no `auth.uid()`, so "the same guest
  leaving" and "an attacker" are indistinguishable. Mitigation: treat any change to AD3 as a
  `[FOUNDER DECISION]`, and cost the guest-flow breakage explicitly before proposing it.
- **A fix here can silently re-break guest rejoin**, which P1053 already broke once and restored
  in migration `20260812190000`. Mitigation: the Group F canaries in
  `e2e/integration/p1053-claim-joiner-seat.spec.ts` must stay green.
- **Review fatigue produces rubber-stamping.** This is the third review pass over the same diff;
  the temptation is to confirm rather than break. Mitigation: each lens must report at least one
  concrete attempted attack and its outcome, including failed attempts.

### Non-Goals

- Do **NOT** re-litigate the room `code` as bearer token, or code confidentiality — that is P1057.
- Do **NOT** re-open the `joiner_profile_id` single-slot design. It is a known, recorded limit and
  is no longer load-bearing for confidentiality (P1053 closed F1 by refusing the transfer).
- Do **NOT** change `claim_joiner_seat`'s guest-reclaim arm's name-forgeability. That is a
  deliberate founder decision, argued on the grounds that release-then-claim already bypasses any
  name check.
- Do **NOT** fix the LOW item below as separate work — record it and move on.
- Do **NOT** report a finding that has not been reproduced on test. Forward it labelled as a
  claim, exactly as F4 is labelled here.

## Done-When

- [ ] F4 is either **reproduced** with a canary showing an anon caller evicting a seated guest, or
      **closed** with a written explanation of why the claim does not hold
- [ ] If reproduced: fixed, with the AD3 trade-off decided explicitly by the founder and recorded
- [ ] The fail-open audit table exists — every boolean condition in the three functions, its
      NULL-reachable operands, its construct (`IF` vs `WHERE` vs policy), and its fail direction
- [ ] Every fail-OPEN condition found is either fixed or recorded as accepted with a reason
- [ ] All three unrun lenses have been run, each reporting concrete attempted attacks and outcomes
- [ ] Every new finding is reproduced on test before being written up as real
- [ ] `.private/docs/security-log.md` updated with anything found
- [ ] P1053's Group F canaries and both integration suites still green

## Findings

### Phase 1 — F4 REPRODUCED, then fixed (2026-09-08)

F4 was not a claim by the time this work started: the canaries committed with P1063
(`e2e/integration/p1058-release-seat-authorization.spec.ts`) already reproduced it, and the P1063
commit body says so. Re-run at the start of this session to confirm rather than inherit the claim
— **3 failed / 5 passed**, the three failures being exactly F4:

| Canary | Result before fix |
|---|---|
| anon holding only the id evicts a seated guest | FAILED — seat stamp and `joiner_name` cleared, rpc error: none |
| the eviction raises `joinerEnded` | FAILED — a departure the guest never made |
| release-then-claim defeats the occupancy guard | FAILED — `Expected "Original Guest"`, `Received "Attacker"` |
| bound: signed-in seat holder | passed — not evictable |
| bound: addressed session | passed — not touchable |
| `joiner_profile_id` never moves | passed — **DoS, not disclosure** |

**Classification: denial of service and a forged departure. No data disclosure.** The transcript
SELECT policy keys on `joiner_profile_id`, and a release does not write it.

**Fix — the code, not identity.** AD3's reasoning (identity cannot distinguish "the guest leaving"
from "an attacker", because a guest has no `auth.uid()`) is correct and is *not* overturned. It is
sidestepped: possession of the ROOM CODE distinguishes them, and a real occupant always holds one.
`code` is the single column P1057 revoked from `anon` (21 of 22 granted) — verified two independent
ways, by `has_column_privilege` inside `20260817140001` and by a live anon `select=code` returning
42501 while `select=id` returned rows. `claim_joiner_seat` has always keyed on the code; release is
now symmetric with it.

**So the founder decision this spec braced for does not arise.** AD3 narrows from "any anon
id-holder may release" to "any anon CODE-holder may". The anonymous guest leave path keeps working
with no account and no UX change. *This narrowing is still a founder decision to ratify — see
Decisions below.*

Migration `20260908114500_p1058_release_seat_requires_code.sql`, client `7a801a3ef`.
After: **P1058 11/11**, and **P1053 + P1063 + P1047 48/48** with no regressions.

### Phase 2 — fail-open audit

Classified by **construct**, not by predicate text, as the spec requires.

| Function | Condition | Construct | NULL-reachable operand | Fail direction |
|---|---|---|---|---|
| `release_joiner_seat` (new) | `id = p_session_id` | WHERE | — | CLOSED |
| | `joiner_seat_claimed_at IS NOT NULL` | WHERE | n/a (`IS` is NULL-safe) | CLOSED |
| | `target_listener_id IS NULL OR target_listener_id = auth.uid()` | WHERE | `auth.uid()` | CLOSED — proven by the addressed-session bound canary |
| | `auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid()` | WHERE | both | CLOSED |
| | `p_code IS NOT NULL AND code = upper(btrim(p_code))` | WHERE | `p_code`, `code` | CLOSED — proven by the wrong-code canary |
| `claim_joiner_seat` | `p_code IS NULL OR length(btrim(p_code)) <> 6` | IF | `p_code` | CLOSED — the `IS NULL` arm short-circuits true |
| | `p_joiner_name IS NULL OR btrim(...) = ''` | IF | `p_joiner_name` | CLOSED — same shape |
| | `NOT FOUND` | IF | — | CLOSED |
| | `ended_at IS NOT NULL` | IF | n/a | CLOSED |
| | F3 `target_listener_id IS NOT NULL AND auth.uid() IS DISTINCT FROM ...` | IF | `auth.uid()` | CLOSED — `IS DISTINCT FROM` is NULL-safe |
| | F2 `(joiner_profile_id IS NULL OR ... IS DISTINCT FROM auth.uid()) AND (EXISTS OR EXISTS)` | IF | `joiner_profile_id` | CLOSED |
| | occupancy, arm (a) `IS NOT DISTINCT FROM auth.uid()` | IF | `joiner_profile_id` | CLOSED — this was **F5**, fixed in `20260812200000` |
| | occupancy, arm (b) `joiner_name IS NOT DISTINCT FROM btrim(p_joiner_name)` | IF | `joiner_name` | CLOSED — fixed in `20260812210000` |
| | F1 `joiner_profile_id IS NOT NULL AND ... IS DISTINCT FROM auth.uid()` | IF | — | CLOSED |
| `complete_clarity_session` | `auth.uid() IS NOT NULL AND NOT EXISTS (...)` | IF | — | **OPEN BY DESIGN** — see below |
| | inner `creator_profile_id = auth.uid()` etc. | WHERE (subquery) | `auth.uid()` | CLOSED |

**One fail-OPEN condition found, and it is deliberate.** `complete_clarity_session`'s guard is
skipped entirely whenever `auth.uid()` IS NULL — written that way to admit the trusted
`service_role` path, but `anon` also has a NULL uid, and nothing in the body distinguishes them.
**Only the ACL closes it.** Recorded as accepted rather than fixed: adding an `auth.uid() IS NULL`
refusal would break the service_role caller the comment names, and that caller has not been
enumerated here. The mitigation is the existing canary (P1058 suite, "complete_clarity_session is
unreachable by anon"), which tests the *claim* rather than reading the ACL, and which passes.

### Research Question 2 — is F5's class anywhere else?

Scanned the **latest definition** of all 94 SECURITY DEFINER functions (later migrations override
earlier ones) for an `IF` that RAISEs on a non-NULL-safe comparison against `auth.uid()`. A first
scan returned 14 hits and was **wrong** — its regex ran across function boundaries, so most hits
were fragments of neighbouring bodies. Re-run with dollar-quote-balanced extraction: 5 candidates,
4 of them mitigated (P1066 added explicit `auth.uid() IS NULL` refusals; `retry_transcription` and
`complete_clarity_session` put the comparison in a subquery WHERE, which is fail-CLOSED).

**One unmitigated instance, outside this spec's three functions:**

`seal_and_send_letter` (`20260904120000`, line 68) — `IF v_sender_id != auth.uid() THEN RAISE`.
`v_sender_id` is guaranteed non-NULL four lines above, so for a NULL `auth.uid()` the condition is
NULL, the branch is skipped, and the refusal never runs. Identical to F5. **Not exploitable today**
— probed on test, anon gets `permission denied for function` (P1063's REVOKE survived P1212's
`CREATE OR REPLACE`, which reused the same signature and therefore inherited the ACL). But the
guard is one accidental grant, or one new overload, away from being live — and a new overload is
exactly how this function acquired a PUBLIC grant once before (P1063's own header records it).
**Recorded, not fixed here** — it is outside P1058's three named functions. Filed for P1059.

### Founder decisions — TAKEN 2026-09-08

1. **AD3 narrowing: RATIFIED.** "Any anon id-holder may release an anonymously-held seat" becomes
   "any anon holder of the code AND the seat capability may". AD3's reasoning is untouched —
   identity still cannot separate a guest from an attacker, and no identity is required. The
   anonymous guest leave path works with no account.
2. **Event practice rooms: FIXED HERE, not accepted.** The first fix bound the release to the room
   code, which closed F4 wherever the code is shared 1:1 and left it open for event practice rooms,
   whose codes `get_practice_room_codes` publishes to any anon visitor (P1057 D-A). Founder chose to
   close that rather than file it: those rooms were already stranger-*joinable* by design, but
   *eviction* is a strictly larger harm and P1057 D-A never accepted it.

   `claim_joiner_seat` now mints a per-occupancy `joiner_seat_token`; the anonymous release arm
   requires it alongside the code. The capability is unreadable and unforgeable by construction —
   P1057's default-deny column grants mean a column added later is invisible to `anon` and
   `authenticated` until named in a GRANT, and this one never is; the migration's DO block asserts
   SELECT and UPDATE privilege on it for both roles rather than trusting that. The claimer still
   receives it because a SECURITY DEFINER function's result is not filtered by the caller's column
   privileges — **confirmed on test before the design depended on it**, by calling
   `claim_joiner_seat` as anon and observing `code` (a column anon cannot SELECT) in the returned row.

   Migration `20260908120000_p1058_per_seat_capability_token.sql`. The former "residue accepted"
   canary now asserts the opposite: a visitor holding the **published** code cannot evict the seated
   guest — while still asserting the code really is published, so it cannot pass for the wrong reason.

   **Still not closed, and out of scope:** a leaked code remains unrevocable (P1098), and whether
   event rooms should be attendee-only remains a product question.

### Phase 3 — the three unrun lenses (2026-09-08). Reports received: **3 of 3**

Run per `/slava:think:adversarial-review`, 3 hostile reviewers on opus, lenses: fail-open/operational,
race/TOCTOU, evasion/blast-radius. Every finding below was **reproduced on test** by the reviewer and
then **re-run independently by the orchestrator** before being recorded (epistemic gate 9).

**The review broke the fix. That is the outcome, and it is the point of running it.**

#### The decisive finding — the token closed nothing (found independently by TWO lenses)

`claim_joiner_seat`'s guest-reclaim arm authorizes on `joiner_name`, which is the third column of
P1057's 21-column anon allowlist. An attacker reads the seated guest's name, re-claims under it, and
the function **mints a fresh token and returns it** via `RETURNING *`. Re-run by the orchestrator:
victim token `96ec5ce1-…`, attacker token `30769e8c-…`, same seat, seconds apart, anon client.

**This was self-inflicted by P1058.** Migration `20260812190000` justified the name-forgeable reclaim
arm *explicitly on AD3* — "release-then-claim already bypasses any name check, so a name check on
claim alone is not what is holding the attacker back." `20260908114500` removed AD3 and voided that
justification without re-examining what rested on it. **This spec's own Non-Goal** ("do NOT change
`claim_joiner_seat`'s guest-reclaim arm's name-forgeability… argued on the grounds that
release-then-claim already bypasses any name check") inherited the same dead premise and is
therefore no longer binding — its stated ground has evaporated.

Two further defects in the same migration, both reproduced: it **stranded every pre-existing seat**
(nullable column, no backfill, equality against NULL excludes → 42501 forever; 200+ such rows
measured on test, prod has the same shape), and the client **could not survive a page reload**
(`LiveSessionProvider` never restores from localStorage; `setActiveSession` runs only at the four
join/create sites). A third: `handleExitMeeting` clears the active-session record *before* awaiting
the release, so the token was destroyed ahead of the call that needed it.

**Outcome: `20260908120000` reverted** by `20260908130000`. [FOUNDER DECISION 2026-09-08]

**None of this was caught by the 13 canaries that passed against it.** They are DB-level and never
simulate a reload, a pre-existing seat, or a second RPC — epistemic gate 7b, the fixture
structurally could not emit the inputs that mattered.

#### Research Question 3 — ANSWERED, and this spec's premise was wrong

The spec asserts the `FOR UPDATE` lock "has never been proven to engage under contention" and that
PostgREST "offers no way to hold a transaction open across two requests". **Both halves are false.**
The Supabase management API (`POST /v1/projects/{ref}/database/query`) runs multi-statement SQL in
one transaction, so `begin; … for update; pg_sleep(N); commit;` holds the lock while a separate
PostgREST RPC races it. Needs no new infrastructure.

| trial | holder | racer | result |
|---|---|---|---|
| CONTROL | `begin; select 1; pg_sleep(5); commit;` | anon `claim_joiner_seat` | returned **380 ms**, succeeded |
| TEST-A | same, but `… for update` | anon `claim_joiner_seat` | **blocked 3145 ms**, then `57014` |
| TEST-B | `begin; select * from claim_joiner_seat(...); pg_sleep(2); commit;` | anon `claim_joiner_seat` | **blocked 2025 ms**, then `42501`; loser re-read the new row version and REFUSED rather than overwriting |

Control and TEST-A differ in exactly one thing — whether the holder took the row lock — and the
racer's latency differs 8×. **The lock is PROVEN.** Supporting facts verified live:
`clarity_sessions_code_key UNIQUE (code)` exists, so the locked row and the updated row are the same
row (the "two rows share a code" attack does not exist), and isolation is READ COMMITTED, which is
what makes EvalPlanQual re-read the committed row version.

#### Findings that SURVIVE the revert — filed, not fixed here

- **`patch_live_state` is the bigger lever.** It is granted to `anon` and carries the *byte-identical*
  `auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL` predicate this spec
  just retired from `release_joiner_seat`. Re-run by the orchestrator: an anon caller holding only an
  enumerated id set `joinerEnded: true` — **HTTP 204, no code, no token**. `get_active_session_by_code`
  filters on both `joinerEnded` and `sessionEnded`, so a forged flag makes the room unrejoinable by
  its own code: a product-wide unauthenticated room-kill, strictly larger than the eviction this spec
  targets. **The impact narrative in `20260908114500`'s header is therefore wrong** where it presents
  the forged departure as closed by this work; it is closed only via `release_joiner_seat`.
- **Event-room seat takeover remains open** — published codes plus the name-forgeable reclaim arm.
- **`get_practice_room_codes` has no authorization beyond naming an event id** — no check that the
  event is published or that the caller attends it, so every live practice-room code is two anon
  requests away.
- **Lock contention surfaces as HTTP 500 / `57014`**, not a clean refusal (`anon` has
  `statement_timeout=3s`) — the loser of a race sees a server error.
- **A guest who signs in mid-session satisfies neither release arm.**

#### Refuted

- **Realtime does NOT leak the code.** `clarity_sessions` is in the `supabase_realtime` publication
  and was never dropped, which would have voided the fix's premise outright. The evasion lens flagged
  this UNVERIFIED and correctly declared its own probe blind (0 events for both subject and control).
  Re-probed by the orchestrator with a working subject: an anon subscriber received an UPDATE payload
  of **exactly 21 columns with `code` absent** — precisely P1057's allowlist, out of 23 columns on the
  table. Realtime column-filters. (The `service_role` control did not fire; the subject's result
  stands on its own because the column *count* is self-validating — an unfiltered payload would carry 23.)
- Read routes that held: `select=*`, `select=code`, `select=joiner_seat_token`, FK embedding,
  RPC `select=` shaping, and direct PATCH of every seat column — all 42501. `code` is not obtainable
  by reading. The token was obtainable only by asking the database to mint a new one.

## Research Questions

1. Does F4 reproduce? Which grant and which policy actually make it reachable — `GRANT EXECUTE …
   TO anon` on the function, or the anon SELECT policy that publishes session ids, or both?
2. Is there any *other* SECURITY DEFINER function in the codebase whose refusal logic sits in an
   `IF` over a nullable column? F5's class is not specific to P1053.
3. Does the `FOR UPDATE` lock actually engage under contention, and can that be demonstrated at
   all through PostgREST — which offers no way to hold a transaction open across two requests?
4. Does `patch_live_state` interact with the new seat columns in any way that re-opens a closed
   session or forges a vacancy signal?

## Notes

**LOW, recorded not fixed (from the P1053 code review).** `clearSessionJoiner`'s stricter WHERE
turns a double-release from a silent no-op into a thrown-then-caught error. Both call sites
(`clarity-live-page.tsx`, `src/auth/AuthContext.tsx`) already catch and swallow it, so the
functional impact is nil and the cost is log noise. Do not fix separately; fold it in only if
Phase 1 or 3 touches `release_joiner_seat` anyway.

**Context and exploit detail:** `.private/docs/security-log.md`, the two `2026-08-12` P1053
entries — the first covers F1/F2/F3, the second covers F5 and why four rounds of canaries missed
it. P1053's spec carries the founder decisions (Reconciliation items 3 and 4) and the AD5
stale-marker.
