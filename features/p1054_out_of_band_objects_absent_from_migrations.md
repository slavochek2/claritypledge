---
status: backlog
type: task
rank: 210
created_date: '2026-08-12'
tags: [security, rls, drift, migrations]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
severity: medium
feature_type: backend
---

# P1054: Objects that exist live and in no migration — reconcile or delete

## Problem

**Situation:** `scripts/rls-drift-check.py` (P1048) compares live `pg_policies` on both
projects against every `CREATE POLICY` in `supabase/migrations/`. Its first run found five
policies that are live and appear in **no migration in this repo**, and a follow-up check
found that **three whole tables have no `CREATE TABLE` in any migration either**. One
further policy is live on prod, absent from test, and *is* in two migrations — the inverse
shape, and equally unexplained.

**Complication:** This is P1046's origin 2, and it defeats every file-based method the repo
has. Migration grep cannot see it. `deploy-manifest.json` cannot see it. `supabase/schema.sql`
is a dump, not an authority. The pre-commit RLS gates read files, so they are blind to it by
construction. Nothing in the repo would have surfaced any of this — it took a live diff.

The deeper problem is not the six objects. It is that **`supabase/migrations/` is not a
complete description of either database**, so any reasoning that starts "the migrations say…"
is unsound by an unknown margin. P1038's audit reasoned exactly that way and was falsified
twice. Until the gap is measured and closed, every future schema claim carries the same
unquantified error.

**Question:** For each object that exists live and nowhere in the repo — is it wanted? If
yes, get it into a migration so the repo describes reality. If no, delete it.

Object names and definitions in `.private/docs/security-log.md` (2026-08-12) — kept out of
this public spec because they are unpatched.

## Appetite

Mostly investigation and a set of small decisions, not a build. Blast radius is potentially
wide but almost certainly narrow in practice: these objects are already live, so adopting
them into migrations changes nothing at runtime, and deleting one changes everything for
whatever depends on it. Reversibility is high for the adopt path (a migration that codifies
current state is a no-op against a database already in that state) and low for the delete
path — hence the enumerate-callers-first requirement below. Decision density is the real
cost: one founder call per object, and the "is this wanted?" question has no owner to ask,
because nothing recorded who applied them or why.

## Solution

1. **Enumerate completely, live, both environments.** Not just policies — tables, columns,
   indexes, constraints, functions, triggers, publications, and grants that exist live and
   have no `CREATE` in `supabase/migrations/`. The P1048 checker covers the policy slice
   only; this needs a wider diff, and the wider diff is the deliverable that outlives the
   cleanup.
2. **Classify each:** wanted (adopt) / unwanted (delete) / unknown (investigate). "Unknown"
   is a real bucket and should not be collapsed into either neighbour to make the list tidy.
3. **For adopt:** write an idempotent migration that codifies current live state, `IF NOT
   EXISTS` throughout, so it is a no-op where the object already exists and correct on a
   fresh database. Verify by applying to test and confirming zero change.
4. **For delete:** enumerate callers first (`src/`, `supabase/functions/`, `scripts/`,
   `e2e/`), then canary before dropping — observe the failure path, per gate 7.
5. **For unknown:** record the open question in `docs/decisions.md` with a falsifier rather
   than guessing. An unexplained object left in place with a written question beats a
   confident wrong call in either direction.
6. **Measure the residual.** After reconciliation, state what fraction of live schema the
   migrations now describe, and what classes the diff still cannot see. A number, so the
   next agent knows how far to trust the files.

## Risks / Non-Goals

### Risks
- **Deleting something load-bearing that only a human remembers.** MITIGATE — enumerate
  callers, canary first, and treat "I cannot find a caller" as weaker evidence than "I found
  the caller and it is dead". Grep absence is not proof of disuse for a table reachable over
  a public REST API.
- **Adopting an object that should have been deleted**, freezing a mistake into the repo and
  making it look deliberate to every future reader. MITIGATE — the adopt migration must
  carry a comment saying it codifies pre-existing live state of unknown origin, not a
  decision that this design is correct.
- **Scope explosion into a full schema audit.** ACCEPT, partly — step 1 is deliberately
  wider than the six known objects, because a diff that only looks where we already know to
  look reproduces the blindness this spec exists to fix. The cleanup in steps 3–4 stays
  scoped to what step 1 returns.

### Non-Goals
- Do NOT auto-remediate. Report, decide, then act — the same constraint P1048 carried, for
  the same reason.
- Do NOT drop anything on prod before the same drop has run on test and a canary has been
  observed failing.
- Do NOT extend `scripts/rls-drift-check.py` to cover non-policy objects. It has a proven
  self-test and a narrow contract; a wider diff is a separate tool. Widening it risks the
  one check that currently works.
- Do NOT treat `supabase/schema.sql` as authoritative for the enumeration — it is a dump of
  a moment, and if it disagrees with live state that disagreement is itself a finding.
- Do NOT touch the unauthenticated-write question for the one table where it applies — that
  is P1045, which now carries the confirmed instance.

## Done-When

- [ ] A complete live-vs-migrations object diff exists for both environments, covering more
      than policies, and is reproducible by a command rather than by hand
- [ ] Every object it returns is classified adopt / delete / unknown, with the founder's call
      recorded per object
- [ ] Adopted objects are in idempotent migrations, applied to test with zero observed change
- [ ] Deleted objects had callers enumerated and a canary observed failing before the drop
- [ ] Unknown objects have an open question in `docs/decisions.md` with a falsifier
- [ ] The residual gap is stated as a number plus a list of classes the diff cannot see
- [ ] `scripts/rls-drift-check.py` reports zero unallowlisted `not-in-files` findings, or
      each survivor is allowlisted with a reason and a date

## Alternatives Considered

- **Adopt everything wholesale, decide later.** Fastest route to "migrations describe live
  state", and it launders six unexplained objects into apparent intent. Rejected: the repo
  would then assert as deliberate what nobody has actually decided, which is worse than a
  known gap.
- **Delete everything not in a migration.** Clean and dangerous. At least one of these
  tables is referenced from `src/`, so this would be an outage in exchange for tidiness.
- **Do nothing; the drift checker now watches it.** The strongest argument against this
  spec, and worth stating: P1048 already means a *new* out-of-band object gets caught the
  next morning, so the bleeding is stopped. Rejected because the existing six still make
  every file-based schema claim unsound, and because they sit permanently in the checker's
  baseline — which is exactly the "known backlog quietly becomes a permanent exemption"
  failure the baseline mechanism was written to avoid.

## Rollback Strategy

Per object, not per spec. Adopt migrations are no-ops against a database already in that
state, so reverting one is deleting the file. Deletes are the irreversible direction: for
each, capture the object's full live definition into `.private/docs/security-log.md` before
dropping, so re-creation is a copy-paste rather than a reconstruction. The P1046 migration
is the precedent — it recorded all four dropped policies' definitions verbatim in its own
header, which is what made its rollback executable.
