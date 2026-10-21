---
status: week
type: task
rank: 50
workstream: infrastructure
created_date: '2026-10-21'
tags: [privacy, push, git-ops, gates]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1526: Close the gaps behind the P1522 push incident (account figures, ambiguous consent, push credential)

## Problem

**Situation:** On 2026-10-20 a spec (P1522) was committed with the Supabase account's usage
totals and a management token's prefix and length. Nothing flagged it at write or commit time.
`/maintain:privacy` caught it at push time as a hard flag. The agent offered three options
(fix file only / rewrite unpushed history / push as is); the founder's reply named none of them,
and the agent chose "fix file only" and pushed. The figures are now in public history. In the
same session, the staging push failed with 403 for about 24 minutes because the fine-grained
token had Contents read-only; nothing checked write access before the founder was asked to
open the push window.

**Complication:** Each gap is mechanical, not a matter of care:
1. The rule "account figures are a hard flag" lives only in the push-time privacy skill.
   Nothing at spec-write or commit time mentions it, and `audit-privacy.sh` matches only shaped
   identifiers (verified: a test line with GB/% figures exits 0; a personal-email control exits 1).
2. `push.md` says STOP on a hard flag but does not say what counts as permission to continue.
3. `git-ops.sh push-docs` first touches credentials at the staging push itself; its only
   credential check (`gh auth status`) runs after it and proves login, not write access.
4. `decisions.md` P970 (2026-06-27) still reads as current ("Contents + Metadata only",
   "git push uses osxkeychain"), though P1335 superseded the scope and `~/.gitconfig` now resets
   github.com helpers to `gh`. `push.md:172` still points at the retired token.

> Founder framing, verbatim: "Analyze one incident and propose the smallest set of mechanical changes that stops it recurring." Then, approving the five ranked changes: "ok let do it"

**Question:** What is the smallest set of mechanical changes that makes each of these fail loudly
next time?

## Appetite

Blast radius: medium (every `/push`, every commit's pre-commit run, every new spec).
Reversibility: git revert. Decision density: zero; the five changes were approved in conversation.

## Invariants

- The privacy-figure check in `pre-commit-checks.sh` is **warn-only** and scans **newly added
  lines only**. It never blocks a commit. (A broad figure regex matches 288 existing lines in 78
  files, mostly public prices; a blocking version would be bypassed.)
- The push preflight runs even under `PUSH_DOCS_ASSUME_YES=1` (decisions.md 2026-06-27: that
  flag skips only the local y/N).
- The preflight must not create any remote ref (`--dry-run` only) and must not print credentials.
- No private figure, token prefix or account id appears in this spec, its tests, or its fixtures.

## Solution

1. **`push.md` (and its `.agents/skills/push/SKILL.md` mirror): consent after a hard flag.**
   When the privacy review hard-flags content in commits that are already committed but unpushed,
   present numbered options and proceed only on a reply that names exactly one option. Any other
   reply (a question, "ok go", "yes", a mixed message) gets a re-ask that restates which option is
   irreversible. Never describe the mechanical scan as catching key shapes or figures.
2. **`git-ops.sh cmd_push_docs`: write preflight.** Before taking `main.lock` and before the
   push window is requested, run `git push --dry-run` of the pushed SHA to a throwaway
   `refs/heads/staging/preflight-*` ref. On failure, die with a message naming the likely cause
   ("push credential lacks Contents write") and the account registry row to fix, plus the raw
   git error. Same check in `cmd_ship_to_prod` if it shares the staging-push path. Implementer
   verifies whether `--dry-run` triggers the local pre-push hook and avoids running it twice.
3. **`/create-spec`: one line in the skeleton guidance and the self-review gates.**
   Account usage, spend, cap, quota figures, billing or account ids, and any token shape
   (prefix, length) go in `.private/`; the public spec says "kept private".
4. **`pre-commit-checks.sh`: a new warn-only check.** On staged added lines in `features/` and
   `docs/`, warn when a usage/billing word (egress, bandwidth, usage, quota, spend, bill, invoice,
   cap, budget, credit) sits near a number with a unit (GB, MB, TB, %, $, €), or when a known
   token prefix (`sbp_`, `github_pat_`, `ghp_`, `gho_`, `sk-ant-`) is followed by a length or
   body. The warning names the file and line and says to run `/maintain:privacy` on it.
   Precedent: check 18c (decisions.md 2026-09-08) warns on newly added lines only.
5. **Docs.** Mark the P970 entry in `docs/decisions.md` superseded by P1335 (scope and helper
   facts), and fix the stale token text at `push.md:172` and its mirror.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Check 4 warns on public prices and gets ignored | MITIGATE | Added lines only, warn text names the one action; measure the hit rate on the last 200 commits and report it |
| Warnings get ignored (decisions.md: a migration warning was routinely ignored) | ACCEPT | Blocking on a regex with this false-positive rate is worse; the push-time skill remains the hard gate |
| Preflight adds a network round trip per push | ACCEPT | One dry-run, seconds |
| Dry-run passes but the real push still fails (e.g. ruleset, workflow-file scope) | ACCEPT | The preflight targets the Contents-write class only; other failures still surface at push |
| Figures already in public history | ACCEPT | Rewriting main is banned; founder accepted option 1 at push time |

**Non-Goals**
- Do NOT rewrite history or force-push anything.
- Do NOT change `audit-privacy.sh` patterns or the CI privacy scan.
- Do NOT change the push-window mechanism (`push-on`, `~/.push-enabled`).
- Do NOT add a token-creation script; the preflight is the single runnable check.
- Do NOT edit `CLAUDE.md` or `.claude/rules/`.

## Done-When

- [ ] Check 4 control: a fixture added line pairing a usage word with a GB/% figure produces the
      warning; a fixture line with a latency in ms and a test count produces none; commit exit
      status is 0 in both. Fixtures live outside `features/` and `docs/`.
- [ ] Check 4 hit rate over the last 200 commits' added lines in `features/` and `docs/` is
      reported in this spec.
- [ ] Preflight control: with the current credential, `push-docs` passes the preflight; with the
      credential helper blanked for github.com (known-bad), it dies before taking `main.lock`
      with the new message. Exit codes pasted.
- [ ] Preflight runs under `PUSH_DOCS_ASSUME_YES=1` (shown by test or trace).
- [ ] `push.md` and its mirror contain the exact-option rule; a reviewer replaying the reply
      "or want consult codex/gemini? if not ok go" against the text concludes "re-ask".
- [ ] `/create-spec` contains the account-figures line in guidance and in the self-review gates.
- [ ] P970 entry carries a superseded-by-P1335 note; `push.md:172` and mirror no longer name the
      retired token.
- [ ] Existing workflows still pass through the new gates: `./scripts/pre-commit-checks.sh` on a
      normal docs commit, and the existing push-docs test scripts.

## Alternatives Considered

- **Key-prefix pattern in `audit-privacy.sh`:** rejected. It would not have caught this
  incident (only a 4-character prefix and a length), and bare prefixes appear legitimately in
  11 tracked files.
- **Narrow figure regex (also requiring account/org/our/we):** rejected. 1 hit repo-wide, but it
  missed the actual P1522 spec text.
- **Blocking figure check:** rejected. Too many false positives against public prices.
- **Switching `/push` to Opus:** rejected as the fix. The leak was written under Opus and the
  push decision under Sonnet; the gap is the missing mechanism, not the model.

## Rollback Strategy

Each change is an independent commit; `git revert` per change.

## Related

- P1522 (the incident spec), P1335 (current token scope), P970 (superseded scope), P919 (server-side privacy boundary)
