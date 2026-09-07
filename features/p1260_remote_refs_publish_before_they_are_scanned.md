---
status: in-progress
type: task
rank: 1000078
workstream: infra
created_date: '2026-09-07'
tags: [git, privacy, push, branches, tooling]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1260: Ref-class publication is unguarded, and no ref this pipeline creates is reclaimed

> **Rewritten 2026-09-07 after three adversarial reviews (2 reported, 1 refused at its wrapper).**
> The first draft proposed "scan content before the staging push". That half is **withdrawn on
> measurement**, not on argument — see Withdrawn Mechanism below. What survives is a different
> control (ref-class policy) plus reclamation.

## Problem

**Situation:** Every push to this **public** repo (`gh repo view` → `"visibility":"PUBLIC"`) first
lands an ephemeral branch on `origin`, and CI scans it *after* it is there. The order is structural:
GitHub binds a required check to a commit SHA, so the ref must exist before the check can. Pre-receive
hooks — the only thing that could reverse this — are unavailable on public-cloud GitHub, recorded in
P919. **On a public repo, a ref that has landed is published.** The check gates promotion to `main`;
it cannot un-publish what it just scanned.

**Complication 1 — the content control that exists does not work, and this is now measured.**
`.git/hooks/pre-push` → `scripts/pre-push-checks.sh` already runs `audit-privacy.sh` over the exact
range being pushed and blocks on a hit. Run against the commits that actually introduced the six
things this repo redacted between 2026-08-28 and 2026-09-07 — a person's name, a credential
inventory, live-vulnerability reproduction steps — it passes **all six**. Two independent
measurements agree (this session, and the Fable review, which additionally re-committed each
redaction's *removed* lines into a scratch repo and re-scanned: 0 hit-lines, exit 0, six for six).
Both runs carried controls through the identical probe — a canary commit and a `/Users/…` path both
produce exit 1 — so the probe discriminates and the six zeros are true negatives. The scanner's
pattern space is personal emails, one handle, one absolute path, a canary sentinel, and third-party
emails. **The six leaks are not in that space, and P1248 already refused to build a detector that
would cover them** (2026-09-04: the detector's own reference data is more sensitive than what it
detects). What caught all six was a person reading a diff. That is the only mechanism with a
six-of-six record and it is not written down anywhere as a control.

**Complication 2 — a ref class that must never be public has nothing stopping it.**
`features/p1255_security_specs_publish_before_the_defect_is_fixed.md` resolves to making security
specs **branch-born**: filed on a `fix/pN-*` branch, never seeded on `main`, so they are not public
until they ship. That mechanism rests entirely on such a branch never being pushed. **Verified:
`scripts/pre-push-checks.sh` contains zero branch-name restrictions.** One `git push origin
fix/p1234-whatever` publishes an embargoed spec, and nothing in either spec owns that invariant.
P1255's property is today observed (no `feature/`/`fix/` branch has ever been pushed), not enforced.

**Complication 3 — nothing reclaims any ref this pipeline creates.** `cmd_push_docs`
(`scripts/git-ops.sh:3476`) deletes its staging branch on several paths, but the timeout, failed-CI
and declined-promotion paths **deliberately** leave it — *"Staging branch … left for inspection"*
(`git-ops.sh:3369, 3377, 3907`) and *"Cancelled. Staging branch … still exists"* (`:3398`). Nothing
ever comes back for it. Measured on `origin` today: `staging/doc-20e894b89` (2026-09-04),
`staging/doc-d7eb148d` (2026-09-01), `presi/habit-slide-3step` (2026-06-15). A sweep exists —
`cmd_gc` (`git-ops.sh:720`) — with **zero operator callers** (only its own test harness at
`scripts/test-git-ops-extensions.sh:197`), a candidate filter of `^(feature|fix)/p[0-9]+`
(`:748`) that matches none of the three, local `git branch` only (`:747`), a 30-day cutoff, and
**no merged-ness check of any kind** — it selects on age and worktree-exclusion alone.

**Question:** What refuses to publish a ref class that must stay private, and what reclaims every
ref this pipeline creates — given that content scanning is measured blind and a content detector is
already rejected?

> Founder framing, verbatim: *"we have this flow o f pushing branches and not cleaning them up and
> it has two issues.. first privacy leaks, second sforegeitng to merge or clean them up .. siilar
> also branches locally we forget to merge and clean them up .. **one of the reaosnsin is i dont
> monitor brnaches i monitor worktress in kanban**"*

**That last clause is the mechanism, verified at the source.** `tools/kanban/server/api.ts:64`
parses `git worktree list --porcelain` and reads each branch name *out of a worktree record*. A
branch is visible to the founder only if it has a worktree. `/weekly` and `/monthly` contain zero
occurrences of "branch" or "remote". Every staging branch, every abandoned branch, every ref on the
remote is structurally absent from the only board anyone looks at.

## Second confirmed occurrence — 2026-09-07, P1257

Added by the P1257 session as evidence, not as a change to this spec's design.

A spec carrying re-identifying detail about a real person (a role, plus a dated public event with a
small attendee list, plus a mail provider) reached `origin/main` and a `staging/` branch on this
**public** repo. The staging push behaved exactly as this spec describes: the ref landed, *then*
`audit-privacy` scanned it, and the scan passed — because the pattern-based gate does not detect an
arbitrary third-party characterization, only known identifiers. `.claude/rules/pii.md` already says
so: *"A green gate is not evidence that this rule was followed."*

Two details worth carrying into the design:

1. **The privacy review ran after the push, not before.** Nothing in the push path required it
   first; the operator remembered. This spec's ordering fix would have made the sequence moot.
2. **Remediation was mis-scoped for hours by a bad probe.** The blast-radius check used a path
   (`features/done/…`) that only exists after a spec closes locally, so `git show` returned "path
   does not exist" for a file that was public at its *unclosed* path — and that absence was reported
   as safety. Any reclaim tooling this spec produces should answer "is this published?" by searching
   the tree (`git grep <token> origin/main`), never by addressing a guessed path.

Both refs were deleted and the text is gone from the current tree; history still holds it, which is
this spec's point about refs being reclaimed by nothing.

**References:** `docs/decisions.md` 2026-09-07 [process] "A probe aimed at the wrong path returns
absence" · features/done/*/p1257_*.md

## Appetite

**Blast radius: high** — touches the push path, which this repo's log records breaking under change
(a one-line edit to a CI-poll guard hit the wrong one of two byte-identical blocks and would have
hard-failed every prod deploy). A wrong reclamation rule destroys work.

**Reversibility: mixed, and the asymmetry is the point.** Tooling changes revert in one commit. A
published ref is not reversible by anything — history rewriting here has been refused three times
(2026-02-28, 2026-08-28, 2026-09-05), never on mechanism grounds.

**Decision density: two founder calls** (D1, D2).

## Invariants

- **Nothing already on a public remote is recoverable by deletion.** Cloned, cached, indexed.
  Deleting the ref changes nothing and must never be presented as a fix.
  (`docs/decisions.md` 2026-09-05, history-rewriting entry.)
- **"Not pushed yet" is not a safety property.** Any commit on the shared main checkout is queued
  for publication by whoever pushes next. (`docs/decisions.md` 2026-09-04 [process].)
- **A reclamation rule fails SAFE: any commit it cannot match ⇒ keep the branch.** Never a
  threshold, never a percentage, never "close enough". See Risks for why both available oracles are
  individually wrong.
- **A merged-ness oracle must be revert-aware.** `docs/decisions.md` 2026-09-05 [technical]
  (*"Rebasing work that was previously REVERTED silently drops commits — patch-id matches the
  revert's history, and every gate stays green"*) is the governing ruling and was **missed by this
  spec's first draft**. Live on this repo: `95036cca3` (2026-09-03 17:31) was reverted by
  `37984ff00` (17:35) and only re-landed as `06dad4d3e` on 2026-09-05. For those two days **both**
  oracles would have called the holding branch fully merged while `main` lacked the content, and
  that worktree no longer exists, so worktree-exclusion would not have saved it.
- **Any new gate must be run against the workflows that already exist before it ships.**
  (`.claude/rules/epistemic.md` gate 7c.)

## Withdrawn Mechanism — content scanning before the staging push

Recorded rather than deleted, so it is not re-proposed. All three options the first draft offered
are dead:

1. **Local pre-push scan.** *Already built and running* (`.git/hooks/pre-push`), and measured blind
   on all six leaks. Proposing to build it was the first draft's largest error.
2. **Scan on a private self-hosted remote first.** Dead by a recorded hardening decision, not merely
   unverified: that host has Actions disabled by design, and live tests recorded settings/Actions
   changes being rejected. It cannot run the workflow.
3. **Accept publish-then-scan and shorten the window.** Not a rival mechanism — it is Solution
   item 3 below.

**Consequence:** publish-then-scan on `origin` is **accepted** as a property of a public repo with
no pre-receive hook. The control for leak *content* is authoring-time — P1255 plus worktree
authoring, which `docs/decisions.md` 2026-09-04 [process] already named — and it is not this spec's.
This paragraph belongs in `docs/decisions.md` and should be filed there whether or not the rest of
this spec is built.

## Solution

Three items. None depends on content scanning.

1. **Refuse to publish a private ref class.** Add a layer to `scripts/pre-push-checks.sh` that
   blocks pushing any `feature/*` or `fix/*` ref to the public `origin`, with an explicit,
   auditable escape for the rare intentional case. This is what makes P1255's branch-born
   mechanism an enforced property rather than an observed habit, and it is independent of what any
   scanner can recognise.
2. **Widen and correct `cmd_gc`.** Enumerate all local branches *and* `git ls-remote origin`;
   replace the `^(feature|fix)/p[0-9]+` filter with an explicit exclusion set (`main`, anything
   held by a worktree or slot lockfile); add the merged-ness classification it does not currently
   have, built as: `git cherry` (patch-id) **and** subject match, **plus** a revert scan — and
   report `KEEP — unmatched: <shas>` whenever the three do not agree. Report-only by default;
   deletion keeps P781's two-flag requirement.
3. **Reclaim and surface.** Make `cmd_push_docs` delete its staging ref on the abort paths that
   currently preserve it, or record it somewhere a sweep will find it; extend the same to the
   ship path's `staging/pN` refs, which item 2's sweep would otherwise be the only thing covering.
   Add a branch-and-remote-refs step to `/weekly` that prints the sweep's report in the Evidence
   Picture — the founder's board cannot show these by construction, so the periodic review is
   where they have to appear.

**Not in scope:** what content may be written into a public file. That is P1255, which handed this
spec off in writing (*"Adjacent gap — NOT in scope, needs its own spec … Recorded so the two are
not merged"*). The one place they touch is Solution item 1, which enforces P1255's mechanism; that
shared invariant is named here because neither spec previously owned it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A reclamation rule deletes real work | MITIGATE | Fail-safe invariant: any unmatched commit ⇒ keep. Both oracles are individually wrong — measured on `backup/p1165-orig-20260827` (29 commits): `git cherry` says 3 unmatched, subject match says 1, and `c431d2ec` subject-matches `main`'s `eb56d6e3` while their patches differ by 382 lines across 5 files. Reverted work defeats both (Invariants) |
| Blocking `feature/*`/`fix/*` pushes breaks a legitimate workflow | MITIGATE | Gate 7c: run the repo's own documented sequences through it before shipping — `/ship`, `push-docs --resume`, `commit-to-main`. The escape hatch must be explicit and logged, never a touch-able flag (the `.allow-pii-next-push` one-shot was removed for exactly that reason) |
| Editing `cmd_push_docs` breaks the push path | MITIGATE | `git-ops.sh` holds two byte-identical CI-poll guards; a prior single-line edit hit the wrong one and would have killed every prod deploy (`docs/decisions.md` 2026-09-04 [process], push-on/`--resume` entry). Disambiguate every edit by enclosing function |
| Unconditional staging-ref deletion races a co-tenant | MITIGATE | `main.lock` is held across the promote, and `git-ops.sh` carries an explicit SAFETY NOTE that the delete becomes unsafe if that lock is ever released across the CI poll. Re-read it before touching the delete |
| The three refs on `origin` today are an exposure | ACCEPT | Measured: each carries 0 commits not already on `origin/main`. Cleanup debt, not a leak — independently confirmed by two reviewers and this session |
| Leak *content* still reaches the public remote | ACCEPT | Explicitly out of scope and unsolvable here (Withdrawn Mechanism). Owned by P1255 + authoring-time discipline |
| The six already-published leaks stay published | ACCEPT | Deletion is not a remedy (Invariants); the rewrite is settled No |

**Non-Goals**
- Do **NOT** rewrite published git history.
- Do **NOT** build a content detector for credentials or exposure mechanics — rejected 2026-09-04
  (P1248).
- Do **NOT** re-propose scanning before the staging push (Withdrawn Mechanism).
- Do **NOT** change spec authoring or embargo rules. That is P1255.
- Do **NOT** make any self-reported frontmatter field load-bearing for a deletion decision.

## Done-When

- [ ] One command enumerates local branches **and** `git ls-remote origin`, and for every ref
      reports: has-worktree, age, and a merged verdict of `MERGED` / `KEEP — unmatched: <shas>`
- [ ] Run against `backup/p1165-orig-20260827`, that command reports **`KEEP`** and names the
      unmatched commits — it must NOT report merged, because 1–3 commits are absent depending on
      oracle. Output pasted in the spec
- [ ] Replaying the 2026-09-03→05 `p1220` revert window, the command reports `KEEP` for a branch
      whose commits were reverted on `main`. Output pasted (this is the case both naive oracles get
      wrong)
- [ ] The `feature/*`/`fix/*` push refusal is shown **blocking** a push to public `origin`, exit
      code pasted (gate 7), **and** shown not blocking `/ship`, `push-docs --resume` and
      `commit-to-main` in the same run (gate 7c)
- [ ] An aborted `push-docs` run leaves no `staging/*` ref on `origin`, verified by `git ls-remote
      origin 'refs/heads/staging/*'` returning empty after a deliberately aborted run
- [ ] `/weekly` prints the branch-and-remote-refs report in its Evidence Picture — one real run
- [ ] The three refs currently on `origin` are resolved per D2
- [ ] The Withdrawn Mechanism paragraph is filed in `docs/decisions.md` — this holds whether or not
      the rest ships

## Alternatives Considered

1. **Keep the first draft's content-scanning half.** Withdrawn on measurement (0 of 6, twice,
   with controls). Recorded above so it is not re-derived.
2. **Split into two specs** (publication boundary / reclamation) — both reviewers recommended it.
   Rejected **after** the rewrite, not before: once the scanning half was withdrawn, what remains
   is one push-path change plus one sweep, sharing the ref-class vocabulary and one `/weekly` step.
   Splitting a three-item change buys process and ships neither half. **If D1 rejects item 1, the
   remainder is pure reclamation and this reasoning no longer holds — split it then.**
3. **A "publication hold" flag other sessions honour.** Rejected 2026-09-04: another coordination
   artifact to forget, unenforceable across sessions that cannot see each other.
4. **Detect-not-prevent: let the ref land, alert, delete.** Strictly weaker here — a deleted public
   ref is still published (Invariants).
5. **Make the kanban show branches.** Rejected as primary: it adds a permanently-populated surface
   to a board whose value is brevity. Revisit if the weekly cadence proves too slow.

## Rollback Strategy

Three independent reverts, any order. The push refusal: revert the `pre-push-checks.sh` layer.
`cmd_gc`: one commit, no state held. `/weekly`: delete the step. No file is deleted, no history
rewritten, no ref destroyed by the rollback itself.

## Decisions Required

- **D1 — the push refusal (Solution item 1).** Block `feature/*`/`fix/*` pushes to public `origin`
  by default? This is the only thing that turns P1255's branch-born mechanism into an enforced
  property. Cost: an explicit escape step on the rare intentional branch push.
- **D2 — the three refs on `origin` today.** Delete all three, or keep `presi/habit-slide-3step`?
  Each carries zero unique commits, so deletion loses no content; the Fable review additionally
  found it is linked from nothing on `origin/main`.

## Decision Criteria

1. **Is the push refusal worth its friction?** → Yes if `git log` shows the repo has ever pushed a
   `feature/*`/`fix/*` ref intentionally. If it never has, the refusal costs nothing and the
   default is obvious. If it has, the escape hatch must be designed first.
2. **Is the merged-ness oracle safe enough to delete on?** → Only if it returns `KEEP` on **both**
   fixtures in Done-When (the `p1165` branch and the `p1220` revert window). If it passes only one,
   ship the sweep as report-only and never wire deletion.

## Open Questions

1. What bounds the age of an unreclaimed ref? The 30-day `cmd_gc` cutoff was never derived from
   anything; the observed leftovers are 3 and 6 days old.
2. Three stale remote-tracking namespaces exist locally for remotes no longer in `git remote`.
   Zero risk, same class of debt — in scope for the sweep or not?
3. The only control with a six-of-six record against real leaks is **a person reading the diff**,
   and it is written down nowhere. Does that belong in `.claude/rules/`, and is it this spec's job?

## Related

- `features/p1255_security_specs_publish_before_the_defect_is_fixed.md` — owns authoring-time
  routing; wrote this spec's handoff. Solution item 1 enforces its mechanism.
- `features/done/2026-06-10/p919_server_side_push_deploy_authorization.md` — built the staging hop;
  records that pre-receive hooks are unavailable here.
- `features/done/2026-04-22/p787_git_ops_sh_extensions.md` — built `cmd_gc`.
- `features/done/2026-04-22/p781_worktree_branch_push_hygiene.md` — one-worktree=one-branch; the
  two-flag deletion requirement.
- `features/p1246_pipeline_controls_are_advisory.md` — the class this spec is an instance of.
- `docs/decisions.md`: 2026-09-04 [process] ("not pushed yet" is not a safety property) ·
  2026-09-04 [technical] (P1248, no content detector) · 2026-09-05 [technical] (reverted work
  defeats patch-id) · 2026-09-05 [process] (history rewriting refused a third time).
- `.claude/rules/epistemic.md` gates 7, 7b, 7c.

## Adversarial review — 2026-09-07 (2 of 3 reviewers reported)

**Fable (repo access): REJECT-AND-RESPEC.** F1 the 0-of-6 replay, with its own scratch-repo
re-scan of the removed lines and its own controls. F2 the private host's CI is disabled — killing option 2
by a recorded decision rather than leaving it unverified. F4 the oracle findings, including the
`p1220` revert trap and the uncited 2026-09-05 ruling. F5 the spec could not be committed
(below). F6 six factual errors. F8 the `staging/pN` ship-path gap, now Solution item 3.

**Codex/gpt-5.6 (no network in sandbox, stated so rather than asserting): REJECT-AND-RESPEC.**
Independently found the count error, the "zero callers" overstatement, the delete-path
mischaracterisation, and — its critical finding — that nothing stops `git push origin fix/pN-*`,
which is now Complication 2 and Solution item 1.

**Gemini 3.8: no review.** Refused at the delegation wrapper (exit 2, private-path pattern) before
the model saw the payload. Its lens (internal consistency) was run inline instead: it found the
spec assuming the favourable answer to its own Open Question 1, an Invariant contradicted by the
then-Solution, and a Done-When box that pre-empted D1 and would have deadlocked `ship-gates.sh`
gate 2.5. All three are fixed above.

**Corrections applied to the first draft:** `cmd_push_docs` is at `git-ops.sh:3476`, not 3717 ·
`backup/p1165` is 29 commits, 28 subject-matched, not 30/29 · `cmd_gc` has zero *operator* callers,
not zero callers · deletion happens on several paths, and the real defect is the abort paths that
preserve the ref deliberately · `7b7494d11` is 2026-08-28, so the six span 08-28 to 09-07 · both
`docs/decisions.md:<line>` citations removed, which pre-commit check 18b (P1171) refuses on added
lines and which would have blocked this file's own commit · the private mirror host's name, path
and network posture removed from this public file — flagged by the Fable review as this spec
reproducing the exact defect it describes.
