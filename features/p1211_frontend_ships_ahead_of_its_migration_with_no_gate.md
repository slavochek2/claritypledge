---
status: today
type: bug
disclosure: public
rank: 0.01
severity: critical
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

# P1211: Code reaches prod ahead of its migration, and no gate on the push path knows migrations exist

## Problem

**Situation.** Prod has two deploy halves. The frontend deploys itself the moment commits reach
`origin/main` (Vercel, no CI deploy step). The schema deploys only when someone runs
`./scripts/migrate.sh --env prod` by hand. The founder has one button, `/push`, and reasonably reads it
as "ship this".

**Complication.** Nothing on any route to `origin/main` checks the second half. `/push`
(`push.md`), `git-ops.sh push-docs`, `ship-to-prod`, the pre-push hook and the two required server
checks (`audit-privacy`, `disclosure`) mention `supabase/migrations/` only as a **privacy-watched
path**. Verified 2026-09-18: `grep` for `check-deploy-manifest|MIGRATION_MISSING|schema_migrations`
across `push.md`, `pre-push-checks.sh`, `ship-gates.sh` and the push-docs/ship-to-prod bodies of
`git-ops.sh` returns nothing. `ship.md` step 3.6 describes the right order, but only as text for an
agent to follow, and no script enforces it. The correct deploy order therefore lives in **the memory of
the session that wrote the migration**. On the shared `main` checkout, whichever session runs `/push`
ships every session's commits.

**Question.** How do we make "code never reaches prod ahead of its schema" a property of the push
itself? It must hold whichever session, model or route performs the push.

### Recurrence: this is the eleventh class-A incident, not the second

Census 2026-09-18: 1 agent, all four history stores plus git, Actions runs and drift issues.
Load-bearing rows were re-verified by command before inclusion. Class A = code live before its
migration.

| Date | Feature | Window of harm | Found by |
|---|---|---|---|
| 01-09 | P50 `has_pledged` | unrecorded; signup failed | founder screenshot |
| 03-26 | P586 visibility | unrecorded; every profile "Points (0)" | — |
| 06-18 | P904 explain-back | ~23 h | CI drift issue #3 |
| 08-13 | P1053 `/live` join | **~24 h, total guest-join outage** (the manifest *listed* the migration as deployed; the function was absent, PGRST202, verified from transcript `1dc5108d` 2026-08-14 05:51Z) | founder screenshot |
| 08-23 | P1114 event room | ~24 h. A version collision (P1042): the ledger said *applied*, but the SQL never ran. A ledger check alone cannot see this; C1's one-file-per-version rule can. | agent |
| 09-01 | P1060/P1193 Groups | ~54 min; every visitor saw zero events | founder on the live page |
| 09-05 | P1097/P1222/P1229 batch | ~49 h (user impact INFERRED) | CI issue #11 |
| 09-09 | P1275 | ~78 min | agent |
| 09-11 | P1236 `/transcribe` | ~65 h (per census; not re-verified) | agent, 3 days late |
| 09-15 | P1307 scheduler | 2 × HTTP 500 | logs |
| **09-18** | **P1114 opt-in** | **~10 min, opt-in failed, on event day.** Vercel Production `success` at 08:41:26Z (GitHub deployment 6520740089); migrations applied 08:51:25Z. | founder asked "all on prod?" |

Plus class B (migration broke the live client: P877 06-04, P1207 09-09), class C (migrations stranded
or skipped: 8 cases), and 5 manifest misreads where a stale stamp sent an agent to migrate prod for
nothing.

**The 2026-09-18 incident, exactly.** The P1114 session (Opus) wrote two migrations and told the
founder three times (07:30Z, 08:24Z, 08:37Z) *"first migrate prod, then push."* The founder then typed
`/push` in a **different** session (Sonnet 5, transcript `d6d4ccd1`). That session listed the push
range and saw `supabase/migrations/` in it. It read both migration diffs **for PII only**, stamped
privacy and pushed all 17 commits at 08:40Z. Vercel deployed the new client. The P1114 session applied
the migrations at 08:51Z only because the founder asked it whether everything was on prod. Neither
session did anything wrong by its own instructions. The instructions have no step for this.

### Why this was "fixed" in the founder's mind and never fixed on disk

- This spec was filed 2026-09-01 with the diagnosis essentially right. It then sat **17 days at
  position ~26 of 35** in `week`. Its `rank: 1000061` came from the `next-rank.sh` legacy-band bug,
  fixed 09-09 (`9be2b4b98`), and existing cards were never re-ranked. So a `high` spec sorted below
  every normal card.
- A 2026-09-07 review (decisions.md, "The deploy manifest is written from a directory glob…") showed
  its manifest-based Fix Approach could not work. The manifest is self-attested and forgeable in one
  command. It concluded the gate must read `supabase_migrations.schema_migrations`, which leaves a
  fail-open/fail-closed decision to make. It marked the spec "needs revision". The revision never
  happened.
- Four docs read as coverage:
  - decisions.md 2026-03-26 calls the drift CI "prevention, bypass-proof". It was made daily-only two
    days later.
  - P887 says "forgetting is mechanically blocked twice", but only in the migration→client direction.
  - `ship.md:66` says "push stays held, so there is no code-without-schema window". That is prose, and
    `/push` has no such step.
  - The 09-15 inbox census closed "Deploy P1236's schema" as "done the same day". That hid a 65-hour
    outage.

  This revision decides the fail-mode question (below). It is ranked to the top of `today`.

## Appetite

- **Blast radius:** the push path, which every change to prod goes through. A false positive blocks
  every deploy that carries a migration. A false negative is today's incident.
- **Reversible:** yes. The new required check is removed from the ruleset in one call. The
  `git-ops.sh` call and the `/push` step are plain reverts. No data or schema changes.
- **Decision density:** one founder decision (D1 below). Everything else is technical and decided
  here.
- **History warning:** `push.md` records four consecutive versions that shipped false claims about
  its own gates. Every mechanism here must be seen to fail before it is trusted (epistemic.md gates 7
  and 7c), and it gets a hostile review before ship.

## Solution

### Invariant

> **I1.** When a SHA becomes `origin/main`, every migration file in its tree is recorded in **prod's**
> `supabase_migrations.schema_migrations`. There are two exceptions, both computed and neither
> declared:
>
> - **(a) Coupled in this push.** The file carries `-- requires-frontend: <sha>`, where `<sha>`
>   resolves to a commit (`git cat-file -e <sha>^{commit}`), is **not** an ancestor of the base
>   (`origin/main` before this push), and **is** an ancestor of the SHA being pushed. The coupled
>   frontend is in this push, so the migration is due right after it. A marker whose frontend is
>   already on the base is **overdue**, not exempt. A marker whose sha does not resolve is **invalid**
>   (P1106 stranding, or a forged `0000000`), not exempt.
> - **(b) Legacy.** The exact basename is listed in the trusted exempt file.

**Checked on the tree, not the range.**
- Measured 2026-09-18 against prod's live ledger (350 rows) and the tree (351 files): every version
  is present except `p63_google_oauth_avatar.sql`, a legacy name the runner itself skips.
- It catches the merge-first state that `ship.md:66` produces (branch merged to local `main`,
  migrations not yet applied). That state is the hazard, not a false positive.
- It catches **stale** violations already on `origin/main`: overdue coupled migrations, a ledger
  restored from backup, a push that bypassed the gate.

**Ground truth is the prod ledger, never the manifest.**
- The ledger is read non-interactively with the scoped `SUPABASE_READONLY_TOKEN` (P1214), which
  exists in `.env.local` and as an Actions secret.
- Probed 2026-09-18 with both controls:
  - known-applied `20260918120100` → present
  - fabricated `20990101000000` → absent
  - a `CREATE TEMP TABLE` through the same token → refused (`25006 read-only transaction`)
- The project URL is not secret. CI takes it from the workflow env, as `stranded-signups.yml`
  already does with `PROD_SUPABASE_URL`.

**Matching: by version, and one file per version.**
- The ledger `name` column is empty on ~240 older rows, so C1 matches on version.
- A version match is only sound if one file owns each version. P1042's collisions are the proof:
  the 08-23 P1114 tables never ran on prod while the ledger said *applied*.
- The existing duplicate check skips allowlisted versions entirely
  (`check-duplicate-migration-versions.sh:118-119`). A **new** `20260223_x.sql` would therefore be
  invisible to it, and would read as applied.
- So C1 enforces its own rule: exactly one tree file per version, except the grandfathered
  **basename pairs** listed in the trusted exempt file. There are 3 pairs today, all in
  `.duplicate-version-allowlist`.
- Any other file sharing a version fails with exit 2.

**Fail mode.**
- C1 **always** runs the full tree check when the ledger is reachable. That one query is the whole
  cost.
- When the ledger is **unreachable**, the rule depends on the range (`origin/main..SHA`, never an
  event's `before..after`):
  - The range touches `supabase/migrations/` → **fail closed** (exit 2).
  - The range touches no migration → **pass, with a loud warning** that the tree check was skipped.
    A Supabase outage never blocks a docs or code-only push, and the next reachable run re-checks
    everything.

### Components

**C1. `scripts/check-schema-ready.sh`: the single checker.** Every other component calls it, and no
caller re-implements it.

- **Arguments.**
  - `--sha <commit>` (required in CI; default `HEAD` locally)
  - `--base <commit>` (default `origin/main`)
  - `--trusted-ref <ref>`: the ref C1 reads its own configuration and libraries from
  - `--post`
- **Exit codes.**
  - `0` ready
  - `1` pending. Prints one line per file, with its reason: `pending`, `overdue-coupled` or
    `invalid-marker`.
  - `2` cannot determine. Prints why: no token, HTTP error, unparseable ledger, unexempted duplicate
    version.
  - `3` (`--post` only) coupled migrations are now due.
- **Every input comes from git objects, never the working tree.**
  - Files via `git ls-tree <sha> -- supabase/migrations/`.
  - Content via `git show <sha>:<path>`.
  - The exempt file and `scripts/lib/prod-ledger.sh` via `git show <trusted-ref>:<path>`.
  - This is what makes the trusted-base pattern cover C1's inputs and not just its entry script
    (Fable #3). It also keeps co-tenant working-tree edits out of the answer.
- **The trusted exempt file is `supabase/migrations/.schema-gate-exempt`.** It holds:
  - one line for `p63_google_oauth_avatar.sql`
  - the 3 grandfathered duplicate basename pairs
  - a reason per line

  There is no regex exemption: a new exemption must be a visible, reviewed diff, and it takes
  effect only once it is on `origin/main`.
- **Shared parsing.** Ledger parsing and the `requires-frontend` marker parser are extracted into
  `scripts/lib/prod-ledger.sh`, shared with `migrate.sh`, never copied.
- **`--post`.** Run after a promote, against the new `origin/main`. Lists coupled migrations that
  are now due (their frontend just landed). Exit 3 if any.

**C2. Mechanical gate inside `git-ops.sh`.** Both push commands run C1 on the SHA they will push,
before anything reaches origin. So a blocked push leaks no staging branch and burns no CI run.
- `cmd_push_docs` runs it on the pinned snapshot `$local_sha`, after Step 0's retreat and before
  `[2/6]`. `--resume` runs it too.
- `cmd_ship_to_prod` runs it before its staging push.
- Exit 1 or 2 → `die` with C1's lines and the single resolving command.
- After a successful promote, **both** commands run C1 `--post` and hand exit 3 to the step-6 logic
  (C4). This is the mechanical home of `--post`, not a line of skill prose.

**C3. Server-side required check `schema-ready`** (`.github/workflows/schema-gate.yml`). This is the
boundary for every update of `main` on GitHub: `--no-verify`, other machines, raw `git push`, the
UI merge of a PR.
- **Mirrors `disclosure-gate.yml`:**
  - `permissions: contents: read`
  - blocking, never `continue-on-error`
  - pinned `actions/checkout`
- **Trusted base for every input.** C1 is invoked as
  `git show origin/main:scripts/check-schema-ready.sh | bash -s -- --sha "$AFTER" --base origin/main --trusted-ref origin/main`.
  The one-time bootstrap fallback to the pushed copy is kept, loudly, as in `disclosure-gate.yml`.
- **Range is always `origin/main..<head sha>`,** never `before..after`. `cmd_ship_to_prod`
  force-updates an existing `staging/pN` (`git-ops.sh:4565`), so an event range can omit a
  migration that is still pending (Fable #2). With the always-on tree check, the range only matters
  when the ledger is unreachable.
- **Triggers:**
  - `push` on `staging/**`, which is where every promote's SHA is checked
  - `pull_request`, using `github.event.pull_request.head.sha` (the SHA the check-run attaches to),
    not the merge ref
  - A fork PR has no secrets → exit 2 → red. That is fail-closed, by design.
- **Token:** `SUPABASE_READONLY_TOKEN` from secrets.
- **Rollout order matters.** First land the workflow on `main` as non-required. Then observe it:
  - green on one real staging push
  - red on one fabricated push

  Only then add `schema-ready` to main's ruleset `required_status_checks`. In the same commit,
  append `schema-ready` to the hardcoded fallback set in `scripts/lib-required-checks.sh:62`. The
  live path gets it from `derive_required_contexts` (P1290); the fallback would otherwise promote
  without waiting (Fable #7, Gemini F6).
- **Known limitation, stated, not solved.** The workflow file itself runs from the pushed commit. A
  push that edits `schema-gate.yml` could weaken it, the same as every existing required workflow
  in this repo. The rulesets API returns no push rulesets today (`rulesets?targets=push` → `[]`). A
  push ruleset restricting `.github/workflows/**` would close it; that is a follow-up, INFERRED
  available on this plan and unverified.

**C4. `/push` resolves the gate instead of stopping at it.** This is the part the founder feels.

**Step 2.5, "Schema before code",** runs after commit (2) and before privacy (3).
1. Run C1 on `HEAD`.
   - Exit 0 → continue silently.
   - Exit 2 → STOP, and report why.
   - Exit 1 with any `invalid-marker` → STOP: that is P1106, and a human fixes the marker.
2. Exit 1 with only `pending` or `overdue-coupled` lines → apply exactly those files, per **D1**:
   `./scripts/migrate.sh --env prod --only <basenames from C1> --expect-sha HEAD`.
   - Name the macOS keychain dialog before triggering it (global rule: announce-and-proceed).
3. **New `migrate.sh --only <basenames>` mode.** This is Gemini's F1 fix.
   - Today gate 2 aborts the **whole run** if any pending file carries an unmet marker
     (`migrate.sh:470-476`). A push that carries both a client-safe migration and a coupled one
     deadlocks: the first must apply before the push, and the second makes the script refuse
     until after it.
   - `--only` restricts enumeration, gate 1 acknowledgement, gate 1b re-verification, gate 2 and
     the apply loop to the listed files.
   - It **also** refuses if any listed file's working-tree blob differs from `git show <sha>:path`.
     This closes Fable #5: a co-tenant's uncommitted edit, or an untracked file, can never be what
     reaches prod.
   - Out-of-order application is allowed. If a listed file depends on a deferred coupled one, its
     SQL fails and the transaction rolls back loudly, not silently.
4. **Any** non-zero exit from `migrate.sh` is a STOP: gate block, acknowledgement mismatch, blob
   mismatch, smoke failure. Nothing is pushed.
5. Re-run C1. It must exit 0.
6. Commit the manifest stamp `migrate.sh` wrote with
   `git-ops.sh commit-to-main --files supabase/deploy-manifest.json`, **before** step 3, so the
   privacy stamp covers it and it rides this push.
   - A failed stamp commit (for example, a shared index holding something else,
     `commit_staged_exact`) is a STOP naming the cause.
   - The migration is already applied, so the push itself is safe. What is at risk is only the
     stamp's accuracy, and that must never be silent.

**Step 6, "After the promote",** acts on C2's `--post` result.
- Exit 3: wait until Vercel reports the promoted SHA's **Production** deployment as `success`, read
  from the GitHub deployments API (`gh api repos/:owner/:repo/deployments?sha=<sha>&environment=Production`,
  then the latest status).
  - Only then apply the due coupled migrations (D1), and verify with C1.
  - Timeout or failed deploy → do **not** apply. Report in one line. This is Gemini F5: applying a
    client-breaking migration while the old bundle is still being served is class B.
- Because C1 treats an overdue coupled migration as pending, a step 6 that never ran blocks the
  **next** push until it is applied. It cannot stay silent across pushes (Fable #4).

Update `push.md`'s step list, the "What stays protected" paragraph and the header table.

**C5. Remove the prose that claims coverage.**
- `ship.md` step 3.6 becomes a one-line pointer to C1/C2. Its merge-first routing stays, and it now
  terminates in a push that C2 checks.
- Append a dated correction line under each of the four coverage claims listed in Problem. These are
  append-only logs: never rewrite them.
- If D1 = A, amend cp `CLAUDE.md` ALWAYS-ASK "run migrations on prod" with the scoped exception
  "except the exact set `/push` step 2.5 or step 6 applies for the SHA it is pushing". Run
  `/slava:maintain:claude-md` first.

### D1 (founder decision): who says yes to the prod migrate inside `/push`

- **A. `/push` is the yes (recommended).** Typing `/push` authorizes exactly the migrations in the SHA
  it ships. The keychain dialog is the physical confirmation. One action, no extra turn.
- **B. `/push` asks once.** It prints the list, waits for "apply", then continues. One extra turn
  per migration-carrying push. The ALWAYS-ASK rule is unchanged.

C2 and C3 block the unsafe push either way. D1 decides only whether the block resolves itself.

## Risks / Non-Goals

- **Non-goal: edge functions.** The same class exists (a client calling an undeployed function).
  Functions deploy via `/ship-prod`, which has its own drift check. Follow-up spec only if an
  incident occurs; none is in the census.
- **Non-goal: fixing P1106's sha rewrite.** C1 now turns a stranded marker into a named STOP
  (`invalid-marker`, `overdue-coupled`) instead of silence. Repairing the sha stays in P1106.
- **Non-goal: the daily `check-deploy-drift.yml`.** It stays as the overnight backstop. C3 neither
  opens nor closes its issues.
- **Non-goal: migrations unsafe in both orders.** They need expand/contract, and C1 cannot detect
  them. The authoring-time `client-safe` / `requires-frontend` annotation remains the control.
- **Accepted: step 2.5 applies client-safe migrations before the push is authorized.** If the
  push-on flag is missing or the push is abandoned, prod holds schema the live client doesn't use
  yet. That is the definition of `client-safe`, and it is the state `ship.md:66`'s merge-first flow
  already produces (Gemini F3).
- **Accepted: the ledger proves the apply tool ran, not what the SQL did** (P1170). The post-apply
  smoke test remains the effect check. The one-file-per-version rule closes the known way a ledger
  row lies (P1042 shadowing).
- **Accepted: a Supabase API outage blocks migration-carrying pushes** (fail closed, see Fail mode).
  There is no agent-settable override. A human can drop the required check in the GitHub UI.
- **Accepted: C2 is forgeable locally** (an agent could edit the script). C3 is the boundary; C2
  exists to fail fast and cheap.
- **Stated limitation:** see C3's workflow-file note.

## Rollback Strategy

1. Remove `schema-ready` from main's ruleset `required_status_checks` with one `gh api` call. Record
   the before and after JSON in the spec.
2. Revert the C2 call sites, `migrate.sh --only`, and the C4 steps in `push.md`.

C1 and the workflow can stay, since nothing calls them. No schema, data or manifest content is
changed by this spec.

## Acceptance Criteria

Every criterion pastes its command, exit code and output. Every "passes" has a paired control that
fails.

- [ ] **C1 unit canary** (`scripts/test-check-schema-ready.sh`, stubbed ledger, wired into
      pre-commit for changes to C1 or `prod-ledger.sh`). One case each:
  - applied → 0
  - fabricated `2099…` → 1 `pending`
  - `requires-frontend` whose sha is in this push only → 0; control: sha already on base and not
    applied → 1 `overdue-coupled`
  - marker `0000000` → 1 `invalid-marker`
  - malformed marker → 1
  - `p63` → 0 via exempt file; control: line removed → 1
  - new file reusing an **allowlisted** version (`20260223_x.sql`) → 2; control: the grandfathered
    pair alone → 0
  - ledger unreachable and range touches a migration → 2; unreachable and range migration-free →
    0 with a warning
  - an exempt-file edit present only in the checked SHA, not in `--trusted-ref` → ignored
  - mutants that drop the version comparison, the ancestor test or the one-file rule are killed
- [ ] **Live ledger controls:** C1 against real prod on the current tree → 0. The same run with one
      fabricated file injected via a scratch commit → 1.
- [ ] **Replay of 2026-09-18 via `/push`:** a scratch commit on local `main` carrying a fabricated,
      correctly annotated `-- client-safe:` migration.
  - With D1's apply step stubbed to decline, `push-docs` refuses before `[2/6]`, exits non-zero,
    and no staging branch exists on origin afterwards.
  - The scratch commit is then dropped.
- [ ] **Replay via `ship-to-prod`:** same fabricated migration, same refusal before its staging push.
- [ ] **Deadlock case (Gemini F1):** a fixture tree holding one client-safe pending file and one
      coupled file whose frontend is in the push. `migrate.sh --only <client-safe>` applies only
      that file on the **test** project; the coupled one is untouched.
- [ ] **Blob mismatch:** `--only` with a working-tree edit to the listed file → refuses, nothing
      applied.
- [ ] **Server boundary, with a safety net:**
  - Push a throwaway `staging/*` SHA that carries the fabricated migration **and** a spec file
    without `disclosure:`. Then `disclosure` is red too, so even a broken `schema-ready` cannot
    promote it.
  - `schema-ready` is red. A promote attempt is refused (`GH013`).
  - Branch deleted.
- [ ] **Narrow-range case (Fable #2):** re-push that staging branch with one extra unrelated commit.
      `schema-ready` is still red.
- [ ] **Stale violation (Fable #4):** a fixture where the base carries an overdue coupled migration.
      A docs-only range → C1 exit 1.
- [ ] **No false positive:** a docs-only push through the real `/push` with the ledger reachable →
      passes. The same with the token set invalid → passes with the warning.
- [ ] **`--post`:** after a real promote carrying a coupled fixture (on the test project), step 6
      waits for the Vercel Production deployment status before applying. With the deployment status
      stubbed failed → does not apply, and reports.
- [ ] **Vercel:** the GitHub deployments API already shows the pattern once: the 09-18 staging push
      produced `Preview` 6520719619, and the promote produced `Production` 6520740089. Confirm the
      Production Branch setting is `main` from the Vercel dashboard or API. If the agent cannot
      read it, ask the founder once.
- [ ] **Ruleset:** `schema-ready` in main's `required_status_checks` (`gh api` output pasted), the
      fallback list updated, and `push-docs` waited for it on one real push.
- [ ] **End to end:** one real `/push` of a migration-carrying range.
  - Step 2.5 applied it.
  - The stamp rode the same push.
  - `origin/main...HEAD` = `0 0` with no leftover stamp commit.
- [ ] **Docs:** `ship.md` 3.6, `push.md` and the four coverage claims corrected, each with a dated
      line.

## Done-When

- [ ] Every Acceptance Criterion is ticked with pasted evidence.
- [ ] A hostile reviewer is told to assume the gate has a hole, and tries to get an unapplied,
      non-exempt migration onto `origin/main` by any route. It fails, or its finding is fixed and
      re-reviewed.
- [ ] decisions.md has one KDD entry recording the fail mode, the one-file-per-version rule, and D1.

## Alternatives Considered

- **Manifest-based gate (this spec's 2026-09-01 candidate 1):** rejected 2026-09-07. The manifest is
  self-attested, forgeable in one command, and was wrong about prod in the P1053 outage.
- **Range-scoped check:** unnecessary once the source is the ledger. A tree check is simpler, and it
  catches stale violations. The range survives only as the outage fallback.
- **`requires-migration` marker on client code:** relies on the author remembering. That is the
  failure it would guard, and it inherits P1106's rewritten-sha defect.
- **Column assertions in the prod smoke test:** detects after deploy, not before. It is a complement
  at best.
- **Block the Vercel deploy until migrations are confirmed:** moves the check to a system we don't
  script. The server-side required check achieves the same guarantee on GitHub, where our other
  boundaries already live.

## Related

- [p1106](p1106_requires_frontend_sha_invalidated_by_ship.md): the stalled-marker direction. C1
  `--post` makes it loud.
- P886/P887 (`features/done/2026-04-22/`): the migration→client gates this complements.
- P1214/P1316: the scoped read-only token C1 and C3 use.
- P1290: `derive_required_contexts`, which is how `push-docs` learns about the new required check.
- decisions.md 2026-09-07 "The deploy manifest is written from a directory glob…": why the ledger.
- Spec review 2026-09-18, all three hostile reviewers run in parallel. Every finding below was
  re-verified by command before being folded in.
  - Gemini 3.8 Flash (served model verified): REJECT. F1 (the deadlock), F2, F4, F5 and F6 were
    folded in; F3 was accepted with its rationale.
  - Fable: REVISE, 11 findings, all folded in.
  - Codex: hit its usage limit mid-run, so it produced no verdict. Its two partial notes (the route
    overclaim, allowlisted duplicate versions) were folded in. **Codex must re-run on this revision.**
- Incident transcripts: `d6d4ccd1` (09-18 push), `57e1165b` (09-18 author session), `1dc5108d`
  (08-14 P1053).
