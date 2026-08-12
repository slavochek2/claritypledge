---
status: today
type: bug
rank: 1000964.0
severity: critical
date_reported: '2026-08-12'
created_date: '2026-08-12'
tags: [security, rls, ownership, privacy, transcripts]
driver: anomaly
feature_type: backend
delivery_stage: architect
pipeline_ran: [architect]
---

# P1053: joining a session has no server-side authorization

## Summary

`clarity_sessions.joiner_profile_id` is the key to a session's stored transcript, and any
signed-in user can write their own id into it on a stranger's session. Nothing in the
database checks whether the seat is free, or whether the caller has any relationship to the
room — the only occupancy check in the product is client-side JavaScript.

Found by adversarial review of P1047. **Pre-existing**, not introduced by it. P1047 closed
forging ownership *onto someone else* and deliberately stopped short of this, because
closing it is the anonymous-session redesign P1047's Non-Goals forbid.

Exploit mechanics and live counts: `.private/docs/security-log.md` 2026-08-11.

## Problem

Three symptoms, one root cause.

1. **Seat seizure.** A signed-in user writes their own uid into `joiner_profile_id` on any
   reachable session. `session_transcripts` and `transcription_jobs` both gate SELECT on
   `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`, so this yields the
   full stored transcript of a private conversation between two other people. It also
   unlocks `complete_clarity_session`, `patch_live_state`, `create_transcription_job` and
   `retry_transcription`, which gate on the same column. Re-sending the original
   `joiner_name` in the same statement makes the takeover invisible in the UI.
2. **Seat erasure.** Any caller — including an unauthenticated one — can NULL the column.
   The session vanishes from the joiner's history, they lose SELECT on their own transcript
   and jobs, new transcription enqueues raise "Not a participant", and they cannot close
   their practice room. User-visible: mid-session, their recording silently stops being
   processed.
3. **Empty-seat claiming.** Anyone can take an unoccupied seat on a stranger's room. The
   room id is freely readable — the SELECT policy exposes every null-target row to anon —
   so no guessing is needed.

**The root cause is that the column means two different things.** It is simultaneously
*who currently occupies the seat* and *who participated* (for transcript access). Those
diverge the moment a joiner leaves: `clearSessionJoiner` (`src/app/data/api.ts:1235`) nulls
`joiner_name` but deliberately keeps `joiner_profile_id`, because the departed participant
still needs their transcript.

**Why no trigger can fix it — established by a failed attempt, not by argument.** P1047
part 4 added exactly the obvious guard (reject when `OLD.joiner_profile_id IS NOT NULL`)
and it broke a live flow: after a signed-in joiner leaves, the next signed-in joiner was
rejected with 42501, surfacing as "Session not found or already full" *after* the mic
prompt was granted. Reverted in P1047 part 5. Every other vacancy signal a trigger could
read (`joiner_name`, `live_state.joinerEnded`) is itself in the client UPDATE allowlist and
so is forgeable in two steps: clear the signal, then claim.

## Appetite

Higher decision density than P1047 and a real blast radius: this touches the join path,
which is the entry point to every `/live` session, including anonymous practice rooms. A
wrong tightening takes guest joins down — P1047 part 4 already demonstrated that failure at
small scale. Not a mechanical predicate change.

## Solution

Sketch, not a decided design — the separation of the two meanings is the actual open
question.

1. **Separate occupant from participant.** Either a distinct column (`joiner_left_at`, or a
   participants join-table) or an explicit vacancy flag the client cannot forge. Until
   these are separable, no authorization rule can be stated correctly.
2. **`claim_joiner_seat(p_code, p_joiner_name)` as SECURITY DEFINER.** Checks vacancy and
   writes `joiner_name` + `joiner_profile_id` atomically, so vacancy cannot be cleared and
   re-claimed across two statements. Sets `joiner_profile_id = auth.uid()`, or NULL for an
   anonymous guest.
3. **Revoke client UPDATE on `joiner_name` and `joiner_profile_id`.** Without this the RPC
   is decorative — the direct PATCH path remains. This is what makes the vacancy signal
   trustworthy.
4. **Authorization rule for an empty seat: the room code is the bearer token.**
   **[FOUNDER DECISION 2026-08-12 — resolved.]** `claim_joiner_seat` takes `p_code`, never a
   session id. Combined with step 3's revoke, the freely-readable room *id* stops being a
   join key, so enumeration of null-target rows no longer yields a claimable seat. Rejected:
   an invite row (anonymous practice rooms have no creator identity to issue one from, so it
   needs a carve-out that reintroduces the open path); splitting the rule by
   `creator_profile_id IS NULL` (two authorization paths and two canary sets for one seat).
   Shape-preserving at the call site — `joinClaritySession` already keys on `code`
   (`src/app/data/api.ts:960`, `.eq('code', normalizedCode)`), so no client rewrite.
5. **The `code` column stops being anon-readable, via a column-level SELECT split.**
   **[FOUNDER DECISION 2026-08-12 — REVERSED the same day, on evidence.]** The original
   decision deferred this, on the rationale that "once client UPDATE is revoked, a readable row
   is no longer a claimable row." **That rationale is false and the deferral is withdrawn.** It
   holds only while the capability lives outside the readable row; under step 4 the capability
   *is* `code`, and `clarity_sessions_select` is row-level only
   (`20260414100001_p703_letter_sourced_live.sql:124-129`) with no column-level SELECT grant on
   the table (`grep -rn "GRANT SELECT (" supabase/migrations/*.sql` → `profiles` only). So anon
   is handed the join capability for every null-target row, and step 4 closes id-enumeration
   while leaving code-enumeration open. Steps 4 and 5 as originally decided were individually
   reasonable and jointly incoherent.

   **What lands here** is *not* the row-predicate narrowing originally contemplated — that one
   stays rejected, because the null-target branch is what makes anonymous practice rooms
   reachable at all. It is the P877/P886 column-grant idiom, which leaves the row predicate
   untouched:

   ```sql
   REVOKE SELECT ON public.clarity_sessions FROM anon, authenticated;
   GRANT  SELECT (<every column except code>) ON public.clarity_sessions TO anon, authenticated;
   ```

   **Consequence to design for:** Postgres requires column SELECT privilege to *reference* a
   column in a `WHERE` clause, so all four `.eq('code', …)` lookups break. Two
   (`api.ts:970, 1002`) are inside `joinClaritySession` and are already replaced by
   `claim_joiner_seat`. The other two — `getClaritySession` (`api.ts:1038`) and
   `getActiveSessionByCode` (`api.ts:1196`) — need SECURITY DEFINER read RPCs.

## Risks / Non-Goals

### Risks
- **Breaking guest joins.** MITIGATE — the join path serves anonymous practice rooms. P1047
  part 4 is the worked example of getting this wrong; its canary
  ("a signed-in user can join a room a previous signed-in joiner left") must stay green.
- **Stripping a departed participant's transcript access.** MITIGATE — the naive fix
  (null `joiner_profile_id` on leave) does exactly this. Any design must keep the
  participant record intact while marking the seat free.
- **A decorative RPC.** MITIGATE — if the direct-PATCH path stays open, the RPC adds a
  mechanism and closes nothing. Verify the revoke landed, on prod, after deploy.

### Non-Goals
- Do NOT re-open P1047's column grants or its trigger. Both are live on prod and verified.
- Do NOT fix the `/demo` `creatorProfileId` argument-order bug here (separate, pre-existing).

## Done-When

- [ ] **Occupancy is separated from participation, written down before any policy is authored:**
      occupancy → `joiner_seat_claimed_at` (server-written, never caller-supplied);
      participation → `joiner_profile_id`.
      **KNOWN GAP, deliberately not closed here [FOUNDER DECISION 2026-08-12]:**
      `joiner_profile_id` remains a *single ACL slot*, so when a second signed-in joiner claims
      a seat the first vacated, the first silently loses transcript, job and history access.
      This is pre-existing (`api.ts:1001` overwrites identically today) and is NOT fixed by the
      vacancy column. Closing it needs a `session_participants` join table plus rewrites of both
      transcript SELECT policies — a confidentiality-boundary backfill that does not belong in
      the same deploy as the join-path change. Tracked in the follow-up spec filed at Build
      Sequence step 10. **This item may be ticked only against the occupancy/participation
      separation — not as "the two meanings are separated" in full.**
- [ ] Seat seizure canary green — `p1047-reproduce-clarity_sessions-update.spec.ts`
      currently carries it as `test.fixme` ("authenticated attacker cannot displace a joiner
      who already holds the seat"); it moves here and must pass
- [ ] **A second seizure canary that drives the RPC**, not a direct PATCH — inside a SECURITY
      DEFINER function `current_user` is the owner, so P1047's trigger takes its trusted-role
      exemption and the RPC is the sole enforcement point on that path
- [ ] Seat erasure canary — an anonymous caller cannot strip a joiner's transcript access
- [ ] Empty-seat rule implemented per the founder decision in Solution step 4 (code as bearer
      token), with a canary: a caller holding only the session *id* cannot claim a free seat
- [ ] **`code` is not readable by `anon`/`authenticated`** (Solution step 5), verified by
      `information_schema.column_privileges` **and** behaviourally: an anon GET selecting `code`
      on a null-target row is rejected. Both read RPCs (`getClaritySession`,
      `getActiveSessionByCode`) migrated and their flows green
- [ ] Concurrency canary — two callers race one free seat, exactly one wins, and the loser's
      `joiner_profile_id` is not the value that persists
- [ ] Follow-up specs filed: the single-slot participant column; the two unpinned `search_path`
      RPCs; server-minted room codes from a CSPRNG; code rotation/revocability
- [ ] P1047's rejoin-after-leave control still green, plus all six anonymous
      practice-room controls
- [ ] Verified live on test, then prod under explicit approval, with grants re-read on prod
      after deploy (a REVOKE that silently no-ops is the P877/P886 failure)
- [ ] Private security log updated

---

## Technical Architecture

### Technical Analysis

#### Reuse inventory

Everything below was read this session. Every decision in the next section cites one of
these rows as *reuses* or *new because the inventory shows no equivalent*.

| Artifact | Path | What it gives us |
|---|---|---|
| `patch_live_state` RPC | `supabase/migrations/20260409140000_fix_guest_patch_live_state.sql` | The canonical **guest-reachable SECURITY DEFINER write RPC**: `SET search_path = public`, `GRANT EXECUTE TO authenticated, anon`, and the exact anonymous-occupant predicate `auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL` |
| `complete_clarity_session` RPC | `supabase/migrations/20260420140000_p769_complete_clarity_session_sets_session_ended.sql` | `REVOKE ALL FROM PUBLIC` + explicit `GRANT EXECUTE`; the `live_state = COALESCE(live_state,'{}') \|\| jsonb_build_object(...)` merge idiom |
| `create_transcription_job` / `retry_transcription` | `20260313140327_p495_create_transcription_job_rpc.sql`, `20260313120000_p495_transcription_tables.sql` | Participant gate `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`; both are consumers of the participant meaning, not the occupant meaning |
| `session_transcripts` / `transcription_jobs` SELECT policies | `20260313120000_p495_transcription_tables.sql` L71-94 | The confidentiality boundary this spec protects; both gate on the same participant predicate |
| P1047 column-grant allowlist | `20260811150000_p1047_bind_update_clarity_sessions.sql` §1 | The 18-column `GRANT UPDATE (...)` this spec subtracts two columns from |
| P1047 identifier revoke | `20260811180000_p1047_seat_occupancy_and_identifier_lockdown.sql` §2 | `REVOKE UPDATE (id, code, created_at)` — precedent for a column-subset revoke on this table |
| P1047 joiner trigger (live body) | `20260811190000_p1047_revert_seat_occupancy_check.sql` | `clarity_sessions_pin_joiner_profile_id`, SECURITY INVOKER, `current_user` role split. **Non-Goal: not reopened.** |
| P880 guard-trigger + accessor pattern | `20260605120000_p880_trust_column_guard.sql` | The reusable shape: *server-controlled column = SECURITY DEFINER accessor is the only writer + client roles lose the grant*. Also the atomic conditional UPDATE (`set_my_pledge`) |
| Canary + 10 live controls | `e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts` (512 lines) | The `test.fixme` at L351 that moves here; the rejoin-after-leave control at L205; six anonymous practice-room controls (L239, L253, L267, L282, L466, L499) |
| Client-safety authoring gate | `scripts/check-migration-client-safety.sh` | Hard-blocks a staged migration containing `REVOKE … FROM … anon\|authenticated` unless it carries `-- requires-frontend: <sha>` or `-- client-safe: <reason>` |
| SD-guard completeness canary | `src/tests/sd-guard-completeness.test.ts` (`CRITICAL_PREDICATES`, L100-117) | Catches a future `CREATE OR REPLACE` that silently drops a guard from either new RPC |
| History query | `src/app/data/sessions-service.ts:67-68` | `.or('creator_profile_id.eq.X,joiner_profile_id.eq.X')` — the second consumer of the participant meaning |

**No equivalent exists for:** a `claim_joiner_seat` / `release_joiner_seat` RPC, a
`joiner_left_at`-style column, or any server-side occupancy column.
`grep -rn "claim_joiner_seat\|release_joiner_seat\|joiner_left_at" supabase/migrations/ src/ e2e/`
returns only prose references inside P1047's part-5 migration comment, this spec, and the
canary's `fixme` note — no definition anywhere.

#### Exact current state, verbatim from migrations

**UPDATE policy** — net of P1047 parts 1 + 3, byte-identical to what has been live on prod
since `20260415120000` (`20260811170000_p1047_restore_creator_not_null_check.sql`):

```sql
CREATE POLICY clarity_sessions_creator_update ON public.clarity_sessions FOR UPDATE
  USING (
    (target_listener_id IS NULL)
    OR (auth.uid() = target_listener_id)
    OR (auth.uid() = creator_profile_id)
  )
  WITH CHECK (
    (creator_profile_id IS NOT NULL)
    AND ((target_listener_id IS NULL)
      OR (auth.uid() = target_listener_id)
      OR (auth.uid() = creator_profile_id))
  );
```

**SELECT policy** (`20260414100001_p703_letter_sourced_live.sql` §4) — the one Solution
step 5 defers:

```sql
CREATE POLICY "clarity_sessions_select" ON clarity_sessions FOR SELECT
  USING (target_listener_id IS NULL OR auth.uid() IN (target_listener_id, creator_profile_id));
```

**Column grants.** P1047 part 1 dropped table-level UPDATE and re-granted 18 columns; part 4
revoked three of them. The client-writable set today is therefore **15 columns**:

```
creator_name, creator_note, joiner_name, joiner_profile_id, state, demo_status,
partnership_status, expires_at, mode, live_state, is_private, last_activity_at,
source_letter_id, source_story_id, status
```

`id`, `code`, `created_at`, `creator_profile_id`, `target_listener_id` are already
server-only. This spec removes two more — `joiner_name`, `joiner_profile_id` — leaving 13.

**Trigger** `clarity_sessions_pin_joiner_profile_id` (live body = part 5): SECURITY INVOKER,
early-returns on an unchanged column, exempts `current_user IN ('service_role','postgres',
'supabase_admin')`, permits `NEW.joiner_profile_id IS NULL`, else requires
`NEW.joiner_profile_id = auth.uid()`. It has **no occupancy branch** — part 4 added one and
part 5 removed it.

**`code` is `TEXT UNIQUE NOT NULL`** (`20250101_initial_schema.sql:139`), so a
`SELECT … WHERE code = ? FOR UPDATE` locks exactly one row.

#### The vacancy invariant

> **The seat is free if and only if `clarity_sessions.joiner_seat_claimed_at IS NULL`.**
>
> `joiner_seat_claimed_at` is a new `timestamptz` column that appears in **no** client
> `GRANT UPDATE` list. Only `claim_joiner_seat` (sets it to `now()`) and
> `release_joiner_seat` (sets it to `NULL`) ever write it, and neither derives its value
> from a caller-supplied argument. No `anon` or `authenticated` statement — direct PATCH,
> RPC argument, or `live_state` payload — can move a row between occupied and free except
> by calling one of those two functions and satisfying its authorization check.
>
> **`joiner_profile_id` no longer participates in this decision at all.** After this spec it
> carries exactly one meaning: *the profile that participated in this session* — the key
> `session_transcripts`, `transcription_jobs`, `complete_clarity_session`,
> `create_transcription_job`, `retry_transcription` and the history query already read. It
> is set on claim and **never cleared on release**.
>
> `joiner_name` stays nulled on release (the creator's partner-left detection reads
> `!freshSession.joinerName` — `clarity-live-page.tsx:1432`) but is no longer an
> authorization input, and after the revoke it is no longer client-writable either.

That is the separation Done-When #1 asks for: **occupancy → `joiner_seat_claimed_at`
(server-written, never caller-supplied); participation → `joiner_profile_id` (server-written,
append-only per claim).** P1047 part 4 failed because it used the participation column as the
occupancy signal; every alternative signal it could have used (`joiner_name`,
`live_state.joinerEnded`) was client-writable. Both halves are fixed here: a dedicated column
*and* the revoke that makes server-written columns actually server-written.

#### Dependencies — everything that reads or writes the two meanings

| Consumer | Path | Reads | Effect of this change |
|---|---|---|---|
| `session_transcripts` SELECT policy | `20260313120000_p495…sql:71-79` | participant | none — `joiner_profile_id` preserved on release |
| `transcription_jobs` SELECT policy | same file, L86-94 | participant | none |
| `complete_clarity_session` | `20260420140000_p769…sql` | participant | none |
| `create_transcription_job` | `20260313140327_p495…sql` | participant | none |
| `retry_transcription` | `20260313120000_p495…sql:149-162` | participant | none |
| `patch_live_state` | `20260409140000_fix_guest…sql` | `joiner_profile_id = auth.uid()` **and** the guest branch `auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL` | none — SECURITY DEFINER runs as owner, unaffected by client column grants. Guest branch still matches while a guest holds the seat, and stops matching after release, exactly as today |
| `getUserSessions` | `src/app/data/sessions-service.ts:67-68` | participant | none |
| `joinClaritySession` | `src/app/data/api.ts:959-1023` | writes both, occupancy check at `:989` | **rewritten to call `claim_joiner_seat`** |
| `clearSessionJoiner` | `src/app/data/api.ts:1233-1259` | writes `joiner_name: null` + `live_state` | **rewritten to call `release_joiner_seat`** |
| `clarity-live-page.tsx` | `:2924`, `:3179`, `:3718` (join), `:3584` (leave), `:1432` (partner-left detect) | via the two api.ts functions | none, if the api.ts return contracts are preserved |
| `clarity-demo-page.tsx:145`, `clarity-chat-page.tsx:476` | | `joinClaritySession(code, name)` — 2-arg | none. *(The `/demo` `creatorProfileId` argument-order bug is an explicit Non-Goal and stays.)* |
| `AuthContext.tsx:194` | sign-out cleanup, joiner branch only | `clearSessionJoiner(sessionId)` | none |

#### Why the revoke breaks the leave path — the piece most likely to be missed

`clearSessionJoiner` (`src/app/data/api.ts:1245-1256`) issues **one** UPDATE that writes
`joiner_name: null` **and** a full `live_state` object (read-modify-write from a prior
SELECT). Solution step 3 revokes `joiner_name`, so this statement starts returning 42501 for
every client role. The joiner's "End Session" button (`clarity-live-page.tsx:3584`) and the
sign-out cleanup (`AuthContext.tsx:194`) both go through it. Without a server-side
counterpart, revoking `joiner_name` takes the leave path down — the mirror of the outage
P1047 part 4 caused on the join path.

It notably does **not** write `joiner_profile_id` — it simply omits the column, which is why
a vacated row today reads `joiner_name = NULL, joiner_profile_id = <departed user>`.

---

### Architecture Decisions

#### AD1 — Occupancy becomes a dedicated server-written column; `joiner_profile_id` becomes participant-only

**Chosen.** `ALTER TABLE public.clarity_sessions ADD COLUMN joiner_seat_claimed_at timestamptz;`
Never added to any client `GRANT UPDATE`. Backfilled in the same migration:

```sql
UPDATE public.clarity_sessions
   SET joiner_seat_claimed_at = COALESCE(last_activity_at, created_at)
 WHERE joiner_name IS NOT NULL;
```

**Rationale.** Two properties, neither available from `joiner_name` alone.

1. **The vacancy signal must not be caller-supplied data.** `claim_joiner_seat` takes
   `p_joiner_name` as an argument. Deriving "is the seat taken" from `joiner_name IS NOT NULL`
   would make the authorization state a function of attacker-controlled text — an empty or
   whitespace name claims a seat that then reads vacant. `joiner_seat_claimed_at` is written
   by the server as `now()`, with no path from any argument.
2. **The backfill preserves today's occupancy semantics exactly.** `joiner_name IS NOT NULL`
   is precisely the check the client performs today (`api.ts:989`), so no live room changes
   occupancy state at migration time. This is the specific failure of P1047 part 4, which
   silently re-classified every vacated room as occupied and broke rejoin.

**Trade-off.** One more column and one more state variable that must stay in lockstep with
`joiner_name`. Mitigated structurally: both are written only by the two RPCs, always
together, and a `CHECK (joiner_seat_claimed_at IS NULL OR joiner_name IS NOT NULL)` makes
the lockstep enforced rather than conventional. (A table-level CHECK validates all existing
rows at `ADD CONSTRAINT` time — the P858 deferral reason — which is safe here *because the
backfill runs first in the same migration*; verify on test before prod.)

**Alternatives rejected.**
- *`joiner_left_at` (the name in Solution step 1).* Requires a non-NULL default so that a
  brand-new room reads vacant, which inverts the column's own name and makes every INSERT
  path responsible for stamping it. `joiner_seat_claimed_at` gets `NULL = free` for free.
- *Reuse `joiner_name IS NULL` as the invariant.* Cheaper — no column, no backfill — and it
  would work today, because the revoke makes `joiner_name` server-controlled. Rejected on
  point 1: it ties an authorization predicate to a display string supplied by the caller,
  which is the exact pattern this spec exists to remove. It also re-entangles two meanings in
  one column, one product (display) and one security (occupancy), which is how P1047 part 4
  got here.
- *A `clarity_session_participants` join table now.* This is the *correct* long-run model
  (see AD8) and is rejected for this spec only on blast radius: it rewrites the two SELECT
  policies that ARE the confidentiality boundary, plus three RPC predicates and the history
  query, on a backfill whose failure mode is silently revoking transcript access for every
  past participant. Shipping that in the same deploy as the join-path change is the second
  independent way to break `/live` that the founder already refused for the SELECT narrowing.

#### AD2 — `claim_joiner_seat(p_code text, p_joiner_name text)`, SECURITY DEFINER, row-locked

**Chosen.**

```sql
CREATE OR REPLACE FUNCTION public.claim_joiner_seat(p_code text, p_joiner_name text)
RETURNS SETOF public.clarity_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.clarity_sessions;
BEGIN
  IF p_joiner_name IS NULL OR btrim(p_joiner_name) = '' THEN
    RAISE EXCEPTION 'joiner name is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.clarity_sessions
   WHERE code = upper(btrim(p_code))
   FOR UPDATE;                                     -- serializes concurrent claimers

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such room' USING ERRCODE = '42501';
  END IF;

  IF v_row.joiner_seat_claimed_at IS NOT NULL      -- occupied: rejoin only (AD5)
     AND NOT (
       (auth.uid() IS NOT NULL AND v_row.joiner_profile_id = auth.uid())
       OR (auth.uid() IS NULL AND v_row.joiner_profile_id IS NULL
           AND v_row.joiner_name = p_joiner_name)
     )
  THEN
    RAISE EXCEPTION 'joiner seat is already held' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.clarity_sessions
     SET joiner_name             = btrim(p_joiner_name),
         joiner_profile_id       = COALESCE(auth.uid(), joiner_profile_id),
         joiner_seat_claimed_at  = now()
   WHERE id = v_row.id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_joiner_seat(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_joiner_seat(text, text) TO anon, authenticated;
```

**Rationale.** `p_code`, never a session id, per the founder decision in Solution step 4 —
combined with the AD6 revoke this is what makes Done-When #4 hold (a caller holding only the
freely-readable `id` has no way to claim). `SELECT … FOR UPDATE` is the atomic-conditional
idiom already used by `set_my_pledge` (decisions.md 2026-06-05); two simultaneous claimers
serialize on the row lock, and the loser re-reads `joiner_seat_claimed_at` after acquiring it.
`SET search_path = public` because the UPDATE fires two existing triggers
(`clarity_sessions_pin_joiner_profile_id`, `trg_prevent_is_private_change`) — decisions.md
2026-06-06 records that a write RPC firing legacy triggers under `search_path = ''` fails
with 42P01. `REVOKE ALL … FROM PUBLIC` before the grants, per decisions.md 2026-08-10: role
reachability is decided by the REVOKE, not the GRANT. Returning `SETOF clarity_sessions`
keeps `joinClaritySession`'s single round trip and its existing `ClaritySession | null`
contract, so none of the five call sites change shape.

**Trade-off.** `RETURNS SETOF public.clarity_sessions` couples the function signature to the
table's column list — a later `ADD COLUMN` changes the RPC's return type. Accepted: the
alternative (returning a narrow composite) would force `joinClaritySession` into a second
SELECT, adding a network hop and a window in which the claimed row can change.

**Alternative rejected.** *Two separate RPCs, `claim` and `rejoin`.* Two authorization paths
and two canary sets for one seat — the same reason the founder rejected splitting on
`creator_profile_id IS NULL`.

#### AD3 — `release_joiner_seat(p_session_id uuid)` is the leave-path counterpart

**Chosen.**

```sql
CREATE OR REPLACE FUNCTION public.release_joiner_seat(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.clarity_sessions
     SET joiner_name            = NULL,
         joiner_seat_claimed_at = NULL,
         -- joiner_profile_id deliberately UNTOUCHED: the departed participant keeps
         -- transcript + history access. This is the whole point of the separation.
         live_state = COALESCE(live_state, '{}'::jsonb)
                      || jsonb_build_object('joinerEnded', true,
                                            'joinerEndedAt', now()::text)
   WHERE id = p_session_id
     AND joiner_seat_claimed_at IS NOT NULL
     AND (
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       OR (auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL)
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not the seated joiner' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_joiner_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_joiner_seat(uuid) TO anon, authenticated;
```

**Rationale.** Takes `p_session_id` because both callers already hold the id and nothing else
(`clarity-live-page.tsx:3584` from `session.id`; `AuthContext.tsx:194` from
`sessionStorage.getItem('clarity_live_session_id')`) — a code-keyed signature would force a
lookup at both sites for no security gain, since the authorization here is "are you the
occupant", not "do you hold the capability". The anonymous branch is a **verbatim reuse** of
`patch_live_state`'s guest predicate (`20260409140000_fix_guest_patch_live_state.sql`), so
guest release is reachable exactly where guest state-writes already are. The `live_state`
merge (`||`, not a full object) folds `clearSessionJoiner`'s current read-modify-write into
one statement, removing a lost-update window the P399 contract in
`docs/technical/database.md` warns about. This directly closes Problem symptom 2 (seat
erasure): an unauthenticated caller can no longer strip a *signed-in* joiner's seat, because
the anonymous branch requires `joiner_profile_id IS NULL`.

**Trade-off.** Residual: any anonymous caller holding a session id can still release a seat
held by an *anonymous* guest. Accepted, and strictly narrower than today (where any caller can
erase any seat, signed-in included). No transcript access is at stake — `session_transcripts`
gates on a non-NULL `auth.uid()`, which a guest never has. It is the same exposure
`patch_live_state` has accepted since P671; closing it needs the deferred SELECT-narrowing
spec, which removes free id enumeration.

**Alternatives rejected.**
- *Let the creator release the joiner's seat too.* No call site does this (the creator's exit
  path is `completeClaritySessionKeepalive` → `complete_clarity_session`), so it would be
  privilege with no consumer.
- *Add `joiner_left_at` and leave `joiner_name` set on release.* Breaks the creator's
  partner-left detection at `clarity-live-page.tsx:1432`, which fires on
  `!freshSession.joinerName`, and would take the grace-period/PartnerLeftScreen flow down.

#### AD4 — Anonymous joiners claim a real seat with a NULL participant id

**Chosen.** `claim_joiner_seat` writes `joiner_profile_id = COALESCE(auth.uid(), joiner_profile_id)`;
for an anonymous caller `auth.uid()` is NULL, so an existing (departed) participant id is
preserved rather than overwritten, and a never-joined room stays NULL. Occupancy is carried
entirely by `joiner_seat_claimed_at`, which is set identically for guests and signed-in users.

**Rationale.** Anonymous practice rooms are the flow P1047 part 4 broke and the reason six of
this file's controls exist. Decoupling occupancy from `joiner_profile_id` is what finally lets
a guest hold a seat that the database can see: today "guest is seated" and "seat is free" are
the same row shape (`joiner_profile_id IS NULL`). Preserving a prior participant id under a
guest claim also means a guest join does not silently destroy a previous signed-in
participant's transcript access.

**Trade-off.** A room can transiently hold `joiner_profile_id = <past signed-in user>` while
a *guest* occupies the seat. That grants the past participant no new access (they were already
a participant) and grants the guest none (they have no uid). It does mean `joiner_profile_id`
is not readable as "the current occupant" — which is the invariant, stated deliberately.

**Alternative rejected.** *Null `joiner_profile_id` on a guest claim.* Restores the "one
column, one occupant" intuition at the cost of stripping the previous participant's transcript
access — the exact harm Risk 2 forbids.

#### AD5 — Rejoin-after-leave and same-occupant rejoin both stay open, by different rules

**Chosen.** Free seat → anyone with the code claims. Occupied seat → refuse, **except**:
(a) `auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid()` — the seated signed-in user
refreshing/rejoining; (b) `auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name =
p_joiner_name` — a guest re-entering the guest seat they hold.

**Rationale.** Rejoin-after-leave (P1047's must-stay-green control, spec Risk 1) is now the
*free-seat* path, not an exception: `release_joiner_seat` nulls
`joiner_seat_claimed_at`, so the next claimer sees a genuinely free seat regardless of who
the previous participant was. That is the whole fix for P1047 part 4's outage. Branch (a)
covers `clarity-live-page.tsx:3179` (rejoin prompt) and `:3718` (mic-permission retry), which
call `joinClaritySession` against a room the user may still hold. Branch (b) preserves the
same-name guest rejoin that `api.ts:991-993` implements today.

**Trade-off.** Branch (b) lets an anonymous caller who knows the code *and* the occupant's
display name re-enter a guest-occupied room. `joiner_name` is readable through the wide anon
SELECT, so this is guessable. Accepted: it is today's behavior verbatim, it moves no
`joiner_profile_id`, and it exposes no transcript (guest seats have no uid). Branch (b)
explicitly requires `joiner_profile_id IS NULL`, so an anonymous caller can **never** re-enter
a seat a signed-in user holds; and branch (a) requires a non-NULL `auth.uid()` match, so a
signed-in user can never attach their uid to a guest-held seat and inherit its transcript.

**Alternative rejected.** *Refuse all claims on an occupied seat.* Breaks the mic-retry and
rejoin-prompt paths, whose UI symptom is the "Session not found or already full" screen
rendered after the mic prompt was granted — the exact regression shape P1047 part 4 produced.

#### AD6 — The revoke is the load-bearing step, and it is frontend-coupled

**Chosen.** A **separate** migration, applied after the RPC migration:

```sql
REVOKE UPDATE (joiner_name, joiner_profile_id) ON public.clarity_sessions FROM anon, authenticated;
```

carrying `-- requires-frontend: <origin/main frontend sha>` as its first annotation.

**Rationale.** Without it the RPC is decorative and closes nothing (spec Risk 3) — the direct
PATCH path stays open and the vacancy signal stays forgeable. A **column**-level REVOKE is
correct here (not a table REVOKE + re-grant), because P1047 part 1 already dropped the
table-level grant and re-granted per column; the P877/P886 no-op trap applies only while the
role still holds a table grant, and it does not. `check-migration-client-safety.sh` will hard
block this file without the annotation, and `migrate.sh --env prod` will refuse the apply
until that sha is an ancestor of `origin/main` — which is the mechanism that prevents the
P886 shape (a gate applied under a bundle that still writes the revoked columns). Splitting
into two files is what makes the "RPC alone is decorative" state observable on test, and gives
a granular rollback.

**Trade-off.** Two prod applies instead of one, and a mandatory frontend-first ordering.
Accepted — that ordering is the *only* thing standing between this change and a repeat of the
P886 outage.

**Alternative rejected.** *One migration containing column, RPCs and revoke.* Cheaper to
apply, but the revoke's coupling annotation would then also block the additive half, and the
decorative-RPC intermediate state could not be exercised.

#### AD7 — P1047's trigger stays untouched and becomes defense-in-depth

**Chosen.** No change to `clarity_sessions_pin_joiner_profile_id` (explicit Non-Goal).

**Rationale.** After AD6 no client role can reach the trigger's client branches at all — a
column-privilege rejection fires before any trigger runs. It survives as a second layer if a
future migration re-grants the column. It cannot block either new RPC: SECURITY DEFINER sets
`current_user` to the function owner (exempted), and even if the owner were an unexempted
role, `auth.uid()` is preserved inside SECURITY DEFINER so a signed-in claim satisfies
`NEW.joiner_profile_id = auth.uid()` and a guest claim takes the `NEW.joiner_profile_id IS
NULL`/unchanged early-return. **This is reasoning, not evidence** — the build sequence
requires the claim canaries to pass on test before it is treated as established.

#### AD8 — What this deliberately does not close

**Chosen.** Two follow-up specs are filed before this one closes.

1. ~~**Anon SELECT narrowing**~~ — **superseded.** The founder reversed the step-5 deferral once
   the Security Review established that `code` is anon-readable, which made the bearer-token
   decision inert. A **column-level SELECT split** (not the row-predicate narrowing this item
   originally described) is now in scope — see Solution step 5 and AD9. The row predicate
   `target_listener_id IS NULL` still exposes non-`code` columns to anon and remains deferred;
   that residue is what the follow-up spec covers.
2. **`joiner_profile_id` is a one-slot column.** *New finding from this analysis, not in the
   spec text.* When a signed-in joiner A leaves and a **different** signed-in joiner B claims
   the freed seat, `claim_joiner_seat` overwrites `joiner_profile_id` with B — and A loses
   transcript, job and history access. This is **pre-existing** (today's `joinClaritySession`
   UPDATE at `api.ts:1001` does exactly the same overwrite) and this spec neither creates nor
   fixes it. The fix is the `clarity_session_participants` join table rejected in AD1, with
   the two transcript SELECT policies and three RPC predicates widened to read it. It must be
   filed alongside (1).

**Rationale.** Both are separate blast radii on the confidentiality boundary; folding either
into this deploy gives two independent ways to break `/live` at once.

#### AD9 — `code` leaves the anon SELECT surface via a column grant, not a policy change

*Added after the Security Review, on the founder's reversal of the step-5 deferral.*

**Chosen.** `REVOKE SELECT ON public.clarity_sessions FROM anon, authenticated;` then
`GRANT SELECT (<every column except code>) … TO anon, authenticated;` — the P877/P886 idiom,
already proven twice in this repo on `profiles`. Plus two SECURITY DEFINER read RPCs,
`get_session_by_code(p_code text)` and `get_active_session_by_code(p_code text)`, carrying the
same `search_path = public` pin, the same `REVOKE ALL FROM PUBLIC` + explicit `GRANT EXECUTE`,
the same `upper(btrim(p_code))` normalization and length guard, and the same generic failure as
`claim_joiner_seat` (AD2 + Reconciliation items 1-2). `get_active_session_by_code` keeps the
grace-period and ended-session logic currently at `api.ts:1200-1222` server-side.

**Rationale.** The privilege layer, not the policy predicate — the same lever P1047 chose, for
the same reason: the null-target row branch is load-bearing for anonymous practice rooms, so
narrowing the *predicate* risks taking guest rooms down, while narrowing the *column grant*
cannot. It also makes the bearer-token decision actually mean something: after this, possession
of the code is a fact about the holder rather than a fact about the public.

**Trade-off.** Postgres requires column SELECT privilege to reference a column in a `WHERE`
clause, so this is not a pure subtraction — four client lookups must move. Two are already
moving to `claim_joiner_seat`; the other two become the RPCs above. Accepted: the alternative
leaves the spec's central mechanism decorative.

**Alternative rejected.** *Row-predicate narrowing* — refused by the founder before the Security
Review and still correct to refuse: it is the one change that can make practice rooms
unreachable, and it would ship in the same deploy as the join-path rewrite.

**Watch item for `/dev`.** `mapSessionFromDb` reads `dbSession.code` (`api.ts:853`) and
`ClaritySession.code` is consumed by the share-link builder
(`clarity-live-page.tsx:4357`). The creator still needs its own room code — it mints the code
client-side today (`api.ts:918-919`), so it holds the value without reading it back, but the
post-INSERT `.select()` and every read path must be re-checked for a now-forbidden `code`
projection. **This is the most likely source of a silent 42501 in this spec** — enumerate the
projections before writing the migration.

---

### Security Review

*Live counts and the telemetry-sink inventory are deliberately not in this public file —
`.private/docs/security-log.md` 2026-08-12. Not applicable: AI Prompt Security (no LLM call).*

**RLS Policies:**

- ⚠️ **BLOCKER — the bearer token is published by the SELECT policy step 5 defers, so step 4
  currently buys nothing.** `clarity_sessions_select` is `USING (target_listener_id IS NULL OR
  auth.uid() IN (target_listener_id, creator_profile_id))`
  (`20260414100001_p703_letter_sourced_live.sql:124-129`) — row-level only. There is no
  column-level SELECT grant on this table: `grep -rn "GRANT SELECT (" supabase/migrations/*.sql`
  returns hits for `profiles` only (P877/P886). So `code` is returned in full to an
  unauthenticated caller on every null-target row. Attacker: anyone holding the public anon key,
  which ships in the bundle. Action: one HTTP GET. Result: the room codes, which under step 4
  *are* the join capability. Step 4's stated leverage — "the freely-readable room *id* stops
  being a join key" — does not hold while `code` sits in the same freely-readable row. **The two
  founder decisions are individually reasonable and jointly incoherent.** The RPC shape is right;
  the deferral is what breaks.
  **→ RESOLVED 2026-08-12:** the founder reversed the step-5 deferral on this evidence. Closed by
  AD9's column-level SELECT split (not the row-predicate narrowing, which stays rejected).
- ⚠️ **Revoking `joiner_name` breaks the joiner's "End Session" button with 42501** —
  `clearSessionJoiner` (`api.ts:1233-1260`) is a direct table UPDATE, not an RPC. Self-inflicted,
  the P886 shape. Closed by AD3's `release_joiner_seat` + the frontend-first deploy order.
- ✅ **The P877/P886 no-op trap does not bite this revoke.** Trap 1 is that a column REVOKE is a
  no-op while the role holds the table grant. P1047 part 1 already dropped the table-level grant
  and re-granted 18 columns (`20260811150000…:71-90`), and part 4 removed three the same way
  (`20260811180000…:110`). A plain `REVOKE UPDATE (joiner_name, joiner_profile_id)` takes effect.
  **Do not re-run the drop-and-re-grant dance** — re-granting 18 columns to fix 2 is how a column
  gets silently restored.
- ✅ **The new vacancy column is client-unwritable for free** — the P1047 allowlist makes any new
  column default-deny for `anon`/`authenticated`. Say so in the migration header so a future "add
  it to the allowlist for consistency" edit is visibly wrong.
- ⚠️ **The table is not closed after this lands.** The UPDATE policy still admits anon on
  null-target rows, and the allowlist still grants `creator_name`, `creator_note`, `state`,
  `live_state`, `mode`, `expires_at`, `last_activity_at` and others — an anonymous caller can
  still rewrite the creator's displayed name and note. Not this spec's job; the spec must not
  imply otherwise.

**Authentication:**

- ✅ **`auth.uid()` survives SECURITY DEFINER** — it reads `request.jwt.claims`, a GUC; DEFINER
  changes the executing role, not the GUC. Live precedent: `patch_live_state`
  (`20260409140000_fix_guest_patch_live_state.sql:19-45`). **Invariant for the migration header:
  the function must never accept a profile id as a parameter and never read one from the payload.**
  A third parameter is the whole vulnerability re-introduced behind a server-side-sounding name.
- ⚠️ **SECURITY DEFINER silently disables the P1047 trigger, making the RPC the sole enforcement
  point.** `clarity_sessions_pin_joiner_profile_id` exempts trusted roles; inside a DEFINER
  function `current_user` **is** the owner, so the trigger takes the exemption branch and checks
  nothing. A future edit setting `joiner_profile_id` to anything but `auth.uid()` would be caught
  by nothing, and the P1047 canary would stay green because it drives the direct-UPDATE path.
  **Required: a canary that drives the RPC** and asserts an authenticated attacker cannot end up
  as `joiner_profile_id` on a seat held by someone else. Contradicts AD7's "defense-in-depth"
  framing — the trigger is structurally off on this path.
- ⚠️ **Two SECURITY DEFINER functions in this blast radius have no `search_path` pin** —
  `create_transcription_job` (`20260313140327_p495…:5-36`) and `retry_transcription`
  (`20260313120000_p495…:149-182`) both reference `clarity_sessions` unqualified. Pre-existing;
  exploitability depends on whether `anon`/`authenticated` hold CREATE on any schema, **which is
  unverified — the defect is confirmed, the exploitability is not.** Filed as follow-up (AD8).
  **`claim_joiner_seat` must use `SET search_path = public`, not `SET search_path = ''`** —
  `docs/decisions.md:5253` records that an empty search_path 42P01s write RPCs whose statements
  fire legacy triggers, and this table carries two BEFORE UPDATE triggers.
- ⚠️ **Grant the RPC explicitly.** P877 trap 3: `REVOKE EXECUTE … FROM PUBLIC` is insufficient
  because Supabase default privileges grant EXECUTE to `anon`/`authenticated` by name. Here the
  RPC *must* be anon-callable, so the failure direction is inverted, but the fix is the same
  shape: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE … TO
  anon, authenticated;` — explicit, readable from the migration rather than inherited.

**Authorization:**

- ⚠️ **TOCTOU race 1 — two callers claim the same free seat.** A read-then-branch-then-write RPC
  under READ COMMITTED lets both read the seat free; the second UPDATE blocks on the row lock,
  then **proceeds and overwrites**. Result: both clients render as seated, and the first
  participant's `joiner_profile_id` is gone — they lose transcript SELECT mid-session. **Required
  form:** a single `UPDATE … WHERE code = upper(trim(p_code)) AND <vacancy predicate> RETURNING
  id INTO v_id;` then raise if `v_id IS NULL`. Postgres re-evaluates the WHERE after the lock
  (EvalPlanQual), so the loser matches zero rows. If the body must read-then-branch, it needs
  `SELECT … FOR UPDATE` with the vacancy test evaluated **after** the lock. In-repo precedent:
  `claim_pending_job` (`20260601120100_p858…:46`).
- ⚠️ **TOCTOU race 2 — clear-then-claim survives, because `live_state` stays client-writable.**
  Step 3 revokes only the two joiner columns. `live_state` remains in the P1047 allowlist and is
  *also* writable by an unauthenticated caller through `patch_live_state`'s guest branch, keyed
  on session id alone. An attacker clears `sessionEnded`/`joinerEnded`, then claims — re-opening
  a closed session and taking its transcript. **Consequence for the design: the vacancy predicate
  must read only columns outside the client UPDATE allowlist**, and `claim_joiner_seat` must not
  gate on `live_state` for its ended-session check, because that check is forgeable. AD2 must
  state which column carries the ended-session signal.
- ⚠️ **Any expiry gate in the RPC is client-forgeable** — `expires_at` is in the allowlist. It is
  `NULL` by design on this table, so the resolution is: **do not gate on expiry at all.**
- ⚠️ **Code entropy as a capability.** Generator at `api.ts:838-845`: alphabet
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars), length 6 → keyspace 32⁶ = **1,073,741,824**
  (2³⁰). No rate limit exists on this path — `grep -rn "rate_limit" supabase/migrations/` returns
  only `ai_rate_limits` (P425, per-user, edge-scoped) and `search_rate_limits` (P878); no per-IP
  throttle on PostgREST RPC in any migration, and any platform-level limit is **unverified**.
  Because sessions never expire the population grows monotonically and guessing cost falls
  linearly. **2³⁰ is below what a bearer capability needs — but it is the wrong number to argue
  about while the codes are simply listed (finding 1).**
- ⚠️ **The code is minted by the client, so the server has no guarantee of its entropy.**
  `createClaritySession` sends `code` in the INSERT payload (`api.ts:918-919`) and the INSERT
  policy constrains verified-host and letter ownership but says nothing about `code`. A modified
  client can INSERT `code = 'AAAAAA'`, and `code TEXT UNIQUE` lets it squat memorable codes.
  `generateRoomCode` also uses `Math.random()`, which is **not** a CSPRNG (V8: xorshift128+,
  state recoverable from a short run of outputs). No cross-user prediction attack was
  constructed and none is claimed — the point stands without it: **a value that authorizes
  reading a private transcript must be server-minted**, via a DEFAULT or a create-session RPC,
  so no client can weaken it.
- ⚠️ **The capability is not revocable.** `code` UPDATE was revoked from clients by P1047 part 4,
  so only `service_role` can rotate a leaked code; there is no rotation path in `src/` and
  `expires_at` is NULL by design. Every historical leak stays live forever. Minimum viable
  answer: a `rotate_session_code` RPC gated on `creator_profile_id = auth.uid()`, or a
  `revoked_at` column the RPC checks. Neither is in the spec.
- ⚠️ **The RPC must not become an existence oracle.** Distinguishable "no such code" vs "seat
  occupied" failures let an attacker confirm valid codes at the cheaper rate and enumerate the
  seated (= transcript-bearing) subset. **Return one generic failure to the client**; put the
  distinction in a server-side log only.

**Input Validation:**

- ⚠️ **`p_code` must be normalized inside the RPC.** The `toUpperCase().trim()` lives in the
  client today (`api.ts:964`). If the RPC matches the raw parameter, any lowercase or padded code
  fails to resolve — surfacing as "Session not found or already full" *after* the mic prompt,
  which is precisely the P1047 part 4 signature the Risks section forbids. Use `WHERE code =
  upper(trim(p_code))`; precedent at `20260415130000_p703…:66`.
- ⚠️ **`p_code` needs a length guard as the first statement** — otherwise an unauthenticated
  caller can pass a multi-megabyte string that `upper(trim(…))` materializes per request. It also
  makes failure timing uniform, which helps the oracle concern above.
- ⚠️ **Empty or NULL `p_joiner_name` creates a row that looks vacant but is occupied** if the
  vacancy signal ever falls back to `joiner_name IS NOT NULL` (what the client checks today at
  `api.ts:989`). Require non-empty after trim.
- ⚠️ **Do not carry the name-equality rejoin into the RPC.** `joinClaritySession` returns the
  session when `existing.joiner_name === joinerName` (`api.ts:992-994`), and `joiner_name` is
  anon-readable — the attacker is handed the value that bypasses the check. The rejoin path is
  live (`handleRejoin` → `joinClaritySession`, `clarity-live-page.tsx:3171-3181`), so the RPC
  needs an explicit rejoin branch: for a signed-in caller `joiner_profile_id = auth.uid()`
  identifies them; for a guest, possession of the code is the model and a name check adds nothing.
  **Name equality must not be the discriminator** — AD5 must not reuse it.
- ✅ **No SQL injection surface** provided the body stays parameterized. Header invariant: no
  `EXECUTE format(...)` in this function, ever.
- ✅ **A `joiner_name` length cap already exists** — `CHECK (length(joiner_name) <= 100)`
  (`20260223_p396_host_rls_and_session_constraints.sql:53`). The RPC should still raise a clean
  error rather than surfacing a raw 23514.

**Data Protection:**

- ⚠️ **BLOCKER — one column cannot hold two participants, and a vacancy column legitimizes the
  breach rather than fixing it.** `session_transcripts` has one row per `session_id` with no
  participant column (`20260313120000_p495…:13-23`), and both transcript tables gate SELECT
  solely on `cs.creator_profile_id = auth.uid() OR cs.joiner_profile_id = auth.uid()`
  (*ibid.*:71-95). Sequence: joiner A participates and leaves; the seat is marked free while
  `joiner_profile_id` is deliberately kept (per the spec's own MITIGATE risk); joiner B
  legitimately claims the free seat. `claim_joiner_seat` writes B's uid into the one slot. **A
  silently loses SELECT on the transcript of the conversation A was in, and B gains it** —
  attacker: a legitimate second joiner, doing nothing wrong. **Done-When #1 is therefore not
  satisfiable by a vacancy column alone**: a vacancy flag separates occupant from ex-occupant,
  but the ACL needs the *set of participants* — a `session_participants` join table plus a
  rewrite of both transcript SELECT policies. AD1/AD8 correctly identify this as pre-existing
  (today's `api.ts:1001` UPDATE overwrites identically) and defer it. **The risk of deferring is
  that this spec ships green with the confidentiality gap open.**
  **→ RESOLVED 2026-08-12:** founder defers the join table (its backfill failure mode is mass
  transcript revocation, which must not share a deploy with the join-path change) and instead
  **corrected the claim** — Done-When #1 now ticks only against the occupancy/participation
  separation and names this gap explicitly. The green-on-a-false-claim risk is what got closed.
- ⚠️ **The code travels in the URL path (`/live/:code`, `src/App.tsx:739`) and reaches
  third-party telemetry at full sampling, including one explicit cleartext capture on the join
  error path (`api.ts:1017`).** If the code is the authorization capability, these are credential
  logging. The join-flow capture is a one-line fix — replace `sessionCode` with a non-reversible
  discriminator. Sink inventory and sampling settings: `.private/docs/security-log.md` 2026-08-12.
- ✅ **Referer leakage to third parties is already closed** — `vercel.json:150` sets
  `Referrer-Policy: strict-origin-when-cross-origin`. Stated plainly so the finding above is not
  read as a general "URLs leak everywhere" claim.

**The P877/P886 verification step, concretely (Done-When #7):** two checks, on **prod**, **after**
the migration applies. (1) `SELECT relacl FROM pg_class WHERE relname = 'clarity_sessions';` shows
no bare `w` for `anon`/`authenticated`, and `information_schema.column_privileges` does not list
`joiner_name` or `joiner_profile_id` for those roles. (2) Behavioural: an anon PATCH setting
`joiner_name` on a null-target row returns **42501**. **Assert the error code specifically** —
PostgREST returns HTTP 204 with no error when `USING` filters a row out, and 42501 only when a
column privilege rejects, so `expect(error).not.toBeNull()` is insufficient and
`expect(status).toBe(204)` is actively wrong. Re-read the row through a service-role client to
confirm the value did not change. Per gate 7, run this against the **pre**-migration state and
confirm it fails first.

---

### Reconciliation — Security findings that amend AD2

Merged by the parent agent. Two are mechanical; two need a decision before `/dev`.

**Mechanical — apply to AD2's body as written:**

1. **Add a `p_code` length guard as the first statement.** `IF p_code IS NULL OR
   length(btrim(p_code)) <> 6 THEN RAISE …` — without it an unauthenticated caller passes a
   multi-megabyte string that `upper(btrim(…))` materializes per request. It also equalizes
   failure timing, which serves (2).
2. **Collapse the two failure messages into one generic error.** AD2 raises `'no such room'` and
   `'joiner seat is already held'` distinguishably; that is an existence oracle letting an
   attacker confirm valid codes at the cheaper rate and enumerate the seated (= transcript-
   bearing) subset. Return one message to the client; keep the distinction in a server-side log.

**Needs a decision — do not implement AD2 as written until resolved:**

3. **AD2's guest-rejoin branch is the name-equality discriminator Security rules out.**
   `(auth.uid() IS NULL AND v_row.joiner_profile_id IS NULL AND v_row.joiner_name =
   p_joiner_name)` gates rejoin on a value the anon SELECT hands the attacker — so a code-holder
   reads the guest's name, resubmits it, and takes the guest's occupied seat. Removing the branch
   without a replacement breaks guest rejoin, which is a live flow. The two coherent resolutions:
   **(a)** accept that anonymous seats are claimable by any code-holder and write it down as the
   practice-room model, or **(b)** have `claim_joiner_seat` mint a per-seat secret on claim,
   return it once, and require it for rejoin — the only option that gives an anonymous
   participant an identity the attacker cannot read. This is the one place where "no identity"
   and "no seizure" genuinely conflict.
4. **AD2 performs no ended-session check, so the P921 guard is bypassable through the RPC.**
   Today that guard lives in `joinClaritySession`'s client-side pre-flight; the RPC does not
   reproduce it, so a direct RPC call claims a seat on an ended session. Adding the check is not
   straightforward: the only signals (`live_state.sessionEnded` / `joinerEnded`) stay in the
   client UPDATE allowlist and are writable by an unauthenticated caller through
   `patch_live_state`, so gating on them is forgeable (TOCTOU race 2 — clear the flag, then
   claim, and a closed session re-opens with its transcript). Resolving this needs either a
   server-written `ended_at` column outside the allowlist, or an explicit decision that ended
   sessions stay claimable.

---

### Implementation Approach

**Worktree recommended:** this touches two migrations, four source files and two test files,
and it changes column privileges on the table every `/live` session writes. The slot is
already claimed — **w2**, `.claude/worktrees/w2`, branch for P1053. Do not author migrations
in the main checkout; note that a worktree's `supabase/` is a real checkout, so applying to
prod runs from the **main** checkout per `docs/technical/worktree-setup.md`.

#### Build Sequence

The order below exists so that **every gate is watched failing before it is trusted**
(epistemic gate 7) and so the decorative-RPC state (spec Risk 3) is observable rather than
assumed.

1. **Baseline.** Run `e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts` on
   test. Record the pass/fail/fixme counts. Anything already red is pre-existing and must be
   reported, not worked around.
2. **Write the canaries first — and watch them fail.** Create
   `e2e/integration/p1053-join-authorization.spec.ts` with four tests, none of which can pass
   before step 5:
   - *seat seizure* — moved verbatim from the `test.fixme` at
     `p1047-reproduce-clarity_sessions-update.spec.ts:351`, with `test.fixme` → `test`
     (Done-When #2);
   - *seat erasure* — an anonymous caller cannot strip a **signed-in** joiner's seat, asserted
     by re-reading `joiner_profile_id` through the admin client (Done-When #3);
   - *id-only claim* — a caller holding only `id` (never `code`) cannot claim a free seat, via
     both a direct PATCH and an attempted RPC call (Done-When #4);
   - *code-bearer claim* — a caller holding the `code` **can** claim a free seat through the
     RPC (the positive control that stops the fix from being "deny everything");
   - *seizure through the RPC* — **distinct from the first canary, which drives a direct PATCH.**
     Inside a SECURITY DEFINER function `current_user` is the owner, so P1047's trigger takes its
     trusted-role exemption and checks nothing: the RPC is the sole enforcement point on this
     path, and the direct-UPDATE canary would stay green while it regressed. Assert an
     authenticated attacker calling `claim_joiner_seat` on an occupied seat cannot end up as
     `joiner_profile_id`, re-read through the admin client;
   - *concurrency* — two claimers race one free seat, exactly one wins, and the loser's
     `joiner_profile_id` is not the value that persists (TOCTOU race 1).

   Run them. **Expected: all four fail** — the first three because the exploit is live, the
   fourth because `claim_joiner_seat` does not exist yet (`42883`). Paste the failure output;
   a canary that has not been seen red is unproven.
3. **Fix the fixtures before they lie.** `seedVictimSession` seeds `joiner_name: 'guest'` with
   no occupancy column, and the seizure test seats a joiner via an admin UPDATE of
   `{joiner_name, joiner_profile_id}`. Under the new invariant those rows read **free**, so
   the seizure canary would pass vacuously after the fix. Every fixture that means "this seat
   is occupied" must also set `joiner_seat_claimed_at`. This is the gate-7b failure mode —
   the fixture cannot emit the input the assertion needs — and it is the single easiest way
   for this spec to ship green and closed.
4. **Migration A (additive, `-- client-safe:`).**
   `supabase/migrations/20260812120000_p1053_joiner_seat_claim_rpcs.sql` — the column, the
   backfill, the optional CHECK, and both RPCs with their `REVOKE ALL FROM PUBLIC` + grants.
   Apply to test. Re-run step 2's canaries: **the first three still fail.** That is the
   evidence for spec Risk 3 — an RPC without the revoke closes nothing. Re-run the P1047 file:
   all controls still green (the column alone changes no behavior).
5. **Migration B (`-- requires-frontend: <sha>`).**
   `supabase/migrations/20260812130000_p1053_revoke_client_joiner_writes.sql` — the two-column
   REVOKE. Apply to test. Re-run: **all four P1053 canaries green.** Verify the revoke landed
   by reading `information_schema.column_privileges` (not `pg_policies`) — a REVOKE that
   silently no-ops is the P877/P886 failure named in Done-When #7.
5b. **Migration C — the AD9 column-level SELECT split.** Before writing it, enumerate every
    `code` projection in `src/` (start from `mapSessionFromDb` at `api.ts:853` and the four
    `.eq('code', …)` sites) — a missed projection is a silent 42501 on a path that works today.
    Apply to test. Re-run: the `code`-readability canary flips green, and the anon read of a
    null-target row **without** `code` must still succeed. Verify via
    `information_schema.column_privileges`, not `pg_policies` — the policy is unchanged by
    design, so a policy-level check proves nothing here.
6. **Migrate the three P1047 controls that assert a removed capability.** These are
   test changes to accommodate an intentional spec change, and must be called out explicitly
   under `.claude/rules/tests.md` rather than made quietly:
   `control: anonymous guest can still set joiner_name` (L239),
   `control: an authenticated user can claim the joiner seat for themselves` (L304), and
   `control: a signed-in user can join a room a previous signed-in joiner left` (L205) all
   perform a **direct UPDATE** of `joiner_name` / `joiner_profile_id`. That capability is what
   this spec removes by design. Each must be rewritten to exercise the same user flow through
   `claim_joiner_seat`, **not** deleted — they are the anonymous-practice-room and
   rejoin-after-leave guarantees Done-When #6 requires. The other controls
   (`state`, `live_state`, `demo_status`, `patch_live_state`, `legacy null-creator`,
   `service_role reassign`, `creator writes joined room`, `code rewrite`) are unaffected and
   must stay green untouched.
7. **Client cutover.** Rewrite `joinClaritySession` and `clearSessionJoiner` (see Files to
   Modify). Preserve both return contracts. Run `npm test` + the /live e2e set.
8. **Regenerate `src/app/types/supabase.ts`** for the new column and two RPCs.
9. **Add a `CRITICAL_PREDICATES` entry** to `src/tests/sd-guard-completeness.test.ts` pinning
   `claim_joiner_seat` / `joiner_seat_claimed_at IS NOT NULL` and `release_joiner_seat` /
   `joiner_profile_id = auth.uid()`, so a future `CREATE OR REPLACE` from an old base cannot
   silently drop either guard (the P952/P975 class). Verify the canary fires by deleting the
   needle locally and confirming a non-zero exit.
10. **File the follow-up specs** — AD8's two (anon SELECT narrowing, Done-When #5; and the
    single-slot participant column), plus three raised by the Security Review and not closed
    here: (a) `create_transcription_job` and `retry_transcription` have no `search_path` pin
    (defect confirmed, exploitability unverified); (b) the room code is client-minted with
    `Math.random()` and must become server-minted from a CSPRNG; (c) a leaked code is
    unrevocable — no rotation path and `expires_at` is NULL by design.
11. **Deploy, frontend first.** Push the bundle; confirm it is live; stamp Migration B's
    `requires-frontend` sha; then `migrate.sh --env prod`. Re-read the prod grants after the
    apply. Update `.private/docs/security-log.md`. Prod migration and push are
    **ALWAYS-ASK** — do not run either without explicit approval in the same turn.

#### Files to Create

- `supabase/migrations/20260812120000_p1053_joiner_seat_claim_rpcs.sql` — `joiner_seat_claimed_at`
  column + backfill + optional CHECK + `claim_joiner_seat` + `release_joiner_seat` + grants.
  Header: `-- client-safe: additive column and two new functions; no grant or policy is narrowed.`
- `supabase/migrations/20260812130000_p1053_revoke_client_joiner_writes.sql` —
  `REVOKE UPDATE (joiner_name, joiner_profile_id) … FROM anon, authenticated`.
  Header: `-- requires-frontend: <sha>` (fill at ship time; `migrate.sh` blocks prod until it
  is an ancestor of `origin/main`).
- `supabase/migrations/20260812140000_p1053_code_column_select_split.sql` (AD9) — the
  `REVOKE SELECT` + per-column `GRANT SELECT` excluding `code`, plus `get_session_by_code` and
  `get_active_session_by_code` with their pins and grants.
  Header: `-- requires-frontend: <sha>` — this one breaks `getClaritySession` and
  `getActiveSessionByCode` the moment it lands, so it deploys **after** the bundle that stops
  selecting `code`, exactly like Migration B.
- `e2e/integration/p1053-join-authorization.spec.ts` — the six canaries from step 2, plus a
  `code`-readability canary: an anon GET selecting `code` on a null-target row is rejected, and
  the same GET without `code` still succeeds (the positive control proving practice rooms stay
  reachable — the founder's stated reason for refusing the row-predicate narrowing).

#### Files to Modify

- `src/app/data/api.ts` — `joinClaritySession` (L959-1023): keep the pre-flight SELECT and the
  P921 ended-session guard (a read, unaffected by the revoke); **delete the client-side
  occupancy check at L989-996** and replace the UPDATE at L1001 with
  `supabase.rpc('claim_joiner_seat', { p_code: normalizedCode, p_joiner_name: joinerName })`,
  keeping the `ClaritySession | null` return. **Also delete the name-equality rejoin at L992-994**
  (Security — Input Validation: `joiner_name` is anon-readable, so it is not a discriminator).
  **Change the Sentry capture at L1017:** it currently sends `sessionCode: normalizedCode` in
  cleartext on every failed join — i.e. on precisely the error path this spec makes more common.
  Once the code is the authorization capability that is credential logging. Replace the value
  with a non-reversible discriminator (`codeLength`, or a hash prefix); keep the capture itself,
  which is the only telemetry on this path.
  `clearSessionJoiner` (L1233-1259): replace the SELECT + full-object UPDATE with
  `supabase.rpc('release_joiner_seat', { p_session_id: sessionId })`.
  **AD9:** `getClaritySession` (L1032-1045) and `getActiveSessionByCode` (L1190-1222) move to
  `get_session_by_code` / `get_active_session_by_code`; the grace-period and ended-session logic
  in the latter moves server-side with it. Audit every `code` projection reachable from
  `mapSessionFromDb` (L853) — after the split, selecting `code` as `anon`/`authenticated`
  raises 42501.
- `src/app/types/supabase.ts` — regenerate.
- `e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts` — remove the `test.fixme`
  block at L339-382 (it moves to the new file); rewrite the three controls named in step 6 to
  go through the RPC; add `joiner_seat_claimed_at` to `seedVictimSession` / `readRow`.
- `src/tests/sd-guard-completeness.test.ts` — two `CRITICAL_PREDICATES` entries.
- `docs/technical/database.md` — add `joiner_seat_claimed_at` to the `clarity_sessions` column
  table and record the vacancy invariant next to the existing `live_state` mutation contract.
- `features/p1053_server_side_join_authorization.md` — tick Done-When as evidence lands.
- `.private/docs/security-log.md` — close the P1053 entry with the prod grant re-read.

**Not modified** (explicit Non-Goals, verified untouched by this design): the P1047 column
grants and trigger; the `clarity_sessions` SELECT/INSERT/UPDATE policies; `patch_live_state`,
`complete_clarity_session`, `create_transcription_job`, `retry_transcription`; the
`session_transcripts` / `transcription_jobs` SELECT policies; `sessions-service.ts`; and the
`/demo` `creatorProfileId` argument-order bug.
