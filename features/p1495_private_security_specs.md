---
status: backlog
type: task
rank: 320
workstream: infra
created_date: '2026-10-15'
tags: [security, privacy, disclosure, process, specs]
disclosure: public
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1495: Sensitive specs are archived privately, never published — even after the fix ships

## Problem

**Situation.** Since P1255 a spec describing a live, unfixed defect is authored with
`disclosure: embargo`: it lives as a tracked file on an unpushed `feature/pN-*` branch,
`main` carries only a neutral stub (`features/pN_security-review-pending.md`), `/ship`
merges the code and withholds the spec (P1464), and `git-ops.sh publish-spec pN`
publishes the full spec into `features/done/` once the fix is confirmed on prod.

**Complication.** The founder no longer wants the last step:

> **Founder framing, verbatim (2026-10-15):** "I don't think we should expose any security
> or privacy or similar kind of sensitive things publicly even after they're developed."
> … "they're just another folder and everything else stays the same — kanban, skills that
> read them, process them. Is it possible or will we break?"
> … "some specs will never be committed and if they are never committed where do they
> live? … if they seem to be in the repo but they are not committed … I don't know if it
> creates some kind of loophole."

A published post-fix write-up still teaches the class of hole, the component, and how it
was guarded, and it is permanent (git history). The current scope (`embargo` = *unfixed
defect*) also does not name privacy-sensitive specs that are not defects.

**Question.** Can a sensitive spec end its life in a private folder instead of
`features/done/`, with the delivery pipeline, the kanban and the skills unchanged — and
which parts of the September embargo failures does that bring back?

**Short answer, from the census below.** Yes, *if* the spec stays a tracked file on its
branch while the work is in flight and only the **end** of the lifecycle changes. Of 150
files that reference `features/` paths, 115 are unaffected, 17 read finished specs and are
fine not seeing private ones, 6 should learn to also read the private folder, 11 must
change, and **1 CI gate breaks if the stub is "closed as done"** (measured: exit 1). That
last finding changes the proposed shape: the stub is **deleted** at close, not moved.

## Appetite

**Blast radius: medium.** Touches `scripts/git-ops.sh` (replaces `cmd_publish_spec`), one
pre-push check, the doc-link validator, `tools/kanban/server/api.ts`, eight skill files and
the disclosure rule. No product code, no schema. **Reversibility: high** — nothing is
published by this change, every touched file is ordinary tracked code, and an archived
spec can still be published later by hand from the private copy. **Decision density:
seven founder calls** (Decisions Needed). This sits on the security path (P1464's
classifier is the thing that keeps a spec off `main`), so it is not a skim job.

## Invariants

- **In flight, a sensitive spec is a tracked file on its own unpushed branch.** Every
  September failure came from hiding a spec from git while the pipeline still needed it
  (P1255 lines 79-95). The private folder is a *terminal* location only.
- **The machine key stays the literal `disclosure: embargo`.** Every content reader that
  keeps a spec off `main` compares against that exact string (`git-ops.sh:2822`,
  `ship-gates.sh:356`, `validate-doc-links.cjs:285`, `check-disclosure.sh:83`,
  `fix-frontmatter.py:359`). A reader that does not know a new value treats it as public,
  i.e. **fails open** (D1).
- **No committed list of which specs are sensitive** (features.md, P1248, P936). Scope is
  each spec's own frontmatter; this spec names no embargoed spec.
- **The branch is deleted only after the private copy is committed and read back.** Until
  then the branch holds the only versioned copy.
- **Nothing already on `origin/main` is "fixed" by deletion** (P1255 Invariant 3).

## Solution

Keep the branch-born lifecycle exactly as it is today until the code has shipped and the
fix is live. Replace the final `publish-spec` step with **`git-ops.sh archive-spec pN`**:

1. **Same preconditions as `publish-spec` today** (`git-ops.sh:3532-3618`): run from the main
   checkout, resolve the branch, exactly one spec file on it, value `embargo`, the spec's
   migrations in `origin/main` `deploy-manifest [prod].migrations` (or `--yes` when there are
   none), authenticated prod smoke passes. Kept on purpose: the stub's removal is a public
   "this is closed" signal and must never precede the prod fix.
2. **Write the private copy:** `git show <branch>:<spec>` (as `:3635` does) into
   `.private/features/done/<sprint>/<basename>`, sprint from `resolve_ship_sprint_dir`, plus
   its UAT pair if present. `.private/` is ignored by the outer repo (`.gitignore:106`,
   verified with `git check-ignore`), so no `git mv` and no outer `git add` is involved. The
   private copy keeps `disclosure: embargo` — D4 of P1255 rewrote it only because the copy
   was going public.
3. **Commit it in the inner `.private` repo** (its own git repo, mirrored to the self-hosted
   private remote — `.private/INDEX.md:5`), one explicit path, after `gitleaks protect
   --staged` per that repo's rule; read the committed blob back (D6).
4. **Refuse if any other local ref contains a withheld spec commit** (the ship journal records
   them). This is the lesson of decisions.md 2026-09-11 [process], "An embargoed spec reached main,
   and taking it off main did not take it off the branches cut from that tip": a ref cut while spec content
   was reachable keeps it, and shipping that ref later would carry it to `main`.
5. **One commit on `main`, under `main.lock`, that only deletes the stub**, subject fixed text
   `chore: close pN (details private)` — never the title. No file is added under
   `features/done/`, so `closure-gate.yml:135` has nothing to judge (see Findings).
   The P-number stays reserved: `next-p-number.sh:62-66` scans deleted spec paths.
6. **Tear down the worktree and delete the branch** (existing teardown, `:3680-3696`).

**Scope (D1, D2):** `embargo` is redefined as *"must never be published: a live or fixed
security defect, privacy-sensitive content, or anything similar"*. Same branch-born
authoring, same stub. Notes that will never produce code (no build, no ship) go straight to
`.private/` from creation and never enter `features/` — that is today's pattern for
`.private/docs/security-log.md`, and the 2026-09-04 [technical] entry
("Credential-exposure disclosure stays an authoring control") already proposed it for
credential-topic specs.

**Read side (D5):** `tools/kanban/server/api.ts` gains a second scan root
`.private/features/` for the main checkout, following the CRM precedent at `api.ts:427`
(`.private/crm/opportunities`). Skills that look up a *closed* spec by P-number fall back to
`.private/features/done/`.

### Where a sensitive spec lives at each stage

| Stage | Location | Committed? | Off-machine copy |
|---|---|---|---|
| Authored, in flight | `features/pN_<slug>.md` on local branch `feature/pN-<slug>` in a worktree; `main` has only the neutral stub | Yes, on the unpushed branch | Home-directory restic backup (`.git` included since 2026-08-25, excludes only regenerable caches). **Not verified against a snapshot listing** — Done-When. Never on GitHub: `git ls-remote --heads origin` returned exactly one head, `main` (2026-10-15) |
| Code shipped, waiting for prod | Same branch, retained by ship (`git-ops.sh:5097-5098`); code is on `main` | Yes, on the branch | Same as above |
| Done | `.private/features/done/<sprint>/<basename>` — the **only** copy; branch deleted | Yes, in the inner `.private` repo | Self-hosted private git remote + restic. **Measured 2026-10-15: the inner repo is 17 commits ahead of its remote with 113 uncommitted paths** — the remote lags, so for a while the copy is local disk + restic only |
| Never buildable (notes, incidents) | `.private/...` from creation | Inner repo only | Same as Done |

**On "it looks like it's in the repo but isn't committed":** a file under `.private/` sits
in the working directory but the public repo ignores it; nothing short of `git add -f`
(banned, `.claude/rules/git.md` table) can stage it, and the inner repo pushes only to the
private remote. The real loophole is a **copy**: someone copies the private spec back into a
tracked path (e.g. to reopen it) and commits it on `main`. Today nothing stops that (leak
path 3) — this spec adds the guard.

### Leak paths

| # | Leak path | Label | Guard today | file:line | Change here |
|---|---|---|---|---|---|
| 1 | The in-flight branch is pushed | MITIGATE (exists) | Pre-push Layer 0 refuses creating/updating `feature/*`, `fix/*` and off-main tags on a GitHub remote; agents cannot push at all (global push hook). Residual: `--no-verify` (banned) or `CP_ALLOW_BRANCH_PUBLISH=<exact ref>` (logged) | `scripts/pre-push-checks.sh:63-130` (`:97` branch match, `:102-118` tags) | None. After archive the branch no longer exists |
| 2 | Ship/cherry-pick carries the spec to `main` | MITIGATE (exists) | P1464 content classifier: any `features/**.md` blob saying `disclosure: embargo` is withheld, mixed commits refused before any pick. Suite re-run 2026-10-15: `RESULT: all passed`, exit 0. The 2026-09-11 incidents (decisions.md 2026-09-11 [process] P1302 and [technical] P1303) predate it | `git-ops.sh:2790-2905`, `:4570-4615` | Keep the single value `embargo` (D1) so the classifier keeps matching |
| 3 | The spec is created or committed on `main` by mistake (incl. a copy from `.private/`) | **MITIGATE (new)** | **None.** Probe 2026-10-15: `check-disclosure.sh` exits **0** for a staged `disclosure: embargo` spec on `main` (control: a spec with no field exits 1). Only the authoring route in `create-spec.md:25-66` | `check-disclosure.sh:83` | Pre-push refuses any pushed commit that adds or modifies a `features/**.md` blob whose content reads `embargo` (reuse `ship_disclosure_of_content`); same check in pre-commit on the main checkout |
| 4 | Text leaks via commit subjects, migration filenames/headers, close-commit title | MITIGATE (authoring) / ACCEPT residual | Subjects in roles (`features.md:66-70`); `supabase/migrations/` is a privacy-review watched path (`privacy-watched-paths.sh:5`, decisions 2026-08-13); ship's titled close (`git-ops.sh:5040`) is skipped for embargo (`:4971`) | as listed | Archive subject is fixed text (step 5). Migration filename slugs have no mechanical check — ACCEPT, authoring rule unchanged |
| 5 | The deleted branch still holds the spec in local reflog/objects | ACCEPT | Harmless on this machine: objects leave only when reachable from a pushed ref (row 1). Backed up encrypted by restic. The real risk is another ref cut while spec content was reachable | decisions.md 2026-09-11 [process] (P1302) | Step 4 refuses while any other ref contains a withheld spec commit |
| 6 | Evidence artifacts outside the spec: goalify pins + review files, `INDEX.md` line, public link to the private file | MITIGATE (new) | None: `/goalify` commits `features/verification/pN/` to `main`; `/kdd` appends every closed spec to `features/done/INDEX.md`; a link into `.private/` passes the doc-link check as `external` | `goalify/SKILL.md:197-205`, `kdd/SKILL.md:208`, `validate-doc-links.cjs:352-354` | Goalify refuses on `embargo`; kdd writes `.private/features/done/INDEX.md` instead; links into `.private/features/` fail the validator |
| 7 | The stub's creation and deletion dates bracket the open window | ACCEPT | Same as today (stub reserve commit + publish commit) | `create-spec.md:42-60` | None |

## Findings — the September failure modes against this shape

1. **`ship` `git mv`s the spec at close** (P1255: an untracked spec made the close die).
   **Cannot recur.** The spec is tracked on its branch in flight; for `embargo` the close is
   skipped (`git-ops.sh:4966-4972`), and archive reads the blob with `git show` and writes an
   ignored path — no `git mv` on the outer repo. It **would** recur if a buildable spec were
   authored straight into `.private/`: `resolve_ship_spec` (`:2321`) would find nothing.
2. **`setup-worktree.sh` seeds from `git ls-files 'features/p*.md'`** (now `:151`).
   **Cannot recur** for the same reason: the worktree is the spec's own branch. Would recur
   for a spec authored in `.private/` — `setup-worktree.sh` has no `.private` handling
   (`grep -n private` returns nothing).
3. **goal-gate CI cannot find the spec in a fresh checkout** (`goal-gate.yml:84`,
   `goal-gate.sh:94`). **Cannot recur:** CI never runs on the unpushed branch, and on `main`
   the gate applies only to P-numbers with a contract pin on `main` (`goal-gate.yml:87-93`).
   **But its sibling does:** `closure-gate.yml:135` runs ship-gates gate 2.5 on any
   `pN_*.md` **added under `features/done/`**. Moving the stub there ("closed as done")
   fails it — measured: `ship-gates.sh p1487 --spec-file <stub with status all-done> --only
   2.5` exits **1** ("no '## Acceptance Criteria' and no '## Done-When'"), while the real
   closed p1487 spec exits **0**. The administrative route (`scripts/lib/admin-close.sh`)
   needs a `withdrawn:` marker, which would be false. Hence step 5 deletes the stub.

## Census — what reads `features/`

Commands (raw output in the session scratchpad, not committed):
`grep -rlE "features/|[\"']features[\"']" scripts tools .claude/commands .claude/hooks
.claude/agents .github/workflows .githooks package.json` → 131 files, plus
`… src/tests e2e evals` → 19 files. **Out-of-scope control:** the same pattern over
`src/app`, `api`, `services`, `supabase/functions` returned only code *comments* citing
spec paths (no readers). `.agents/skills/` (50 hits) is generated from
`.claude/commands/` by `scripts/sync-agent-skills.sh` and inherits each source's class.
Flags were derived per file by a second grep for `features/done`, recursion (`rglob`,
`find … features`, `ls-files`, `**`); every flagged file was then read at the cited line.

| Class | Count | Meaning |
|---|---|---|
| (a) unaffected | 115 | Top-level / in-flight paths only, fixed citations of public specs, hermetic test fixtures, or archived scripts nothing calls |
| (b) fine without private specs | 17 | Reads finished specs; missing a private one is acceptable |
| (b) should also read `.private/features/done` | 6 | Founder-visible capability would silently lose private specs |
| (c) must change | 11 | Names `publish-spec`, encodes the old stub/exit, or opens a leak path |
| (c) breaks under the proposed shape | 1 | Only if the stub is moved into `features/done/` |

**(b) fine (17):** `challenge-prd.md:308`, `architect.md:186`, `create-prd/agent.md:79`,
`critique-ux.md:54`, `prep-spec/SKILL.md:162`, `prep-spec/synthesizer.md:106`,
`day-cp.md:1466`, `programme-health/SKILL.md:128` (driver ratio undercounts private specs),
`tos-review/SKILL.md:28`, `weekly/SKILL.md:773,837`, `block-manual-spec-close.py:40`
(its `features/done/` regex also matches `.private/features/done/`, so hand-archiving is
blocked — wanted), `check-duplicate-p-numbers.sh:15,19`, `fix-frontmatter.py:144,375`,
`next-p-number.sh:62-66`, `pipeline-strandings.sh:141`, `pre-commit-checks.sh:202,1270`,
`tools/kanban/scripts/validate-features.ts:157`.

**(b) should read the private folder (6):** `change-request.md:61` and `dev.md:74`
(change-request predecessor), `fix.md:600` (deferral lookup), `revert-feature.md:47,131`,
`postmortem/SKILL.md:35`, `tools/kanban/server/api.ts:38-78`.

**(c) must change (11):** `git-ops.sh:3532` (+ messages `:4972`, `:5098`),
`ship-gates.sh:344,360`, `check-disclosure.sh:83,90-94`, `spec-intent-gate.sh:67` (exact stub
text — changes in lockstep with the stub template), `validate-doc-links.cjs:352-354,573`,
`test-p1464-ship-embargo.sh:258-330,604-616` (D1/F2/I3 exercise `publish-spec`),
`create-spec.md:42-66`, `create-bug.md:54-78`, `ship.md:53`, `kdd/SKILL.md:208`,
`goalify/SKILL.md:197-205`. Not in the census scope but also rewritten:
`.claude/rules/features.md:21-70`.

**(c) breaks if the stub is closed into `features/done/` (1):** `closure-gate.yml:135`.

## Alternatives Considered

1. **Keep publishing after the fix (status quo).** Rejected by the founder's call. The cost
   is real, not taste: the published write-up is permanent, names the component and the
   guard, and a reader can compute the exposure window. P1255's argument for publishing was
   showcase value of *shipped* specs; the founder has weighed that and declined it for this
   class.
2. **A separate private repository for sensitive specs.** Rejected: the spec must be a
   tracked file in *this* repo while in flight, or the pipeline breaks exactly as in
   September (findings 1-2) — `/dev`, `/fix`, `ship-gates.sh` and the worktree all read it
   from this repo's branch. A second repo would need every consumer taught a second root
   for in-flight work, i.e. the "gitignored folder" problem in another form. (`.private/` is
   already a separate repo; using it for the *terminal* copy gets the benefit without the
   in-flight cost.)
3. **Gitignored folder from creation** (`.private/features/` for the whole life). Rejected,
   re-verified today: the three P1255 breakages still hold — `ship` resolves specs under
   `features/` (`git-ops.sh:2321`), `setup-worktree.sh:151` seeds only tracked specs, and
   worktrees have no `.private`. It also removes the P1464 classifier's protection, which
   works on tracked blobs.
4. **Close the stub into `features/done/` with neutral text.** The originally proposed
   shape. Breaks `closure-gate.yml` (finding 3). Making it pass needs either fake completion
   evidence (ticked boxes + `pipeline_ran` in a stub — a self-reported claim, the thing P1169
   removed) or a new stub-shaped exemption in gate 2.5 — a new way to close a spec without
   gates. Deleting costs nothing and the number stays reserved.
5. **A new value `disclosure: private` beside `embargo`.** Rejected unless the founder wants
   it (D1): every content reader keys on the literal `embargo`, and one missed reader turns
   the new value into "public" at the ship boundary.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The private copy is lost (only copy, inner remote lags) | MITIGATE | Commit in the inner repo before deleting the branch (step 3, Invariant); restic coverage verified once (Done-When) |
| A private spec is copied back into `features/` and pushed | MITIGATE | Leak path 3 pre-push refusal |
| `embargo` now means "never publish", which the word does not say | ACCEPT | Cheaper than a fail-open window across five readers; rule text explains it |
| Programme-health and similar counts silently exclude private specs | ACCEPT | Small numbers; state it in those skills only if a count is ever acted on |
| Public decisions entries about sensitive work lose their spec link | ACCEPT | Same as today while embargoed; link the stub's P-number, mechanics stay in `.private/docs/security-log.md` |
| `.agents/skills/` mirror drifts from edited skills | MITIGATE | Regenerate with `scripts/sync-agent-skills.sh` in the same change |
| The archive refuses because a co-tenant branch contains a withheld commit | ACCEPT | Correct refusal; the fix is to clean that ref, as on 2026-09-11 |

**Non-Goals**
- Do **not** unpublish or relabel specs already on `origin/main` (frozen, P1255 D2).
- Do **not** add a content detector for sensitive text (rejected 2026-07-15, P1248).
- Do **not** move in-flight authoring of buildable specs into `.private/`.
- Do **not** change P1464's classifier logic — only the step after it.
- Do **not** commit a list of private specs anywhere public, including the kanban.

## Acceptance Criteria

- [ ] `git-ops.sh archive-spec pN` performs steps 1-6; the `main` commit contains exactly one
      path, the stub deletion, with subject `chore: close pN (details private)`.
- [ ] It refuses with non-zero exit and changes nothing when: a prod gate fails; the inner
      repo commit cannot be read back; another ref contains a withheld spec commit; it runs
      outside the main checkout. Each refusal exercised, exit codes pasted (epistemic gate 7).
- [ ] Pre-push refuses a range that adds or modifies a `features/**.md` blob reading
      `disclosure: embargo` (failure exit pasted), and the repo's own workflows still pass
      through it — a normal ship push and a stub-reservation push (gate 7c).
- [ ] `validate-doc-links.cjs` fails a public link into `.private/features/`; a link to
      `.private/docs/security-log.md` still passes (both directions in one run).
- [ ] The kanban main board shows `.private/features/done/` specs (if D5 = yes), and a
      worktree board is unchanged.
- [ ] The six "(b) should read" consumers fall back to `.private/features/done/`.
- [ ] `/kdd` writes private closes to `.private/features/done/INDEX.md`; `/goalify` refuses
      on `embargo`.
- [ ] Stub template text, `spec-intent-gate.sh` `STUB_BODY`, `create-spec.md`, `create-bug.md`,
      `ship.md`, `ship-gates.sh`, `check-disclosure.sh` and `.claude/rules/features.md` (via
      `/slava:maintain:claude-md`) describe the new exit; no file outside `git-ops.sh` history
      names `publish-spec` as a step.
- [ ] `test-p1464-ship-embargo.sh` covers archive instead of publish and passes; the closure
      gate is shown not to fire on the archive commit.
- [ ] `.agents/skills/` regenerated.

## Done-When

- [ ] One real sensitive spec goes through ship then archive: `git ls-tree -r --name-only
      origin/main` holds no file with its slug, the inner repo holds the committed copy,
      and `restic ls latest` lists `.private/features/done/<sprint>/<file>`.
- [ ] P1266's two `publish-spec` Done-When items are marked superseded by this spec.
- [ ] A `docs/decisions.md` entry records the change and its three founder answers that
      overturn P1255 D4 and the publish step.

## Rollback Strategy

Revert the commits. Nothing is published by this change, so a rollback exposes nothing.
Any spec archived meanwhile still exists in the inner repo and can be published by hand
(copy into `features/done/`, rewrite the field to `public`, delete nothing else) — the
same commit shape `publish-spec` produces today, recoverable from git history.

## Decisions Needed

- **D1 [FOUNDER DECISION] — one word or two?** Keep the existing word `embargo` and widen
  what it means to "never publish", or add a new word such as `private`? *Recommendation:
  keep `embargo`.* Every safety check matches that exact word; a new word that one check
  forgets is treated as public at the moment the spec could leak.
- **D2 [FOUNDER DECISION] — what counts as sensitive?** Security defects only (fixed or
  not), or also privacy-sensitive and "similar" specs? *Recommendation: all three, as you
  said; the author decides, default closed when unsure.*
- **D3 [FOUNDER DECISION] — remove publishing entirely?** Delete `publish-spec`, or keep it
  as a rarely-used manual option? *Recommendation: remove it; publishing by hand from the
  private copy stays possible if you ever change your mind.*
- **D4 [FOUNDER DECISION] — what happens to the public placeholder at the end?** Delete it
  (number stays reserved, no check breaks), or keep it on the board as "done" (breaks the
  closure check unless we add an exception)? *Recommendation: delete it.*
- **D5 [FOUNDER DECISION] — should your kanban show the private finished specs?**
  *Recommendation: yes, on the main board only, read from `.private/` the way the CRM
  cards already are.*
- **D6 [FOUNDER DECISION] — may the archive step commit into the private `.private` repo
  by itself?** Otherwise the only copy sits uncommitted until someone commits `.private`.
  *Recommendation: yes, one file per commit, after the secret scan.*
- **D7 [FOUNDER DECISION] — anything retroactive?** Security specs already published stay
  published and frozen (your 2026-09-08 call). *Recommendation: confirm; deleting them
  from the repo would not remove them from history.*

## Related

- [P1255](done/2026-06-10/p1255_security_specs_publish_before_the_defect_is_fixed.md) — the
  embargo design this changes (its D4 and the publish step).
- [P1464](done/2026-06-10/p1464_ship_embargo_spec_rides_code_commits.md) — the content
  classifier this depends on.
- [P1266](p1266_prove_the_embargo_end_to_end_on_the_first_real_security_spec.md) — its
  publish-side items are superseded.
- `docs/decisions.md` 2026-10-12 (P1464), 2026-09-15 (embargo deploy order; branch-born dead
  ends), 2026-09-11 (P1302, P1303 incidents), 2026-09-04 [technical] (credential-topic specs
  in `.private/`).
