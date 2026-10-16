---
status: qa
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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
> **Founder contract (2026-10-16, verbatim):** *"If something is sensitive, it stays in .private forever. If something is not sensitive, it is public forever."*
> The founder never takes an extra step and never needs to understand the mechanism. **Decided:** the off-machine copy is made automatically: the branch is kept until the nightly backup snapshot is verified to hold the archived spec and UAT blobs, then deleted by the tool. There is no founder push step; this replaces the earlier "founder pushes .private" design. Kanban marks private specs visibly. Editor search of `.private/` is enabled locally.


> **Renumbered 2026-10-16** from P1495, which a public spec on `main` took three minutes earlier (the number-picker cannot see a spec that is uncommitted in a worktree). Commits before this one say p1495.

# P1507: Sensitive specs are archived privately, never published — even after the fix ships

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
files that reference `features/` paths, 114 are unaffected, 16 read finished specs and are
fine not seeing private ones, 8 should learn to also read the private folder, 11 must
change, and **1 CI gate breaks if the stub is "closed as done"** (measured: exit 1). That
last finding changes the proposed shape: the stub is never moved into `features/done/`. It
is either deleted at close or, as recommended (D8), never created.

## What changes for the founder

Checked against how specs are actually handled today (conversation history since 2026-08,
founder messages only): specs are named by P-number in chat ("ship 1236", "why is 1302
still open in kanban?"), sometimes by pasted path (`features/p1094_….md`); the kanban is
the place to confirm a spec closed and its worktree went away; specs are filed from chat
through `/create-spec`, never by hand.

| Activity | Today | After P1507 |
|---|---|---|
| **Creating** | Say what's needed; `/create-spec` picks public or embargo | Same. Embargo now also covers privacy-sensitive specs, and no "security review pending" file appears on the public repo |
| **Finding by P-number** | Agent resolves `pN` in `features/` or `features/done/` | Same words. A finished private spec resolves to `.private/features/done/<sprint>/` |
| **Kanban** | Main board shows `features/` and `features/done/`; an in-flight embargo spec appears only on its own worktree board | **Founder requirement (2026-10-16):** the main board shows every private spec, in **any** status, mixed in with the public ones and marked with a visible `.private` tag. In flight it is read from its worktree's branch copy; finished, from `.private/features/done/`. No separate lane |
| **Editor search** | `.private/` is searchable (local `.vscode/settings.json`), but `.claude/worktrees` is excluded, so an in-flight embargo spec is **not** found. **Founder-observed 2026-10-16:** Quick Open for `1494` finds nothing, because P1494 lives only in `w3` | Once archived, the spec sits under `.private/` and **is** found. While in flight: unchanged. Re-check once in VS Code after the first real archive (Done-When) |
| **Links** | A doc can link `features/done/…` | A public doc **cannot** link a private spec (validator refuses). Private notes can. Pasting the path in chat works as today |
| **Extra step at close** | Run `publish-spec` after prod confirmation | No publish. The archive runs at close; the branch is removed only once an off-machine copy is confirmed. No additional founder action is expected (see the contract above) |

## Appetite

**Blast radius: medium.** Touches `scripts/git-ops.sh` (replaces `cmd_publish_spec`), one
pre-push check, the doc-link validator, `tools/kanban/server/api.ts`, eight skill files and
the disclosure rule. No product code, no schema. **Reversibility: high** — nothing is
published by this change, every touched file is ordinary tracked code, and an archived
spec can still be published later by hand from the private copy. **Decision density:
nine founder calls** (D0-D8, Decisions Needed). This sits on the security path (P1464's
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
- **The branch is deleted only after an OFF-MACHINE copy is verified by hash.** Every
  archived blob (spec, and UAT pair if any) must be in a nightly backup snapshot taken
  after the archive, with the same git blob id as on the branch, as proven by the backup
  job itself. A local commit does not count. Until then the branch stays.
- **A spec that will be archived privately is never an absorber.** `ship-gates.sh:192-196`
  takes absorption evidence only from a single copy under `features/done/` with a public
  close history, and that cannot exist for a private spec.
- **Nothing already on `origin/main` is "fixed" by deletion** (P1255 Invariant 3).

## Solution

Keep the branch-born lifecycle exactly as it is today until the code has shipped and the
fix is live. Replace the final `publish-spec` step with **`git-ops.sh archive-spec pN`**:

The step runs in two halves. The pause between them is the next nightly backup, which
needs no founder action. (Superseded design: a founder push of the `.private` repo. The
founder contract above removed every extra step.)

**Half 1 — `archive-spec pN`:**

1. **Same preconditions as `publish-spec` today** (`git-ops.sh:3532-3618`): run from the main
   checkout, resolve the branch, exactly one spec file on it, value `embargo`, the spec's
   migrations in `origin/main` `deploy-manifest [prod].migrations` (or `--yes` when there are
   none), authenticated prod smoke passes. These are now the "is it really done" check. Under
   D8's recommended option nothing public happens at close, so they no longer guard a
   publication.
2. **Build an exact manifest:** the spec path and, if present, its UAT pair
   (`features/uat/pN.md`, the same pairing P1464 protects). For each, record the branch blob id
   (`git rev-parse <branch>:<path>`) and the destination
   `.private/features/done/<sprint>/<basename>` (UAT pair under `<sprint>/uat/`), with the
   sprint from `resolve_ship_sprint_dir`. The manifest is the private-repo file
   `.private/features/done/<sprint>/pN.manifest`. Nothing outside the manifest is written or
   staged.
3. **Write each blob** with `git show <branch>:<path>` (as `:3635` does). `.private/` is
   ignored by the outer repo (`.gitignore:106`, verified with `git check-ignore`), so there is
   no `git mv` and no outer `git add`. The private copy keeps `disclosure: embargo`. D4 of
   P1255 rewrote that value only because the copy was going public.
4. **Commit exactly the manifest's paths in the inner `.private` repo.** It is its own git
   repo (`.private/INDEX.md:5`). Run `gitleaks
   protect --staged` first, per that repo's rule. Then confirm `git -C .private rev-parse
   HEAD:<dest>` equals the branch blob id for every entry. Git blob ids depend only on
   content, so equal ids mean the bytes are identical.
5. **Refuse if any other local ref contains a withheld spec commit** (the ship journal records
   them). This is the lesson of decisions.md 2026-09-11 [process], "An embargoed spec reached main,
   and taking it off main did not take it off the branches cut from that tip": a ref cut while spec content
   was reachable keeps it, and shipping that ref later would carry it to `main`.
6. **Stop.** The branch and worktree are untouched until the backup proves the copy.

**Half 2 — `archive-spec pN --finish`:**

7. **Read the backup's proof.** After each verified snapshot, the nightly backup job reads
   every `pN.manifest` as plain data (strict line shape, no `..`), dumps each listed file
   from its own snapshot, hashes it, and writes `pN.proof` (snapshot time plus blob id per
   file) outside the repo. Half 2 requires a proof whose snapshot started after
   `archived_at` and that lists every manifest blob. Any miss stops the step with nothing
   deleted. **Built this way after the 2026-10-16 security review:** the job holds the
   backup credentials, which agents are walled off from, so it must never execute code from
   this agent-writable repo. A forged proof costs at most the branch, while the `.private`
   copy remains on disk and in every later snapshot. `archive-spec --finish-pending` runs
   Half 2 for every archive still waiting (from `/day`).
8. **Public side, depending on D8.** Under the recommended option there is no public stub,
   so this step does nothing on `main`. Under the stub-kept option, make one commit under
   `main.lock` that only deletes the stub. Its subject is fixed text, `chore: close pN`,
   never the title. Nothing is added under `features/done/`, so `closure-gate.yml:135` has
   nothing to judge (see Findings).
9. **Tear down the worktree and delete the branch** (existing teardown, `:3680-3696`).

**Absorption (`absorbed_by:` / `absorbs:`):** a spec bound for private archive may not
absorb another spec. `ship-gates.sh:192-196` takes absorption evidence only from exactly
one copy under `features/done/` whose close commit is in public history (`:236-252`). A
private absorber would read as "not shipped". That fails closed (the absorbed spec cannot
close), not open, but it leaves the absorbed spec stuck. Rule: `create-spec`/`dev` refuse
`absorbs:` on an `embargo` spec. A public spec whose scope a sensitive fix covered closes
through its own work or as `withdrawn:` (`scripts/lib/admin-close.sh`), with a neutral
reason.

**Scope (D1, D2):** `embargo` is redefined as *"must never be published: a live or fixed
security defect, privacy-sensitive content, or anything similar"*. Same branch-born
authoring. The public placeholder is D8. Notes that will never produce code (no build, no ship) go straight to
`.private/` from creation and never enter `features/` — that is today's pattern for
`.private/docs/security-log.md`, and the 2026-09-04 [technical] entry
("Credential-exposure disclosure stays an authoring control") already proposed it for
credential-topic specs.

**Read side (D5):** `tools/kanban/server/api.ts` gains a second scan root
`.private/features/` for the main checkout, following the CRM precedent at `api.ts:427`
(`.private/crm/opportunities`). Skills that look up a *closed* spec by P-number fall back to
`.private/features/done/`.

**The public placeholder is itself a register (D8).** Today's stub (`create-bug.md:60-73`,
`create-spec.md:42-60`) is named `pN_security-review-pending.md`, carries the tag
`[disclosure-embargo]`, and says "active security disclosure embargo". Each one announces
"a security hole was opened on this date", and its removal says when it was closed.
**28 commits on `origin/main` already touch such stubs** (`git log origin/main --
'features/*security-review-pending*' | wc -l`, 2026-10-15). Those are public and stay
public. A "generic" stub does not help either: if only sensitive specs ever use it, the
generic name is just as much a register. Options:

- **S1 (recommended): no public stub at all.** While the work is in flight, the number is
  held by the worktree lock and the worktree's own `features/` dir, which
  `next-p-number.sh:35-41` and its lock scan already read. After archive it is held by a
  new scan of `.private/features/` (next-p-number runs locally only, so reading `.private/`
  exposes nothing). `ship` already works with no stub on `main`:
  `test-p1464-ship-embargo.sh` case A2 ("branch-born, no stub") passed on 2026-10-15. What
  stays public is a permanent gap in the number sequence. That gives a count and a rough
  creation date (from neighbouring numbers), but no label and no close date.
- **S2: keep a stub, made generic.** Filename `pN_reserved.md`, no tag, body "Reserved."
  It still leaks count, open date and close date, as long as only sensitive specs use it.
  Requires changing `spec-intent-gate.sh:67` (exact `STUB_BODY`) in lockstep.
- **S0: keep today's stub.** Leaks count, dates and the word "security".

### Where a sensitive spec lives at each stage

| Stage | Location | Committed? | Off-machine copy |
|---|---|---|---|
| Authored, in flight | `features/pN_<slug>.md` on local branch `feature/pN-<slug>` in a worktree; `main` has nothing (S1) or a placeholder (S0/S2) | Yes, on the unpushed branch | Home-directory restic backup (`.git` included since 2026-08-25, excludes only regenerable caches). **Not verified against a snapshot listing** — Done-When. Never on GitHub: `git ls-remote --heads origin` returned exactly one head, `main` (2026-10-15) |
| Code shipped, waiting for prod | Same branch, retained by ship (`git-ops.sh:5097-5098`); code is on `main` | Yes, on the branch | Same as above |
| Archived, not yet verified off-machine (after Half 1) | Both: the branch, and `.private/features/done/<sprint>/` committed in the inner repo | Yes, twice, on one disk | restic only. **Measured 2026-10-15: the inner repo is 17 commits ahead of its remote with 113 uncommitted paths**, so "it is in `.private`" does not mean "it is off this machine" |
| Done (after Half 2) | `.private/features/done/<sprint>/` is the **only** copy; the branch is deleted | Yes, in the inner repo | The nightly backup snapshot, with every blob id verified (step 7), plus restic |
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
| 5 | The deleted branch still holds the spec in local reflog/objects | ACCEPT | Harmless on this machine: objects leave only when reachable from a pushed ref (row 1). Backed up encrypted by restic. The real risk is another ref cut while spec content was reachable | decisions.md 2026-09-11 [process] (P1302) | Step 5 refuses while any other ref contains a withheld spec commit |
| 6 | Evidence artifacts outside the spec: goalify pins + review files, `INDEX.md` line, public link to the private file | MITIGATE (new) | None: `/goalify` commits `features/verification/pN/` to `main`; `/kdd` appends every closed spec to `features/done/INDEX.md`; a link into `.private/` passes the doc-link check as `external` | `goalify/SKILL.md:197-205`, `kdd/SKILL.md:208`, `validate-doc-links.cjs:352-354` | Goalify refuses on `embargo`; kdd writes `.private/features/done/INDEX.md` instead; links into `.private/features/` fail the validator |
| 6b | A public `docs/decisions.md` entry from a sensitive session describes the hole | MITIGATE (new) | `/kdd`'s privacy split (P1438) classifies entries by names, deal terms and competitive detail, not by security content | `kdd/SKILL.md:117-121` | A session that touched an `embargo` spec defaults every entry to **private-only**. A public entry is written only after the founder reviews its text |
| 7 | The placeholder is a public register (count, open/close dates, the word "security"). 28 such commits are already on `origin/main` | MITIGATE (D8) / ACCEPT history | Stub template | `create-bug.md:60-73`, `create-spec.md:42-60` | S1 drops the stub. Only a permanent number gap remains: count and rough open date, no label, no close date. ACCEPT the 28 existing commits |

## Findings — the September failure modes against this shape

Each "cannot recur" holds only under the condition stated with it.

1. **`ship` `git mv`s the spec at close** (P1255: an untracked spec made the close die).
   **Cannot recur, provided the spec is tracked on its branch until ship has run.** For
   `embargo` the close is skipped (`git-ops.sh:4966-4972`). Archive reads the blob with `git
   show` and writes an ignored path, so there is no `git mv` on the outer repo. It **would**
   recur if a buildable spec were authored straight into `.private/`: `resolve_ship_spec`
   (`:2321`) would find nothing.
2. **`setup-worktree.sh` seeds from `git ls-files 'features/p*.md'`** (now `:151`).
   **Cannot recur, provided all work on the spec happens in its original worktree, which is
   kept from `claim` until Half 2.** `main` has no copy (none at all under S1), so seeding
   never delivers it. `cmd_claim` always runs `git worktree add -b <branch> main`. A second
   `claim` for the same P-number either fails, because the branch already exists, or with a
   different slug creates a fresh branch from `main` that has no spec. Resuming after
   teardown therefore needs `git-ops.sh adopt` or a manual `git worktree add` of the existing
   branch. The rule text has to say so. It would also recur for a spec authored in
   `.private/`: `setup-worktree.sh` has no `.private` handling (`grep -n private` returns
   nothing).
3. **goal-gate CI cannot find the spec in a fresh checkout** (`goal-gate.yml:84`,
   `goal-gate.sh:94`). **Cannot recur, provided no contract pin for pN ever lands on
   `main`.** CI never runs on the unpushed branch. On `main` the gate applies only to
   P-numbers with a pin on `main` (`goal-gate.yml:87-93`). If a pin existed, any later `main`
   diff touching `features/pN…` (the S0/S2 stub deletion, for example) would make
   `goal-gate.sh:94` exit 1 with "no spec found". So `/goalify` must refuse on `embargo`
   (leak path 6). **Its sibling does break:** `closure-gate.yml:135` runs ship-gates gate 2.5
   on any `pN_*.md` **added under `features/done/`**. Moving the stub there ("closed as done")
   fails it. Measured: `ship-gates.sh p1487 --spec-file <stub with status all-done> --only
   2.5` exits **1** ("no '## Acceptance Criteria' and no '## Done-When'"), while the real
   closed p1487 spec exits **0**. The administrative route (`scripts/lib/admin-close.sh`)
   needs a `withdrawn:` marker, which would be false. Hence the stub is never moved there:
   it is either absent (S1) or deleted (S0/S2).

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
| (a) unaffected | 114 | Top-level / in-flight paths only, fixed citations of public specs, hermetic test fixtures, or archived scripts nothing calls |
| (b) fine without private specs | 16 | Reads finished specs; missing a private one is acceptable |
| (b) should also read `.private/features/done` | 8 | Founder-visible or audit capability would silently lose private specs |
| (c) must change | 11 | Names `publish-spec`, encodes the old stub/exit, or opens a leak path |
| (c) breaks under the proposed shape | 1 | Only if the stub is moved into `features/done/` |

**(b) fine (16):** `challenge-prd.md:308`, `architect.md:186`, `create-prd/agent.md:79`,
`critique-ux.md:54`, `prep-spec/SKILL.md:162`, `prep-spec/synthesizer.md:106`,
`day-cp.md:1466`, `programme-health/SKILL.md:128` (driver ratio undercounts private specs),
`weekly/SKILL.md:773,837`, `block-manual-spec-close.py:40`
(its `features/done/` regex also matches `.private/features/done/`, so hand-archiving is
blocked — wanted), `check-duplicate-p-numbers.sh:15,19`, `fix-frontmatter.py:144,375`,
`next-p-number.sh:62-66` (under S1 it moves to (c): it must also scan `.private/features/`),
`pipeline-strandings.sh:141`, `pre-commit-checks.sh:202,1270`,
`tools/kanban/scripts/validate-features.ts:157`.

**(b) should read the private folder (8):** `change-request.md:61` and `dev.md:74`
(change-request predecessor), `fix.md:600` (deferral lookup), `revert-feature.md:47,131`,
`postmortem/SKILL.md:35`, `tools/kanban/server/api.ts:38-78`, `verify/SKILL.md:82,93,99`
(its resolver finds open and worktree specs only, so a `/verify` after archive finds
nothing), and `tos-review/SKILL.md:28`. That last one is the legal audit: it reads
`features/done/INDEX.md` as "all shipped features" to decide whether the ToS or privacy
policy needs an update. A privacy-category change archived privately would drop out of it,
so it must also read `.private/features/done/INDEX.md`. (Reclassified after review; the
first draft had verify in (a) and tos-review in (b) fine.)

**(c) must change (11):** `git-ops.sh:3532` (+ messages `:4972`, `:5098`),
`ship-gates.sh:344,360`, `check-disclosure.sh:83,90-94`, `spec-intent-gate.sh:67` (exact stub
text — changes in lockstep with the stub template), `validate-doc-links.cjs:352-354,573`,
`test-p1464-ship-embargo.sh:258-330,604-616` (D1/F2/I3 exercise `publish-spec`),
`create-spec.md:42-66`, `create-bug.md:54-78`, `ship.md:53`, `kdd/SKILL.md:208`,
`goalify/SKILL.md:197-205`. `ship-gates.sh:192-252` (absorption) needs no code change: it
fails closed. The rule against absorbing into a private spec lives in the skills (Solution).
`kdd/SKILL.md:117-121` also gains the sensitive-session default (leak path 6b). Not in the
census scope but also rewritten:
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
6. **Keep the withheld branch as the permanent record** (reviewer's proposal, D0). Ship
   already retains the branch and worktree for `embargo` (`git-ops.sh:5097-5098`), so the
   terminal step could be "do nothing more": no extraction, no inner-repo commit, no branch
   deletion. This is a real option, and in some ways the stronger one:
   - **For it:** fewer moving parts at close. There is no second repo, no manifest and no
     hash check. The spec keeps its full commit history rather than one final blob.
     Nothing ever changes location, so there is no copy step to get wrong.
   - **Against it, verified:**
     (i) **It is the object behind the 2026-09-11 incident.** A long-lived branch carrying
     withheld commits is "ahead of main" forever, and every ref cut from it or merged with it
     carries the spec.
     (ii) **The repo's own health checks treat it as a defect.**
     `pipeline-strandings.sh:175-181` reports every `feature/*` branch without a worktree as
     "BRANCH, NO SLOT … commits here are easy to lose" (P781 one-worktree-one-branch). Keeping
     worktrees instead uses up the finite `wN` slots.
     (iii) **Every reader must become branch-aware.** The kanban reads worktree directories
     (`api.ts:64-100`), and the eight "(b) should read" skills read files. Each would need
     `git show <branch>:<path>`, a much bigger change than one extra folder. The founder
     asked for the opposite ("just another folder").
     (iv) **The off-machine copy has no path today.** Pushing `feature/*` to GitHub is
     refused (`pre-push-checks.sh:97`). The outer repo has a single remote, `origin` (`git
     remote`, 2026-10-15). Pre-push allows a non-GitHub remote (`:67-68`), so a private
     mirror remote could be added, but that is new infrastructure. Until then the only
     backup is restic of `.git`, which has not been verified.
     (v) **A re-run of `ship` on a retained branch has re-applied commits before**
     (decisions.md 2026-09-15 [process], P1315).
   - **Verdict: recommend the `.private` archive (Solution) over D0.** D0 saves the
     extraction step. In exchange it keeps permanently the one object every embargo incident
     involved, and it makes every reader branch-aware. A middle path stays open if history
     matters: Half 1 can also store `git bundle create pN.bundle <branch>` next to the spec
     in `.private`, which keeps the full history as one file and needs no new reader.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The private copy is lost (only copy, inner remote lags) | MITIGATE | The branch is deleted only in Half 2, after every manifest blob id is confirmed on the private remote (step 7, Invariant). restic coverage is checked once (Done-When) |
| A public spec becomes un-closable because its absorber went private | MITIGATE | Skills refuse `absorbs:` on `embargo` specs. `ship-gates.sh:192-252` fails closed if it happens anyway |
| A privacy change escapes the ToS/privacy-policy audit | MITIGATE | `tos-review` also reads the private INDEX |
| A private spec is copied back into `features/` and pushed | MITIGATE | Leak path 3 pre-push refusal |
| `embargo` now means "never publish", which the word does not say | ACCEPT | Cheaper than a fail-open window across five readers; rule text explains it |
| Programme-health and similar counts silently exclude private specs | ACCEPT | Small numbers; state it in those skills only if a count is ever acted on |
| Public decisions entries about sensitive work lose their spec link | ACCEPT | Same as today while embargoed. Sensitive-session entries default to private-only (leak path 6b) |
| `.agents/skills/` mirror drifts from edited skills | MITIGATE | Regenerate with `scripts/sync-agent-skills.sh` in the same change |
| The archive refuses because a co-tenant branch contains a withheld commit | ACCEPT | Correct refusal; the fix is to clean that ref, as on 2026-09-11 |

**Non-Goals**
- Do **not** unpublish or relabel specs already on `origin/main` (frozen, P1255 D2).
- Do **not** add a content detector for sensitive text (rejected 2026-07-15, P1248).
- Do **not** move in-flight authoring of buildable specs into `.private/`.
- Do **not** change P1464's classifier logic — only the step after it.
- Do **not** commit a list of private specs anywhere public, including the kanban.

## Acceptance Criteria

- [x] `git-ops.sh archive-spec pN` (Half 1) writes exactly the manifest's paths (spec + UAT
      pair if present) and commits exactly those paths in the inner repo. Each committed blob
      id equals the branch blob id. The branch and worktree are untouched, and nothing on
      `main` changes.
- [x] `archive-spec pN --finish` (Half 2) deletes the branch only after the backup's proof
      shows every manifest blob id in a snapshot newer than the archive. A control with one blob
      missing from the remote refuses, and the branch still exists afterwards (exit code
      pasted).
- [x] Under S0/S2 only: the `main` commit contains exactly one path, the stub deletion, with
      subject `chore: close pN`. Under S1: Half 2 makes no `main` commit, and
      `next-p-number.sh` does not reissue an archived P-number (control: delete the worktree,
      run the script, the archived number is still excluded).
- [x] Half 1 refuses with non-zero exit and changes nothing when: a prod gate fails; an inner
      repo blob id does not match; another ref contains a withheld spec commit; it runs
      outside the main checkout. Each refusal exercised, exit codes pasted (epistemic gate 7).
- [x] `create-spec`/`dev` refuse `absorbs:` on an `embargo` spec. (`create-spec.md` step 5; `dev.md` has no `absorbs:` handling to change — main dfb4597be)
- [x] `/kdd` defaults every entry from a session that touched an `embargo` spec to
      private-only.
- [x] Pre-push refuses a range that adds or modifies a `features/**.md` blob reading
      `disclosure: embargo` (failure exit pasted), and the repo's own workflows still pass
      through it — a normal ship push and a stub-reservation push (gate 7c).
- [x] `validate-doc-links.cjs` fails a public link into `.private/features/`; a link to
      `.private/docs/security-log.md` still passes (both directions in one run).
- [x] The kanban main board shows `.private/features/done/` specs (if D5 = yes), and a
      worktree board is unchanged.
- [x] The eight "(b) should read" consumers fall back to `.private/features/done/`
      (including `verify` and `tos-review`).
- [x] `/kdd` writes private closes to `.private/features/done/INDEX.md`; `/goalify` refuses
      on `embargo`.
- [x] Stub template (removed under S1, made generic under S2), `spec-intent-gate.sh` `STUB_BODY`, `create-spec.md`, `create-bug.md`,
      `ship.md`, `ship-gates.sh`, `check-disclosure.sh` and `.claude/rules/features.md` (via
      `/slava:maintain:claude-md`) describe the new exit; no file outside `git-ops.sh` history
      names `publish-spec` as a step. (Stub template removed; `spec-intent-gate.sh` `STUB_BODY`
      is left as-is so a legacy stub still validates until `archive-spec --finish` deletes it.)
- [x] `test-p1464-ship-embargo.sh` covers archive instead of publish and passes; the closure
      gate is shown not to fire on the archive commit.
- [x] `.agents/skills/` regenerated.

## Done-When

- [x] P1266's two `publish-spec` Done-When items are marked superseded by this spec.

## Follow-ups after ship (not gating; each needs the next nightly backup or a later step)

These cannot be observed before ship: the first needs a real sensitive spec through the
archive and one nightly backup run, the second the founder's editor.

- First real case: P1494 through ship (when built), Half 1, a nightly backup, and Half 2 —
  `git ls-tree -r --name-only origin/main` holds no file with its slug, the backup's proof
  holds the manifest's blob ids. Until P1494 is built, its spec-only archive is the case.
- VS Code Quick Open for the archived spec's number finds its `.private/features/done/`
  file (founder screenshot, or a computer-use check).
- `docs/decisions.md` entry recording this change and the founder answers that overturn
  P1255 D3 (placeholder), D4 and the publish step — written by this session's `/kdd`.

## Known limitations (review 2026-10-16, set aside)

- The kanban shows an in-flight sensitive spec only while its worktree exists. Ship keeps
  the worktree for embargoed specs, so this only bites after a manual teardown.
- The archive refuses a branch carrying merge commits rather than proving what they changed.
- A proof file is forgeable by anything running as the founder; the cost is a branch deleted
  while the `.private` copy (on disk and in later snapshots) remains.
- The ref check covers branches, tags and remote refs, not `refs/stash` or a detached
  worktree HEAD.

## Rollback Strategy

Revert the commits. Nothing is published by this change, so a rollback exposes nothing.
Any spec archived meanwhile still exists in the inner repo and can be published by hand
(copy into `features/done/`, rewrite the field to `public`, delete nothing else) — the
same commit shape `publish-spec` produces today, recoverable from git history.

## Decisions Needed

- **D0 [FOUNDER DECISION] — where does a finished sensitive spec live?** (a) Copy it into
  the private `.private` folder and delete its branch once the copy is confirmed
  off-machine, or (b) simply keep its branch forever as the record? *Recommendation: (a).*
  (b) has fewer steps at the end. But a branch kept forever is exactly the thing that
  leaked on 2026-09-11, the repo's health checks flag it as lost work, and every tool would
  need to learn to read branches instead of a folder. (a) matches "just another folder".
  If you want the spec's full edit history too, (a) can also save the branch as a single
  bundle file next to it.
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
- **D4 [FOUNDER DECISION] — if a public placeholder exists, what happens to it at the
  end?** Delete it (the number stays reserved and no check breaks), or keep it on the board
  as "done" (breaks the closure check unless we add an exception)? *Recommendation: delete
  it.* This only matters if D8 keeps a placeholder.
- **D5 [FOUNDER DECISION] — should your kanban show the private finished specs?**
  *Recommendation: yes, on the main board only, read from `.private/` the way the CRM
  cards already are.*
- **D6 [FOUNDER DECISION] — may the archive step commit into the private `.private` repo
  by itself, with you pushing it?** The step commits exactly the spec (and its test
  checklist, if any) after the secret scan. You push `.private` as you do today. The branch
  is deleted only after a second run confirms the exact files reached the private server.
  *Recommendation: yes.*
- **D7 [FOUNDER DECISION] — anything retroactive?** Security specs already published stay
  published and frozen (your 2026-09-08 call). *Recommendation: confirm; deleting them
  from the repo would not remove them from history.*
- **D8 [FOUNDER DECISION] — keep a public placeholder at all?** Today each sensitive spec
  puts a "security review pending" file on the public repo, and 28 public commits already
  show when each one opened and closed. Options: no placeholder (only a missing number is
  visible), a bland "reserved" placeholder (still shows dates), or today's placeholder.
  *Recommendation: no placeholder.* It reveals the least. Ship already works without one,
  and the number-picker can be taught to skip archived numbers. This reverses your
  2026-09-08 choice (P1255 D3), which wanted the placeholder to hide gaps. The trade-off is
  that a missing number now hints that something private exists, but no longer says
  "security" or when it was fixed.

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
