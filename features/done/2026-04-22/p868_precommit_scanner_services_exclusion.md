---
status: all-done
type: task
rank: 5
flow: inline
pipeline_ran: [ship]
tags:
  - tooling
  - pre-commit
  - security
created_date: 2026-06-01T00:00:00.000Z
completed_at: 2026-06-01
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
2. The installed `.git/hooks/pre-commit` is a **symlink** to `scripts/pre-commit-checks.sh` (created by `scripts/install-hooks.sh` via `ln -sf`) — editing the source script *is* the running hook. No separate reinstall/sync needed. (The original premise of a "diverged superset copy" was incorrect on this setup — see Verification.)
3. Add a `huggingface-access-token` rule to `.gitleaks.toml`. Excluding `services/` from the Layer-2a grep removes the *accidental* backstop that caught hardcoded `hf_` tokens — and `services/transcribe` is the one place `HF_TOKEN` is actually used (`config.py`, `diarizer.py`). gitleaks' default ruleset has no `hf_` rule, so this restores coverage at Layer 1 for `services/` and closes the same pre-existing blind spot for `src/`, `scripts/`, `api/`.

## Risks / Non-Goals

- **RESOLVED:** installed hook is a symlink to the source script — no separate update needed. The original "diverged copy" assumption was wrong (corrected during implementation).
- **MITIGATE → DONE:** widening the Layer-2a exclusion to `services/` would have removed the accidental `hf_`-token backstop there; added a `huggingface-access-token` gitleaks rule (Layer 1) so real `hf_` tokens are still caught everywhere.
- **ACCEPT:** widening the grep exclusion to `services/` is safe — gitleaks (Layer 1, proper rules) scans `services/` for real high-entropy secrets; the grep layer is only a crude name-pattern backstop per its own design comment.
- **Non-goal:** do not weaken gitleaks (Layer 1) or the connection-string scan (Layer 2b). This adjusts the Layer-2a path exclusion + adds one Layer-1 rule.

## Done-When

- [x] Staging a `services/` file with a legitimate `SUPABASE_SERVICE_ROLE_KEY` / `apikey` / `token =` **name** reference (dummy value) no longer false-blocks at commit.
- [x] A `services/` file containing a REAL high-entropy secret IS still caught (by gitleaks Layer 1) — verify gitleaks scans `services/`.
- [x] The installed `.git/hooks/pre-commit` reflects the change (not just `scripts/pre-commit-checks.sh`).
- [x] `services/transcribe/tests/test_pipeline.py` can be re-staged and committed without a false secret block.
- [x] A real (random, high-entropy) `hf_` token under `services/` is caught at Layer 1 by the new `huggingface-access-token` gitleaks rule; an `hf_xxxx…` placeholder is not.

## Verification (2026-06-01)

- **Fix:** one token added to the Layer-2a grep exclusion regex (`scripts/pre-commit-checks.sh:297`) — `…|\.claude/_archive/|scripts/|services/)`.
- **#1 / #4:** the old regex left `services/transcribe/tests/test_pipeline.py` in the grep-scan set (false-positive source); the new regex excludes it while still scanning root config files (`playwright.config.ts`, etc.).
- **#2:** gitleaks 8.30.0 catches a real private key under `services/` identically to a non-`services/` path (2 findings each). `services/` is not allowlisted in `.gitleaks.toml`, so Layer 1 coverage is unchanged.
- **#3 — spec correction:** the installed `.git/hooks/pre-commit` is a **symlink** to `scripts/pre-commit-checks.sh` (`scripts/install-hooks.sh` uses `ln -sf`), not a diverged copy. Editing the source *is* the running hook — no separate reinstall needed. The "MITIGATE: update installed hook" risk above does not apply on this setup.
- **Layer-1 gap closed (added during /finish review):** excluding `services/` from Layer-2a removed the accidental `token =` backstop for hardcoded `hf_` tokens, and gitleaks had no `hf_` rule. Added `huggingface-access-token` to `.gitleaks.toml` (`regex hf_[A-Za-z0-9]{34,}`, placeholder allowlist). Verified: a random `hf_` token under `services/` fires the rule; `hf_xxxx…` placeholder and `os.getenv("HF_TOKEN","")` do not; no false-positive against the current tree.
