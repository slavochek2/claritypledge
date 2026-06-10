---
status: qa
type: task
rank: 1000802.0
created_date: '2026-06-10'
tags: [infrastructure, git-hooks, privacy, security]
delivery_stage: fix
pipeline_ran: [create-spec, fix]
---

# P917: Pre-push privacy gate — tracked source, stamp-path unify, decouple from push-enable

## Problem

**Situation:** The repo runs a layered privacy firewall — pre-commit (`pre-commit-checks.sh`: gitleaks + grep + `audit-privacy.sh`) and a 137-line `.git/hooks/pre-push` (a non-bypassable PII regex scan + a `.privacy-reviewed` stamp gate + a prod TTY confirm). `/maintain:privacy` is the judgment-layer review the stamp gate is supposed to enforce.

**Complication:** Verified 2026-06-10 (while running `/maintain:privacy` after committing strategy-doc changes from `/claude-conversations-to-cp`) that the pre-push *judgment* layer is non-functional and non-reproducible — **four defects**:
1. **No tracked source.** `scripts/install-hooks.sh` (run via `postinstall`) installs **only** `pre-commit` (symlink → `pre-commit-checks.sh`). The `pre-push` hook is a hand-written local artifact (2026-04-18 per decisions.md) with **no tracked source** in the repo. A fresh clone / CI / a new machine has **no pre-push privacy gate at all** (CI gitleaks covers secrets only, not the privacy judgment layer).
2. **Stamp-path mismatch → gate inert.** The hook reads `$(git rev-parse --show-toplevel)/.privacy-reviewed` (repo ROOT). The `/maintain:privacy` skill writes `.claude/.privacy-reviewed`. **Running the review never satisfies the hook** — it either hard-blocks every interactive docs push or is skipped by push-enable.
3. **push-enable waives the judgment gate.** `if [[ -f "$HOME/.push-enabled" ]]; then exit 0; fi` sits **above** the `.privacy-reviewed` gate, so push-enable skips the privacy review **and** the TTY confirm. The PII regex scan (first in the file) correctly stays non-bypassable. Authorizing a push ≠ having done the review.
4. **Root `.privacy-reviewed` not gitignored** (`.claude/.privacy-reviewed` is) — a committable-stamp latent leak if the hook's root path were ever satisfied.

**Question:** How do we make the pre-push privacy review reproducible (every clone), functional (the stamp the skill writes is honored), and uncoupled from push-authorization — without weakening the non-bypassable PII scan?

**Prior incident (why this matters):** decisions.md records 297 commits that once leaked personal identifiers to `origin/main` past a broken privacy check. This is the same firewall.

## Appetite

**Blast radius — medium-high.** It's the security firewall: touches `scripts/install-hooks.sh`, the pre-push hook body, and the `/maintain:privacy` SKILL stamp path. **Reversibility — high** per change (git-revert + re-run installer). **Decision density — low.** Fix direction is determined; the one open call is heredoc-in-installer vs a tracked hook file symlinked like pre-commit.

## Solution

1. **Track + install the pre-push hook.** Move the hook body into a tracked source installed by `scripts/install-hooks.sh` on `postinstall` (mirror the existing pre-commit symlink pattern, including the worktree-safe `--git-common-dir` handling already in that script). It must recreate on a fresh `bash scripts/install-hooks.sh`.
2. **Unify the stamp path on `.claude/.privacy-reviewed`** (already gitignored) in **both** the hook and `.claude/commands/slava/maintain/privacy/SKILL.md` step 6.
3. **Hoist the `.privacy-reviewed` gate above the push-enable `exit 0`.** push-enable waives **only** the TTY confirm. Keep the PII scan first and unconditional, exactly as-is.

## Risks / Non-Goals

### Risks
- **Weakening / reordering the non-bypassable PII scan.** MITIGATE: the PII scan stays first and unconditional; only the stamp-gate position and path change. Verify it still runs (and still blocks) after the edit.
- **Fresh-clone install regression** (hook not installed, or installed to the wrong dir under a worktree). MITIGATE: exercise the installer + failure path on a throwaway clone / fresh worktree before trusting it.
- **The change itself silently no-ops the gate** (the exact failure mode from the 297-commit incident). MITIGATE: the Done-When failure-path proof is mandatory — paste exit codes, do not infer.

### Non-Goals
- Do NOT change `audit-privacy.sh` patterns or `.github/workflows/secret-scan.yml`.
- Do NOT touch the `pre-commit` hook or `pre-commit-checks.sh` privacy section.
- Do NOT remove the prod TTY confirm — only decouple it from the privacy gate.
- Do NOT make any layer that is currently non-bypassable bypassable.
- Do NOT add a second stamp path or leave the root `.privacy-reviewed` path live.

### Alternatives Considered
- **Edit `.git/hooks/pre-push` directly** — rejected: wiped by the next `postinstall` (no tracked source is the root defect; an inline edit is not a fix).
- **Keep the hook's root path and gitignore root `.privacy-reviewed`** — rejected: `.claude/.privacy-reviewed` is already the gitignored, skill-written path; unify there instead of introducing a second ignore rule and a committable root stamp.

### Rollback Strategy
Revert the `install-hooks.sh` + `SKILL.md` commit and re-run `bash scripts/install-hooks.sh` to restore the prior hook. The local `.git/hooks/pre-push` is regenerable either way (it is not tracked today).

## Done-When

- [x] `scripts/install-hooks.sh` installs `pre-push` from a tracked source (`scripts/pre-push-checks.sh`); a fresh `bash scripts/install-hooks.sh` recreates `.git/hooks/pre-push` as a symlink. Verified in main repo (hand-written file → symlink) AND in a hermetic fresh `git init` repo (no hook → symlink to tracked source, executable).
- [x] Stamp path is identical in the hook (`scripts/pre-push-checks.sh:96`) and `SKILL.md:85`, and is `.claude/.privacy-reviewed` (gitignored, `.gitignore:106`). Root `/.privacy-reviewed` path fully removed.
- [x] **Failure path proven (exit codes):** stamp MISSING → `exit=1`; stamp STALE → `exit=1`; stamp FRESH + push-enable → `exit=0`. Additionally hardened: empty/malformed stamp → `exit=1` (fail-closed).
- [x] **push-enable decoupled (exit codes):** `~/.push-enabled` SET + stamp MISSING → `exit=1`; SET + stamp STALE → `exit=1` (privacy gate STILL fires; only the TTY confirm is waived). Proven with a fake `HOME` so the real human-controlled `~/.push-enabled` was never touched.
- [x] **PII scan non-bypassable:** planted a hard-pattern personal identifier (an absolute `/Users/<name>/...` home path) in a `features/` file, with push-enable SET AND a fresh stamp → `exit=1`, blocked by Layer 1 PII scan (runs first, unconditional). Verified against the REAL `audit-privacy.sh`.
