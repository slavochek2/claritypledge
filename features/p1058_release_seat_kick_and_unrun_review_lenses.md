---
status: qa
type: task
disclosure: public
rank: 1
created_date: '2026-08-12'
tags: [security, clarity-sessions, rls, adversarial-review]
delivery_stage: fix
pipeline_ran: [create-spec, fix]
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

**Correction (2026-09-08).** An earlier edit of this section claimed Phase 3 had not run and moved
it to P1274. That was wrong: Phase 3 **did** run — see "Phase 3 — the three unrun lenses,
Reports received: 3 of 3" below. The edit was made from a read of this branch taken hours earlier,
by a session working elsewhere, without re-checking that the facts still held. P1274 is retracted
as a duplicate. Recorded rather than quietly overwritten, because the failure — acting on a
verified-but-stale reading of another session's branch — is the one `.claude/rules/git.md`
("volatile state decays") names, and it is worth the line.

- [x] F4 is either **reproduced** with a canary showing an anon caller evicting a seated guest, or
      **closed** — REPRODUCED: 3 failed / 5 passed before the fix, the three failures being exactly F4
- [x] If reproduced: fixed, with the AD3 trade-off decided explicitly by the founder and recorded
- [x] The fail-open audit table exists — every boolean condition in the three functions, its
      NULL-reachable operands, its construct, and its fail direction
- [x] Every fail-OPEN condition found is either fixed or recorded as accepted with a reason
- [x] All three unrun lenses have been run, each reporting concrete attempted attacks and outcomes
      — **3 of 3 reported.** The review broke the fix: the per-seat token was minted and handed to
      the attacker on request, and it stranded 200+ existing seats. Backed out in `f24c4d354` on
      founder decision, on evidence rather than preference.
- [x] Every new finding is reproduced on test before being written up as real — reproduced by the
      reviewer, then re-run independently by the orchestrator (epistemic gate 9)
- [x] `.private/docs/security-log.md` updated with anything found
- [x] P1053's Group F canaries and both integration suites still green — re-run AFTER the token
      revert, so it describes the shipped set rather than the reverted one: **59 passed, 2 skipped
      (both pre-existing `test.fixme` in p1053), exit 0** across P1058 + P1053 + P1063 + P1047.

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
- **A guest who signs in mid-session satisfies neither release arm.** Their seat has
  `joiner_profile_id IS NULL` but they now have an `auth.uid()`, so the signed-in arm's equality
  fails and the guest arm's `auth.uid() IS NULL` fails. **Pre-existing, not introduced** — the
  P1053 predicate had the same shape.
- **The authoring gate never required either coupling marker, and cannot.** Verified directly:
  `scripts/check-migration-client-safety.sh:27`'s `BREAKING_SHAPES` covers `REVOKE … FROM
  (anon|authenticated)`, `DROP POLICY`, `ALTER TABLE … DROP COLUMN` and `ALTER COLUMN … TYPE`. It
  has **no `DROP FUNCTION` and no notion of a signature change**, and both P1058 migrations revoke
  `FROM PUBLIC`, which the regex does not match. So the most client-breaking shape in this whole
  feature — changing an RPC's signature out from under a deployed client — is invisible to the gate,
  and every marker here was voluntary. Filed to the task inbox.
- **P1057's own ban on `SETOF clarity_sessions` / `RETURNING *` is violated by `claim_joiner_seat`,
  and the rule is now false as written** (`20260817140000:71-77`). The ban exists for exactly the
  "a future ADD COLUMN joins the output" case — which is precisely the mechanism that let the
  reverted token reach the claimer, and precisely why the next column added to this table publishes
  itself to every claimer, anonymous ones included. The exception should be named in that rule
  rather than left contradicted.
- **`get_practice_room_codes` has no publish or attendance check** — carried into P1269.

#### Phase 3b — independent Codex review (non-Claude reviewer), 2026-09-08

Run via `~/.agents/bin/codex-review` in an isolated clone, primed with what the three Claude
lenses had already found so it would go beyond them. **Verdict: DO NOT SHIP** — and its top
finding is one all three Claude lenses missed, because it read the *deploy script* rather than
only the SQL.

**[HIGH] A known-broken migration must never enter prod's sequence, even with its own undo behind
it.** `scripts/migrate.sh` does **not** abort on a failed migration: it increments `FAIL_COUNT`,
continues the loop, and only exits non-zero at the end (verified at `scripts/migrate.sh:580-590`).
So shipping `20260908120000` (the token) plus `20260908130000` (its revert) means prod transiently
enters the broken state, and if the revert fails or the run is interrupted, **it stays there** —
every pre-existing anonymous seat unreleasable, exactly the defect the revert exists to undo.

**Acted on: both files removed from the branch** (`git rm`, history retained). Only
`20260908114500` ships. Prod therefore never receives the column or the token function. The
residue is that the **test** database keeps an inert `joiner_seat_token` column created by a
migration file that no longer exists on any branch — cosmetic, test-only, and an instance of the
class cp P1054 already tracks.

**[MEDIUM] The coupling marker cannot reach an already-loaded browser tab.** A tab that loaded the
pre-P1058 bundle keeps calling `clearSessionJoiner(sessionId)` with no code, so that guest's
release is refused until they reload. The client catches it and still does local cleanup, so the
visible effect is a seat not freed server-side, self-healing on reload. Bounded; recorded rather
than fixed.

**[LOW] `claim_joiner_seat` remains `RETURNS SETOF clarity_sessions` with `RETURNING *`**, so any
column added later is published to every successful anonymous claimer. Independently found by the
fail-open lens (F10). Now moot for prod — the column never ships — but the return-shape hazard
stands for the next column anyone adds.

**Two corrections to my own reporting, both fair:**

- I told the reviewer the suite has **13** canaries. Post-revert it has **11** — 13 described the
  pre-revert state and I carried a stale number into the prompt.
- The revert migration claimed the restored bodies were "byte-for-byte" identical. They match on
  **executable SQL after comment stripping**, not byte-for-byte. Moot now (file removed), but the
  wording was overclaimed.

**Weigh its evidence accordingly:** Codex did not run the integration suite (no external network in
its sandbox) and Vitest would not start in the clone, so its verdict rests on reading plus
`tsc --noEmit` (exit 0). That is thinner evidence than the three Claude lenses, which actually ran
exploits — but the HIGH finding is a reasoning defect in the deploy sequence, which is exactly the
kind of thing reading catches and running does not.

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

### Inheritance pass — independent verification by a second session (2026-09-09)

This branch sat untouched for ~18h. A different session picked it up under instruction to judge
it rather than trust it, and re-ran its load-bearing claims from scratch. **Everything above that
was checked held.** What follows is what the re-run added.

**The hole is still live on `main` today — verified, not inherited.** `grep -rn "FUNCTION
public.release_joiner_seat" supabase/migrations/` returns two definitions, the later being
`20260812180000:162`. Its anonymous arm is still `auth.uid() IS NULL AND joiner_profile_id IS NULL
AND joiner_name IS NOT NULL` with no code and no token, and `20260812180000:196` still grants
EXECUTE to `anon`. `20260817140001:68-73` grants anon SELECT on 21 columns including `id` and
excluding `code`. No later migration touches the function — `20260813080000` (P1063) names it only
in prose, at lines 66 and 77, to say it is deliberately NOT revoked. **Nothing has closed F4 since.**

**Suites re-run against the live test project by the inheriting session, not carried over:**

| suite | result | exit |
|---|---|---|
| `e2e/integration/p1058-release-seat-authorization.spec.ts` | 11 passed | 0 |
| p1053 + p1063 + p1047 integration | 48 passed, 2 skipped | 0 |
| `src/tests/p740…`, p754, p1240, p537, p705 (vitest) | 11 passed, 4 skipped | 0 |
| `npm run lint` | clean | 0 |
| `./scripts/typecheck-gate.sh` | clean | 0 |

The P1058 suite is not all-refusals: `POSITIVE CONTROL: a guest holding the room code CAN release
their own seat` and `a WRONG code is refused — the code is checked, not merely required` are the
two that stop a "required but never verified" fix from passing (epistemic gate 7c).

#### NEW — BLOCKS THE PROD APPLY: the `requires-frontend` marker names a SHA that ship will rewrite

`-- requires-frontend: 7a801a3ef` is a **branch-local** SHA. `git-ops.sh:815` states plainly that a
shipped branch is **cherry-picked** onto main and keeps its own SHAs, so `7a801a3ef` never becomes an
ancestor of `origin/main`. `scripts/migrate.sh:446` gates the prod apply on exactly
`git merge-base --is-ancestor "$REQUIRED_SHA" origin/main`, and its else-arm is a hard BLOCK that
`--yes` does not bypass. **As written, this migration cannot be applied to prod.**

This is a known repo step, not a novel defect — every one of the 11 existing `requires-frontend`
markers in `supabase/migrations/` currently resolves to ANCESTOR-OK, and two of them were fixed by an
explicit follow-up: `02c83e54f` ("fix(p1057): repoint requires-frontend at the post-merge sha") and
`f16c42040` ("fix(p1275): re-point the requires-frontend marker at the cherry-picked SHA"). **The
same follow-up commit is mandatory here, after ship and before any prod apply.** Recorded because
the step is invisible until the apply refuses.

#### NEW — the `deploy-manifest.json` edit on this branch is stale and will conflict at ship

The branch adds `20260908065003`, `20260908110000`, `20260908130000` to `.test.migrations` and moves
`migrations_deployed_at` back to `2026-09-08T13:31:39Z`. `main` already carries all three plus
`20260908210000` and `20260908210100`, stamped `2026-09-09T05:59:51Z`. The branch's edit is now a
strict subset and a timestamp regression. `git-ops.sh:3475` already recognises a
deploy-manifest-only conflict and says so during ship — take main's side. Note also that
`20260908114500` appears in **neither** manifest, although the suite above proves it IS applied on
test; the stamp was never written.

#### Second independent Codex review — 2026-09-09, verdict DO NOT SHIP (founder decision, not a code defect)

Re-run via `~/.agents/bin/codex-review` on the shipped set, primed with the security claim and asked
specifically whether an anonymous guest's in-memory `session.code` is actually populated after P1057
revoked `code` from anon — the failure that would break the guest leave path in exactly the way this
fix claims not to. **Refuted, and this is the reassuring finding:** `mapSessionFromDb` takes a
REQUIRED `knownCode` and returns `code: dbSession.code ?? knownCode` (`src/app/data/api.ts:908-910`),
so the splice is compiler-enforced at every call site. Re-checked directly rather than taken on the
reviewer's word (epistemic gate 9). The `AuthContext` sessionStorage read was checked the same way:
`clarity_live_session_code` is written at `clarity-live-page.tsx:1128`.

Its two HIGHs are both **already-recorded items, re-rated**, not new defects:

1. **An already-loaded pre-P1058 tab cannot release an anonymous seat** — it calls with one argument,
   resolves to the new function via `DEFAULT NULL`, and fails the WHERE for `42501`. Recorded above
   as MEDIUM by the first Codex pass; this pass calls it HIGH. The client catches it and still does
   local cleanup, so the seat is left stamped server-side until it expires, self-healing on reload.
   No deploy ordering can fix it — only time or a forced reload.
2. **Event practice rooms remain evictable** — the accepted residue, pinned by a canary. The attempt
   to close it (the per-seat token) was reviewed, broken, and reverted on founder decision.

**Neither is fixable in code without a founder decision, which is why this branch stops here.**
No new code changes were made by the inheriting session; the review found nothing to fix.

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
