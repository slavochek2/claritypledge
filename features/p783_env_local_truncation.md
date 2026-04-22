---
status: qa
type: bug
severity: critical
rank: 1000783.0
created_date: '2026-04-22'
date_reported: '2026-04-22'
tags: [infrastructure, shell-safety, env, worktrees, security]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
architect_plan: ~/.claude/plans/creqate-a-detialed-plan-dapper-moonbeam.md
base_commit: 9ffc2d22
---

# P783: `.env.local` truncation via shell-redirect injection (P781 fallout)

## Problem

**Situation:** On 2026-04-22 around 16:00:50 local time, `.env.local` (5157 bytes) and `.env.test.local` (1545 bytes) in the main `claritypledge` repo were truncated to 0 bytes. `.env.prod` was untouched. Because worktrees `w1`/`w3`/`w4` symlink their `.env.local` and `.env.test.local` at main's file, the wipe propagated to every active worktree simultaneously.

**Complication:** The truncation was triggered by a documented smoke-test command for in-progress work on P781:

```bash
eval "$(./scripts/git-ops.sh claim p999 smoketest 2>&1 1>/tmp/claim-stdout)"
```

The `2>&1 1>/tmp/claim-stdout` reversal routed **stderr** (which contained `setup-worktree.sh` output) into `eval`. `setup-worktree.sh:39` emitted lines of the form `OK  .env.local -> /Users/.../.env.local`. `zsh` parsed each such line as a command with a redirect — specifically `OK .env.local - > /path` — which ran `OK` (command not found, but parsed first), then opened `/path` with `O_TRUNC` for the `>` operator. The target file's inode and permissions were preserved (in-place truncation, not recreation) and directory targets (`node_modules`, `scripts`, `supabase/migrations`) errored on `>` and were unaffected.

**Question:** How do we make it structurally impossible for `setup-worktree.sh` — or any eval-adjacent shell script — to emit output that can be re-interpreted as a shell redirect, and ensure any regression trips an invariant guard before it can wipe a second file?

## Appetite

**High blast radius** — `scripts/setup-worktree.sh` runs automatically via `npm predev` (`check-worktree-env.sh`). Any session running `npm run dev` re-emits the dangerous `->` string. Any re-run of the P781 smoke command wipes the env files again. Restoring without prevention exposes the restored file to the same bug immediately.

**Mostly reversible** — every change is a shell script or rule file; `git revert` undoes. The hermetic canary (L4) makes regressions loud.

**Low decision density** — user already resolved L1+L2+L3+L4+L5+L6 via AskUserQuestion. Launchd file-integrity monitor and tty merged-streams check explicitly dropped (paranoia theater once structural layers close the bug surface). Decisions are in the architect plan.

## Solution

Six-layer defense, all landing on `main` via this fix (no reliance on P781 shipping):

- **L1**: Replace the dangerous `echo "OK  $label -> $src"` in `scripts/setup-worktree.sh:39` with `echo "OK  $label: $src"`. Colon has no shell-metacharacter meaning at a word boundary.
- **L1b**: `_safe_echo` filter that rejects any output line containing `>`, `<`, or `|` anywhere in the string (character-level, not space-bounded — a space-bounded check would miss `->` because `-` precedes `>` without whitespace). Catches any future edit that reintroduces a redirect-looking token. The canary (L4) uses the same character-level check, and the plan's original space-bounded regex was widened here and in the canary for this reason.
- **L2**: Pre/post hash + size invariant guard on `$MAIN_REPO/.env.local` and `$MAIN_REPO/.env.test.local`. Portable via `wc -c` + `shasum` (avoids BSD/GNU `stat` incompatibility).
- **L3a**: Promote `scripts/git-ops.sh` from the P781 worktree (`.claude/worktrees/w4`) onto `main` so the structural defenses live on main regardless of whether P781 ships.
- **L3b**: Sentinel-wrapped stdout in `cmd_claim` (`#CP_CLAIM_BEGIN` … `#CP_CLAIM_END`). Even if a caller accidentally merges stderr, the documented safe pattern filters non-export lines out of the `eval`.
- **L3c**: Rewrite the P781-documented smoke command to the safe pattern (`2>/tmp/claim-stderr.log | sed -n '/BEGIN/,/END/p' | grep -v '^#'`). Add a "Lessons" subsection to the P781 spec.
- **L4**: Hermetic canary `scripts/test-worktree-setup.sh` (no `git worktree add`, pure scratch dir). Three invariants: env files unchanged after run, no redirect-parseable output, adversarial `eval` of the captured output cannot wipe a sandbox file. Wired into `pre-commit-checks.sh` when any of setup-worktree / create-worktree / setup-cloud-worktrees / check-worktree-env / git-ops stage.
- **L5**: Shared `scripts/lib/env-sentinel.sh` — `check_env_sentinel` aborts if `.env.local` or `.env.test.local` are 0-byte or point at an empty symlink target. Invoked from both `pre-commit-checks.sh` (early) and `check-worktree-env.sh` (before hydration) for detection at next `npm run dev`, not only at `git commit`.
- **L6**: `chmod 600 .env.local .env.test.local .env.prod` post-restoration. `.env.local` was found at mode `0644` after restoration — secondary exposure.

Full technical design (code snippets per layer, verification steps, P781 coupling): `~/.claude/plans/creqate-a-detialed-plan-dapper-moonbeam.md`.

## Risks / Non-Goals

### Risks

- **L2 only catches in-script mutations.** The actual failure mode was a concurrent external `eval` of this script's output — which cannot be caught by in-script invariant guards. L1+L1b are the primary defense; L2 is defense-in-depth for bugs that haven't been thought of yet.
- **L5 sentinel can't prevent active truncation.** If `.env.local` is being wiped right now by another session, L5 detects it at the next pre-commit or predev. The canary (L4) plus L1+L1b+L3b must make fresh truncation impossible in the first place.
- **L3a promotion creates a temporary duplicate.** `scripts/git-ops.sh` exists on main (via this fix) AND is staged-not-committed in `.claude/worktrees/w4` on the P781 branch. Commit D in the plan deletes the w4 copy to prevent drift. If Commit D is skipped or P781 is abandoned, the stale w4 copy must still be removed.

### Non-Goals

- **Do NOT rotate secrets.** This was a local-only wipe — no network exfiltration, no unknown-process suspicion. Rotation is mandated for any case with exposure suspicion; this incident is not such a case.
- **Do NOT install a launchd file-integrity monitor.** User dropped after plan review — paranoia theater once structural layers close the bug surface.
- **Do NOT add a tty-based merged-streams check inside `setup-worktree.sh`.** Misfires on legitimate `2>log` usage. Sentinel markers (L3b) already cover the failure mode.
- **Do NOT make `.env.local` immutable (`chflags uchg`)** — would force `sudo chflags nouchg` for every legitimate edit. L1+L1b+L2+L5+L6 adequate.
- **Do NOT move `.env.local` outside the repo.** Shell `>` follows symlinks, so pointing at `~/.config/cp/env.local` still gets truncated.
- **Do NOT audit non-shell scripts (Python, Node) for redirect-parseable output.** The incident vector was bash-only. Tracked in `.claude/rules/shell-safety.md` for scope creep monitoring.

### Alternatives Considered

- **Documentation-only defense** (comment warning in `git-ops.sh` header). Rejected — documentation theater. Structural defenses (sentinel markers + output string fix + canary) are the real fix.
- **Keep w4 as sole owner of `git-ops.sh`.** Rejected — protection would evaporate if P781 is abandoned. Landing on main with active deletion in w4 is the coherent version.
- **Narrow L5 sentinel to just `.env.local`.** Rejected — `.env.test.local` was also truncated and is load-bearing for integration tests.

### Rollback Strategy

Each layer reverts independently via `git revert`:

1. **L6 permissions** — no code to revert; `chmod 644` manually if something breaks.
2. **L5 env-sentinel** — revert the commit that adds `scripts/lib/env-sentinel.sh` and removes it from `pre-commit-checks.sh` / `check-worktree-env.sh`.
3. **L4 canary** — revert the commit that adds `scripts/test-worktree-setup.sh` and its pre-commit wiring.
4. **L3b sentinel markers** — revert the commit that wraps `cmd_claim` stdout; documented smoke commands return to raw `eval`.
5. **L3a git-ops.sh promotion** — `git rm scripts/git-ops.sh` on main. P781 branch already re-owns it (if D was not yet applied) or re-stages it on w4.
6. **L1/L1b/L2 setup-worktree.sh** — revert the commit that changes the output string and adds the invariant guard. Note: reverting L1 alone re-introduces the injection bug — must revert with full awareness.

## Acceptance Criteria

- [x] `grep -E '(^|[[:space:]])(->|<-)([[:space:]]|$)' scripts/setup-worktree.sh` matches nothing in `echo`/`printf` lines
- [x] `_safe_echo` helper exists in `scripts/setup-worktree.sh` and every symlink-status line routes through it
- [x] Temporarily reintroducing `echo "bad -> /tmp/x"` causes `setup-worktree.sh` to abort with `FATAL: setup-worktree.sh attempted unsafe output`
- [x] Pre/post hash+size guard exists in `scripts/setup-worktree.sh`; deliberately truncating `.env.local` mid-script aborts with FATAL
- [x] `scripts/lib/env-sentinel.sh` exists with `check_env_sentinel` function
- [x] `scripts/pre-commit-checks.sh` sources and calls `check_env_sentinel` before the TypeScript section
- [x] `scripts/check-worktree-env.sh` calls `check_env_sentinel` before symlink hydration
- [x] `scripts/test-worktree-setup.sh` exists, passes with `bash scripts/test-worktree-setup.sh`, and is wired into `pre-commit-checks.sh` to auto-run when relevant scripts stage
- [x] Temporarily re-adding `echo "bad -> /tmp/x"` causes the canary to FAIL
- [x] `scripts/git-ops.sh` exists on main with `#CP_CLAIM_BEGIN` / `#CP_CLAIM_END` sentinel markers wrapping the export line in `cmd_claim`
- [x] `features/p781_worktree_branch_push_hygiene.md` T02 section reflects the reduced scope (git-ops.sh already on main)
- [x] `features/p781_worktree_branch_push_hygiene.md` documented smoke command uses the safe `2>/tmp/claim-stderr.log | sed ... | grep -v '^#'` form; no remaining `2>&1 1>/tmp/...` pattern
- [x] `.claude/rules/shell-safety.md` exists with the "never emit redirect-like tokens from eval-able scripts" rule
- [x] `stat -f '%Lp' .env.local .env.test.local .env.prod` returns `600` for each
- [x] No `ACTION_NEEDED:` entry for this incident remains in memory after this ships

## Done-When

- [x] L1+L1b+L2 applied to `scripts/setup-worktree.sh`
- [x] `scripts/lib/env-sentinel.sh` created; wired into `pre-commit-checks.sh` + `check-worktree-env.sh`
- [x] `scripts/test-worktree-setup.sh` created; passes locally; wired into `pre-commit-checks.sh`
- [x] `scripts/git-ops.sh` landed on main with L3b sentinel markers
- [x] `.claude/rules/shell-safety.md` filed
- [x] Env file permissions normalized to `600`
- [x] P781 branch reconciliation commit filed (w4): stale `scripts/git-ops.sh` removed, T02 scope reduced, smoke command rewritten to safe form, Lessons subsection added
- [ ] KDD captures: shell-stream-reversal hazard, why documentation-only defenses fail, why structural sentinel markers + output-string fix are the real defenses
- [x] Hermetic canary run on main: exit 0
- [x] Temporarily re-introduce `->` in setup-worktree.sh → canary exits non-zero; revert and re-run → exit 0

## Verification per layer

| Layer | Verification |
|-------|--------------|
| L1 | `grep -- '->' scripts/setup-worktree.sh` returns no matches in `echo`/`printf` lines |
| L1b | Temporarily re-inject `echo "bad -> /tmp/x"`, run script — must abort with FATAL |
| L2 | Temporarily truncate `$MAIN_REPO/.env.local` inside the script, run — must abort with FATAL |
| L3a | `ls scripts/git-ops.sh` on main succeeds after Commit C |
| L3b | `./scripts/git-ops.sh claim p1 test` stdout contains `#CP_CLAIM_BEGIN`/`#CP_CLAIM_END`; safe `eval` pattern captures only the export line |
| L3c | `features/p781_worktree_branch_push_hygiene.md` contains no `2>&1 1>/tmp/...` pattern; smoke uses `2>/tmp/claim-stderr.log \| sed ...` form |
| L4 | `bash scripts/test-worktree-setup.sh` exits 0; temporarily re-add `->` and it must FAIL |
| L5 | Running `check_env_sentinel` with `.env.local` = 0 bytes exits 1 with FATAL |
| L6 | `stat -f '%Lp' .env.local .env.test.local .env.prod` returns `600` for each |

## Out of scope

- **`chflags uchg`** — rejected (forces `sudo` for every legitimate edit).
- **Move `.env.local` outside the repo** — rejected (shell `>` follows symlinks).
- **Rotate all secrets** — rejected for this incident (local-only wipe). Mandate documented for any case with network exposure suspicion.
- **Restoration procedure** — already completed by the user before this plan ran (5157 + 1545 bytes, 53 + 27 lines).
- **Audit Python/Node scripts for redirect-parseable output** — future follow-up. Bash-only vector here.
- **launchd file-integrity monitor** — dropped (paranoia theater).
- **tty-based merged-streams check** — dropped (false positives on legitimate `2>log`).
