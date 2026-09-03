# P1207 — adversarial permission audit: method and transferable results

**Run:** 2026-09-01 → 2026-09-03 · Branch: `feature/p1207-adversarial-permission-audit`

**Specifics are deliberately not published here.** Several findings are fixed on the test database
but **not yet in production**, so exact policy predicates, reproduction payloads and per-table
status live in `.private/docs/security-log.md` (2026-09-01..03) rather than in this public repo —
per CLAUDE.md's rule on unpatched vulnerability mechanics. This file records what the audit
*learned*, which is the part worth keeping and the part that is safe to keep in the open.

## Decision Criterion 1 — answered

**No.** The permission surface was not safe to build an agent-callable API on. Seven distinct
reachability defects were confirmed against live catalogs, six of them reachable in production at
the time of the audit. Every one is now fixed on test; the production apply is a separate,
gated step.

## The transferable result

**Classify by who the predicate admits, not by what the column looks like.**

Phase 1 swept for sensitive-*looking* columns that were publicly readable. That method produced a
**4:3 false-positive ratio** — four findings were retracted after checking the artifact, because
the product deliberately publishes those columns. In every retracted case the answer was already
in the repo: a rendering component, an explicit column list in a migration, an assertion in an
existing test, or the policy's own `CASE` expression.

Every finding that survived has the opposite shape: **an unscoped branch admitting someone the
system never intended to be a party.** Not a sensitive column — a missing condition. The most
severe one sat in a policy Phase 1 had read and passed over, because only its *third* branch was
unscoped and the first two looked correct.

Three sub-patterns worth naming, each of which produced a real finding:

1. **A correctly-scoped parent with unscoped children.** The gate existed, was well written, and
   simply was not applied one level down. Then it recurred one level further out, on a
   *grandchild*, after the first fix.
2. **A credential treated as an identifier.** If knowing a value is sufficient to gain access,
   that value must be *presented*, never *listed*. Any read that returns a set of them is an
   enumeration oracle.
3. **A `WITH CHECK` that appears to compensate for a permissive `USING`.** It does not, when the
   caller can satisfy the check by writing themselves into the row.

## What the method got right

**Start from the live catalog, not the migration files.** Grepping migrations suggested a
dozen-plus unconditional write policies; the live catalog held six. The rest had been superseded.
Fixes fanned out from the file-based list would have chased policies that no longer exist.

**Diff production against test before trusting either.** Two findings were invisible to every
test-based probe because the test database refused the column that production allowed. An audit
following this repo's own probe-test convention would have reported both clean.

**An empty table cannot be classified.** Six tables were unclassifiable because they held no rows —
a clean anonymous result on an empty table proves nothing. Seeding them turned four into confirmed
findings, one of which was among the most serious in the audit.

**Every probe needs a known-good and a known-bad scoring differently on the identical metric.** A
control caught a measurement artifact in the first sweep that had produced three false leads.

## What the method got wrong, and what it cost

- **Reading one half of a two-half rule.** An `UPDATE` policy is governed by both `USING` and
  `WITH CHECK`. Two separate checks in this audit examined only one of them — the second one
  three phases after an adversarial review had already flagged the same defect elsewhere. It
  produced one false finding and one blind spot in a control.
- **Writing a new gate with a defect the audit had itself just documented.** A standing control
  written mid-audit was defeated by trivially-equivalent predicates — the same weakness the audit
  had recorded in an existing gate. Fixed by inverting the test: rather than enumerating the ways
  a predicate can be unconditional, require that it reference caller identity at all.
- **A fix that broke the feature it protected.** A tightened policy referenced a table that is
  itself default-denied. A subquery inside a policy runs with the caller's own permissions, so it
  evaluated false for everyone and hid all rows, not just the private ones. Caught only because
  the test asserted the legitimate case *first*: **a leak assertion passes most emphatically when
  nothing is readable at all.**

## Standing control

A per-environment check now runs daily rather than per-commit. It reads the two catalogs the
repo's existing drift checks do not — table/column privileges and schema default privileges —
which is why a whole class of privilege was invisible to them.

It ships with an **offline self-test** that scores known-bad and known-good predicates and fails
if it cannot tell them apart. That matters more than the live check: an adversarial review
defeated the first version of the detector, and the live run looked identical before and after.
The daily guidance says to treat a self-test failure as louder than a live failure.

## Verification bounds, stated

- The privilege floor cannot be exercised through the application's own API surface, so it is
  asserted at the catalog level and not by an end-to-end test. That unreachability *is* the
  finding's severity classification.
- One schema default is owned by a platform role this repo cannot alter. The control reports it
  on every run rather than hiding it behind a green exit code.
- A full parallel run of the database-layer test suite reports failures unrelated to this work.
  A serial re-run plus a catalog diff established that none is attributable to this branch; their
  causes were not investigated and no claim is made that they are benign. That suite is not run in
  CI and has no enforced green baseline.
- A true before/after control was unavailable: reverting the code would not revert the schema, and
  rolling the schema back to measure would destroy the state under investigation.

## Backlog specs

Five related specs were each given a verdict against the artifact rather than against a summary.
Four remain open; one is partially closed by this work. Details in the private log.

## Closure

Spec closed 2026-09-03. Eleven Done-When items: nine met as written, two met with a recorded
shortfall rather than ticked into compliance —

- **Classes C and D were run as lenses, not per-table cells.** The matrix is per-table for class A
  (54 tables) and class B; column-level and delivery-surface reach were queried per finding and per
  route. The spec's stopping rule ("every table appears with evidence") therefore holds for A and B
  only, and that bound is stated rather than absorbed.
- **The standing control is a daily check, not the pre-commit one the spec asked for.** A commit
  gate that needs network and a management token teaches people to reach for `--no-verify`, which
  in this repo also disables the privacy gate. Both of its own gates were met: it was watched
  failing on an injected widening, and it was run through the workflow that actually invokes it —
  which caught a real defect.

Neither shortfall changes the answer to Decision Criterion 1. A **No** does not become less true
for having been reached over an incomplete matrix.

**Production is not remediated by this spec.** Every fix is applied to test only, and three
findings on one table are not fixed here at all — they were ceded to two other specs whose
migrations supersede this one and whose version numbers apply later. This branch's migration was
numbered *earlier*, so keeping it would have overwritten their fixes backwards on a fresh
production apply while failing nothing loudly. The prod apply is a separate, founder-gated step;
until it happens the daily privilege-floor check is expected to alarm, and that is correct
behaviour rather than a bug to silence.
