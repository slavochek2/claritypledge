---
status: week
type: task
rank: 1000078
workstream: keyring
created_date: '2026-09-08'
tags: [credentials, pre-commit, ci, drift-audit]
related: [p1147, p1153, p1155, p1214, p1239, p1248]
disclosure: public
flow: dev
delivery_stage: create-spec
pipeline_plan: [create-spec, dev]
pipeline_ran: [create-spec]
pipeline_skipped: ["challenge-prd -- founder asked for an inline critique instead; five findings folded into Solution and Risks", "architect -- the one architectural call (extend vs rebuild) is argued in Alternatives Considered and was verified in critique C4", "generate-tests -- /dev runs TDD and the fixture shape is pinned by Done-When", "ux/ui/verify -- no user-visible surface; the output is a shell exit code", "decompose -- four files", "adversarial-review -- WILL RUN after /dev, kept out of pipeline_plan because the skill does not stamp pipeline_ran and would deadlock the plan"]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1267: A credential referenced only by CI is invisible to every control this repo has

> **Credentials are named generically throughout**, per
> [.claude/rules/credentials.md](../.claude/rules/credentials.md) § Identifiers ("public files —
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
helper is convenience."* Deferred to a follow-up, not built here. A helper that writes a row is
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
| The gate only fires when a workflow file is staged — deleting a registry row later goes uncaught | ACCEPT | `/weekly`'s audit covers the standing state; this gate covers the authoring moment. Same split as check 18c. |
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

- [ ] Running the audit before and after the backfill produces **no new** `REGISTRY_ONLY` or
      `REGISTRY_LOCATION_MISMATCH` lines — the C1/C2 regression, checked by diffing the two runs
- [ ] A workflow referencing a platform built-in (`secrets.GITHUB_TOKEN`) is not flagged
- [ ] Every `secrets.X` referenced by any workflow on `main` has a registry row with a `Location`
      naming the CI store — the backfill, verifiable by re-running the audit and getting zero
      unregistered findings
- [ ] The audit script reports the unregistered class when run against a fixture workflow, exit
      non-zero — **the failure path observed and its exit code pasted** (epistemic gate 7)
- [ ] **The gate-7c case: a fixture containing only registered credentials passes, exit 0** —
      including all four real registered names, so the allowed path is exercised by the same
      fixture shape that exercises the refused one
- [ ] `pre-commit-checks.sh` runs the check when a workflow file is staged and prints an explicit
      skip line when none is
- [ ] Committing the p1155 branch's escalator workflow against the *pre-backfill* registries is
      refused by the gate — the incident that motivated this spec, replayed
- [ ] `/weekly` step 2.10.2's `--not-enumerated` clause no longer claims the CI surface is
      unenumerable, and the skill text says which half remains unreachable
- [ ] The check's own output states that it fails open in CI

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
2. Does `github-actions` as a `Location` value need a matching entry in the keyring status tooling,
   or is it inert there? Not checked.
