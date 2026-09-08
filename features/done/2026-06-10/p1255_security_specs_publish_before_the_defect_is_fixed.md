---
status: all-done
type: task
rank: 1000074
workstream: infra
created_date: '2026-09-07'
tags: [security, disclosure, process, specs]
disclosure: public
pipeline_ran: [create-spec, architect, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-08
---

# P1255: Security specs are published while the defect they describe is still open

## Problem

**Situation:** The public repo carries 162 open feature specs on `origin/main` (measured
`git ls-tree -r --name-only origin/main features/`). Nineteen of the 163 open specs locally
carry `security` in `tags:`. Several of those describe defects that are **not yet fixed** —
one at `status: week` since 2026-08-18, two more sitting in `backlog` — and each names the
component, the class of hole, and the fact that nothing currently guards it. The exploit
mechanics are correctly withheld (they live in `.private/docs/security-log.md`, per the
CLAUDE.md disclosure rule), and that half of the control demonstrably works.

**Complication:** What is not controlled is **timing**. A spec becomes public at
creation-time-plus-next-push — typically weeks or months before the fix lands. The
2026-09-04 ruling established that *"not pushed yet"* is not a safety property: any commit
on the shared main checkout is queued for publication by whoever pushes next. So the window
between "we wrote down where the hole is" and "the hole is closed" is published in full, and
its length is set by backlog priority, not by any security decision.

**Question:** Should publication of a security-tagged spec be deferred until its defect is
fixed — and if so, by what mechanism, given that 265 distinct spec paths are referenced from
public `docs/`, `README.md` and `content/` (75 of them currently-open specs) and
`scripts/validate-doc-links.cjs` runs as pre-commit check 12?

> Founder framing, verbatim: *"I like the idea of publishing specs only after work is done.
> But we also need to review them properly and improve probably our privacy gates in Git and
> here privately when we push."* … *"features are used in so many different places and are
> referenced by so many different places. we know we can't just move it or whatever. We need
> to make sure that we don't break anything."* … *"And what do we do with the current
> breaches? I mean, how to evaluate how bad is the situation?"*

## Appetite

**Blast radius: medium-high** — touches `.gitignore`, the `/ship` close path, the pre-commit
doc-link validator, and whatever reads `features/` (kanban, `goal-gate.sh`, `git-ops.sh`).
Getting it wrong does not break the product; it breaks the delivery pipeline, which is worse
day-to-day. **Reversibility: high** — no file is deleted, and the change is a `.gitignore`
line plus a promotion step; `git revert` restores the prior state. **Decision density: three
founder calls**, all listed under Decisions Required.

## Invariants

- **The control must not require a committed list of what is sensitive.** A file enumerating
  which specs hold security content *is itself the disclosure* — the same finding that
  rejected P1248 (2026-09-04) and P936's names watchlist before it. Any mechanism here must
  derive its scope from data the specs already carry (`tags:`), never from a curated index.
  **This spec obeys its own invariant:** it states counts and statuses, and deliberately does
  not list which spec files are security-tagged.
- **No local capability may be lost.** The founder's tooling reads `features/` from disk;
  a deferred spec must remain a normal file on disk, fully readable by kanban, `/ship`,
  `goal-gate.sh` and every skill. Deferral is a *publication* decision, not a storage one.
- **Nothing already on `origin/main` is treated as recoverable by deletion.** It is cloned,
  cached and indexed. Removal from HEAD changes nothing about exposure and must never be
  presented as a fix.

## Solution

**Revised after adversarial review (Fable, 2026-09-07). The gitignore-based embargo in the
first draft is withdrawn — it breaks the pipeline, in three ways that a filename convention
does not fix.** Verified by command:

- `scripts/git-ops.sh:2399` and `:2913` both `git mv` the spec at close. An untracked file
  makes that `die "ship: git mv failed"`. `/ship` cannot close an embargoed spec at all.
- `scripts/setup-worktree.sh:146` seeds worktrees from `git ls-files -- 'features/p*.md'`.
  An untracked spec never reaches a worktree, so `/dev` and `/fix` cannot find it.
- `.github/workflows/goal-gate.yml:84` selects on `git diff -- 'features/**'` and
  `scripts/goal-gate.sh:94` `find`s the spec in CI's fresh checkout. An ignored file is
  absent from both → `exit 1, no spec found`. **This is P1248 rejection reason 2 reproduced**
  — gitignored artifacts fail their dependent gate open or hard, and that property is
  inherited by any design that hides a file from git.

**The mechanism instead: security specs are branch-born.** File them in a worktree on their
own `fix/pN-*` branch and never seed them on `main`. The file is fully tracked, so every
consumer above works unchanged, and it is simply not on the public branch until it ships.

This is already supported, not new machinery:

- `/ship` has a branch-born path — `git-ops.sh:2602-2626` seeds the creation blob onto main
  at close so the cherry-picks replay cleanly.
- `ship-gates.sh:52-57` reads the spec from the branch.
- `goal-gate.yml:84` sees the branch diff.
- `next-p-number.sh` scans worktrees, so no P-number collision.
- **`git branch -r` shows 8 remote branches: `main`, one presentation branch, two leftover
  `staging/doc-*`. No `fix/` or `feature/` branch has ever been pushed** — the private-by-
  default property is observed, not hoped for.
- It is what `docs/decisions.md` 2026-09-04 [process] already prescribes: *"sensitive
  authoring belongs in a worktree."*

Cost, stated: the kanban board is per-worktree (`tools/kanban/server/api.ts:64-100`), so w0's
board will not show branch-born specs without switching view. That is the whole bill.

**Correction applied at `/architect` (2026-09-07), verified by command — "already supported,
not new machinery" is half true, and "the whole bill" understates it.** Two facts this
Solution asserts do not hold today:

1. **No skill can author a spec on a branch at all.** `create-spec.md` ("## Worktree guard")
   and `create-bug.md` (same section) both compare `git worktree list | head -1` to `pwd` and
   **stop immediately** if they differ, redirecting to w0 — `"Do not create any file until you
   are in the main repo."` The guard is deliberate (it prevents accidental spec-stranding), so
   branch-born authoring needs a narrow carve-out, not a removal. That is Decision 2 below, and
   it is net-new work, not reuse.
2. **`git-ops.sh claim` creates only `feature/pN-*`, never `fix/pN-*`** (`:310`,
   `local branch="feature/${p_number}-${slug}"`). Ship-side resolution accepts both (`:1347`,
   `:2223`), so the asymmetry is invisible until you try to create one. This Solution's
   `fix/pN-*` phrasing names a branch shape the tooling does not produce; the design uses
   `feature/pN-*`.

The mechanism survives both corrections — the close/seed path really is already supported
(`git-ops.sh:2602-2626`), and the kanban cost really is as stated. What changes is the build
estimate: two skill files gain a classification step before their guard.

**Promotion trigger — NOT `/ship`.** The first draft said the spec becomes public "exactly
when it stops describing a live hole." That is false for anything with a migration: `/ship`
merges to `main`, and applying to **prod** is a separate founder-gated step. Publishing at
`/ship` would land at maximum asymmetry — fix readable in the public migration diff, hole
still live on prod. Promotion must be gated on the spec's migrations appearing in
`deploy-manifest.json[prod].migrations`.

**Caveat on that gate, which the reviewer could not see and which matters:** the manifest is a
record, not the database. `.private/docs/security-log.md` 2026-08-10 documents an incident
where it *recorded a migration as applied whose effects were absent*. So the manifest is the
trigger, and a live catalogue check is the confirmation — never the manifest alone.

**On "improve the privacy gates": one line, not a new check, and not a scanner.**
`scripts/validate-doc-links.cjs:287-289` is already tracked-aware —
`trackedSet().has(rel) → 'live'`, `isIgnored(rel) → 'external'`, else `'dead'`. It passes an
ignored target deliberately. The fix is to classify an ignored target *under `features/`* as
dead. A detector for credential content stays rejected (P1248, 2026-09-04).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An embargoed path breaks kanban, `goal-gate.sh`, `git-ops.sh`, `check-duplicate-p-numbers.sh` or `fix-frontmatter.py` | MITIGATE | Enumerate every consumer of `features/` by grep before moving one file; run each against a single embargoed test spec first |
| Referrer discipline has no enforcement — **confirmed**, the existing link validator passes on an embargoed target | MITIGATE | Build the publishability check in Solution part 3; without it a public doc can link to an invisible spec and nothing objects |
| A published P-number gap reveals how many specs are embargoed | ACCEPT | **Measured: 324 of 1254 P-numbers (26%) are already absent from the published tree** — parked, archived and renumbered specs. A new gap carries no distinguishable signal |
| The embargo directory name itself signals "security holes live here" to anyone reading `.gitignore` | ACCEPT | `.gitignore` publishes the directory *name*, never its contents or count. An attacker learns that embargoed specs exist — which this spec, and the repo's whole disclosure rule, already state publicly |
| A spec is filed without the `security` tag and publishes anyway | ACCEPT | Same residual the authoring control already carries; tagging is the judgement, and no mechanism replaces it (2026-09-04) |
| Embargo becomes an excuse to leave defects open longer | MITIGATE | Exposure duration is the real variable — pair this with a stated maximum age for an unfixed security spec, or the control quietly rewards delay |
| The 19 already-published security specs stay published | ACCEPT | See Decisions Required D2; deletion from HEAD is not a remedy (Invariants) |

**Non-Goals**
- Do **NOT** rewrite published git history to remove already-public specs.
- Do **NOT** build a credential-name or exposure-mechanics detector — rejected 2026-09-04.
- Do **NOT** move non-security open specs out of the public repo. The measured cost is 75
  broken public links versus 8, for the same risk reduction.
- Do **NOT** change `.private/docs/security-log.md` or the existing withhold-the-mechanics
  authoring rule. That part works and is the reason severity here is moderate, not high.
- Do **NOT** close the repo or change the licence.

## Done-When

- [x] Every consumer of `features/` is enumerated by command and each is confirmed working
      against an embargoed spec — list pasted in the spec, not summarised
      → see **Consumer verification** below.
- [x] A public doc linking to an embargoed spec is **blocked at commit time** by the new
      publishability check, with the non-zero exit code pasted (gate 7 — failure path
      exercised, not asserted), AND a legitimate link to a normal spec still passes in the
      same run (gate 7c — the false-positive side is measured, not assumed)
      → see **Gate evidence** below; both directions pasted, re-run after rebase onto main.
- [x] **Re-scoped to [P1266](../../p1266_prove_the_embargo_end_to_end_on_the_first_real_security_spec.md), not
      abandoned.** Two claims here assert what happens to a REAL embargoed spec across a
      real push and a real prod apply: that it stays out of
      `git ls-tree -r --name-only origin/main features/`, and that `publish-spec` then makes
      it public alongside its fix. Neither is falsifiable against a fixture — the first needs
      a push, the second needs a migration actually applied to production — and
      manufacturing one would reproduce exactly the fixture-shaped confidence the check is
      meant to replace. P1266 carries both, with the failure direction named as the half
      that matters. This is the deferral gate 3.65 requires to name a P-number.
- [x] The kanban renders embargoed specs identically to today (founder's board is unchanged)
      → `tools/kanban/server/api.ts:64-105` already enumerates every worktree's own
      `features/` dir, so a branch-born spec renders from its worktree board today. No code
      change was needed; confirmed by reading the file, and it is in the NOT-modified list.
- [x] Decisions D1-D5 recorded in this spec with the founder's answer (below)

## Alternatives Considered

1. **Embargo every open spec, publish on close** (the founder's original framing). Rejected on
   measured cost: 75 currently-open specs are linked from public `docs/`/`README`/`content`
   versus 8 for the security-tagged subset — roughly a 10x referrer-repair bill for the same
   risk reduction, since the non-security 144 specs carry no exposure.
2. **A separate private repo for specs.** Rejected: it splits the delivery pipeline across two
   remotes, and the README markets the spec-driven process as a public artifact. The
   showcase value is in *shipped* specs, which this design keeps public.
3. **Keep publishing, publish a stub instead** (title + status, body withheld until close).
   Viable and cheaper on links — the referrer never breaks. Weaker on disclosure, because the
   title alone often names the component and the hole (`…_insertable_directly`,
   `…_keyed_only_by_session_id`). Worth reconsidering if D3 finds the embargo mechanism costs
   more than expected.
4. **Do nothing structural; fix the open security defects faster.** Not a rival — it is the
   stronger remedy and should happen regardless. Exposure duration is the variable this spec
   does not touch. Recorded here so the two are not confused for each other.
5. **A mechanical exposure-detector gate.** Rejected 2026-09-04 (P1248), reasons above.

## Rollback Strategy

Remove the `.gitignore` line and drop the `.embargo` suffix from the affected filenames.
Nothing is deleted at any point, no history is rewritten, no file moves directory, and no
consumer holds state about the embargo. One commit.

## Decisions Required

- **D1 — scope.** Security-tagged open specs only (19 today), or all open specs (163)?
  Recommendation in the handoff.
- **D2 — the already-published 19.** Leave them, freeze them (no further detail added while
  the defect is open), or prioritise closing the defects they describe?
- **D3 — mechanism.** Gitignored subdirectory versus public stub (Alternative 3).
- **D4 — the `disclosure:` field after close.** Leave `embargo` in `features/done/`, rewrite to
  `public` at publication, or drop it? Leaving it publishes a permanent, computable
  exposure-duration figure per security spec (R3). Added by the `/architect` merge step.
- **D5 — is the P1068 rebuttal made, or is the mechanism withdrawn?** See the merge-step note
  under Architecture Decisions. Added by the `/architect` merge step.

### Founder answers (2026-09-08)

- **D1 — scope.** Neither tag-scoping nor all-specs: scope by the **required
  `disclosure:` field**, as the Decision Criteria section recommends after criterion 2
  fired. Tag-scoping was measured blind — 26% of open specs carry no `tags:` at all.
- **D2 — the already-published 20.** **Freeze + prioritise the fixes.** They are backfilled
  `disclosure: public` (already exposed; the Invariant forbids pretending otherwise), no
  further detail is added while their defect is open, and closing those defects is the real
  remedy. The freeze is an authoring rule — now in `.claude/rules/features.md`.
- **D3 — mechanism.** Branch-born **plus** the neutral public stub (Alternative 3), not one
  or the other: branch-born withholds the content, the stub closes the P-number-gap channel
  that branch-born leaves open.
- **D4 — the field after close.** **Rewrite to `public` at publication.** Leaving `embargo`
  in `features/done/` would publish a permanent, computable
  `completed_at − created_date` exposure-duration figure for every security fix, forever —
  which sits badly beside Invariant 1. Implemented in `cmd_publish_spec`.
- **D5 — the P1068 rebuttal.** **Made, and narrowed.** The 2026-07-15 entry rejects a
  *content-detection* gate; its reasons are all about detection (*"narrative is not
  greppable"*, *"trivially evaded by paraphrase"*, *"a judgment failure, not a string
  failure"*). `disclosure:` is not in that class: the human makes the entire judgement and
  the machine enforces only that it was **made** and **honoured**. P1068's objection (1)
  (contradictory trigger) is fixed by stating the trigger concretely; (3) is this rebuttal;
  **(2), the evasion hole, survives and is unfixable** — the honest case is that the field
  changes the *default*, and today there is no default, since a quarter of the board carries
  no tags at all.

  **The narrowing is load-bearing and belongs in the Solution, not a footnote.** This
  mechanism covers the **deliberate** class only. It would NOT have caught P1215 — the
  review's own most urgent finding — because that author was writing an agent-API spec and
  would have set `public` without hesitating. For the **incidental** class, 2026-07-15's
  review-cadence remedy stands unchanged, and Decision 6 (P1215 redaction, its own spec)
  remains step 0.

## Decision Criteria

Pre-registered, so the mechanism is not chosen by whichever one gets built first:

1. **Is the embargo mechanism viable?** → Viable only if every `features/` consumer works
   unmodified or with a one-line path change, AND the doc-link check fails on a fresh clone.
   If more than two consumers need real changes, take Alternative 3 (stub) instead.
2. **Is the scope right?** → Security-tagged-only is right unless a non-security open spec is
   found to disclose exposure. One counter-example moves scope to "all open specs"; zero
   keeps it narrow.

**Criterion 2 FIRED during filing — recorded rather than quietly re-cut.** Measured: **43 of
163 open specs (26%) carry an empty or missing `tags:` field**, and three of those discuss
exposure. One is published and states that a queue of credentials is marked retired but not
revoked — *"each one still live and no longer monitored by any consumer"*, with the window
open until a `backlog` spec runs. That is an exposure disclosure carrying no `security` tag.

**What it does NOT imply.** The criterion's own remedy ("move to all open specs") was written
before the cause was known, and the cause is not that non-security specs disclose things — it
is that **`tags:` is optional and a quarter of the board leaves it empty**, so a tag is the
wrong key for any gate. Embargoing all 163 would buy the blind spot back at 10x the referrer
cost. The correct third option, not considered when this spec was drafted:

**Scope by a REQUIRED frontmatter field, defaulting closed** (which then drives the filename
suffix in part 1)**.** Every new spec carries
`disclosure: public | embargo`; `/create-spec` and `/create-bug` set it, `fix-frontmatter.py`
rejects its absence, and anything describing an unfixed defect in an authenticated or
anon-reachable surface defaults to `embargo`. A required field with a closed default is still
a human judgement — the same irreducible residual as tagging — but it cannot be silently
skipped, which is exactly how the 26% blind spot formed. **This is now the recommended
mechanism; D1 and D3 should be decided against it, not against tag-scoping.**

## Open Questions

1. How is exposure duration bounded? Three security specs have been open, published and
   unfixed for between 6 days and ~4 weeks. Embargo removes the disclosure but not the hole,
   and a maximum-age rule has no owner today.
2. ~~Does `validate-doc-links.cjs` fail on a gitignored target?~~ **Answered by command
   during filing: no.** It is `fs.existsSync`-based and pre-commit-only, so the embargo has
   no referrer enforcement today and part 3 is net-new work, not a freebie. Folded into
   Solution part 3.

## Adjacent gap — NOT in scope; FILED as P1260 (closed 2026-09-08)

The staging-branch hop (`docs/technical/git-workflow.md:97-113`) pushes commits to
`origin` as `staging/pN` **before** the server-side privacy check runs on them. On a public
repo a staging branch is publicly fetchable, so that check can block promotion to `main` but
cannot prevent publication — stated in `docs/decisions.md` 2026-09-04 [process], with no spec
filed against it. It does **not** undermine this spec: a gitignored file never enters any
commit and therefore never reaches a staging branch either. Recorded so the two are not
merged; the staging gap is about *everything else* that gets pushed.

## Related

- `docs/decisions.md` 2026-09-04 [technical] — P1248 rejected; disclosure stays an authoring
  control, and a detector's reference data is more sensitive than what it detects.
- `docs/decisions.md` 2026-09-04 [process] — "not pushed yet" is not a safety property; the
  only gate before publication is the local commit hook.
- `.claude/rules/pii.md` — P936, a committed names watchlist would itself be the disclosure.
- `.private/docs/security-log.md`, `.private/docs/security-incidents.md` — the private half.


## Adversarial review — Fable, 2026-09-07 (1 of 1 reported)

Verdict: **REJECT the mechanism and the promotion trigger; the problem is real, re-spec it.**
Every finding below was re-run by this session before being written here (epistemic gate 9).

**Upheld and applied:** the three pipeline breakages (Solution, above); the promotion-trigger
error; branch-born as the replacement; the one-line validator fix.

**Upheld, and the most urgent item in the whole review — F3.**
`features/p1215_agent_callable_surface_for_user_actions.md` is published on `origin/main`,
carries `tags: [agents, api, auth, distribution]` — **no `security` tag** — and quotes a
private-log verdict verbatim, including a statement that one finding leaks real personal data
from production, that others leak per-user scores and session identifiers, that a privilege
class is ungovernable by RLS across production tables, and that the fixes were test-only. It
names the table whose three findings were ceded elsewhere. **This is the authoring control
having already failed, on a spec no tag-derived rule would have covered.** It outranks the
design question and should be redacted before the next push.

**Second instance, confirmed but weaker than the review implied.**
`features/p1124_agent_operator_is_a_real_profile.md` is published, `tags: [agent-accounts,
accountability, schema, profiles]` — again no `security` tag — and names a service function
that *"already paginates the whole table unauthenticated, so enumeration is possible today."*
Read in context this is an accepted-by-design public read being argued about, not a defect
being disclosed; the spec's actual concern is the escalation to a verified identity link. It
corroborates the pattern (untagged specs carry reachability statements) without being an
exposure on the order of the P1215 excerpt.

**Upheld, and it corrects a number this spec asserted.** The P-number gap is a real channel:
266 numbers are absent from the published tree, but **246 of them are in P1-P399** (retired
numbering). From P400 on it is **20 of 855 = 2.3%**, and in the last 80 numbers exactly one
(P1246, unpushed). A fresh gap in the tail is therefore a near-certain "spec withheld here",
timestamped by its neighbours and countable. Branch-born specs still produce that gap. Only a
neutral public stub closes it.

**Upheld:** the `security` tag count is **20**, not 19 — the draft's inline grep matched
`security-headers` on a word boundary and missed two list-form `tags:` blocks.

**Not upheld — evidence stale, mechanism still valid (F1/F8).** The review measured
`supabase/deploy-manifest.json` on `origin/main`, which is 369 commits behind: prod=264 at
2026-09-01. The working-tree manifest reads **prod=301 at 2026-09-07T06:19Z with zero
test-not-prod migrations**, and all seven named security migrations present on prod. That
stamp is **uncommitted**, which is why the reviewer could not see it — and per the caveat
above it is a record, not proof. The design point stands; "seven fixes are queued behind an
unrun prod apply" does not.

**Not upheld — no exposure.** The two leftover `origin/staging/doc-*` branches carry **0
commits not already on `origin/main`**. Cleanup debt, not a leak.

## Technical Architecture

### Technical Analysis

**Current code state, verified this session by reading each file (not the spec's line numbers
alone):**

- `scripts/git-ops.sh` — `cmd_claim` (~L226-320) creates worktrees. **It always names the
  branch `feature/${p_number}-${slug}`** (L310) — it never creates a `fix/pN-*` branch. The
  `fix/pN-*` form the Solution names only appears in comments/docs (`git-ops.sh:3097`,
  `ship.md:179`) that describe branch-resolution patterns tolerant of either prefix; nothing
  in this repo's tooling *creates* one. The branch-born mechanism should use the branch
  `git-ops.sh claim` already produces — `feature/pN-*` — not invent a second naming
  convention.
- The branch-born seed path is real and matches the spec's citations: `git-ops.sh:2602-2626`
  (`need_seed` block — reads the creation blob from the branch via `ship_spec_creation_blob`,
  writes it to the main-relative path, `git add`, `commit_staged_exact`), and the `git mv`
  calls at `git-ops.sh:2399` and `:2913` (confirmed present, both `die "ship: git mv failed"`
  on an untracked target).
- **`/ship`'s seed step is unconditional.** Whenever a spec isn't found on `main`
  (`need_seed == 1`), ship seeds the creation blob to `main` as part of the *same* close
  operation, then Phase 3 (`git-ops.sh:2989-3009`) deletes the branch and removes the
  worktree unconditionally. There is no existing "ship the code, hold the spec" mode — closing
  a branch-born spec today always publishes it in the same operation that ships the code. This
  is exactly the lever the promotion-trigger design needs: **gate `/ship` itself from running
  at all on an embargoed spec until promotion is warranted**, rather than trying to split
  ship's close step into a code-only half (which would touch the seed/mv/cleanup sequence a
  dozen incidents have hardened — see `.claude/rules/git.md`'s own account of that code).
- `scripts/setup-worktree.sh:146` seeds new worktrees via
  `git -C "$MAIN_REPO" ls-files -- 'features/p*.md'` (confirmed) — untracked/branch-only specs
  are correctly excluded, so a branch-born spec never leaks into a *different* worktree by
  this path.
- `scripts/goal-gate.sh` (~L92-95) resolves the spec via `find features -name "${PN}_*.md"` in
  whatever checkout it runs in — inside the spec's own worktree this finds the branch-born
  file; nothing to fix.
- `.github/workflows/goal-gate.yml` — read in full. Its selection is **narrower than the spec
  states**: it only runs `goal-gate.sh` for a P-number whose Verification Contract is already
  pinned **on `origin/main`** (`git cat-file -e origin/main:features/verification/$p/contract.sha256`,
  L91). A branch-born spec, by construction, never has a contract on `origin/main` before
  promotion, so this workflow simply does not select it (`"No contract pin on origin/main…
  goal gate does not apply"`, L97-98) — not a residual risk, just inapplicable until
  promotion, at which point it starts applying like any other goalified spec.
- `scripts/validate-doc-links.cjs` — read `classifyTarget` (L263-291) in full.
  `isIgnored()` (L229-243) is real but classifies **gitignored** paths as `'external'`
  — irrelevant to branch-born specs, which are never gitignored (nothing hides them; they are
  simply absent from `main`'s tree). Two cases follow from that, verified by tracing the
  function, not asserted:
  1. **Cross-worktree reference (the common case).** A public doc on `main`/another worktree
     linking to a branch-born spec: `fs.existsSync(abs)` is `false` for both candidate paths
     (the file is not on disk in that checkout at all) → falls through the loop → `'dead'`.
     **Already blocking, no code change needed.**
  2. **Same-branch reference (the gap).** A public doc and the embargoed spec edited in the
     *same* worktree (the realistic authoring flow — writing the fix and referencing the spec
     from a doc in one sitting): the spec file exists on disk **and is tracked** on that
     branch, so `trackedSet().has(rel)` is `true` (L287) → `'live'`. **This is the actual
     enforcement gap** — not the ignored-path case the first draft targeted, which no longer
     applies once the mechanism is branch-born rather than gitignored.
- `scripts/pre-commit-checks.sh` check 12 (L768-772) runs `validate-doc-links.cjs` with no
  args — confirmed staged-file-scoped by the script's own comment (L764-767). It fires inside
  whichever worktree the commit happens in, so a fix to `classifyTarget` is exercised by the
  same check already wired in, no new pre-commit wiring required for the doc-link half.
- `scripts/fix-frontmatter.py` — read `fix_file` (L252-345) in full. It has exactly one
  existing precedent for a **required-but-not-guessable** field: `type` (L338-340) is
  **reported as an error, never auto-filled** — every other missing field (`status`, `tags`,
  `rank`, `created_date`, `completed_at`) is silently defaulted. `disclosure` is the same
  shape as `type`: a judgement call, not a mechanical default. **This script is invoked
  post-write by `.claude/hooks/features-frontmatter-fix.sh`** (confirmed: a `PostToolUse` hook
  firing on every Write/Edit to `features/p*.md`, non-blocking — it prints to the transcript
  and does not fail the tool call) and separately by hand per `CLAUDE.md` Commit Discipline.
  **It is not called anywhere in `pre-commit-checks.sh`** (confirmed by grep — zero hits) —
  its "errors" list is advisory today, never a commit blocker.
- **A second, independent required-fields validator exists and was not in the original
  file list**: `tools/kanban/scripts/validate-features.ts` L142
  (`requiredFields = ['status', 'type', 'rank']`). Found via the mandated
  `grep -rln "features/" scripts/ tools/ .github/ .claude/rules/` sweep. Adding `disclosure`
  to this list would flag all 163 existing open specs red on every kanban validation run —
  it must NOT be touched (see Decision 1's grandfathering).
- `.claude/rules/features.md` (loaded this session) — the Frontmatter table currently lists
  `status`, `type`, `rank`, `tags` as required; `disclosure` is absent. This file, not the
  spec, is the value-owning doc per `CLAUDE.md`.
- `tools/kanban/server/api.ts` L64-105 — `getWorktrees()` already enumerates
  `git worktree list --porcelain` and `getFeaturesDir(worktreePath)` reads each worktree's own
  `features/` directory. **Branch-born specs already render on the kanban today, from the
  worktree's own board view.** Confirms the spec's Done-When item 5 needs zero code change —
  it is an existing-behavior assertion, not a build item.
- `scripts/next-p-number.sh` (read in full) already scans `.claude/worktrees/*/features/`
  (L23-28) — confirmed, no P-number collision risk.
- `scripts/check-duplicate-p-numbers.sh` (read in full) operates on the single `features/`
  dir of whatever checkout invokes it (relative path, no worktree scan) — a branch-born spec
  is invisible to a run on `main`, by construction; no change needed.
- **`scripts/ship-gates.sh:47` has a pre-existing gap, unrelated to this spec but touching the
  same surface**: it resolves branch spec content via
  `git branch --list "feature/${pn}-*"` only — it does not check `fix/${pn}-*`, even though
  `git-ops.sh` itself resolves ship branches under both prefixes (`git-ops.sh:1347,1379`).
  Because branch-born specs in this design use `feature/pN-*` (see first bullet above), this
  gap is never exercised by this mechanism. **Flagged, not fixed** — fixing an unrelated
  latent gap is out of this spec's scope (Non-Goals discipline), and papering over it here
  would hide the fact that `fix/` branches, if anyone starts using them, resolve to *no* spec
  content in gate 2.5 today.
- `scripts/privacy-watched-paths.sh` (read in full) — `WATCHED_PATHS` already includes
  `features/`, and this list is sourced by both `pre-push-checks.sh` and
  `git-ops.sh cmd_ship_to_prod`. Once a promotion runs `/ship` normally (this design's whole
  point — promotion IS a normal `/ship`, gated on when it's allowed to run, not a different
  code path), the existing privacy scan re-applies to the newly-published spec content at
  push time exactly as it does for every other spec. No new privacy-gate work needed for the
  *general* PII class; P1215 is a separate, already-happened exposure (Decision 6).
- `supabase/deploy-manifest.json` — read the live file: top-level keys `prod` / `test`, and
  `prod` carries `functions`, `functions_deployed_at`, `migrations`, `migrations_deployed_at`
  — confirms the spec's `[prod].migrations` citation exactly.
- **`scripts/prod-smoke-test.mjs` already exists and is already mandatory** — per
  `ship.md:66` and confirmed by reading the script: it authenticates against live prod via
  `PROD_TEST_AGENT_EMAIL`/`PROD_SUPABASE_ANON_KEY` and asserts real HTTP outcomes (e.g. L140
  already asserts a PII query returns `401/403` against **live prod**, not the manifest).
  `features/done/INDEX.md` confirms this shipped under **P919** ("`/ship` now runs the
  authenticated prod smoke"). **This is the "live catalogue check" the spec's caveat calls
  for — already built**, for the exact failure mode named
  (`.private/docs/security-log.md` 2026-08-10: manifest recorded a migration whose effects
  were absent). It is generic today; a security-fix promotion adds one fix-specific assertion
  to it, which is normal maintenance of an existing file, not new infrastructure.
- **The worktree guard blocks the mechanism as designed.** Read `create-spec.md:16-21`,
  `create-bug.md:26-33`, and `change-request.md:16-23` in full: all three stop immediately and
  redirect to `main` when invoked from inside a worktree. This guard exists on purpose —
  `docs/decisions.md` 2026-03-02 [process] "Worktree strategy simplified": *"Spec creation in
  w0 only... No spec files stranded on feature branches."* **The Solution's framing —
  branch-born is "already supported, not new machinery" — is true of `git-ops.sh`'s close/seed
  path but NOT true of the authoring path**: today, no skill can create a spec inside a
  worktree at all. This is the single largest gap between the spec's Solution and the actual
  tooling, and Decision 2 below designs the carve-out.
- **Grep sweep result** (`grep -rln "features/" scripts/ tools/ .github/ .claude/rules/`,
  60 files) surfaced nothing else load-bearing beyond what's covered above; the remainder are
  test files (`test-*.sh`), archived migrations, and files already covered
  (`pre-commit-checks.sh`, `pre-push-checks.sh`, `goal-gate.sh`, `ship-gates.sh`,
  `git-ops.sh`, `setup-worktree.sh`, `next-p-number.sh`, `check-duplicate-p-numbers.sh`,
  `fix-frontmatter.py`/`.sh`, `sweep-done.sh` — archives already-closed public specs only,
  `.github/workflows/ui-gate.yml` — one incidental reference to a spec path in a comment,
  not a consumer).
- **Prior related decisions checked**, per instruction: `docs/decisions.md` 2026-09-04
  [technical] "Credential-exposure disclosure stays an authoring control" (P1248 rejection —
  already reflected in the spec's Non-Goals) carries a **live residual, `Status: proposed`,
  not yet filed**: *"authoring credential-topic specs in `.private/` from the start, with a
  public stub carrying the reasoning."* That is the same shape as Alternative 3 / Decision 5
  below, arrived at independently for the credential-exposure class. Cited as corroboration
  for the stub recommendation, not superseded by it — the P1248 residual is about
  `.private/`-first authoring for a different content class (credential detail) and stays a
  separate, unfiled rule change. `features/done/INDEX.md` confirms P919 shipped the prod
  smoke test and P936 shipped server-enforceable third-party-email detection (the
  authoring-vs-enforcement split this design also follows for `disclosure:`).

### Architecture Decisions

**Blocking prior decision, found at the merge step and verified by command — read before
Decision 1.** The `disclosure:` frontmatter mechanism this spec recommends was already
deferred once, and the deferral came with a condition this spec has not discharged.
`features/done/2026-06-10/p1068_automate_vulnerability_disclosure_routing.md:113` reads:

> **Do NOT build the `disclosure:` frontmatter marker system in this spec.** Deferred, with
> reasons: its trigger condition ("carries a security signal") had two contradictory readings
> in the previous draft; it carries a self-admitted evasion hole (an agent marks `public` to
> unblock); and the 2026-07-15 precedent forbids the gate class without a rebuttal this spec
> does not attempt. **If it is ever revived it needs its own spec and its own argument against
> that entry.**

The precedent is `docs/decisions.md` 2026-07-15 [security], "infra identifiers are public-by-design
— the leak risk is vulnerability *narrative*, not resource names; P994 rejected" — it rejects the
content-gate class for narrative disclosure and prescribes **widening review cadence** over
building detection.

P1255 satisfies half the condition — it *is* its own spec. It does not satisfy the other half:
it cites neither entry, and the rebuttal is not attempted. Branch-born genuinely answers the
*pipeline-breakage* objections raised against the earlier draft, and that is real progress.
It does not touch the *evasion* objection at all — the `disclosure:` value is still self-set
by the same author at the same moment, which this spec's own Decision Criteria concedes is
*"the same irreducible residual as tagging."*

**This does not invalidate the architecture below.** It means one of two things must happen
before `/dev`: either write the argument the 2026-07-15 entry demands (why a location-routing
field, unlike the rejected content gate, is worth its evasion hole — the honest case is that
it changes the *default*, and a closed default that is sometimes overridden is strictly better
than no default, which is a different claim from "it detects"), or reframe this spec as
widening review cadence, which is what P1068 actually chose. Recorded as **D5**.


**Decision 1 — Where `disclosure:` is validated, and the backfill problem (163 specs, 0 with
the field today).**

- **Chosen:** Three-tier enforcement, matching the existing `type`-field precedent exactly at
  tier 1 and adding one genuinely new tier 3:
  1. `.claude/rules/features.md` — add `disclosure: public | embargo` to the required
     Frontmatter table, with the closed-default rule stated in prose (mirrors how `type`'s
     four values are documented today).
  2. `scripts/fix-frontmatter.py` — add `disclosure` to the **report-only** list alongside
     `type` (`fix_file`, next to the L338-340 block): `if not has_field(new_lines,
     'disclosure'): errors.append('missing disclosure: add public | embargo')`. Never
     auto-filled — same reasoning as `type`. Fires via the existing `PostToolUse` hook on
     every future Write/Edit to any spec, old or new, but **never blocks** (the hook already
     doesn't fail the tool call) — this is the nudge layer, not the gate.
  3. **New, genuinely hard gate — but scoped to newly-added files only.** A new check in
     `pre-commit-checks.sh` (after check 12, i.e. "12c"), scoped with
     `git diff --cached --name-only --diff-filter=A -- 'features/p*.md'` (the `A`-only filter
     is the existing idiom at `pre-commit-checks.sh:1226/1290` for "new migration files", not
     invented here). For each newly-added spec, hard-require a valid `disclosure:` value;
     block the commit if absent or invalid. **This is what makes the field real** without
     touching the 163 files that are only ever `M` (modified), never `A` (added) again.
- **Rationale:** Gate 7c (`.claude/rules/epistemic.md`) requires running a new refusal against
  workflows that already exist. `git diff --cached --name-status` on the 163 existing specs
  will show `M`, never `A`, for the rest of their lives — the `--diff-filter=A` scope is a
  structural grandfather, not a policy carve-out that could rot. Reusing the `type`-field
  precedent (report vs. hard-block split) means no new mental model for whoever reads
  `fix-frontmatter.py` next.
- **Trade-off:** A spec created by hand (`Write` tool, bypassing `/create-spec`/`/create-bug`)
  with no `disclosure:` field is still caught, but only at commit time, not at write time —
  same latency the `type` field already accepts.
- **Alternative rejected:** Auto-defaulting missing `disclosure:` to `embargo` repo-wide via a
  one-time bulk edit of all 163 files. Rejected: it would touch every open spec in one commit
  for a field whose entire value is human judgement (same reasoning CLAUDE.md gives for never
  auto-filling Founder Decisions), and — per the Invariant — a spec already on `origin/main`
  cannot be un-published by relabeling it `embargo` after the fact; the label would be a lie
  for 163 files that are already exposed. **What DOES happen to the 163**, as a one-time,
  reviewable migration script (`scripts/archive/migrations/YYYYMMDD-backfill-disclosure-public.py`,
  per `docs/technical/file-locations.md` convention): stamp `disclosure: public` on every spec
  path present in `git ls-tree -r --name-only origin/main features/` (already-published =
  already-disclosed, regardless of tag), and leave it unset on anything not yet on
  `origin/main` (nothing to backfill — those get the field at next `/create-spec`/`/create-bug`
  touch or at the new hard gate if ever re-added). This backfill is a **separate, small PR**,
  not bundled into this spec's Build Sequence, because it needs the founder's D2 answer first
  (whether the 19-20 already-published security specs get anything beyond `public` — freezing
  further detail, say — is a content decision, not a mechanism one).

**Decision 2 — The worktree-guard carve-out (the actual authoring path).**

- **Chosen:** A narrow, explicit exception added to the "Worktree guard" section of
  `create-spec.md` and `create-bug.md` (not `change-request.md` — a change-request redesigns
  a *shipped* feature, which by definition already has fixed behavior on `main`; it is not
  the vehicle for describing a live unfixed defect). The exception is a **classification
  gate that runs before the location gate**, not a removal of the location gate:

  > Before applying the worktree-guard stop, classify from the user's request whether this
  > spec will describe a **live, unfixed defect in an authenticated or anon-reachable
  > surface** (the same judgement call `security`-tagging already makes, now load-bearing).
  > **If no** (the overwhelming majority of specs): apply the existing guard unchanged — stop
  > and redirect to `w0` if in a worktree.
  > **If yes:** do not stop. Instead: (a) run `next-p-number.sh` to get `pN`; (b) run
  > `./scripts/git-ops.sh claim pN` to create a fresh `feature/pN-*` worktree+branch (or use
  > the current worktree if the operator is already in a dedicated one for this work); (c)
  > write the spec file inside that worktree at `features/pN_<slug>.md` with
  > `disclosure: embargo`; (d) state the decision explicitly in the skill's output — *"Filing
  > pN as a branch-born embargoed spec on feature/pN-\* — it will not reach `main` until
  > promoted (see Decision 4)."* — never silently.
- **Rationale:** The 2026-03-02 guard exists to prevent *accidental* stranding ("spec files
  stranded on feature branches, causing kanban status drift"). Embargo is *deliberate*
  stranding, with a name and an exit condition (Decision 4). Moving the classification ahead
  of the location check is the minimal change that lets the skill make the routing decision
  it needs to make, without weakening the guard for the 96%+ of specs it correctly protects.
- **Trade-off:** The skill now makes a security-judgement call earlier in its flow than any
  other classification it does. Under-classifying (missing a real live defect) is the same
  residual the spec's own Risks table already accepts row 5 ("A spec is filed without the
  `security` tag and publishes anyway... no mechanism replaces it"). Over-classifying (routing
  an ordinary spec into a worktree unnecessarily) costs one `git-ops.sh claim` and is fully
  reversible — the spec can be re-filed at `w0` if the operator disagrees with the skill's
  call, per the founder's own review discretion.
- **Alternative rejected:** Leave the guard as-is and require the operator to `git-ops.sh
  claim` first, then write the spec file with `Write`/`Edit` directly, bypassing the skill.
  Rejected: it produces a spec with none of the skill's structure checks (P-number collision
  guard, frontmatter template, `pipeline_ran` stamp), for the *one* class of spec where
  getting the process right matters most. It also means the classification never happens in a
  place that can set `disclosure: embargo` — the field would be missing exactly where it's
  most needed, defeating Decision 1.

**Decision 3 — `validate-doc-links.cjs`: the actual gap is same-branch reference, not the
ignored-path case the first draft targeted.**

- **Chosen:** Modify `classifyTarget` (`scripts/validate-doc-links.cjs:263-291`). After the
  existing `if (trackedSet().has(rel)) return 'live';` check, insert a frontmatter read for
  targets under `features/` (excluding `features/done/` and `features/archive/` — closed and
  rejected specs are never embargoed): parse the target file's frontmatter for
  `disclosure: embargo` (reuse the repo's existing lightweight frontmatter-line-scan idiom —
  `fix-frontmatter.py`'s `parse_frontmatter`/`has_field` pattern, ported to the one-line regex
  this `.cjs` file already uses elsewhere for frontmatter-adjacent scans). If found, return a
  new outcome `'embargoed'`; wire it into the existing report so it is treated exactly like
  `'dead'` for pass/fail purposes (same bucket, distinct label in output so the message reads
  "linked spec is under disclosure embargo" rather than "target does not exist" — a clearer
  fix-it message for the same block).
- **Rationale:** The traced gap (Technical Analysis, `classifyTarget` bullet) is specifically
  the same-worktree case: spec and public doc are both tracked on the current branch, so
  existence+tracked-ness alone can never distinguish "safe to link" from "embargoed." Only a
  content read of the target's own frontmatter can. The cross-worktree case (spec absent from
  disk entirely) is already correctly blocked by the existing `'dead'` fallthrough and needs
  no change — confirmed by tracing the function, not assumed.
- **What happens to specs currently linked from public docs:** none of the 20 currently
  security-tagged, currently-published specs carry `disclosure: embargo` after Decision 1's
  backfill (they get `disclosure: public`, because they are already on `origin/main` and the
  Invariant forbids treating that as reversible) — so this new classification never fires
  against them. It only fires going forward, against a *new* branch-born embargoed spec that
  a doc on the same branch links to before promotion. The false-positive side (Done-When gate
  7c): a link to any `disclosure: public` (or field-absent, pre-Decision-1) spec is
  unaffected — `trackedSet().has(rel)` still returns `'live'` before the new check is ever
  reached, since the new check is scoped to `disclosure: embargo` only.
- **Trade-off:** One more file read per `features/`-targeting link during the scan (already
  memoised the same way `isIgnored` is, per the existing `_ignoreCache` pattern) — the
  validator already reads target files today for the `existsSync`/`statSync` checks, so this
  adds one `readFileSync` on an already-touched path, not a new I/O class.
- **Alternative rejected:** Scope the new check to "public docs only" (`docs/`, `README.md`,
  `content/`) as the `fromFile`, exempting `features/`-to-`features/` links. Rejected: a
  non-security spec's "Related" section linking to an embargoed spec by P-number is the same
  disclosure as a `docs/` link, and restricting `fromFile` adds a branch of logic for no
  measured benefit — the spec's own Done-When example is "a public doc," but nothing in the
  Problem statement limits the risk to that referrer class.

**Decision 4 — The promotion step: not a new skill, a new gate inside the existing `/ship`
gate sequence.**

- **Chosen:** Add a new gate to `scripts/ship-gates.sh` — **Gate "1.5 — disclosure
  promotability"**, run before the existing 2.5, and only when the resolved spec's
  frontmatter reads `disclosure: embargo`:
  1. Identify migrations belonging to this spec — the same `pNNN`-token convention
     `next-p-number.sh` already relies on (`grep -l "p${pn#p}" supabase/migrations/*.sql`,
     stripped of the leading `p`), so no new metadata field is required to link a spec to its
     migrations.
  2. If migrations were found: hard-require every one present in
     `origin/main:supabase/deploy-manifest.json` → `.prod.migrations` (reuse
     `check-deploy-manifest.sh`'s own sourcing choice — `origin/main`, not the local working
     copy, exactly for the reason its header already states: a feature branch's local manifest
     copy is not the trusted record). Missing any → hard fail with the specific migration
     filenames named in the message.
  3. If NO migrations belong to this spec (a pure application-code fix): there is nothing a
     manifest can confirm. Per CLAUDE.md's ALWAYS-ASK class ("deploy to prod" is always-ask,
     and this is the deploy-adjacent judgement call for a code-only security fix) this step
     cannot be satisfied mechanically — the gate requires an explicit operator
     acknowledgement, surfaced the same way `migrate.sh --env prod` already requires explicit
     `y`/`--yes` for pending migrations (P887 pattern, `ship.md:66`) — reusing an
     already-established human-ack idiom rather than inventing a new one.
  4. **Live confirmation, regardless of (2) or (3):** require `node
     scripts/prod-smoke-test.mjs` to have been run and to have passed in this ship session,
     with the specific fix's assertion present (added to the smoke test as part of the
     security spec's own Pre-deploy Checklist — every embargoed spec with a schema or
     API-surface fix must add one `ok(...)` assertion to `prod-smoke-test.mjs` exercising the
     fixed behavior against live prod, as a required Pre-deploy Checklist item, per
     `.claude/rules/features.md`'s existing Pre-deploy Checklist convention). This is the
     "live catalogue check... never the manifest alone" caveat, satisfied by the exact
     mechanism P919 already built for the general case, extended with one fix-specific
     assertion rather than a bespoke new check.
  5. Only after 1.5 passes does `/ship` continue into its existing gate 2.5 onward,
     unmodified. **No change to the seed/mv/cleanup mechanics** (Technical Analysis, second
     bullet) — an embargoed spec that fails Gate 1.5 simply never reaches `/ship`'s close
     step, so it stays branch-born, on its worktree, exactly where it already is. The worktree
     and branch are **not** torn down (`/ship` is never invoked to completion) until Gate 1.5
     passes.
- **Rationale:** Reuses `ship-gates.sh`'s existing numbered-gate convention (2.5, 2.7, 2.7b,
  3.5, 3.65 already establish the pattern of "hard-assert, script relays output verbatim,
  `/ship` never re-attests") and the existing `origin/main`-sourced manifest read
  (`check-deploy-manifest.sh`'s own header explains why: a feature branch's local copy is
  routinely dirty from `migrate.sh` stamping it mid-flight, so trusting it directly would
  reproduce the exact P1173 false-positive class `.claude/rules/epistemic.md` gate 7c already
  documents). Publication and code-merge happen in the same `/ship` run, by construction —
  satisfying Done-When item 4 (`/ship` makes it public in the same commit range as its fix)
  without inventing a second promotion codepath that could itself drift from `/ship`'s
  already-hardened close sequence.
- **Trade-off:** An embargoed spec with no migration and a founder who is slow to ack step 3
  sits un-promotable indefinitely — this is the correct failure direction (fails closed,
  toward non-disclosure) but means a pure-code security fix has no mechanical trigger at all,
  only a human one. Named as a residual, not solved further — Open Question 1 (exposure
  duration has no owner) already covers the general version of this gap.
- **Alternative rejected:** A fully separate `/promote-disclosure` skill outside `/ship`.
  Rejected: it would need to independently reimplement the branch/worktree resolution,
  cherry-pick, and close mechanics `git-ops.sh` already owns — doubling the surface a future
  incident could hit, for a step that is conceptually "run `/ship`, but not yet" rather than a
  different operation.

**Decision 5 — The P-number gap channel: ship a neutral public stub (Alternative 3).**

- **Chosen:** Alternative 3, per the adversarial review's own correction of the base rate
  (P400+: 20/855 absent = 2.3%, one gap in the last 80 numbers). At the moment `next-p-number.sh`
  assigns `pN` to an embargoed spec (Decision 2, step (a)), commit a neutral stub directly to
  `main` at `features/pN_security-review-pending.md` in the *same* commit that would otherwise
  have created nothing — content:
  ```
  ---
  status: backlog
  type: task
  rank: {bottom of backlog}
  tags: [disclosure-embargo]
  disclosure: public
  created_date: {today}
  ---
  # P{N}: Under disclosure embargo

  This P-number is reserved for a spec under active security disclosure embargo (see
  docs/decisions.md, disclosure policy). Details — including the affected component and
  the nature of the issue — are withheld until the underlying defect is confirmed fixed on
  production. This stub exists so the P-number sequence carries no gap.
  ```
  At promotion (Gate 1.5 passing, `/ship` running to completion), the real spec content
  **overwrites this file at the same path** — same idiom `git-ops.sh` already uses for the
  seed step (`printf '%s' "$blob" > path; git add; commit`, `git-ops.sh:2610-2617`), so no new
  git mechanic is introduced; a slug rename (if the real title differs) is a plain `git mv` in
  the same commit, identical to the pattern at `git-ops.sh:2901`.
- **Rationale:** The reviewer's own corrected math makes the residual near-certain evidence
  once the tail is this thin (1 gap in 80) — an unstubbed gap says "something was filed and
  withheld here" as clearly as a name would. `docs/decisions.md` 2026-09-04 [technical]
  records the org independently converging on "public stub, private-authored reasoning" as
  the resolution for the analogous credential-exposure case (P1248's unfiled residual) —
  corroborating evidence, not the same decision.
- **Trade-off:** One extra commit to `main` per embargoed spec, at creation time, which is
  itself now traceable ("a stub landed on `main` on date X" is timing information an attacker
  could correlate against, e.g., a later incident report). Judged acceptable: the stub
  deliberately carries zero content beyond the fact of embargo, which — per the spec's own
  Risk row (ACCEPT) — is already publicly stated by this very spec and by the repo's
  disclosure rule; the stub adds a timestamp to a fact already public, not a new fact.
- **Alternative rejected:** Accept the gap (no stub). Rejected on the reviewer's own numbers:
  once the tail base rate is 2.3% instead of 26%, "accept the channel" stops being a
  low-signal residual and becomes close to naming the spec directly. **Alternative rejected:**
  a title-only stub using the real slug. Rejected: the spec's own review already showed slugs
  routinely leak the defect class (`…_insertable_directly`, `…_keyed_only_by_session_id`) —
  a stub must use a generic filename, never the real one, or it reintroduces the exact leak
  it exists to close.

**Decision 6 — P1215 redaction is immediate remediation, filed as its own spec, not folded
into this one's Build Sequence.**

- **Chosen:** File a separate `type: bug`, `status: today`, `driver: anomaly` spec (new
  P-number) with a single scope: edit the current `main` content of
  `features/p1215_agent_callable_surface_for_user_actions.md` to replace the verbatim-quoted
  private-log verdict with role/category-level language (e.g., "an authenticated-surface
  finding, ceded to a separate remediation — see `.private/docs/security-log.md`"), matching
  the exact pattern `.claude/rules/pii.md` already prescribes for third-party names ("roles,
  not names... anonymize the characterizing detail too"). This is a **content edit on `main`
  going forward**, not a mechanism change, and does not depend on any part of this design
  being built — it can and should ship before Decisions 1-5 land.
- **Rationale:** CLAUDE.md's Founder Decisions rule forbids filling in tone/wording without
  being told, and this redaction touches exactly that — what the replacement language says
  is a founder call, not an architecture call. Separating it from this spec keeps this spec's
  Build Sequence about the mechanism (reviewable, testable, revertible per its own Rollback
  Strategy) and lets the P1215 remediation move at the speed the exposure actually warrants,
  independent of this spec's review/build timeline.
- **What "redact" concretely means, given the Invariant:** it means the current file content
  on `origin/main`'s `HEAD` changes so that anyone viewing the file **from now on** (GitHub
  UI, a fresh clone, a search-engine re-crawl) sees the role-level version, not the verbatim
  verdict. It does **not** mean the verdict is gone — every prior commit, every existing
  clone, and any cache or index that already captured the old content keeps it, exactly as
  the Invariant states ("nothing already on `origin/main` is treated as recoverable by
  deletion"). The remediation spec's Done-When must say this explicitly, so a future reader
  doesn't mistake the edit for a fix of the exposure rather than a stop to it compounding.
- **Trade-off:** None avoided by waiting — every day this spec's mechanism work continues
  before the P1215 edit lands is a day the verbatim verdict stays the current, freshly-crawled
  view of the file. This is the argument FOR treating it as step 0 of the overall effort
  (first item in the founder-facing handoff), even though it is architecturally a separate
  spec.
- **Alternative rejected:** Fold the P1215 edit into this spec's own Build Sequence as file
  #1. Rejected: this spec's Done-When and Rollback Strategy are about the *mechanism*
  (embargo, gates, promotion) — bundling a founder-worded content redaction into the same
  spec means the mechanism's review (which will take some cycles — it touches `.claude/`,
  `scripts/`, and CI) blocks a fix that should not wait on it.

### Security Review

**RLS Policies:**
- ✅ N/A. This spec touches no database policy. Confirmed by reading the Solution in full: it changes doc-link classification, spec-authoring frontmatter, and where a file is git-committed — no RLS surface.

**Authentication:**
- ✅ N/A. No auth surface changed.

**Input Validation:**
- ✅ N/A in the traditional sense (no user-facing form/API). The one "input" that matters here is the `disclosure:` frontmatter value itself, which is really an authoring-judgment field, not a validated input — see Gate Fail-Open Analysis below for why treating it as if it were "validated" is misleading.

**Data Protection:**
- ⚠️ No new PII is written by this design (confirmed: no new manifest/state file with personal data is proposed). But two data-protection findings fall out of the design itself:
  1. **`disclosure: embargo` becomes a permanent, dated public marker.** Nothing in the Solution strips or rewrites frontmatter fields at ship time beyond the existing `ship_rewrite_frontmatter` (title/path rebasing). A shipped spec in `features/done/` will carry `disclosure: embargo` alongside its existing required `created_date` and `completed_at` (`.claude/rules/features.md` "When `status: done`"). That is a computable, permanent "this spec held a live hole open for `completed_at − created_date` days" — for every security spec, forever, on the public remote. This is new information disclosure that does not exist today (today there is no `disclosure:` field to leave behind). Not catastrophic (duration-of-exposure, not the exploit), but it is a residual the design doesn't name in its own Risks table, and one the Invariants section ("must not require a committed list of what is sensitive") arguably brushes against — a per-spec exposure-duration index is exactly the kind of thing that invariant exists to prevent.
  2. `.private/` remains the right home for exploit detail; verified `.private/docs/security-log.md` is present locally and gitignored (`git check-ignore -v .private/docs/security-log.md` → matched at `.gitignore:103`). No new artifact is proposed that would need a new gitignore entry, so the P1248 failure mode (an enumerable list of what's sensitive) is not reintroduced by anything in the Solution *as written*. It would be reintroduced if the "publishability check" (item 2 below) is implemented as a committed list of embargoed paths rather than a live git-ls-tree check — the spec doesn't specify the implementation, so this is a design constraint to state explicitly in the follow-on architecture, not yet a defect.

**Disclosure-Channel Analysis (feature-specific):**

- ✅ **RESOLVED (2026-09-08) — the `/ship` close-commit message echoes the spec's title on `main`, even under the "not-at-`/ship`" promotion design.** Read `scripts/git-ops.sh:2930-2944` (the branch-based close path) and `:2380-2399` (the no-branch/direct-to-main close path): both extract `title="$(ship_extract_title ...)"` from the spec's own first `# ` heading and commit with `"chore: close $pn — $title"` (or `"chore: close $pn (direct-to-main) — $title"`). This commit is made **on `main`**, because merging to `main` is what `/ship` does. The spec's own Alternative-3 discussion states plainly that "the title alone often names the component and the hole" (e.g. `…_insertable_directly`, `…_keyed_only_by_session_id`). So even if the *body* of the spec never lands on `main` until the promotion trigger fires, the **title fires at `/ship` time — before the deploy-manifest-gated promotion the spec calls for.** The Solution section states "Promotion trigger — NOT `/ship`" and then, two paragraphs later, cites the *same* `/ship` branch-born close code (`git-ops.sh:2602-2626`) as "already supported, not new machinery." Those two claims are in direct tension: reusing the existing close path unmodified means `/ship` **is** the promotion event for the title, regardless of what the design intends for the body. Nothing in the Solution proposes gating the close commit itself on the manifest check. This needs to be resolved explicitly (either the close path is modified to hold the commit until the manifest condition is met, or the spec accepts title-level disclosure at `/ship` time as a residual and says so).

  **Resolved as the second branch, explicitly.** The close path is NOT modified — it is the
  code a dozen incidents have hardened, and gating it would reintroduce the R1 deadlock at a
  different point. The spec accepts title-level disclosure at `/ship` time as a residual, and
  the remedy is a wording rule rather than a gate, because a commit subject is prose and no
  glob reaches it (`.claude/rules/pii.md` makes exactly this argument for names). That rule
  now lives in [.claude/rules/features.md](../../../.claude/rules/features.md) — Disclosure, final
  paragraph: *write commit subjects for an embargoed spec in roles, not specifics*. It covers
  both channels R4 named — `/ship`'s `chore: close pN — <title>` and the branch's own commit
  subjects, which cherry-pick to `main` verbatim.

- ⚠️ **Open — commit messages more broadly are not addressed.** Beyond the close-commit title above, no part of the Solution constrains what commit *subjects* on the embargoed `fix/pN-*` branch may say once that branch's commits are cherry-picked/replayed to `main` as part of the actual code fix (separate from the spec-file seed commit). `scripts/git-ops.sh` ship flow cherry-picks the branch's commits verbatim (existing behavior, unrelated to this spec) — commit messages authored during the fix work land on `main` in full, on the *same push* that (per the design) is supposed to be the trigger for making the spec public. If an agent writes a commit message on the branch that names the vulnerability class, it publishes at the same moment the code fix does, independent of the spec file's own embargo status. This is outside this spec's stated scope (it only governs the *spec file*), but the spec's Problem statement frames the goal as "close the disclosure window," and a commit-message channel for the same content is not called out as a Non-Goal or Open Question. Recommend adding it explicitly as a stated residual.

- ✅ **Closed as claimed, for the specific claim made — `docs/decisions.md`, `docs/process-learnings.md`, `docs/CHARTER.md`, `features/done/INDEX.md` do not currently echo embargoed spec content**, verified by: `grep -n "disclosure\|embargo" docs/CHARTER.md docs/process-learnings.md` → no matches (the mechanism doesn't exist yet, so there is nothing to echo today). This is a point-in-time ✅, not a structural guarantee — `docs/decisions.md` **routinely quotes spec prose verbatim** (confirmed: dozens of hits for `verbatim`/`quotes` throughout the file, e.g. the P1215-related entries below), so the *practice* of quoting spec content into `decisions.md` exists and is common; the spec doesn't address what happens when a founder or agent writes a decisions.md entry *about* an embargoed spec's rationale before the embargo lifts. Recommend an explicit rule: `docs/decisions.md` entries that reference an embargoed spec state its existence and P-number only, never quote its body, until promotion.

- ⚠️ **Open, and re-evaluated per the task's specific instruction — the staging-branch hop does NOT "not undermine" this design the way the spec claims, for a reason narrower than the spec's own framing.** Read `docs/technical/git-workflow.md:97-113`: `git-ops.sh ship`/`commit-to-main` push commits to `origin` as `refs/heads/staging/pN` — a real, publicly-fetchable branch on a public repo — **before** the server-side `privacy-scan / audit-privacy` required check runs, and only then promote to `main`. The spec's own "Adjacent gap" section argues this "does not undermine this spec: a gitignored file never enters a commit and therefore never reaches a staging branch either." That argument is **stale relative to the spec's own final mechanism.** The gitignore-based embargo (the "never enters a commit" design) was explicitly withdrawn earlier in the same Solution section in favor of branch-born: the spec file **is** a normal tracked file, committed on `fix/pN-*`. The question that actually matters is whether the branch-born spec's *own* commits (the seed-to-main commit, or the cherry-picked fix commits at close) transit `staging/pN` on their way to `main`. They do — `commit-to-main`/`ship` is the code path that performs the staging hop (`git-workflow.md`'s own diagram: `git push origin main:refs/heads/staging/pN` → wait for the check → `git push origin main`), and the spec's Solution cites this exact tooling as what it reuses. So: **at the moment `/ship` runs the close (title-bearing commit, and for the fix code, the cherry-picked commits), that content is briefly public via `staging/pN` even before it lands on `main`.** For a public repo this is a narrow, short-lived window (staging branches are deleted immediately per the documented flow, and the content is the same content about to go to `main` seconds later anyway) — so this does not add NEW exposure beyond what `/ship` itself already discloses (see the close-commit-title finding above), but the spec's blanket claim that the staging hop "does not undermine this spec" is not fully re-derived against the branch-born mechanism; it should say "no incremental exposure beyond the close-commit title finding," not "does not undermine," because the reasoning it gives (gitignore) no longer applies to the design it shipped.

**Gate Fail-Open Analysis (feature-specific):**

- ⚠️ **`disclosure:` required-field validation in `fix-frontmatter.py` — fails open completely, by wiring, not by edge case.** This is the most concrete, verified finding in the review. `fix-frontmatter.py` already has an analogous pattern: a missing `type:` field is appended to an `errors` list, which causes `main()` to `sys.exit(1)` (`scripts/fix-frontmatter.py:338-340`, `:415-424`) — i.e., the script itself *can* hard-fail on a missing required field. But **nothing currently invokes this script as a gate anywhere a commit or push could be blocked on it**: `grep -n "fix-frontmatter" scripts/pre-commit-checks.sh` → no match (it is not called from the git pre-commit hook at all); `grep -rln "fix-frontmatter" .github/workflows/` → no match (it is not run in any CI workflow, so there is no server-side check either). The only live wiring found is `.claude/hooks/features-frontmatter-fix.sh`, a Claude-Code `PostToolUse` agent hook that fires on `Write`/`Edit` tool calls and unconditionally `exit 0`s regardless of what `fix-frontmatter.py` reports — it is informational, not a gate, and it is bypassed entirely by any edit made through `sed`/`python3`/`Bash` directly rather than the `Edit`/`Write` tools (which is explicitly this session's own preferred mode per its harness instructions). **So a `disclosure:` field implemented exactly as the spec describes — "rejects its absence" — currently has no enforcement point at all, local or server-side.** This is worse than "fails open under an edge condition"; it fails open unconditionally until the spec's Done-When items also add this script to `pre-commit-checks.sh` (local, bypassable per `.claude/rules/git.md`) **and** to a required GitHub Actions check (the only real boundary, per that same rules file). Neither is in the spec's Done-When list today. Recommend adding both explicitly, with the CI half required, mirroring how `goal-gate.yml`/`privacy-scan.yml` are wired as `required` checks with an empty bypass list.

- ⚠️ **The publishability check (blocks a public doc linking to an embargoed spec) — fails open on the same axis as `validate-doc-links.cjs` today: local pre-commit only, no server-side half.** Confirmed: `validate-doc-links.cjs` is invoked from `scripts/pre-commit-checks.sh:769-770` ("Doc links" check) and `grep -rln "validate-doc-links" .github/workflows/` → no match — it does not run in CI. Per `.claude/rules/git.md`, local hooks are explicitly documented as accident-prevention only, bypassable with `--no-verify` or a rewritten hook; the real boundary for this repo's other security control (`audit-privacy.sh`) is a required `privacy-scan` GitHub Actions check. The spec's "one-line" fix to `validate-doc-links.cjs:287-289` (classify an ignored target under `features/` as `dead` rather than `external`) — verified by reading `scripts/validate-doc-links.cjs:264-289`, the code does exactly what the spec says: `isIgnored(rel) → 'external'` is the current unconditional pass-through — will still only run locally, so a determined or compromised agent can add a link to an embargoed spec and commit with `--no-verify`, or simply not run pre-commit at all in an automated flow. The Done-When item ("blocked at commit time... non-zero exit code pasted") only proves the local hook fires; it does not establish a server-side boundary. This is the single most important structural gap in the whole design, because it is the enforcement mechanism for the Invariant that makes embargo meaningful — without a server-side check, an embargoed spec's *existence and rough content* can still be inferred by finding a public doc that links to it (a 404/dead link on a public repo is itself informative — "something used to be referenced here").

- ⚠️ **Fresh-CI-checkout condition — untested, and plausible to fail open.** The task specifically asks whether the branch-born mechanism (goal-gate style: gate script fetched from `origin/main`, not the pushed branch) behaves correctly in a CI checkout that has never seen the `fix/pN-*` branch. `goal-gate.yml`'s own design note (`:84`) states its selection logic depends on the P-number appearing "either in the branch name or in a touched `features/` path" — for an embargoed spec that is **exactly** the branch-born design (branch is named `fix/pN-*`), so `goal-gate.yml` would still correctly select and run against it. But the **publishability check** (new, not yet built) has no such precedent to reuse, and its correctness in a fresh CI checkout was not exercised — it is the "gate 7c" concern (false-positive/false-negative on a case the fixture never emits) named in this repo's own `epistemic.md`, and the Done-When list for this spec does not include "run the publishability check against a fresh clone with no local worktree state." Flag as untested, not asserted broken.

- ✅ **The manifest-driven promotion trigger correctly recognizes it is not sufficient on its own.** The spec's own caveat ("the manifest is a record, not the database... a live catalogue check is the confirmation — never the manifest alone") is the right instinct and is independently corroborated: `.private/docs/security-log.md` is confirmed present and gitignored, and the spec's own text cites a real prior incident where the manifest recorded a migration as applied whose effects were absent. What is missing is a **concrete, mechanical definition of what "live catalogue check" means** as a Done-When item — right now it is a sentence of intent, not a script or a gate. Recommend the promotion step run something equivalent to `mcp__supabase__list_migrations` (or the prod REST/psql equivalent per `.claude/rules/db-access.md`) against **prod**, not test, and assert the specific migration IDs the embargoed spec's fix depends on are present, before any human is told "safe to promote." Given the manifest's own documented unreliability, treating it as sufficient for a security-disclosure trigger (rather than merely a candidate to verify) would repeat the exact failure class already logged for this codebase.

**Already-Published Exposure (feature-specific):**

- **Severity: independently verified as real and current, both files confirmed live on `origin/main` right now** (`git cat-file -e origin/main:features/p1215_agent_callable_surface_for_user_actions.md` and the P1124 equivalent both succeeded after an explicit `git fetch origin main`). `features/p1215_agent_callable_surface_for_user_actions.md` carries no `security` tag and quotes, verbatim, a private security-log verdict describing multiple confirmed reachability defects against production — including a real-personal-data leak and a session/score leak — and states explicitly, as of the review's most recent evidence (2026-09-03, corroborated by `docs/decisions.md` 2026-09-03 [process] "A merged spec is not a closed vulnerability... every finding they name is still live in production"), that the underlying fixes were on **test only**, not applied to production. **I could not establish, within this review's scope, whether production remediation has landed since 2026-09-03** (today is 2026-09-07) — that is a live, actionable open question, not something to infer either way; the founder or an agent with current prod access should re-verify the P1207 findings' production disposition before treating this as historical. Class of disclosure: a public document confirms, with attribution to a private incident log, that specific classes of live production vulnerability existed and gives enough structural detail (which finding IDs, which audit, which spec closed with a "No") for a motivated reader to correlate against the shipped code and narrow the search space significantly. This is qualitatively worse than a bare "we have unfixed security debt" statement — it is closer to a redacted incident report than a design discussion.
  - **Remediation class:** (1) redact the quoted verdict block down to a role/class-level statement ("an audit found multiple reachability defects against production data; remediation status tracked privately") per the existing `.private/docs/security-log.md` convention this repo already uses elsewhere; (2) add the `security` tag (or, once built, `disclosure: embargo`) retroactively is **not** a fix by itself — per this spec's own Invariants ("nothing already on `origin/main` is treated as recoverable by deletion... removal from HEAD changes nothing about exposure"), the content is already disclosed; the only remaining action is redacting the *file going forward* (new commit, new HEAD state) to stop compounding the exposure with every future reader/clone, not a claim of remission; (3) confirm current production status of the underlying findings independently before deciding urgency.
  - `features/p1124_agent_operator_is_a_real_profile.md`: confirmed present on `origin/main`, no `security` tag, and — read in context, per this review's own pass rather than taking the earlier adversarial review's characterization on faith — the "unauthenticated enumeration" statement it contains reads as an accepted-by-design public-read behavior being argued about for a different reason (escalation to identity linkage), not a disclosed defect. Lower severity, but it corroborates the same structural gap: untagged specs can and do carry reachability statements, and no scope-by-tag mechanism will catch this category by construction.

**AI Prompt Security:** This feature uses no LLM/AI API — confirmed by reading the full spec; the Solution only touches git tooling, frontmatter validation, and a Node.js link-checker script. Table skipped as instructed.

---

#### Summary of the two findings I'd weight most heavily

1. **The proposed `disclosure:` frontmatter mechanism is, in substance, the same class of control that was already deferred twice in this codebase** — P1068's own "Alternatives Considered" (now in `features/done/2026-06-10/p1068_...md`) explicitly deferred "the `disclosure:` frontmatter marker system" citing a **self-admitted evasion hole** ("an agent marks `public` to unblock") and required that reviving it "needs its own spec and its own argument against" `docs/decisions.md` 2026-07-15 [security] (which concluded "no such gate is constructible for this class [of narrative disclosure]... escalate to human-review cadence, not to tooling"). `docs/decisions.md` 2026-08-13 [process] reaffirmed the deferral in the same terms. **P1255 does not cite either entry and does not offer the required rebuttal to the 2026-07-15 ruling** — it revives the mechanism under a new name (branch-born + required field, rather than pre-push+CI gate) without engaging why the prior two attempts stopped short. The branch-born delivery mechanism is genuinely new and does address the *pipeline-breakage* objections raised against the earlier gitignore draft — but it does not address the **evasion-hole** objection at all: the `disclosure:` value is still self-set, by the same author, at the same moment, with the same judgment call the spec itself calls "the same irreducible residual as tagging." This should be resolved explicitly — either write the rebuttal the 2026-07-15 entry demands, or reframe this spec as "widening review cadence" (P1068's actual chosen remedy) rather than a field-based gate.

2. **The enforcement gates this spec depends on — `fix-frontmatter.py`'s required-field check and the new publishability check in `validate-doc-links.cjs` — currently have zero server-side presence and, in `fix-frontmatter.py`'s case, zero commit-time presence at all.** Both are pre-commit-local at best (the doc-link check) or purely an advisory agent hook (`fix-frontmatter.py`, via `features-frontmatter-fix.sh`). This repo's own `.claude/rules/git.md` states plainly that local hooks are "accident-prevention, not the boundary," and that the real boundary for the repo's other disclosure control (`audit-privacy.sh`) is a required GitHub Actions check with an empty bypass list. This spec's Done-When list should include the equivalent for both new gates, or explicitly accept — and say why — that this control is authoring-discipline-only, matching how P1068 was ultimately framed.


### Implementation Approach

**Worktree recommended:** this spec's Build Sequence touches `.claude/commands/slava/build/`,
`scripts/`, `.claude/rules/features.md`, and `scripts/ship-gates.sh` — all shared, high-blast-
radius surfaces per `.claude/rules/git.md`; do the work in a `feature/p1255-*` worktree via
`git-ops.sh claim p1255`, never directly on the shared main checkout.

#### Reconciliation — Security Review vs Build Sequence (parent merge step, 2026-09-07)

The `/architect` merge step re-ran every ⚠️ finding in the Security Review above against the
Build Sequence. Four contradictions were found and are corrected in the numbered steps below.
Each was verified by command in this session, not taken from either agent's report.

**R1 — Decision 4's Gate 1.5 deadlocks `/ship` for any embargoed spec carrying a migration.
BLOCKING; Decision 4 is amended by this note.** Gate 1.5 runs before the merge and hard-
requires the spec's migrations to be present in `origin/main:supabase/deploy-manifest.json`
→ `.prod.migrations`. But `.claude/commands/slava/build/ship.md:66` mandates the opposite
order for the worktree case, which `/dev` makes the default: *"do NOT migrate before merge …
Route merge-first: continue through the merge (step 3.7), THEN migrate prod from the main
repo, THEN `git-ops.sh commit-to-main` the stamp."* The reason is structural, not stylistic —
`scripts/stamp-deploy-manifest.sh:23` refuses to run from inside a worktree, and migrating
from main pre-merge dirties main's manifest into a guaranteed cherry-pick conflict. So the
prod stamp Gate 1.5 waits for cannot exist until after the merge Gate 1.5 blocks. **This is
epistemic gate 7c exactly** — a new refusal that was never run against the workflow the tool
already documents.

*Correction:* Gate 1.5 must not gate the **merge**; it gates only **publication of the spec
file**. `/ship` merges the fix code as it does today and, for `disclosure: embargo`, simply
does not seed the spec onto `main` — the spec stays branch-born. Publication becomes a
distinct, later step run from the main repo *after* the prod apply, alongside the manifest
stamp that is already committed there. Decision 4's rejected alternative ("a fully separate
promotion step") was rejected on a cost that does not apply once the merge has happened: the
promotion no longer needs branch resolution, cherry-pick or close mechanics, because the code
is already on `main`. It is a one-file `git-ops.sh commit-to-main` of the spec, in the same
locked sequence that already commits the stamp.

**R2 — neither new gate has a server-side half; the Build Sequence adds none.** Verified:
`grep -n "fix-frontmatter" scripts/pre-commit-checks.sh` → no match, and
`grep -rln "fix-frontmatter" .github/workflows/` → no match (its only wiring is
`.claude/hooks/features-frontmatter-fix.sh`, which `exit 0`s regardless of what the script
reports). `grep -rln "validate-doc-links" .github/workflows/` → no match; it runs only from
`scripts/pre-commit-checks.sh:769`. Per `.claude/rules/git.md`, local hooks are
*"accident-prevention, not the boundary"* — the boundary for this repo's other disclosure
control is the required server-side `privacy-scan / audit-privacy` check on `main` (P919).
A publication control enforced only by a `--no-verify`-bypassable local hook is authoring
discipline wearing a gate's clothing. Build Sequence step 9 is added to supply the CI half;
if the founder declines it, the spec must say plainly that this control is
authoring-discipline-only — which is how P1068 was ultimately framed.

**R3 — `disclosure: embargo` survives into `features/done/` as a permanent public marker.**
Nothing in the Build Sequence strips or normalises the field at close, and
`.claude/rules/features.md` already requires `created_date` and `completed_at` on a done
spec. The published result is a computable, per-spec "this hole was open for
`completed_at − created_date` days", forever, for every security fix. That is a weaker
disclosure than the exploit, but it is *new* information that does not exist today, and it
sits uncomfortably beside this spec's first Invariant. Build Sequence step 10 added.

**R4 — two channels the Build Sequence does not close, recorded as residuals, not fixed
here.** (a) `scripts/git-ops.sh:2397` and `:2944` both commit `chore: close $pn — $title`
**on `main`**, and this spec's own Alternative 3 states the title often names the component
and the hole; under the R1 correction the close commit still fires at merge time, ahead of
publication. (b) Commits authored on the embargoed branch are cherry-picked to `main`
verbatim at merge; nothing constrains their subjects. Both are title/message channels, not
spec-body channels — they need a wording rule, not a gate, and that rule belongs with the
authoring control in `.claude/rules/features.md`, not in this Build Sequence. Named so
neither is mistaken for covered.

**Also corrected — a stale justification in this spec's own text.** The "Adjacent gap"
section argues the staging-branch hop does not undermine this design because *"a gitignored
file never enters any commit."* That reasoning belongs to the withdrawn gitignore draft;
under branch-born the spec file **is** tracked and committed. Re-derived against the actual
mechanism: `docs/technical/git-workflow.md:97-113` pushes to a publicly-fetchable
`staging/pN` before the required check runs, so the close-commit title from R4(a) transits a
public ref seconds before `main`. The conclusion survives — no incremental exposure beyond
R4(a) — but the stated reason does not. The section should read "no incremental exposure
beyond the close-commit title", not "does not undermine".

**Not contradicted, confirmed consistent:** the Security Review's constraint that the
publishability check must never become a committed list of embargoed paths (that would
re-create the P1248 failure). Decision 3 satisfies it — it reads the target spec's own
frontmatter, deriving scope from data the spec already carries, per Invariant 1.

#### Build Sequence

0. **(Separate spec, not this Build Sequence — see Decision 6.)** File and ship the P1215
   redaction spec first; it is independent of everything below and should not wait on it.
1. `.claude/rules/features.md` — add `disclosure: public | embargo` to the required
   Frontmatter table and document the closed-default rule (Decision 1).
2. `scripts/fix-frontmatter.py` — add `disclosure` to the report-only missing-field list next
   to `type` (Decision 1, tier 2). Verify: run against one spec missing the field, confirm the
   error string appears and the file is otherwise unchanged (no auto-fill).
3. `scripts/pre-commit-checks.sh` — add check "12c", scoped to
   `--diff-filter=A -- 'features/p*.md'` (Decision 1, tier 3). **Exercise gate 7 and 7c in the
   same run, per Done-When item 2:** stage one new spec missing `disclosure:` → confirm
   non-zero exit, paste it; stage one new spec carrying a valid `disclosure:` value in the
   same commit → confirm it passes. Separately confirm the 163 existing specs, touched with a
   trivial unrelated edit (`M`, not `A`), do **not** trip the new check — paste that result
   too, since it is the gate-7c-adjacent proof that grandfathering actually holds under a real
   edit, not just under the theory of `--diff-filter=A`.
4. `scripts/validate-doc-links.cjs` — implement the `classifyTarget` change (Decision 3).
   Verify: a same-branch link from a test doc to a test spec carrying `disclosure: embargo`
   fails with the new message; the same link to a spec carrying `disclosure: public` (or the
   field absent, pre-backfill) passes — both in the same run (Done-When item 2, gates 7/7c).
5. `create-spec.md` and `create-bug.md` — add the classification-before-guard carve-out
   (Decision 2). Verify: run each skill once with a request that clearly does NOT describe a
   live defect (confirm the existing w0-only guard still fires unchanged from a worktree —
   this is the "legitimate workflow still passes" proof gate 7c asks for on THIS refusal too,
   since the guard itself is being modified) and once with a request that does (confirm it
   routes to `git-ops.sh claim` + writes inside the new worktree, never touching `main`).
6. `scripts/ship-gates.sh` — add Gate 1.5 **as amended by R1: it gates spec publication,
   never the merge.** For `disclosure: embargo`, `/ship` merges the fix code unchanged and
   skips the spec seed/mv onto `main`, leaving the spec branch-born and reporting that it did
   so. Verify: run `/ship` against a test embargoed spec — confirm the code merges, confirm
   `git cat-file -e main:features/pNNNN*.md` **fails** afterwards (gate 7: publication
   withheld), and confirm a `disclosure: public` spec in the same run still seeds and closes
   normally (gate 7c: the pass-through case). **Do not implement the pre-merge blocking form
   in Decision 4 — it deadlocks against `ship.md:66`; see R1.**

6b. **New — the publication step.** After the prod apply, from the main repo root, in the same
   `git-ops.sh commit-to-main` sequence that already commits the manifest stamp: assert every
   migration belonging to the spec is present in `origin/main:supabase/deploy-manifest.json`
   → `.prod.migrations`, assert `node scripts/prod-smoke-test.mjs` passed in this session with
   the fix-specific assertion present (Decision 4 step 4 — this half is unchanged and is the
   "live catalogue check, never the manifest alone" confirmation), then commit the spec file
   to `main`. For a spec with no migration, the manifest assertion is replaced by the explicit
   operator ack of Decision 4 step 3. Verify: run it once with the migration absent from the
   prod manifest (confirm non-zero exit, migration named — gate 7) and once with it present
   and the smoke passing (confirm the spec lands on `main` — gate 7c).

7. Wire the neutral-stub commit (Decision 5) into the worktree-guard carve-out's step (a)/(b)
   from item 5 above — same skill edit, same verification pass.
8. **One-time backfill** (Decision 1's rejected-alternative note) — a separate PR,
   `scripts/archive/migrations/YYYYMMDD-backfill-disclosure-public.py`, stamping
   `disclosure: public` on the 163 already-published open specs. Requires the founder's D2
   answer before running (does anything beyond `public` apply to the 19-20 already-published
   security-tagged specs) — do not run this step unattended.

9. **Server-side half (R2) — `.github/workflows/`.** Add the `disclosure:` required-field
   check and the publishability check to a workflow wired as a **required** status check on
   `main` with an empty bypass list, mirroring how `privacy-scan` / `audit-privacy` is already
   configured (P919). Without this, both gates are `--no-verify`-bypassable and the control is
   authoring discipline, not a boundary. Verify: open a test PR that links a public doc to an
   embargoed spec — confirm the required check fails and blocks merge (gate 7); confirm a PR
   touching a normal spec passes the same check (gate 7c). **If the founder declines this
   step, amend the Solution to state the control is authoring-discipline-only** rather than
   leaving it implied.

10. **`disclosure:` normalisation at close (R3).** Decide and implement what the field reads
   once the spec is in `features/done/`. Options: leave `embargo` (accepts the permanent
   exposure-duration marker), rewrite to `public` at publication in step 6b (loses the audit
   trail locally unless mirrored to `.private/`), or drop the field entirely at close. This is
   a founder call — add it to Decisions Required as **D4** and do not pick it here.

#### Files to Create

- `scripts/archive/migrations/YYYYMMDD-backfill-disclosure-public.py` — one-time backfill
  (Decision 1; run only after D2 is answered).
- (No other new files — every other change is an edit to an existing, named file. The stub
  spec files created per Decision 5 are data, not code, and are created by the modified skill
  at runtime, not authored here.)

#### Files to Modify

- `.claude/rules/features.md` — add `disclosure:` to the required Frontmatter table.
- `scripts/fix-frontmatter.py` — add `disclosure` to the report-only list (`fix_file`, near
  L338-340).
- `scripts/pre-commit-checks.sh` — new check 12c after check 12 (~L772).
- `scripts/validate-doc-links.cjs` — `classifyTarget` (L263-291), add the embargo-frontmatter
  branch after the `trackedSet()` check (L287).
- `.claude/commands/slava/build/create-spec.md` — Worktree guard section (L16-21):
  classification-before-guard carve-out.
- `.claude/commands/slava/build/create-bug.md` — Worktree guard section (L26-33): same
  carve-out.
- `scripts/ship-gates.sh` — new Gate 1.5, inserted before the existing Gate 2.5 block
  (~L70).
- `.claude/commands/slava/build/ship.md` — document Gate 1.5 in the gate-report list (mirrors
  how 2.5/2.7/3.5/3.65 are already documented there per the file read this session).
- `scripts/prod-smoke-test.mjs` — per-fix assertions added by each future embargoed spec's own
  Pre-deploy Checklist (not a single upfront edit; ongoing, spec-by-spec).
- `.github/workflows/` — the server-side required check for both new gates (R2, Build Sequence
  step 9). **Net-new and not in the Architect's original list**; without it neither gate is a
  boundary.
- `.claude/rules/features.md` — additionally, the commit-subject wording rule for embargoed
  specs (R4: close-commit titles and branch commit subjects reach `main` ahead of publication).
- **Explicitly NOT modified:** `tools/kanban/server/api.ts` (already correct — Technical
  Analysis), `tools/kanban/scripts/validate-features.ts` (must NOT gain `disclosure` in its
  `requiredFields` — Technical Analysis), `scripts/next-p-number.sh`,
  `scripts/check-duplicate-p-numbers.sh`, `scripts/setup-worktree.sh`,
  `scripts/goal-gate.sh`, `.github/workflows/goal-gate.yml` (all already correct as traced
  above), `scripts/ship-gates.sh:47`'s `fix/` branch gap (flagged, not fixed — out of scope).
