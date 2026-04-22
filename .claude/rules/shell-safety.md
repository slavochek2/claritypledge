---
paths:
  - "scripts/**"
  - "**/*.sh"
---

# Shell Safety — Output of eval-able scripts

**Applies to:** any bash/zsh script whose stdout or stderr may be routed into `eval` or a subshell expansion by a downstream caller.

## The rule

Scripts under `scripts/` that print status lines MUST NEVER emit output containing `>`, `<`, or `|` tokens at word boundaries. If a caller's stream reversal (`2>&1 1>/file`) routes stderr into `eval`, the shell re-parses those tokens as I/O redirects and can silently truncate or overwrite files named in the output string.

## Why this rule exists (P783)

On 2026-04-22, `scripts/setup-worktree.sh` emitted lines like `OK  .env.local -> /Users/.../.env.local`. A caller for the P781 smoke test ran:

```bash
eval "$(./scripts/git-ops.sh claim p999 smoketest 2>&1 1>/tmp/claim-stdout)"
```

The stream-reversal routed the setup-worktree output into `eval`. zsh lexed `OK .env.local - > /Users/.../.env.local` as: command `OK`, args `.env.local -`, then redirect `> /Users/.../.env.local`. The `>` operator opened the target with `O_TRUNC` before the nonexistent `OK` command could run, wiping `.env.local` to 0 bytes. All worktree symlinks propagated the wipe. Directory targets errored on `>` and were untouched (that's why only the files were hit).

The attack surface is any eval-adjacent script that emits redirect-parseable tokens. The fix is structural: status lines use separator characters with no shell-metacharacter meaning (e.g., `:` instead of `->`), and a lint helper (`_safe_echo`) aborts on any regression.

## How to apply

When writing or editing a script in `scripts/`:

1. **Never use `->`, `>`, `<`, `|` as separators in status lines.** Use `:`, `—`, `[link]`, or similar. Colon is the canonical choice.
2. **Route all status output through a helper that asserts the output is redirect-safe.** See `scripts/setup-worktree.sh:_safe_echo` for the reference implementation. The helper must exit non-zero if the line contains `>`, `<`, or `|` anywhere.
3. **Don't rely on "but callers should never do `2>&1 1>/file`".** Stream-reversal is an easy typo and is actually useful for capturing stdout + logging stderr. The script's output contract is what matters, not caller discipline.
4. **Document the contract at the top of the script.** A one-line invariant comment beats a reviewer wondering if `_safe_echo` is load-bearing.

## Safe caller pattern for eval-able output

Scripts whose stdout is designed for `eval` (`git-ops.sh claim`, hypothetical future scripts) MUST wrap the eval-safe portion in sentinel markers, so callers can filter reliably:

```bash
# In the producing script:
echo "#CP_CLAIM_BEGIN"
echo "export CP_LOCK_NONCE_w1=abc123"
echo "#CP_CLAIM_END"

# In the caller:
eval "$(./scripts/git-ops.sh claim p1 slug 2>/tmp/claim-stderr.log \
        | sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"
cat /tmp/claim-stderr.log  # human-readable summary stays separate
```

This defends even against mis-formatted output on the producing side.

## What's NOT covered by this rule

- Python and Node.js scripts — they don't re-enter shell lexing when captured, so a Python `print("x > y")` in a `$(...)` context is a string, not a redirect. If such a script's output is ever passed through `bash -c` or `eval`, audit it separately.
- Log files written to disk — a file is not lexed as shell.
- User-facing stderr messages from interactive scripts (`read -p`, etc.) — not intended for machine consumption.

## Related

- `features/p783_env_local_truncation.md` — root-cause analysis and six-layer fix
- `scripts/setup-worktree.sh` — reference `_safe_echo` implementation
- `scripts/test-worktree-setup.sh` — hermetic canary that fails if `setup-worktree.sh` regresses
- `scripts/git-ops.sh:cmd_claim` — reference sentinel-marker output pattern
