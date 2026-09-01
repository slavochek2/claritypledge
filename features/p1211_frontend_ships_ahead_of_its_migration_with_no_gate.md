---
status: week
type: bug
rank: 1000061
severity: high
workstream: infrastructure
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [migrations, deploy, ship, push, tooling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
feature_type: backend
---

# P1211: A frontend that requires a migration can ship while the migration sits unapplied on prod, and nothing says a word

## Summary

The migration/frontend coupling check runs in **one direction only**. `migrate.sh` gate 2 (P886)
honours `-- requires-frontend: <sha>`, which holds a *migration* back until its coupled frontend
commit is an ancestor of `origin/main`. There is no marker, gate or check for the reverse: a
**frontend commit that requires a migration** can reach prod while that migration is still pending,
and every surface reading the new column then fails for every visitor, silently.

Observed 2026-09-01 on P1060/P1193 (Clarity Groups). Related to [p1106](p1106_requires_frontend_sha_invalidated_by_ship.md),
which is the *same silence* on the opposite direction — there a marker stranded migrations that
carried it; here no marker was ever appropriate, because the migrations were genuinely additive and
client-safe. **The two specs share a symptom and not a cause; neither fix closes the other.**

## Root Cause

`requires-frontend` protects the client from a *schema change the deployed client cannot handle*.
It has no counterpart protecting the client from *a schema change that has not happened yet*.

The nine pending migrations were all correctly annotated `-- client-safe: additive only`. That
annotation is true and was the right call: an old client is unaffected by a new nullable column. But
`client-safe` answers "can this migration land before the frontend?" — nobody asks the mirror
question, **"can this frontend land before the migration?"**, and for P1060 the answer was no. The
new client does not merely tolerate `events.org_id`; it *requires* it.

Nothing in the pipeline holds the pair together:

- `/ship` merges the frontend and never inspects whether the branch's migrations are on prod.
- `/push` pushes source and knows nothing about the prod database.
- `migrate.sh` is correct but **operator-triggered** — it only refuses things when someone runs it.
  Nobody ran it, so nothing refused anything.
- `prod-smoke-test.mjs` runs only *after* a prod migrate — precisely the path not taken — and its
  eight assertions cover auth, profiles, a story roundtrip and the PII column gate. **None of them
  reads a column the deployed client reads**, so it would have passed against the broken prod
  anyway.

## Reproduction Steps

1. On a feature branch, add a migration introducing a new column (nullable, additive, correctly
   annotated `-- client-safe:`).
2. In the same branch, add client code that filters on that column
   (`supabase.from('events').select(...).eq('org_id', orgId)`).
3. `/ship` the branch, then `/push`. Do **not** run `./scripts/migrate.sh --env prod`.
4. Load the page that renders the org-scoped surface, signed out.

## Expected Behavior

Something refuses, or at minimum warns loudly: the ship, the push, or a post-deploy check names the
migration the shipped client depends on and reports that prod does not have it.

## Actual Behavior

Everything reports success. Prod's PostgREST answers each query with
`{"code":"42703","message":"column events.org_id does not exist"}`; the service layer throws; the
page renders its empty state. `/groups`, `/groups/cm` and `/groups/online` showed **zero events and
zero participants to every visitor** — a community holding 11 events and 49 distinct RSVP'd
participants reading as dead, and the second organisation not existing at all.

**Nine migrations were pending** — `20260828120000_p1179_event_links` through
`20260831190000_p1193_last_organizer_cannot_leave`. Duration unmeasured; the earliest was authored
2026-08-28, and the frontend was live at least a day before discovery. **Found by the founder
looking at the live page**, not by any gate:

> "we just shipped the feature, the new feature, and I look at it and it says Clarity Practice
> Community, but they don't see any participants, no events. It's not backfiled as it should have
> been."

Note the founder's own first hypothesis was a *backfill* failure. The backfill was fine — it had
never run, along with everything else. **A missing gate presents as a data bug**, which is why this
cost a diagnosis session rather than a glance.

## Affected Files

- `scripts/migrate.sh` — gate 2 (`requires-frontend`), the one-directional check; header comment
  documents the P886/P887 gates
- `scripts/check-migration-client-safety.sh` — enforces the `client-safe` / `requires-frontend`
  annotation at authoring time, in the migration→client direction only
- `scripts/prod-smoke-test.mjs` — the post-migrate check; no assertion touches a client-read column
- `.claude/commands/slava/build/ship.md` — merges the frontend, no prod-schema precondition
- `.claude/commands/slava/build/push.md` — pushes source, no prod-schema precondition
- `supabase/deploy-manifest.json` — already records what is deployed where; `check-deploy-manifest.sh
  --env prod` already computes `MIGRATION_MISSING`, and **nothing on the ship/push path calls it**

## Severity

**high** — a whole feature was dark on prod for every visitor, with no error surfaced to anyone, and
the only detection channel was the founder happening to look. Not `critical`: no data was lost or
corrupted, nothing was mis-recorded, and recovery was a single `migrate.sh --env prod` run.

## Fix Approach

The cheapest honest fix reuses machinery that already exists rather than adding a second
annotation for humans to forget. Three candidates, in preference order:

1. **Make the existing drift check a gate.** `check-deploy-manifest.sh --env prod` already reports
   `MIGRATION_MISSING`. Call it from `/ship` (or the pre-push hook) and fail — or warn with a
   named list — when the branch being shipped contains migrations prod does not have. This changes
   no authoring habit and adds no marker. **Caveat that must be handled:** per
   [decisions.md](../docs/decisions.md) 2026-08-25, `--env prod` reads the manifest from
   `origin/main` by design (P820), so an unpushed stamp reads as missing — a false positive that
   has already misled one session into recommending a prod migrate that applied nothing. The gate
   must distinguish "not applied" from "applied but not stamped upstream".
2. **Assert client-read columns in the prod smoke test.** Add a small set of column-existence
   assertions covering what the deployed client actually reads. Catches the state directly rather
   than inferring it from the manifest, and would catch drift arriving by any route. Weakness: it
   runs *after* a prod migrate, so it must also be wired to run post-deploy to help here.
3. **A `requires-migration` marker on the frontend side.** Symmetric with `requires-frontend` and
   therefore tempting — but it inherits P1106's exact defect (an authoring-time sha that `/ship`'s
   cherry-pick invalidates), and it asks a human to remember the thing they just demonstrably did
   not remember. **Recommend against** unless 1 and 2 both prove unworkable.

**Do not** solve this by making every migration `requires-frontend`. That inverts the deploy order
for changes that genuinely are safe in either order, and re-creates the P1106 stall.

## Invariants

- `requires-frontend` semantics must not change. It exists because of the P886 auth outage and
  guards a real, different failure.
- Any new gate must be **run against the pipeline's own existing workflows before shipping**
  ([epistemic.md](../.claude/rules/epistemic.md) gate 7c): a ship of a migration-free branch, and a
  ship of a branch whose migrations are already applied, must both still pass. The false-positive
  rate is the part that will not announce itself.
- The gate must be seen to FAIL before it is trusted (gate 7) — a green run proves only that the
  happy path runs.

## Acceptance Criteria

- [ ] Shipping or pushing a branch whose migrations are not applied to prod produces a named,
      blocking-or-loud signal identifying the specific pending migration(s)
- [ ] The signal does not fire when the branch contains no migrations
- [ ] The signal does not fire when the branch's migrations are already applied to prod
- [ ] The signal does not fire merely because a manifest stamp is unpushed (the P820/2026-08-25
      false positive is explicitly exercised as a test case)
- [ ] The failure path has been observed failing, with the non-zero exit code pasted into the spec
- [ ] The P1060 scenario replayed against the gate reproduces the block

## Related

- [p1106](p1106_requires_frontend_sha_invalidated_by_ship.md) — the mirror-image silence: a
  `requires-frontend` sha invalidated by `/ship` strands the migration queue. Same "nothing reports
  the stall" property, opposite direction.
- P886 / P887 (`features/done/2026-04-22/`) — why gate 2 and the pending-ack gate exist.
- [decisions.md](../docs/decisions.md) 2026-08-25 — `--env prod` reads the manifest from
  `origin/main`; the false-positive trap any manifest-based fix must handle.
- The triggering incident: `6818f82d`.
