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

**Both existing checks are branch-shaped, and this work had no branch.**

`check-deploy-manifest.sh --env prod` already computes exactly the missing signal
(`MIGRATION_MISSING`), and it is already wired into two places. Neither could fire here:

- **`/ship` step 3.6** is described as a hard gate, and its guidance is explicitly correct about
  this hazard — *"push stays held, so there is no code-without-schema window."* **But step 3.6 is
  not implemented anywhere.** `scripts/ship-gates.sh` mechanically enforces gates 2.5, 2.7, 2.7b,
  3.5 and 3.65 and contains **zero** references to `check-deploy-manifest` or `MIGRATION_MISSING`
  (verified: `grep -c` returns 0). Step 3.6 exists only as prose in `ship.md:63-69` instructing the
  executing agent to run a command by hand. It is the one step in the ship sequence with no
  mechanical enforcement, and nothing detects that it was skipped.
  **And it was reached at least once:** `p1204`'s frontmatter records
  `pipeline_ran: [change-request, dev, verify, ship]` — `/ship` ran, 19 seconds before `p1193`
  closed, over the same pending set. (`p1193` records `pipeline_ran: [dev, verify]` — no ship at
  all.) So the branch-shaped story is only half the cause: for one of the two closing commits the
  gate was in scope and was simply not run.
- **`/finish`'s non-blocking drift warning** (`finish/SKILL.md:175-186`) is guarded by
  `git diff --name-only main..HEAD | grep -qE '^supabase/(migrations|functions)/'`. On main,
  `main..HEAD` is **empty by definition**, so the condition is false no matter what the work
  touched. The check does not merely get skipped — it is unreachable.

`/push`, which is the path this work actually took, has no prod-schema step at all.

**So the gap is two things, not one.** (a) Every gate is attached to the feature-branch lifecycle,
while `/dev` explicitly supports landing work on main (`dev.md:93`, `dev.md:140`) — a supported
route with none of the merge-time protections, and nothing announces that trade. (b) The one gate
that names this exact hazard is **self-attested prose an agent can silently skip**, which is the
same failure class as the `requires-migration` marker rejected below: a step nobody is *forced* to
run. Replacing a self-attested step with an enforced one is therefore the primary work — extending
coverage to the no-branch route is the second half, not the whole.

The `requires-frontend` asymmetry described above is real and still worth closing, but it is the
second-order cause. Even a perfectly symmetric marker would have been checked by `migrate.sh` —
which nobody ran — and by `/ship` — which never executed.

## The second detection channel, and why it could not have helped

`.github/workflows/check-deploy-drift.yml` runs `check-deploy-manifest.sh --env prod` on a daily
cron, opens/appends a GitHub issue on drift (find-or-append, auto-closes on recovery), and `/day`
surfaces it. It has fired four times (issues #2, #3, #8, #10 — most recently 2026-08-21). **This
spec's first draft claimed the founder was the only detection channel. That was wrong**, and the
correction matters for the fix.

It could not have caught this, for a reason that is a finding in itself. Verified timeline:

| Time (UTC, 2026-09-01) | Event |
|---|---|
| 09:43:02 | `72dae037` reaches `origin/main` — the frontend and all 9 migrations. **The host deploys from that event**, so the feature goes live here |
| ~10:25 | migrations applied to prod |
| 10:37:36 | `6818f82d` lands — manifest stamp; drift closes |
| 11:22:31 | daily drift check runs — **45 minutes after the window closed**; correctly reports no drift |

**The detectable window was ~54 minutes.** The check reads the manifest from `origin/main`, so it is
structurally blind until the commits are upstream — and that same event is what deploys the
frontend. The prior day's run logged *"Deploy manifest check passed — all infra matches prod"*
because the commits were still local. **A once-daily check cannot see a defect whose window opens on
deploy and is closed by the founder within the hour**: for same-day work it is not a detection
channel, only an overnight backstop. It is not blind; it is too slow by construction.

This also corrects the outage duration: **~54 minutes**, not the "at least a day" the first draft
inferred from the earliest migration's authoring date.

**Consequence for the fix:** the host deploys straight from the upstream update, with no CI deploy
step (`vercel.json` present; `csp-smoke.yml` is the only workflow naming the host). The pre-push
hook is therefore the **last moment before the deploy trigger**, which is what makes it the right
placement rather than merely a convenient one. The daily check stays as the overnight backstop; the
new gate must not duplicate or fight its issue-management logic.

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
`20260831190000_p1193_last_organizer_cannot_leave`. **Live-and-broken for ~54 minutes** (09:43Z
deploy, 10:37Z stamp — see the timeline below; an earlier draft guessed "at least a day" from the
earliest migration's authoring date, which was wrong: the commits sat local until 09:43Z).
**Found by the founder looking at the live page**, and by the only channel that could act inside
that window:

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
- `.claude/commands/slava/build/ship.md:63` — step 3.6, the hard manifest gate. Correct, and
  unreachable for work that never branches
- `.claude/commands/slava/build/finish/SKILL.md:175-186` — the drift warning, guarded by a
  `main..HEAD` diff that is empty on main
- `.claude/commands/slava/build/push.md` — the path this work took; no prod-schema step at all
- `.claude/commands/slava/build/dev.md:93,140` — where direct-to-main is sanctioned
- `scripts/check-deploy-manifest.sh` — already computes `MIGRATION_MISSING`; the signal exists and
  has two callers, both branch-shaped

## Severity

**high** — a whole feature was dark on prod for every visitor, with no error surfaced to anyone, and
the only detection channel was the founder happening to look. Not `critical`: no data was lost or
corrupted, nothing was mis-recorded, and recovery was a single `migrate.sh --env prod` run.

## Fix Approach

The cheapest honest fix reuses machinery that already exists rather than adding a second
annotation for humans to forget. Three candidates, in preference order:

1. **A mechanical check in the pre-push hook — but scoped to the range, which is the actual work.**
   `.git/hooks/pre-push` is a real symlink to `scripts/pre-push-checks.sh` and runs on every
   invocation, so it sees the direct-to-main route; and since the host deploys straight from the
   upstream update, it is the last gate before the deploy trigger.

   **`check-deploy-manifest.sh` cannot be wired in as-is.** It globs the *entire*
   `supabase/migrations/` directory and flags every version absent from the manifest
   (lines 104-116). It has no concept of a range and no concept of which migration a commit's
   client code needs. Gating the hook on its exit code would block **everything** — a docs typo, a
   CSS tweak — for as long as *any* migration anywhere is unapplied, which is a routine multi-day
   state and is exactly what `ship.md:66`'s own merge-first flow deliberately produces. That
   collides with this spec's own acceptance criteria.

   So the real work is a narrower comparison: migrations reachable from **this invocation's range**
   (`git diff --name-only <remote_sha>..<local_sha> -- supabase/migrations/`) that are absent from
   the prod manifest. **Downgrade the earlier "mostly wiring" framing**: reusing the tree-level
   signal is cheap, scoping it to the range is the build. **Caveat that must be handled:** per
   [decisions.md](../docs/decisions.md) 2026-08-25, `--env prod` reads the manifest from
   `origin/main` by design (P820), so an unpushed stamp reads as missing — a false positive that
   has already misled one session into recommending a prod migrate that applied nothing. The gate
   must distinguish "not applied" from "applied but not stamped upstream".
2. **Assert client-read columns in the prod smoke test.** *(Promoted — it answers the question
   directly rather than inferring it from manifest state, and needs no range arithmetic.)* Add a small set of column-existence
   assertions covering what the deployed client actually reads. Catches the state directly rather
   than inferring it from the manifest, and would catch drift arriving by any route. Weakness: it
   runs *after* a prod migrate, so it must also be wired to run post-deploy to help here.
3. **A `requires-migration` marker on the frontend side.** *(Weakest — it would not have caught
   this incident: the marker would have been read by `migrate.sh`, which nobody ran.)* Symmetric with `requires-frontend` and
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
- **This gate is client-side and best-effort.** It lives only on machines where
  `scripts/install-hooks.sh` has run and is defeated by `--no-verify` (banned by convention in
  `.claude/rules/git.md`, not technically blocked). The durable backstop is the existing daily
  `check-deploy-drift.yml`. Neither replaces the other: the hook is fast and evadable, the workflow
  is unevadable and ~24h late.
- Step 3.6 must end up **mechanically enforced**, not restated as prose. A gate whose only
  enforcement is an agent's willingness to run it has already failed once here.

## Acceptance Criteria

- [ ] Shipping or pushing a branch whose migrations are not applied to prod produces a named,
      blocking-or-loud signal identifying the specific pending migration(s)
- [ ] The signal does not fire when the branch contains no migrations
- [ ] The signal does not fire when the branch's migrations are already applied to prod
- [ ] The signal does not fire merely because a manifest stamp is unpushed (the P820/2026-08-25
      false positive is explicitly exercised as a test case)
- [ ] The failure path has been observed failing, with the non-zero exit code pasted into the spec
- [ ] The P1060 scenario replayed against the gate reproduces the block — **specifically via the
      direct-to-main route** (commit on main, `/push`), not only via `/ship`
- [ ] The gate is reachable from a session that never created a feature branch
- [ ] A range containing no migration passes, **while an unrelated migration is pending elsewhere
      in the tree** — the `ship.md:66` merge-first state must not be blocked
- [ ] The ephemeral staging-branch hop of P919 is not blocked
- [ ] Step 3.6 is enforced by `ship-gates.sh` (or the hook), not by prose an agent may skip
- [ ] The new gate's relationship to `check-deploy-drift.yml` is stated: it does not open or close
      that workflow's issue

## Related

- [p1106](p1106_requires_frontend_sha_invalidated_by_ship.md) — the mirror-image silence: a
  `requires-frontend` sha invalidated by `/ship` strands the migration queue. Same "nothing reports
  the stall" property, opposite direction.
- P886 / P887 (`features/done/2026-04-22/`) — why gate 2 and the pending-ack gate exist.
- [decisions.md](../docs/decisions.md) 2026-08-25 — `--env prod` reads the manifest from
  `origin/main`; the false-positive trap any manifest-based fix must handle.
- `.github/workflows/check-deploy-drift.yml` — the daily backstop that already computes this
  signal; issues #2, #3, #8, #10.
- Adversarial review 2026-09-01 (1 reviewer, 1 report; every load-bearing claim re-verified by
  command before folding in). It falsified the first draft's `/ship` claim and surfaced the
  unenforced-prose finding; the ~54-minute window and the reason the daily check could not fire
  came from verifying its "already alerted for this signature" claim, which did not hold.
- The triggering incident: `6818f82d`.
