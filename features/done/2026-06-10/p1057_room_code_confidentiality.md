---
status: all-done
type: bug
rank: 1000965.0
severity: high
date_reported: '2026-08-12'
created_date: '2026-08-12'
tags: [security, rls, grants, privacy, live]
driver: anomaly
feature_type: backend
changes: p1053
completed_at: 2026-08-13
---

# P1057: the room code is a bearer token, and the SELECT policy publishes it

## Summary

P1053 made the 6-character room `code` the capability that authorizes claiming a joiner
seat — `claim_joiner_seat(p_code, p_joiner_name)` accepts nothing else. But the
`clarity_sessions` SELECT policy exposes every null-target row to `anon`, and `code` is one
of the columns it exposes. **The capability is published to the people it is supposed to
exclude.**

Split out of P1053 as AD9 [FOUNDER DECISION 2026-08-12] so the transcript-exposure fix
could ship without waiting on this. P1053 closed seat seizure, seat erasure and empty-seat
claiming; this closes the remaining path, which is that the key is readable.

## Problem

`claim_joiner_seat` refuses an occupied seat and refuses an ended session, so a code-holder
cannot displace a signed-in participant. What a code-holder *can* still do:

1. **Claim any vacant seat on any reachable room** — the intended practice-room model, but
   the reader never had to be invited, because enumeration is free.
2. **Take an anonymously-held seat**, per the P1053 resolution of Reconciliation item 3
   (anonymous rooms have no participant identity — release-then-claim makes any secret on
   claim alone worthless).

Neither is exploitable *at scale by a stranger* once the code is unreadable. Both are
trivially exploitable while it is readable, because no guessing is required.

**This is a different property from the one P1053 closed.** P1053 closed *who may write the
seat*. This closes *who may learn the capability*. A fix to one does not touch the other,
which is why they separate cleanly.

## Appetite

**Blast radius: the highest of anything in the P1053 family.** Every read path that projects
`code` breaks the moment the grant narrows — `mapSessionFromDb` (`api.ts:853`) selects `*`,
and four `.eq('code', …)` call sites resolve rooms by it. This is why it was split: it is
strictly riskier than the fix it was bundled with, and bundling them meant a UAT problem
here would have held the transcript fix hostage.

**Reversible:** yes — re-granting the column restores the previous state exactly.
**Decision density:** low. The mechanism is settled (see Solution); the work is enumeration.

## Solution

Sketch, inherited from P1053 AD9. Not yet re-verified against current code — treat the line
numbers as leads, not facts.

1. **Column-level SELECT split, not a row-predicate narrowing.**
   `REVOKE SELECT ON public.clarity_sessions FROM anon, authenticated;` then an explicit
   per-column `GRANT SELECT` that omits `code`. The P877/P886 idiom, already proven twice on
   `profiles`.

   The row-predicate narrowing stays **rejected** [FOUNDER DECISION, carried from P1053]:
   the null-target branch is what makes anonymous practice rooms reachable at all.

2. **Two SECURITY DEFINER read RPCs** to replace the reads that need `code`:
   `get_session_by_code` and `get_active_session_by_code`, each with `SET search_path =
   public`, `REVOKE ALL … FROM PUBLIC`, then explicit `GRANT EXECUTE`. The grace-period and
   ended-session logic currently in `getActiveSessionByCode` (`api.ts:1190-1222`) moves
   server-side with it.

3. **Audit every `code` projection reachable from `mapSessionFromDb`.** After the split,
   selecting `code` as `anon`/`authenticated` raises 42501. A missed projection is a silent
   break on a path that works today — this is the bulk of the work and the whole risk.

4. **Deploy frontend first**, exactly like P1053 Migration B: the migration carries
   `-- requires-frontend: <sha>` and `migrate.sh` blocks the prod apply until that commit is
   an ancestor of `origin/main`.

## Risks / Non-Goals

- **MITIGATE — a missed `code` projection.** The dominant risk. Enumerate from
  `mapSessionFromDb` outward and from all four `.eq('code', …)` sites before authoring the
  migration, not after.
- **ACCEPT — anonymous seats remain claimable by a code-holder.** Unchanged from P1053 and
  deliberate. Anonymous practice rooms have no participant identity; no `session_transcripts`
  row is reachable through one, because that policy gates on a non-NULL `auth.uid()`.
- **DEFER — the room code is client-minted with `Math.random()`.** A 6-char code from a
  non-CSPRNG is guessable independently of whether it is published. Hiding it raises the bar
  only as far as the generator allows. Its own spec (below).
- **DEFER — a leaked code is unrevocable.** No rotation path, `expires_at` is NULL by design.
- **Non-goal:** the single-slot `joiner_profile_id` ACL. Separate spec, separate backfill.

## Done-When

- [ ] `code` is not readable by `anon` or `authenticated`, verified **both** by
      `information_schema.column_privileges` **and** behaviourally: an anon GET selecting
      `code` on a null-target row is rejected
- [ ] The positive control holds: the same anon GET **without** `code` still succeeds — this
      is what proves anonymous practice rooms stay reachable, and it is the founder's stated
      reason for refusing the row-predicate narrowing
- [ ] `getClaritySession` and `getActiveSessionByCode` migrated onto the read RPCs, both
      flows green
- [ ] Every `code` projection enumerated and confirmed — no 42501 on any path that works today
- [ ] Deployed frontend-first, `requires-frontend` sha stamped, prod grants re-read after apply

## Related

- **P1053** — server-side join authorization. Shipped the write-side fix; this is its AD9,
  split out at `/dev` time so the transcript exposure could close first.
- Follow-ups still unfiled from P1053's Security Review: server-minted codes from a CSPRNG;
  code rotation/revocability; the two unpinned `search_path` RPCs
  (`create_transcription_job`, `retry_transcription`); the single-slot participant ACL.
