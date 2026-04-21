---
status: week
type: task
rank: 1000751.0
created_date: '2026-04-21'
tags: [infrastructure, worktrees, git, skills, process]
delivery_stage: create-spec
pipeline_ran: [create-spec]
architect_plan: ~/.claude/plans/and-what-about-push-wild-pony.md
base_commit: a10dfd38
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
