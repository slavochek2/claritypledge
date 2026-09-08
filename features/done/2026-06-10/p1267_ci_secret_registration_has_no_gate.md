---
status: all-done
type: task
rank: 1000078
workstream: keyring
created_date: '2026-09-08'
tags: [credentials, pre-commit, ci, drift-audit]
related: [p1147, p1153, p1155, p1214, p1239, p1248]
disclosure: public
flow: dev
pipeline_plan: [create-spec, dev]
pipeline_ran: [create-spec, dev, ship]
pipeline_skipped: ["challenge-prd -- founder asked for an inline critique instead; five findings folded into Solution and Risks", "architect -- the one architectural call (extend vs rebuild) is argued in Alternatives Considered and was verified in critique C4", "generate-tests -- /dev runs TDD and the fixture shape is pinned by Done-When", "ux/ui/verify -- no user-visible surface; the output is a shell exit code", "decompose -- four files", "adversarial-review -- WILL RUN after /dev, kept out of pipeline_plan because the skill does not stamp pipeline_ran and would deadlock the plan"]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-08
---

# P1267: A credential referenced only by CI is invisible to every control this repo has

> **Credentials are named generically throughout**, per
> [.claude/rules/credentials.md](../../../.claude/rules/credentials.md) § Identifiers ("public files —
> specs, docs, commit messages — describe credentials generically"). The two specific variable
> names behind "the unregistered pair" below belong in `.private/docs/security-log.md`. None of the
> reasoning here depends on them.

## Problem

**Situation:** Registering a credential depends on remembering four places —
`.private/docs/accounts.md`, `.private/docs/edge-function-secrets.md`, the locked-half /
`.env.local` call from P1239, and the consuming config. The founder's framing, verbatim:

> "adding a credential today depends on remembering four places … There is no checklist and no
> gate — I grepped."

**Complication:** On 2026-09-08 a mail-sending key was added to the GitHub Actions secrets store on
the `feature/p1155-alert-escalator` branch and registered in neither registry. Three things about
that omission are worse than "someone forgot":

1. **A control exists and was scoped to exclude exactly this surface.**
   `scripts/audit-credential-drift.sh` (P1147) does registry↔consumer drift in three directions.
   `/weekly` step 2.10.2 invokes it with
   `--not-enumerated "ci-secrets:GitHub Actions secrets store — agent's credential has no API
   access, HTTP 403 by design"`. That reasoning is true about the **secrets store** — verified this
   session, `gh secret list` returns `HTTP 403: Resource not accessible by personal access token` —
   and false about the **workflow files' references to it**, which sit in the repo and are readable
   with no network at all. One clause excluded both.
2. **The audit is structurally blind here even with the surface added.** Its `LIVE_KEYS` are derived
   from `--env-dir` (`audit-credential-drift.sh:454`), so `CONSUMER_ONLY` can only fire for a key
   found in a local env file. A CI-only credential is in no env file and in no reachable store, so
   *both* directions of a three-direction audit see nothing. The `--not-enumerated` clause documents
   the gap as accepted; it is not accepted, it was never measured.
3. **The reasoning was recorded; the registration was not.** Contrary to the framing above, the
   P1239-half decision for this credential *is* in `docs/decisions.md` (2026-09-08 [process], "A
   locked-half credential cannot be handed to CI"). What never happened is the registry row. That
   distinction matters for the fix: the missing artifact is a **row**, not a rationale, so the
   remedy is a gate on rows and not more prose.

**Measured on the current tree by running the audit read-only, and load-bearing for the design
below:** six distinct `secrets.X` names are referenced across `main` plus the p1155 branch.
**Four parse out of the registries and must keep passing** — the mail domain, the ops mailbox and
both platform-database credentials. **Two do not**, one of them on `main` today in a workflow
committed well before this incident. So the gate has a pre-existing violation on the branch it
would defend, a backfill is a prerequisite rather than a follow-up, and the allow-set for the
gate-7c fixture is four real names rather than a synthetic one.

**Question:** what is the smallest control that makes an unregistered CI credential impossible to
commit, without becoming a gate that blocks legitimate work?

## Appetite

**Blast radius:** medium — one pre-commit check plus one shared script. A false positive blocks
every commit that touches a workflow file, which is the whole CI surface.
**Reversibility:** high — git revert; no migration, no deployed artifact.
**Decision density:** low. One founder call, marked below (whether an unregistered secret hard-fails
or warns during the backfill window).

## Invariants

- **The gate reads the repo and nothing else.** No network, no `gh` call, no `supabase` call. Its
  authority must survive the agent's credential having no Administration scope — which it does not,
  by design (P970/P919), and which is why the store itself can never be the oracle.
- **A registry entry proves registration, never provisioning.** The gate can say "this name has a
  row"; it can never say "this value exists in GitHub". Nothing in the implementation or its output
  may imply the second. The store remains unreachable and stays named as such.
- **The gate fails OPEN in CI, and must say so where it is wired.** Both registries are gitignored
  (`.gitignore:106`), so a fresh CI checkout has neither file. P1248 was rejected partly for
  depending on a gitignored artifact and calling itself fail-closed. This spec inherits the same
  limitation and must not repeat the same claim: this is a local pre-commit control, advisory in the
  sense P1246 established for the whole pipeline, and that sentence belongs in the check's own
  output — not only in this spec.
- **No committed list of which credentials are critical**, and no credential names in public files.
  `.claude/rules/credentials.md` § Identifiers and `pii.md`/P936 both already rule on this. The
  fixture uses synthetic names.

## Solution

**Extend `scripts/audit-credential-drift.sh`; do not add a bespoke grep to
`pre-commit-checks.sh`.** P1248's first rejection finding was building in-script what an existing
tool already did. Three things that script already has and a fresh grep would have to reinvent:
a column resolver that handles the two registries' genuinely different table layouts
(`accounts.md` has `Env var`, `edge-function-secrets.md` has `Secret`), the
`MULTI_KEY_ROW_BUNDLED` handling for rows naming two vars, and the boundary-terminated matcher
whose `[A-Za-z_][A-Za-z0-9_]*\.KEY` alternative already matches `secrets.NAME` (added under P1153
for `env.KEY` property reads — the same shape, arrived at for a different reason).

Three parts, in dependency order:

1. **Widen `LIVE_KEYS` to include workflow-referenced names — before anything else.** This is
   ordered first for a reason found in review, not for tidiness. `LIVE_KEYS` is env-file-derived
   (`audit-credential-drift.sh:454`), and `is_live` gates the per-row loop at line 546. Backfilling
   a row for a credential that lives only in the CI store therefore emits
   `REGISTRY_ONLY:<KEY>` — *"documented credential that lives nowhere"* — which `/weekly` step
   2.10.2 counts as a finding. **Backfilling first would make the weekly report show more drift,
   not less, for every row added correctly.** Widening `LIVE_KEYS` is also exactly what the new
   refusal class needs, so this is one change serving both.
2. **Teach the location check that not every location is a file.** Once CI keys are live, line 554
   builds `claimed="${ENV_DIR}/${loc}"` and compares against `LIVE_CLASSIFIED` paths;
   a `Location` of `github-actions` matches no file, so `REGISTRY_LOCATION_MISMATCH` fires for
   every CI credential. Non-file locations must be satisfied-by-construction, not mismatches.
   The script's own comment at line 364 already treats a guaranteed-false-positive location finding
   as a HIGH defect — this is the same class, and it must not be reintroduced by this spec.
3. **A built-ins exclusion list.** `secrets.GITHUB_TOKEN` is auto-provisioned by GitHub Actions and
   has no registry row because there is nothing to register. This repo writes `github.token`
   today (10 call sites, verified — so nothing fires now), but the first workflow written the other
   way would be a false positive on an unregisterable credential. Mirror
   `check-edge-function-secrets.sh`, which already excludes the platform built-ins for the same
   reason.
3b. **Count a workflow as a consumer.** Found by MEASUREMENT after the critique, not by it: the
   first correct backfill against the real tree pushed `RETIREMENT_CANDIDATE` from 28 to 29, because
   `_count_live_consumers` scans `--consumers-dir` only and `.github/workflows` is not one — nor can
   it become one, since the markdown tier would then match the credential's own registry prose.
   Same harm as C1 ("documented, nothing uses it") reached through a different function. This is why
   the before/after diff is an acceptance criterion rather than a nicety.

4. **Backfill.** Registry rows for the unregistered pair, each carrying a CI-store `Location` and
   its P1239 half. Safe only after 1–3; before them it manufactures findings.
5. **A new refusal class** for "referenced by a workflow, present in no registry". Wire the surface
   into `/weekly` step 2.10.2 and **replace** the `--not-enumerated "ci-secrets:…"` clause with one
   stating the narrower truth it should always have stated: the secrets *store* is unreachable, the
   *references* are now enumerated.
6. **A pre-commit check**, gated on `.github/workflows/*.yml` being staged, mirroring check 4.8's
   shape (`--self-test` canary + real scan). Skips loudly when no workflow is staged, and skips
   loudly when the registries are absent rather than passing silently.

`scripts/new-credential.sh` — the founder's own framing: *"the gate is the load-bearing half; the
helper is convenience."* Deferred deliberately and **filed to the task inbox rather than left in
prose** (`.private/docs/process-learnings.md`, 2026-09-08, `due: month`) — a deferral that names no
destination is the scope-drop this repo's own ship gate scans for. A helper that writes a row is
worth having only once the gate defines what a valid row is, and building both together lets the
helper's output define the gate's expectations instead of the other way round.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Gate blocks a legitimate workflow edit (false positive) | MITIGATE | Gate-7c fixture below runs the *registered* pair through the gate and asserts exit 0. Non-negotiable acceptance criterion. |
| Registry parsing regresses and reports every secret unregistered | MITIGATE | `--self-test` canary on a hermetic fixture, run pre-commit whenever the script is staged — check 4.8's existing pattern. |
| Fails open in CI (registries gitignored) | ACCEPT | Unavoidable without publishing the registry, which P1248 established is a worse disclosure than the drift it prevents. Named in the check's output, not hidden. |
| `--no-verify` bypasses it entirely | ACCEPT | True of every pre-commit check here; P1246 already ruled the pipeline advisory. Not this spec's problem to solve. |
| Backfilled rows manufacture `REGISTRY_ONLY` findings in `/weekly` | MITIGATE | Widen `LIVE_KEYS` first (Solution 1). Ordering is the mitigation; reversing it reproduces P1173. |
| Backfilled rows manufacture `REGISTRY_LOCATION_MISMATCH` findings | MITIGATE | Non-file `Location` values satisfied by construction (Solution 2). |
| A platform built-in (`secrets.GITHUB_TOKEN`) is flagged though it cannot be registered | MITIGATE | Built-ins exclusion list (Solution 3). |
| Backfilled rows manufacture `RETIREMENT_CANDIDATE` findings | MITIGATE | Workflow refs counted as consumers (Solution 3b). Found by measurement, canaried as E5. |
| `secrets['NAME']` bracket syntax evades a dot-only regex | MITIGATE | Both spellings matched. Unused in this repo today — which is exactly why nothing would have noticed. |
| The gate only fires when a workflow file is staged — deleting a registry row later goes uncaught | ACCEPT | `/weekly`'s audit covers the standing state; this gate covers the authoring moment. Same split as check 18c. |
| A row satisfies the gate while documenting the credential as living elsewhere, or as retired | ACCEPT | Enforcing otherwise needs the per-file location skip fixed first (above). The gate's claim is narrowed to match. |
| An edit made in the GitHub web editor or by a bot PR never runs this hook | ACCEPT | Local hooks are accident-prevention, not a boundary (git.md). Named so it is not mistaken for coverage. |
| A reusable workflow called with `secrets: inherit`, or a composite action under `.github/actions/`, is never scanned | ACCEPT | Verified absent from this repo today: no `.github/actions`, no `workflow_call`, no `secrets: inherit`, no non-`.yml` workflow files. Revisit if any appears. |
| A secret referenced via `${{ env.X }}` indirection or a composite action evades the regex | ACCEPT | Both absent from this repo today — verified: all references are direct `secrets.X`. Revisit if one appears. |
| Registry row exists but the GitHub-side value does not | ACCEPT | Structurally undetectable (403). The gate's claim is registration, per the Invariant above. |

**Non-Goals**
- Do NOT query the GitHub API for secret existence — it is 403 by design and making it reachable
  would mean granting Administration scope, which P970/P919 deliberately withheld.
- Do NOT build `scripts/new-credential.sh` in this spec.
- Do NOT add credential names to any public file, this spec included.
- Do NOT extend the gate to `.env*` consumers — P1147/P1153 already cover them.
- Do NOT change the P1239 locked/plaintext split, or re-open where any credential lives.

## Done-When

- [x] Running the audit before and after the backfill produces **no new** `REGISTRY_ONLY` or
      `REGISTRY_LOCATION_MISMATCH` lines — diffed at HEAD `92e32aff5` with a stability guard proving
      HEAD and the workflow tree did not move mid-run (two earlier attempts were voided by exactly
      that: P1155 shipped between the two passes). Finding keys IDENTICAL across the pair;
      `CONSUMER_ONLY` 3->2 and `WORKFLOW_UNREGISTERED` 2->0 are the only changes
- [x] A workflow referencing a platform built-in (`secrets.GITHUB_TOKEN`) is not flagged — canary C1
- [x] Every `secrets.X` referenced by any workflow on `main` has a registry row — `--gate-workflows`
      against the real tree and real registries returns `GATE:PASS`, exit 0; `WORKFLOW_UNREGISTERED`
      count is 0. **This criterion was written as "with a `Location` naming the CI store" and has
      been corrected to what is actually enforced.** See "What this gate does NOT prove" below: the
      location half is not enforceable against these registries today, and shipping the stronger
      wording over the weaker mechanism is precisely the gate-7b failure this spec cites others for
- [x] The audit script reports the unregistered class when run against a fixture workflow, exit
      non-zero — canary B1/B3/B6 assert exit **1**; end-to-end, a staged workflow with an
      unregistered secret returned `pre-commit exit = 1` (captured via `$?`, not `PIPESTATUS`,
      which is empty in the agent's zsh)
- [x] **The gate-7c case: a fixture containing only registered credentials passes, exit 0** —
      canary A1 runs the repo's REAL `.github/workflows/` tree through the gate and asserts exit 0;
      A2 repeats it with the allow-set split across both registry header shapes; B5 is the pair to
      B3 (identical workflow, one registry row apart). End-to-end: a staged workflow referencing a
      registered secret returned `pre-commit exit = 0`
- [x] `pre-commit-checks.sh` runs the check when a workflow file is staged and prints an explicit
      skip line when none is — both observed
- [x] Committing the p1155 branch's escalator workflow against the *pre-backfill* registries is
      refused by the gate — **replayed in shape, not in original substance.** P1155 shipped to `main`
      mid-session (`e88f7a725`) and its session had already backfilled the sending key by hand, so
      the original inputs no longer exist to re-run. Canary B3 reproduces the exact shape (a new
      escalator workflow adding a mail-sending secret against registries carrying only its sibling)
      with fixture names and asserts exit 1. Ticked under this repo's own convention — the box
      means verified to the limit of what is checkable here — with the caveat kept inline rather
      than invented as a new checkbox token, which would have slipped past `ship-gates.sh`
      (it matches `- [ ]` literally) with no gate modelling it
- [x] `/weekly` step 2.10.2's `--not-enumerated` clause no longer claims the CI surface is
      unenumerable, and the skill text says which half remains unreachable
- [x] The check's own output states that it fails open in CI — the skip branch prints
      "This check fails OPEN by design (registries are gitignored). Not a pass."

## What this gate does NOT prove

Written after adversarial review demonstrated each of these against the real script.

- **It proves a name string appears in some registry table. Nothing more.** Neither `Location` nor
  `Status` is consulted. A row saying the credential lives in `.env.local`, or one marked
  `retired 2020`, satisfies the gate for a `secrets.*` reference — both demonstrated, both
  `GATE:PASS`, exit 0.
- **The location half cannot currently be enforced, and that is a pre-existing limit, not a
  shortcut.** `NO_LOC_REGFILES` is computed per FILE, not per table: one table without a `Location`
  column disables the location check for every table in that file. Both real registries are
  multi-table and both are in that set today (`LOCATION_CHECK_SKIPPED` fires twice for each). So
  `REGISTRY_LOCATION_MISMATCH` **and** this spec's own new `REGISTRY_LOCATION_NONFILE` are
  unreachable against production data — the C2 fix is correct code that currently never runs there.
  Canary F5 asserts this rather than leaving it implicit. Enforcing "Location names the CI store"
  requires fixing the per-file skip first; that belongs to P1147's parser, not here.
- **It sees the commit, never the secrets store.** The real sequence is: a human creates the secret
  in the GitHub web UI (this repo's credential has no Administration scope, by design), *then*
  commits a workflow. The gate intervenes only at the second step. A credential sitting in the store
  that no committed workflow references is invisible to it, permanently.
- **Any edit path that does not run this hook is unaffected** — the GitHub web editor, a bot PR, a
  machine without the hook installed. This is a broader bypass than `--no-verify` because it
  requires no intent to bypass anything.

## Alternatives Considered

- **A standalone grep in `pre-commit-checks.sh`** (the founder's proposal as stated). Rejected on
  P1248's first finding: it duplicates a registry parser that took two specs (P1147, P1153) and one
  false-clean incident to get right, and would diverge from it on the next column change.
- **A CI-side required check.** Cannot work: the registries are gitignored, so the check would
  either fail open silently or require publishing the inventory — the exact move P1248 was rejected
  for.
- **Extending `--consumers-dir` to `.github/workflows`.** Insufficient alone. It would populate the
  `RETIREMENT_CANDIDATE` / `CONSUMER_LIST_STALE` counts, but `CONSUMER_ONLY` reads `LIVE_KEYS` from
  env files only, so the class that matters here still never fires. Worth doing *as well*, not
  *instead*.
- **Requiring the GitHub PAT to gain Administration scope** so the store becomes readable. Rejected
  on the standing ruling (decisions.md 2026-06-27): the agent's credential must be unable to
  administer the gate it is subject to.

## Rollback Strategy

Revert the `pre-commit-checks.sh` hunk — one block, no state. The audit-script additions are
additive finding classes and can stay; the backfilled registry rows should stay regardless, since
they are correct independent of whether the gate ships.

## Open Questions

1. **[FOUNDER DECISION]** During the backfill window, should an unregistered secret **hard-fail**
   the commit or **warn**? Hard-fail is the point of the spec; warn-first is how check 18c was
   introduced (advisory, newly-added instances only). Recommendation: hard-fail, because the
   backfill is Done-When #1 and lands before the gate is wired — there is no window to soften for.
2. Does `github-actions-secret` as a `Location` value need a matching entry in the keyring status
   tooling, or is it inert there? Not checked.
3. **The unblocker for location enforcement.** `parse_registry` emits `__NO_LOCATION_COLUMN__` per
   file rather than per table, so one Location-less table disables the check file-wide. Fixing that
   would make `Location` trustworthy and let this gate enforce "the row says it lives in CI" — the
   claim its first draft made and could not keep. Scoped to P1147's parser; not attempted here
   because changing that resolution changes every existing location finding at once.
4. **Found in passing, belongs to P1155, not fixed here.** `docs/decisions.md` 2026-09-08 [process]
   records that the escalator's send layer "reads it from `OPS_SMTP_PASSWORD`". That variable
   appears nowhere on the shipped P1155 code — the implementation moved to Mailgun's API
   (`d8fe087a0`, "delete the hand-rolled SMTP client") and reads a differently-named sending key.
   The decision record and the implementation disagree about which credential exists. Flagged, not
   edited: it is another spec's record.
5. **The registry moved twice during this spec's own implementation.** The P1155 session backfilled
   the sending key by hand while this was being built, and then shipped to `main` mid-measurement.
   Nothing was lost — the duplicate row was found and removed, and the measurement was re-run under
   a stability guard — but it is direct evidence for this spec's premise: registration currently
   depends on whoever remembers, and two sessions independently reached for the same row.
