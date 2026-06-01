---
status: qa
type: task
rank: 5
delivery_stage: dev
flow: inline
tags:
  - tooling
  - pre-commit
  - security
created_date: 2026-06-01T00:00:00.000Z
---

# P868: Pre-commit secret-scanner — add `services/` to the grep-scan exclusion

> Surfaced during P858 (event-driven transcription) test commits. Filed so it is not lost; not blocking P858 (worked around there by removing an unneeded env line from the new pytest files).

## Problem

The grep-based secret-scan layer in `scripts/pre-commit-checks.sh` (and the installed `.git/hooks/pre-commit`, the copy that actually runs — line ~297) builds `GREP_SCAN_FILES` by excluding every code directory **except `services/`**:

```
grep -vE '(\.gitleaks\.toml|pre-commit-checks\.sh|docs/decisions\.md|docs/technical/|supabase/functions/|supabase/migrations/|features/|src/|api/|e2e/|\.claude/commands/|\.claude/rules/|\.claude/_archive/|scripts/)'
```

The layer's own documented intent (the comment just above it): *"Gitleaks (Layer 1) handles src/, supabase/, and scripts/ with proper rules — grep only scans config/root files."* So gitleaks is meant to cover code dirs; the crude grep is only a config/root backstop. **`services/` was simply omitted from the exclusion list.**

Consequence: any file under `services/` is grep-scanned and false-positives on a legitimate env-var **name** reference — the pattern `(...|SUPABASE_SERVICE|api[_-]?key|...)[^a-zA-Z]` matches `os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-key"`. Gitleaks (Layer 1) correctly passes (the value `test-key` is not a real secret); only the grep backstop false-fires.

The committed `services/transcribe/tests/test_pipeline.py` uses the identical line and would **re-block if it were ever re-staged** — i.e. this is a latent gap, not P858-specific.

## Appetite

Tiny, reversible, low decision-density. One-line change to the exclusion regex + confirm the installed hook reflects it.

## Solution

1. Add `services/` to the `GREP_SCAN_FILES` exclusion regex in `scripts/pre-commit-checks.sh`, alongside the existing `src/|api/|e2e/|scripts/` entries.
2. **Confirm the installed `.git/hooks/pre-commit` picks up the change.** The installed hook (in the shared common git dir, used by every worktree) is a superset of `scripts/pre-commit-checks.sh` and is what runs at commit time — a source-only edit may not update it. Determine how the hook is installed/synced (there may be an install step) and update the installed copy too.

## Risks / Non-Goals

- **MITIGATE:** update the *installed* hook, not just the source script — they have diverged (the installed hook contains additional checks like the P861 typecheck-gate).
- **ACCEPT:** widening the grep exclusion to `services/` is safe — gitleaks (Layer 1, proper rules) still scans `services/` for real high-entropy secrets; the grep layer is only a crude name-pattern backstop per its own design comment.
- **Non-goal:** do not weaken gitleaks (Layer 1) or the connection-string scan (Layer 2b). This only adjusts the Layer-2a path exclusion.

## Done-When

- [x] Staging a `services/` file with a legitimate `SUPABASE_SERVICE_ROLE_KEY` / `apikey` / `token =` **name** reference (dummy value) no longer false-blocks at commit.
- [x] A `services/` file containing a REAL high-entropy secret IS still caught (by gitleaks Layer 1) — verify gitleaks scans `services/`.
- [x] The installed `.git/hooks/pre-commit` reflects the change (not just `scripts/pre-commit-checks.sh`).
- [x] `services/transcribe/tests/test_pipeline.py` can be re-staged and committed without a false secret block.

## Verification (2026-06-01)

- **Fix:** one token added to the Layer-2a grep exclusion regex (`scripts/pre-commit-checks.sh:297`) — `…|\.claude/_archive/|scripts/|services/)`.
- **#1 / #4:** the old regex left `services/transcribe/tests/test_pipeline.py` in the grep-scan set (false-positive source); the new regex excludes it while still scanning root config files (`playwright.config.ts`, etc.).
- **#2:** gitleaks 8.30.0 catches a real private key under `services/` identically to a non-`services/` path (2 findings each). `services/` is not allowlisted in `.gitleaks.toml`, so Layer 1 coverage is unchanged.
- **#3 — spec correction:** the installed `.git/hooks/pre-commit` is a **symlink** to `scripts/pre-commit-checks.sh` (`scripts/install-hooks.sh` uses `ln -sf`), not a diverged copy. Editing the source *is* the running hook — no separate reinstall needed. The "MITIGATE: update installed hook" risk above does not apply on this setup.
