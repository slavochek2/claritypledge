---
status: all-done
type: task
rank: 1000751.0
created_date: '2026-04-21'
tags: [infrastructure, worktrees, git, skills, process]
pipeline_ran: [create-spec, decompose]
completed_at: '2026-04-22'
---

# P781: Worktree / branch / push hygiene — unified wrapper + lockfile protocol

## Problem

**Situation:** Multi-session parallel work runs through hand-rolled `git worktree add`, `git checkout -b`, and `rm -rf` calls scattered across `/dev`, `/fix`, `/ship`, `/park`, and ad-hoc agent commands. Worktree slots (`wN`) are numbered, not session-owned. `supabase/migrations/` and `scripts/` are symlinked across every worktree so an untracked WIP file in session A is physically present in session B's tree.

**Complication:** Yesterday's session logged 15 distinct failures across 4 P-numbers, including two `--no-verify` escapes. Three fault lines compound under parallel shipping:
1. **Cross-session contamination** — pre-commit runs `npm test` / `tsc --noEmit` / `npm run build` on the full repo and fails on another session's broken untracked WIP (items 5, 8, 9, P770 #5, #6).
2. **Worktree wipes** — any session's teardown can delete another session's active slot (P766 item #2, three re-applies).
3. **Branch/push doc drift** — `ship.md` step 8 auto-pushes, its footnote claims "push cleanup pre-approved," and `docs/decisions.md` says "push always requires explicit approval." The pre-push hook physically blocks agent pushes (no TTY), so no prod deploy has leaked — but the drift misleads agents into wasting tool calls against a hook that always refuses.

**Question:** How do we make cross-session pollution impossible, bind slots 1:1 to sessions and branches, and align skill wording with the push guards that already exist?

## Appetite

**High blast radius** — touches every branch/worktree/commit op across all skills and every pre-commit in the repo.
**Mostly reversible** — scripts can be deleted, symlinks re-added, skill edits reverted via git revert. The one non-trivial reversal is the in-place migration of w1/w3, which replaces symlinks with native checkouts; the migration script includes a pre-check diff so divergent state surfaces before the swap.
**Low decision density** — invariants decided by the architect plan (one-worktree = one-branch, lockfile identity via PID + start-time + nonce, merge-strategy matrix in `git.md`, no auto-push). Founder decisions only where the plan explicitly defers: (a) whether `git-ops.sh sync` survives the 3-month usage review, (b) whether to pursue GitHub server-side branch protection as a follow-up P-number.

## Solution

Build one sanctioned wrapper (`scripts/git-ops.sh`) that owns every branch/worktree operation agents are allowed to perform. Back it with a lockfile protocol that survives PID recycling, compaction, and crash-between-steps. Break the `scripts/` and `supabase/migrations/` symlinks so native git worktree semantics hold. Scope `pre-commit-checks.sh` to build-affecting staged files so docs-only commits don't run whole-repo tests. Align `/ship`, `/park`, `/dev`, `/fix` with the wrapper, add journal-based idempotent recovery to `/ship` and `/park`, and codify the merge-strategy matrix + one-worktree = one-branch invariant in `.claude/rules/git.md`.

Full technical design (subcommand surface, lockfile fields, identity rules, migration pre-check, 20 regression scenarios, 12-step rollout order) lives in the architect plan at `~/.claude/plans/and-what-about-push-wild-pony.md`. The spec is intentionally shorter than the plan — the plan is the contract for execution.

## Risks / Non-Goals

### Risks

- **Migration breaks an in-flight slot.** `migrate-existing-slot.sh` runs on w1 (chore/kanban-logging) and w3 (feature/p772-letter-shortcodes) while they hold live work. *Mitigation:* step 3 of the migration runs `git diff main..HEAD -- <path>` for each un-symlinked path and aborts if any diff exists; restores symlinks and surfaces the error on verification failure. Destroy-and-recreate is the fallback, never the first move.

- **Wrapper becomes a chokepoint.** If `git-ops.sh` has a bug, every skill breaks at once. *Mitigation:* step 1 of rollout tests all subcommands against a throwaway test P-number on a scratch branch, covering every regression scenario (3, 4, 5, 15, 16, 18, 19) before any skill is wired to call it.

- **`pre-commit-checks.sh` whitelist regression.** An earlier draft narrowed the whitelist to `.ts|.tsx|.js` only, which would skip build for `vite.config.ts` / `package.json` changes and ship broken builds. *Mitigation:* whitelist must include TS/JS source, `package.json`, `*.config.*`, lockfiles, and `public/` assets. Regression tests 6 and 7 verify both directions (docs-only skips, config changes trigger).

- **Lockfile PID recycling.** Two-second PID-recycling window on macOS is the classic race. *Mitigation:* lock identity requires `PID_START_TIME` from `ps -o lstart=` AND a 64-bit nonce stored in caller's environment (`CP_LOCK_NONCE_<slot>`). Either mismatch = stale.

- **Residual: `git push --no-verify` still skips the pre-push hook.** `.claude/rules/git.md` already bans it; the Claude Code `block-prod-deploy.sh` still catches the Bash-tool path. True mechanical defense requires GitHub server-side branch protection — separate P-number, explicitly out of scope here.

### Non-Goals

- **Do NOT install a new pre-push hook.** `.git/hooks/pre-push` already exists (137 lines, 2026-04-18) and does strictly more than any replacement would (PII scan, `.privacy-reviewed` stamp, TTY gate). Plan section C.3 was dropped for this reason. Any edit to the existing hook is out of scope.
- **Do NOT add GitHub server-side branch protection.** Documented as residual risk; handled by a separate P-number.
- **Do NOT fix `cloud-agent.sh`'s 6 unconditional pushes.** Separate tool, separate P-number.
- **Do NOT change long-running batch merge policy.** `letters-ship`-style hundreds-of-commits batches remain a documented merge exception, invoked manually. Matrix only records existing policy.
- **Do NOT ever auto-push in any subcommand.** `/ship` stops at "Ready to push." No flag, no override, no "pre-approved" language.
- **Do NOT remove symlinks for `.env.local`, `.env.test.local`, `node_modules`.** Those are environment/dependency artifacts; their reinstall cost per worktree exceeds the correctness benefit. Only `scripts/` and `supabase/migrations/` get unsymlinked.
- **Do NOT scope `tsc --noEmit` to individual staged files.** Type errors span files; whole-repo tsc remains load-bearing when any build-affecting file is staged.

### Alternatives Considered

- **Keep ad-hoc calls, add more guards.** Rejected: five skills drift independently today; more guards means more drift surfaces. Single wrapper + single rule file cuts the audit surface in half.
- **Per-session worktree directories (`w-<session-id>`) instead of numbered slots.** Rejected: port mapping (5100/5200/5300) is per-slot, not per-session; preserving the numbered slot model keeps Vite/dev-server routing trivial.
- **Install a second git pre-push hook specific to this flow.** Rejected after discovering `.git/hooks/pre-push` already exists and does strictly more (verified during planning). Two hooks would conflict or regress coverage.
- **SHA-set based `/ship` idempotency.** Rejected: cherry-pick bumps SHAs (committer date changes), so SHA-set checks lie. Journal of step-completion + `(source_sha → landed_sha)` mappings is robust against empty-commit skips, partial ranges, and any batch size.
- **Narrow `pre-commit-checks.sh` whitelist to `.ts|.tsx|.js` only.** Rejected: skips build for config/lockfile changes, ships broken builds. Wider whitelist (sources + configs + lockfiles + `public/`) retains correctness without running on docs-only commits.

### Rollback Strategy

Ordered reversal, one layer at a time:

1. **Skill edits** — `git revert` the commits that modified `ship.md`, `park.md`, `dev.md`, `fix.md`. Skills return to raw `git worktree` / `git checkout -b` calls. Safe because the old flows still exist in git history.
2. **Rule edits** — `git revert` the `.claude/rules/git.md` and `docs/technical/worktree-setup.md` commits. No code depends on them; they are discipline layers.
3. **Pre-commit scoping** — `git revert` the `pre-commit-checks.sh` commit. Returns to whole-repo unconditional checks.
4. **Symlink restoration** — `git revert` the `setup-worktree.sh` commit AND re-run `migrate-existing-slot.sh --restore-symlinks` (new `--restore-symlinks` flag, added defensively) on w1 and w3 to put the symlinks back. Destroy-and-recreate is the fallback if `--restore-symlinks` fails on a given slot.
5. **Wrapper removal** — `rm scripts/git-ops.sh scripts/pre-flight.sh scripts/migrate-existing-slot.sh`. Nothing else depends on them once steps 1–2 are reverted.

Rollback is incremental: any single layer can be reverted without touching the others, so a bug in one doesn't force a full revert.

### Migration Plan

Per architect plan section F + rollout step 7:

1. **Pre-check (read-only, run first):** for each slot (w1, w3), for each path (`scripts/`, `supabase/migrations/`), run `git diff main..HEAD -- <path>`. Surface any diff; user decides whether to commit/merge/drop before migration proceeds.
2. **Write lockfile:** new `.lock` with current PID, `PID_START_TIME` from `ps -o lstart=`, new `SESSION_ID`, nonce from `/dev/urandom`, heartbeat timestamp.
3. **Replace symlinks:** only if step 1 is clean. `rm symlink`, then `git checkout -- <path>` from the slot's branch.
4. **Verify:** slot still points at its branch, `git status` unchanged, build still passes (targeted `npm run build` in the slot).
5. **Fallback on verification failure:** restore the symlinks from main, surface the error, do not destroy-and-recreate silently.
6. **Orphan branch pruning** (separate from in-place migration): `git-ops.sh gc --dry-run` → user review → `gc --yes --delete-branches`. Two-flag requirement on irreversible branch deletion.

### Data Integrity Check

"Data" here is git state, not DB rows. Verify via:
- `git worktree list` output unchanged for all migrated slots (same branch, same HEAD SHA).
- `git status` in each slot reports the same working-tree state before and after migration (no phantom changes introduced by the symlink swap).
- `git log --oneline -5` identical pre- and post-migration per slot.

## Done-When

### Code & infrastructure

- [ ] `scripts/git-ops.sh` exists with all subcommands listed in plan section A (`claim`, `status`, `gc`, `release`, `abandon`, `commit-to-main`, `switch-safe`, `sync`, `reconcile`, `ship`)
- [ ] `scripts/pre-flight.sh` exists and is callable from `/ship`, `/dev`, `/fix`, `/park`, and from `git-ops.sh claim/abandon/ship/park`
- [ ] `scripts/migrate-existing-slot.sh` exists and dry-run passes on w1 and w3
- [ ] `scripts/setup-worktree.sh` no longer creates symlinks for `scripts/` or `supabase/migrations/`; still creates symlinks for `.env.local`, `.env.test.local`, `node_modules`
- [ ] `scripts/pre-commit-checks.sh` sections 1, 3, 4 skip when no build-affecting file is staged; whitelist includes TS/JS, `package.json`, `*.config.*`, lockfiles, `public/`
- [ ] `.claude/worktrees/*` is in `.gitignore` (`git check-ignore -v .claude/worktrees/w1/.lock` succeeds)

### Skill & rule updates

- [ ] `.claude/commands/slava/build/ship.md` no longer contains `git push origin main`; uses `git-ops.sh` for cherry-pick + branch delete; acquires `main.lock` for the whole sequence; writes `.ship-state` journal; calls `pre-flight.sh` at step 0
- [ ] `.claude/commands/slava/build/park.md` stamps frontmatter BEFORE KDD cherry-pick; uses `git-ops.sh commit-to-main` for KDD commits; writes `.park-state` journal
- [ ] `.claude/commands/slava/build/dev.md` and `fix.md` delegate to `git-ops.sh claim`
- [ ] `.claude/rules/git.md` (via `/claude-md` gate) bans direct `git worktree` / `git checkout -b` / `git branch -D` / `rm -rf .claude/worktrees/*`; contains merge-strategy matrix; contains one-worktree = one-branch invariant; contains "pushes never pre-approved" statement
- [ ] `docs/technical/worktree-setup.md` drops the "trivial fixes can go directly on main" exception; documents lockfile protocol, `status` output format, and 1:1 invariant

### Regression tests (all from plan verification section, observable)

- [ ] `./scripts/git-ops.sh claim p999 smoketest` creates next free slot + branch + lockfile
- [ ] Two concurrent `commit-to-main` calls serialize via `main.lock` with a clear "held by session X" message (no interleaved writes on main)
- [ ] Lockfile recognized as stale after PID recycling (matching PID, different `PID_START_TIME`)
- [ ] `/ship` resumes correctly after kill between cherry-picks via `.ship-state` journal (no double-apply, no skipped commit)
- [ ] Docs-only commit from w2 succeeds when w1 has an untracked broken test file (both symlink-break AND pre-commit scoping verified independently)
- [ ] Staging `vite.config.ts` alone triggers build; staging `docs/**/*.md` alone skips build
- [ ] `git-ops.sh sync` refuses on any branch that exists on `origin`
- [ ] `switch-safe main` refuses when main has uncommitted changes not attributable to caller's lock

### In-place migration

- [ ] w1 migrated without destroying context (branch, HEAD, port mapping preserved; `git status` unchanged)
- [ ] w3 migrated without destroying context (same checks)
- [ ] If migration pre-check (step 3) surfaces divergence on either slot, plan stops and surfaces — no silent destroy

### End-to-end

- [ ] One full `/ship` run on a real P-number: pre-flight → main.lock → stamp → journal-recorded cherry-pick → branch delete → lock release → "Ready to push." (no auto-push)
- [ ] User explicit push succeeds; Vercel deploys
- [ ] `/kdd` captures the "C.3 dropped because existing hook was better" and "journal beats SHA-set for cherry-pick idempotency" decisions

## Implementation Tasks

> **Deviation note:** The external architect plan at `~/.claude/plans/and-what-about-push-wild-pony.md` was overwritten prior to decompose running. Its content had been repurposed for a follow-up spec (pre-commit hook check-only). The decompose is derived entirely from the spec's inline content: `## Done-When`, `## Risks / Non-Goals`, `## Rollback Strategy`, `## Migration Plan`, and `## Alternatives Considered`. The spec's Solution section summarizes the plan's subcommand surface, lockfile fields, and migration approach in sufficient detail to produce a complete manifest. Plan section references below cite spec sections as `"Spec: <section heading>"`.

> **Pre-flight deviations noted:**
> 1. `## Technical Architecture` section absent in spec — architect plan was external file; plan file has been overwritten. Waived per founder instruction.
> 2. `/spec-review` READY gate not run. Waived per founder instruction.
> 3. No `## Test Coverage Strategy` in spec — `/generate-tests` has not run.

> ⚠️ Run `/generate-tests` before `/dev` — test files not yet generated.

---

### Consistency Check Summary

**Check 1: Acceptance Criteria Coverage**

All 16 Done-When checkboxes map to at least one task in this manifest:
- Code/infra items (items 1–6): covered by Tasks 1–10
- Skill/rule items (items 7–11): covered by Tasks 11–16
- Regression tests (items 12–19): covered by Tasks 1–10 (each task includes inline Verify lines)
- In-place migration items (items 20–22): covered by Tasks 8–9
- End-to-end items (items 23–25): covered by Task 17

All criteria mapped. No unmapped items.

**Check 2: UX–Architecture Drift**
Not applicable — no UX section exists in this infrastructure spec. Skipped.

**Check 3: Security Blockers in Build Sequence**
Risks reviewed: lockfile PID recycling (mitigated in Task 2 lockfile design), migration divergence (mitigated in Task 8 pre-check step), wrapper chokepoint (mitigated in Task 17 smoke test). The residual `git push --no-verify` gap is explicitly out of scope (separate P-number, non-blocking). No unresolved security risks that must precede implementation.

---

### T01 — `.gitignore` check: add `.claude/worktrees/` entry

**Source:** Spec: Done-When > Code & infrastructure (item 6)
**Files:** `.gitignore`
**What:** Verify `.claude/worktrees/*` is not already tracked by git. Add `.claude/worktrees/` to `.gitignore` if absent. Commit the `.gitignore` change alone.
**Why first:** All subsequent tasks write lockfiles and journal files under `.claude/worktrees/`; those paths must be ignored before any `.lock` file is created.
**Dependencies:** None — can start immediately.
Verify: `git check-ignore -v .claude/worktrees/w1/.lock` returns a match after this commit.

---

### T02 — `git-ops.sh`: claim / status / release subcommands

**Source:** Spec: Done-When > Code & infrastructure (item 1); Spec: Solution
**Files:** `scripts/git-ops.sh` (create)
**What:** Create `scripts/git-ops.sh` with three subcommands:
- `claim <p-number> <slug>` — finds next free slot, creates worktree + branch, writes lockfile (PID + `PID_START_TIME` from `ps -o lstart=` + 64-bit nonce + `SESSION_ID` + heartbeat)
- `status [slot]` — prints slot occupancy table or single-slot detail; detects stale locks (PID recycled = PID match but `PID_START_TIME` mismatch)
- `release <slot>` — removes lockfile, does NOT delete worktree (that's `abandon`)
**Why:** Lockfile identity (PID + start-time + nonce) must be established before any other subcommand is built on top of it.
**Dependencies:** T01 (`.gitignore` must be in place before `claim` writes `.lock`).
Verify: `./scripts/git-ops.sh claim p999 smoketest` creates next free slot + branch + lockfile.

---

### T03 — `git-ops.sh`: gc / abandon / reconcile subcommands

**Source:** Spec: Solution; Spec: Done-When > Code & infrastructure (item 1)
**Files:** `scripts/git-ops.sh` (extend)
**What:**
- `gc [--dry-run|--yes --delete-branches]` — lists orphan branches (no lockfile, no recent activity); dry-run default; two-flag requirement on branch deletion
- `abandon <slot>` — removes lockfile AND worktree, does NOT delete branch (branch is preserved for manual review)
- `reconcile` — cross-checks active lockfiles against `git worktree list` output; surfaces any slot where they disagree
**Dependencies:** T02 (claim/status/release must exist first for gc/abandon to reason about lock state).

---

### T04 — `git-ops.sh`: commit-to-main + switch-safe subcommands

**Source:** Spec: Solution; Spec: Done-When > Code & infrastructure (item 1)
**Files:** `scripts/git-ops.sh` (extend)
**What:**
- `commit-to-main <message> [files...]` — acquires `main.lock`, runs `git commit`, releases lock; serializes concurrent main commits
- `switch-safe <branch>` — checks that target branch has no uncommitted changes not attributable to caller's lock before switching; refuses if another session's lock is active on the slot
**Why separate task:** `commit-to-main` requires `main.lock` file (distinct from slot `.lock`); `switch-safe` requires understanding of lock identity. Both are independently testable.
**Dependencies:** T02.
Verify: Two concurrent `commit-to-main` calls serialize with "held by session X" message; `switch-safe main` refuses when main has uncommitted changes from a different lock.

---

### T05 — `git-ops.sh`: sync subcommand

**Source:** Spec: Done-When > Code & infrastructure (item 1); Spec: Risks / Non-Goals > Non-Goals
**Files:** `scripts/git-ops.sh` (extend)
**What:** `sync` — rebases current slot's branch onto main, but only when the branch does NOT exist on `origin`. Refuses on any branch that has a remote counterpart (push was never pre-approved, so a pushed branch must be handled manually).
**Dependencies:** T02.
Verify: `git-ops.sh sync` refuses on any branch that exists on `origin`.

---

### T06 — `git-ops.sh`: ship subcommand (journal-based idempotent)

**Source:** Spec: Done-When > Skill & rule updates (item 7); Spec: Risks / Non-Goals > Alternatives Considered (SHA-set rejected)
**Files:** `scripts/git-ops.sh` (extend)
**What:** `ship <p-number>` — acquires `main.lock`, cherry-picks commits from the feature branch onto main, writes `.ship-state` journal per step (source SHA → landed SHA mappings), skips already-landed commits on resume (idempotent), deletes feature branch on success, releases `main.lock`. Stops at "Ready to push." — NEVER auto-pushes.
**Why journal:** cherry-pick bumps SHAs (committer date changes), so SHA-set checks lie. Journal of step-completion + mappings is robust against empty-commit skips, partial ranges, and any batch size.
**Dependencies:** T04 (requires `commit-to-main` pattern for `main.lock` acquisition).
Verify: `/ship` resumes correctly after kill between cherry-picks via `.ship-state` journal (no double-apply, no skipped commit).

---

### T07 — `scripts/pre-flight.sh` (create)

**Source:** Spec: Done-When > Code & infrastructure (item 2)
**Files:** `scripts/pre-flight.sh` (create)
**What:** Create `pre-flight.sh` — callable from `/ship`, `/dev`, `/fix`, `/park`, and from `git-ops.sh claim/abandon/ship/park`. Checks: lockfile valid for caller's session, slot branch matches expected, working tree clean, `main` up to date with remote (read-only check — no fetch). Exits non-zero with a clear message on any failure.
**Dependencies:** T02 (reads lockfile format established there).
Verify: `scripts/pre-flight.sh` callable without arguments; exits 0 on clean state, non-zero with message on stale lock.

---

### T08 — `scripts/migrate-existing-slot.sh` (create)

**Source:** Spec: Done-When > Code & infrastructure (item 3); Spec: Migration Plan
**Files:** `scripts/migrate-existing-slot.sh` (create)
**What:** Create `migrate-existing-slot.sh`:
1. Pre-check (read-only): for each path (`scripts/`, `supabase/migrations/`), run `git diff main..HEAD -- <path>`; abort with error if any diff found
2. Write lockfile for the slot
3. Replace symlinks: `rm symlink`, then `git checkout -- <path>` from the slot's branch
4. Verify: slot still points at its branch, `git status` unchanged, build still passes
5. Fallback on verification failure: restore symlinks, surface error
6. `--restore-symlinks` flag for rollback
**Dependencies:** T01 (`.gitignore`), T02 (lockfile format).
Verify: `./scripts/migrate-existing-slot.sh --dry-run w1` dry-run passes on w1; if migration pre-check surfaces divergence, plan stops.

---

### T09 — Migrate w1 and w3 in place

**Source:** Spec: Done-When > In-place migration (items 20–22)
**Files:** `.claude/worktrees/w1/` and `.claude/worktrees/w3/` (symlinks replaced, no file creates in git)
**What:** Run `migrate-existing-slot.sh` on w1 (chore/kanban-logging) and w3 (feature/p772-letter-shortcodes):
1. Dry-run on both: surface any diffs in `scripts/` or `supabase/migrations/`
2. If clean: execute migration on w1, verify, then execute on w3, verify
3. If pre-check fails on either: stop, report, do not proceed
**Dependencies:** T08 (migration script must exist), T01 (`.gitignore` must be in place).
Verify: w1 migrated without destroying context (branch, HEAD, port mapping preserved; `git status` unchanged); w3 same; if divergence detected, plan stops with clear message.

---

### T10 — `scripts/pre-commit-checks.sh`: scoping (skip when no build-affecting file staged)

**Source:** Spec: Done-When > Code & infrastructure (item 5); Spec: Risks > `pre-commit-checks.sh` whitelist regression
**Files:** `scripts/pre-commit-checks.sh`
**What:** Gate sections 1 (tsc), 3 (build), 4 (tests) behind a staged-file whitelist check. Whitelist: `*.ts`, `*.tsx`, `*.js`, `package.json`, `*.config.*`, lockfile patterns (`package-lock.json`, `yarn.lock`), `public/` assets. Docs-only commits (`**/*.md`, `*.json` config files not in whitelist) skip all three sections.
**Why separate from T07:** This change to `pre-commit-checks.sh` must be committed before any worktree migration (`T09`) so that migration commits (which are chore/docs commits) don't accidentally trigger whole-repo tests.
**Dependencies:** T01 (`.gitignore` commit must land first).
Verify: staging `vite.config.ts` alone triggers build; staging `docs/**/*.md` alone skips build (regression tests 6 and 7 from original plan).

---

### T11 — `scripts/setup-worktree.sh`: break `scripts/` and `supabase/migrations/` symlinks

**Source:** Spec: Done-When > Code & infrastructure (item 4)
**Files:** `scripts/setup-worktree.sh`
**What:** Remove the lines that create symlinks for `scripts/` and `supabase/migrations/`. Keep symlinks for `.env.local`, `.env.test.local`, `node_modules` (per Non-Goals). Add `git checkout -- scripts/ supabase/migrations/` after worktree creation to hydrate native copies from the slot's branch.
**Dependencies:** T09 (existing w1/w3 already migrated, so new worktrees created after this edit will be correct from birth).
Verify: Create a test worktree with `git-ops.sh claim p999 test`; confirm `scripts/` and `supabase/migrations/` are real directories (not symlinks); confirm `.env.local` is still a symlink.

---

### T12 — `.claude/commands/slava/build/ship.md`: rewrite for `git-ops.sh` + journal + pre-flight

**Source:** Spec: Done-When > Skill & rule updates (item 7)
**Files:** `.claude/commands/slava/build/ship.md`
**What:**
- Add step 0: call `pre-flight.sh`
- Acquire `main.lock` for the whole sequence via `git-ops.sh`
- Replace direct `git cherry-pick` calls with `git-ops.sh ship <p-number>`
- Journal-based idempotent recovery via `.ship-state`
- Remove ALL `git push origin main` references
- Remove "push cleanup pre-approved" language
- End sequence at "Ready to push." — no push, no flag, no override
**Dependencies:** T06 (ship subcommand), T07 (pre-flight).

---

### T13 — `.claude/commands/slava/build/park.md`: stamp frontmatter before KDD cherry-pick + journal

**Source:** Spec: Done-When > Skill & rule updates (item 8)
**Files:** `.claude/commands/slava/build/park.md`
**What:**
- Move frontmatter stamp step to BEFORE any KDD cherry-pick (prevents the stamp commit from being missed if cherry-pick fails)
- Replace direct `git commit` for KDD commits with `git-ops.sh commit-to-main`
- Add `.park-state` journal write so resume is safe after interruption
**Dependencies:** T04 (commit-to-main), T07 (pre-flight).

---

### T14 — `.claude/commands/slava/build/dev.md` and `fix.md`: delegate to `git-ops.sh claim`

**Source:** Spec: Done-When > Skill & rule updates (item 9)
**Files:** `.claude/commands/slava/build/dev.md`, `.claude/commands/slava/build/fix.md`
**What:** Replace direct `git worktree add` + `git checkout -b` calls with `git-ops.sh claim <p-number> <slug>`. Add `pre-flight.sh` call at session start. Both skills acquire a lockfile via claim; the lockfile is valid for the session's duration.
**Dependencies:** T02 (claim), T07 (pre-flight).

---

### T15 — `.claude/rules/git.md` edit via `/claude-md` gate

**Source:** Spec: Done-When > Skill & rule updates (item 10)
**Files:** `.claude/rules/git.md` (via `/claude-md` gate — MUST use the gate, not direct edit)
**What:** Add to git.md:
1. Ban list additions: direct `git worktree add`, direct `git checkout -b` (use `git-ops.sh claim`), direct `git branch -D` (use `git-ops.sh abandon`), `rm -rf .claude/worktrees/*` (use `git-ops.sh release`/`abandon`)
2. Merge-strategy matrix (e.g., single-commit features → cherry-pick, multi-commit features → merge, long-running batches → documented exception)
3. One-worktree = one-branch invariant: a slot must never have more than one branch checked out; switching branches inside a slot without `switch-safe` is banned
4. "Pushes are never pre-approved" statement: no skill, comment, or agent prompt may claim push is pre-approved
**Note:** This task MUST invoke `/claude-md "add worktree/branch/push rules to git.md"` first. Do not edit the file directly.
**Dependencies:** T12, T13, T14 (skill edits should land before the rule banning direct calls — otherwise the rule fires against old skills during the migration commit).

---

### T16 — `docs/technical/worktree-setup.md` edit

**Source:** Spec: Done-When > Skill & rule updates (item 11)
**Files:** `docs/technical/worktree-setup.md`
**What:**
- Drop the "trivial fixes can go directly on main" exception (replaced by the one-worktree = one-branch invariant)
- Document lockfile protocol: fields, identity rules, stale detection (PID + `PID_START_TIME` + nonce), heartbeat format
- Document `git-ops.sh status` output format
- Document 1:1 slot-to-branch invariant
- Document `migrate-existing-slot.sh` usage and `--restore-symlinks` flag
**Dependencies:** T11 (setup-worktree.sh changes finalized), T02 (lockfile format finalized).

---

### T17 — End-to-end `/ship` validation on a real P-number

**Source:** Spec: Done-When > End-to-end (items 23–25)
**Files:** None — validation only; updates spec Done-When checkboxes
**What:** Run one full `/ship` on a real (non-p999 smoke) P-number. Required sequence:
1. `pre-flight.sh` → passes
2. `main.lock` acquired
3. Frontmatter stamp applied
4. `.ship-state` journal records each cherry-pick
5. Feature branch deleted
6. Lock released
7. Output: "Ready to push." (no auto-push)
8. User explicit push succeeds; Vercel deploys
9. `/kdd` captures "C.3 dropped because existing hook was better" and "journal beats SHA-set for cherry-pick idempotency" decisions
**Dependencies:** T12 (ship.md), T15 (git.md rule bans direct push), all other tasks complete.
Verify: `Spec: Done-When > End-to-end` — all three checkboxes observable.

---

**Total tasks:** 17 | **Can parallelize:** T02/T03/T04/T05 can start in parallel once T01 is done; T07/T08/T10 can parallelize after T01; T11 must wait for T09; T12/T13/T14 can parallelize after T06/T07; T15/T16 can parallelize after T12/T13/T14 | **Must be sequential:** T01 → T02 → T06 → T12 → T17; T08 → T09 → T11
