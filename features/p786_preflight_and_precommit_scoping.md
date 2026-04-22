---
status: qa
type: task
rank: 1000752.0
workstream: infrastructure
created_date: '2026-04-22'
tags: [p781, pre-flight, pre-commit, worktrees, cross-session]
parent: p781
blocks: [p789]
delivery_stage: ship
pipeline_ran: [fix, ship]
---

# P786: Pre-flight invariant checker + pre-commit staged-file scoping

## Problem

Two pieces of P781 infrastructure that weren't delivered in the initial pass:

1. **No pre-flight invariant checker.** `/ship`, `/dev`, `/fix`, `/park` don't validate preconditions (lockfile valid, branch matches spec, tree clean of bystander files, main up-to-date). Each skill re-implements ad-hoc checks, and misses cases that `/ship` errors catch too late (e.g., "branch is 30 commits behind main" → cherry-pick storm).

2. **Pre-commit runs whole-repo checks regardless of staged scope.** `scripts/pre-commit-checks.sh` runs `npm test` / `tsc --noEmit` / `npm run build` on every commit, even docs-only. In parallel sessions, session A's uncommitted broken TS blocks session B's docs-only commit. This was P781's #1 motivator and remains open.

Both are prerequisites for clean parallel-worktree operations. Without them, cross-session friction persists.

## Appetite

**Low–medium blast radius.** Pre-flight.sh is a new file — zero risk of regressions. Pre-commit-checks.sh scoping touches every commit — medium risk of false-negatives (a real build break slipping past an incorrectly-narrow whitelist). The P781 spec explicitly warned about this: "an earlier draft narrowed the whitelist to `.ts|.tsx|.js` only, which would skip build for vite.config.ts / package.json changes and ship broken builds."

**Fully reversible.** Both changes are plain script edits; revert via `git revert` if the scoping misses a case.

## Solution

### T07: `scripts/pre-flight.sh`

New file. Single function surface:

```
pre-flight.sh <context> [--slot wN] [--spec pN]
  context ∈ {ship, dev, fix, park, claim}
```

Checks performed (each with clear PASS/FAIL lines):

- **Lockfile:** if `--slot wN` passed, `.claude/worktrees/wN/.lock` exists AND `PID_START_TIME` matches live `ps -o lstart=`. Stale/orphan → FAIL with exit 2.
- **Branch matches:** if `--spec pN` passed AND caller is in a worktree, current branch is `feature/pN-*` or `fix/pN-*`. Mismatch → FAIL.
- **Tree clean of bystanders:** `git diff --cached --name-only` contains only files the caller owns. Heuristic: files whose most recent commit on this branch was by the caller's session (via session-id in `.lock`). If tree has foreign staged files → WARN (not FAIL) with advice.
- **Main up-to-date (read-only):** `git fetch --dry-run origin main` check; report if main is behind origin. Never fetches or modifies.

Invoked from:
- `scripts/git-ops.sh` at top of `claim`, `abandon`, `ship`, `park`
- `/ship` skill as step 0
- `/dev` + `/fix` as Phase 0.0.5

### T10: Staged-file whitelist in `scripts/pre-commit-checks.sh`

Gate sections **1 (TypeScript), 3 (Build), 4 (Tests)** behind:

```bash
BUILD_AFFECTING=$(git diff --cached --name-only | \
  grep -E '\.(ts|tsx|js|jsx)$|^package\.json$|\.config\.(ts|js|mjs|cjs)$|\.lock$|^package-lock\.json$|^deno\.lock$|^public/' \
  || true)
```

If `$BUILD_AFFECTING` is empty → skip sections 1/3/4 with `>>> Skipped (no build-affecting files staged)`. Otherwise run as today.

Whitelist rationale (from P781 Risks): must include TS/JS source, `package.json`, `*.config.*`, lockfiles, and `public/` assets. Narrowing further ships broken builds. Widening further defeats the purpose.

## Risks / Non-Goals

### Risks
- **Pre-commit whitelist too narrow** → ships broken build. Mitigated by the P781-explicit whitelist covering TS/JS/configs/lockfiles/public.
- **Pre-commit whitelist too wide** → no benefit. Mitigated by regression test (AC below): docs-only commit skips build.
- **Pre-flight rejects legitimate state.** Mitigated by WARN (not FAIL) for the "tree has foreign staged files" check — this heuristic is genuinely uncertain.

### Non-Goals
- Do NOT scope section 2 (ESLint) — it's already file-scoped.
- Do NOT scope secrets / gitleaks / privacy checks — they run on staged files and are cheap.
- Do NOT build a cross-session index tracking system. Session-id-in-lockfile is sufficient.

### Alternatives Considered

- **Full rewrite of `pre-commit-checks.sh`** — rejected. Too risky; scope creep. Surgical section-gating is the right appetite.
- **Move pre-flight logic into `git-ops.sh`** — rejected. Pre-flight is called from skills (non-git-ops paths too). Separate file is cleaner.

## Done-When

- [x] `scripts/pre-flight.sh` exists and is executable
- [x] `./scripts/pre-flight.sh claim --slot w99` exits 2 when no lockfile at that slot
- [x] `./scripts/pre-flight.sh ship --spec p999` on a valid worktree + clean tree exits 0
- [x] `scripts/pre-commit-checks.sh` skips sections 1/3/4 when only docs/*.md are staged
- [x] Staging `vite.config.ts` alone triggers build
- [x] Staging `package.json` alone triggers build
- [x] Staging `src/foo.ts` alone triggers build
- [x] Staging `public/image.svg` alone triggers build
- [ ] Pre-flight invoked from `/ship` step 0, `/dev` Phase 0.0.5, `/fix` Phase 0.0.5, and `scripts/git-ops.sh` cmd_claim/cmd_abandon — **deferred to P787 (git-ops) and P789 (skill rewrites)**
- [x] No regression: build still runs when source + docs both staged

## Acceptance Criteria

- [x] Docs-only commit (e.g., `features/done/INDEX.md` edit) shows `>>> Skipped (no build-affecting files staged)` in pre-commit output, does NOT invoke TypeScript/build/test sections
- [x] Config commit (e.g., `vite.config.ts` edit) DOES invoke TypeScript + build + test sections
- [x] `pre-flight.sh` emits a one-line summary per check: `✓` or `✗` with context
- [x] Pre-flight's "lockfile stale (PID recycled)" path is covered by a regression test (hermetic, uses scratch dir + `ps -o lstart=` substitution)

## Dependencies

- **Blocks:** P789 (skill rewrites use pre-flight.sh)
- **Blocked by:** None. Can start immediately on a branch from main.
- **Parallelizable with:** P787 (git-ops.sh extensions)

## Branch

`feature/p786-preflight-precommit-scoping` — from main HEAD at start time.
