---
status: week
type: task
rank: 94
workstream: infrastructure
created_date: '2026-11-05'
tags: [privacy, push, performance, scanner]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1617: Privacy scan cost grows faster than the patch, so a big push takes hours

## Problem

> Founder framing, verbatim (from the task brief the founder pasted, which another model drafted): *"Today a 93-commit stack (about 120k patch lines) took about a day to land."*

**Situation:** `scripts/audit-privacy.sh` is the scanner behind the local hooks and the required `audit-privacy` check. Its allowlist filter (lines 104-144) appends each kept line to one shell string, which recopies everything kept so far.

**Complication:** A 93-commit stack (120,525 patch lines) took about a day to land on 2026-11-04 and 2026-11-05. The scan ran four times for that one stack: local hook on the staging ref (about 80 min), CI on staging (65 to 69 min), local hook on the main ref (55 to 90 min), and CI again on the main push (68 min). An unrelated hold-up cost a whole cycle, because no scan result can be reused.

Measured 2026-11-05 on real ranges with the unchanged scanner. Load varied, so read these as shape, not benchmarks:

| Patch lines | Filter loop | Everything else in the scan | Machine load |
|---|---|---|---|
| 5,313 | 6.8 s | 3.3 s | 3.9 |
| 10,870 | 40.9 s | 8.0 s | 11.8 |
| 21,771 | 171.0 s | 7.6 s | 22.4 |
| 45,179 | 539.9 s | 12.5 s | 4.0 |

**Question:** Can the scan stop growing faster than the patch without changing any verdict, on the check that protects a public repo?

## Appetite

Blast radius: high. This is the privacy boundary for every commit and push, and a wrong filter fails silently by passing. Reversibility: high for the code (`git revert`), none for anything published while a broken scanner was trusted. Decision density: low, with one landing question below.

## Invariants

- **Same verdict, same bytes.** For any input the filter accepts, its output must be byte-identical to the current filter's, including where a reader might think the current behaviour is wrong. Changing what the scanner catches is separate work.
- **The filter fails closed on both sides.** If it does not read all of its input, or does not finish, the scanner exits non-zero with its own code (3). An empty result must never read as "nothing to scan". The script runs without `set -e` (line 9), so this will not happen by default. This covers the filter only: failures earlier in the script are tracked separately.
- **Exit codes stay distinct.** 0 clean, 1 hits, 2 bad input, 3 filter failure. The script header documents all four.
- **The scan stays ahead of the push waiver.** Push-enable cannot bypass privacy ([decisions.md](../docs/decisions.md) 2026-04-18).
- **CI keeps running `origin/main`'s scanner, never the pushed copy** (`.github/workflows/privacy-scan.yml`, design notes and line 76; P919).

## Solution

Keep the existing state machine as it is and change only where kept lines are stored. Each kept line goes into a bash array by explicit index, the array is joined once with newline as the separator, and a final newline is added only when the array is not empty.

This keeps the header rule, the allowlist matching and all later checks untouched. Nothing downstream of `ADDED` changes. There is no new subshell, capture or sentinel, so a fatal error or kill inside the loop ends the scan instead of leaving a partial result. The scan's exit status in that case is checked in Done-When.

The loop counts the lines it reads and compares the count with the input's line count. A mismatch exits 3. A reader that sees early end-of-input otherwise ends normally and reports nothing.

Use the indexed form (`KEPT[N]=...`), never `KEPT+=(...)`, which stays superlinear on macOS `/bin/bash` 3.2.

Measured 2026-11-05 on the full range and on four copies of it. All variants produced the same output hash:

| Filter design | 120,525 lines | 482,100 lines |
|---|---|---|
| Indexed array (chosen) | 6.5 s | 25.8 s |
| Function plus sentinel | 6.7 s | 28.9 s |
| `KEPT+=(...)` | 13.9 s | 146.5 s |

Recommend the indexed array over the function-and-sentinel design because of runtime complexity: it has one process and one failure state fewer, at equal speed. Recommend it over awk because of correctness: it keeps the current matching code and adds no awk dialect or locale behaviour. An awk translation differs on these inputs (verified 2026-11-05):

- **Allowlist with no final newline:** the current `read` loop ignores the unterminated last entry, while awk `getline` honours it. That would widen an exemption.
- **NUL bytes:** BSD awk truncates a line at a NUL, losing the text after it. Bash removes the NUL and keeps the rest.

**Measured whole-scan result:** a single-pass filter on the full 93-commit range finished the whole scan in 36.5 s with exit 0 (load about 10), down from 65 to 90 min. A reviewer measured 38 s with an array prototype.

**Exit-code consumers:** the pre-push hook and CI treat every non-zero exit as a block, so 3 blocks the same way. Their messages may call it a privacy hit, which is accepted below.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Filter dies mid-run and a partial result passes the scan | MITIGATE | No capture to go empty; line count catches early end-of-input; both simulated in Done-When |
| Fixtures exercise only macOS | MITIGATE | Byte fixtures join `scripts/test-audit-privacy.sh`. CI's parity step runs the pushed copy on Linux inside the required `audit-privacy` job, so a failure there stops the promote |
| Real test ranges never reach the allowlist branch, so they prove nothing about it | MITIGATE | Done-When compares kept lines against a comment-only allowlist. Net counts of kept against plus-lines can hide drops, because real headers count as plus-lines |
| The new test compares the new code with itself | MITIGATE | Expected bytes are generated once from the filter at `7df461be2` and committed |
| CI on the staging ref still uses the old scanner | ACCEPT | Inherent to the trust boundary. The main-push run fetches `origin/main` after the landing, so it already uses the new scanner |
| The fix cannot land strictly alone while local `main` has unpushed commits | ACCEPT | About 28k patch lines were pending on 2026-11-05, roughly 3 to 5 min per scan on the old scanner |
| The pre-commit override proceeds on any non-zero exit, including 3 | ACCEPT | It already proceeds on hits; a human sets it deliberately |
| Hook messages describe exit 3 as personal identifiers | ACCEPT | Still a block. Rewording means editing the hook, a non-goal here |
| Another phase becomes the slow one at larger sizes | ACCEPT | Everything else took about 35 s at full stack size; re-measure if it grows |

**Non-Goals**
- Do NOT change what counts as a file header, an allowlist match or a detector pattern.
- Do NOT edit `.privacy-allowlist`, `.privacy-email-allowlist`, `privacy-scan.yml` or `pre-push-checks.sh`.
- Do NOT add scan reuse, promote-only recovery, flag handling or stack caps. Each is filed separately in the task inbox.
- Do NOT use the old scanner on a full big range as the test oracle.
- Do NOT add an environment switch to the scanner for tests. Tests exercise the shipped code.

## Done-When

- [ ] The founder reproduces the speed-up on real ranges: the commands and old and new timings are recorded, and the full `7da630ec5..7df461be2` scan finishes in under 5 minutes on the founder's machine with exit 0.
- [ ] Growth is linear: filter time at four times the full range is under about 5 times its time at one, measured on the same machine.
- [ ] Old and new filter output is byte-identical, compared as raw bytes before any shell capture, on the fixtures and on at least three real ranges of about 5k to 20k patch lines.
- [ ] At least one of those ranges really drops allowlisted lines, shown by keeping fewer lines than the same range under a comment-only allowlist.
- [ ] Old and new whole-scanner stdout, stderr and exit code match on those ranges, plus on a copy with a planted hit in a non-allowlisted file, so the comparison includes a blocking verdict. Stdout is capped at 20 lines, so this complements the byte comparison and does not replace it.
- [ ] Fixtures cover: CR removal, line order, exact-path and directory-prefix matching, `.sh.bak` not matching, `#` comments and blank lines in the allowlist, an allowlist with no final newline, an absent and an empty allowlist, non-UTF-8 bytes under both C and UTF-8 locales, a NUL past the first 8,000 bytes of a new file (an earlier NUL renders as a binary diff and tests nothing), numeric-looking and space-bearing paths, backslashes, percent signs and glob characters in lines and paths, deleted files, every line allowlisted, and an empty range.
- [ ] Expected bytes come from the filter at `7df461be2`, are committed, and are checked by `scripts/test-audit-privacy.sh` against the filter code in the shipped script.
- [ ] `--staged` gives the same results as before. `--msg` skips the filter, so it is regression-tested only.
- [ ] `scripts/test-audit-privacy.sh` and `scripts/test-p1526-privacy-push-gates.sh` pass.
- [ ] Known-bad controls fail with exit 1 exactly: the P919 canary string in an ordinary file, and the existing "content injection attack blocked" case. The existing helpers accept any non-zero exit, so these assert the code itself.
- [ ] Filter failure fails closed with the status shown (epistemic gate 7): killing the loop mid-run, and killing the writer feeding it, each give a non-zero exit on a fixture whose canary sits after the kill point. A scan that stops on these fixtures must not exit 0.
- [ ] Documented workflows pass through it (epistemic gate 7c): one real pre-commit run, and one real pre-push hook run on a staging-shaped ref with no publishing.
- [ ] All of the above pass locally on macOS. `[post-deploy]` CI's parity step passes on Linux on the staging ref during landing, and a later big push's CI scan time confirms the speed-up.

## Alternatives Considered

- **Shell function with a sentinel, captured once:** equal speed and identical output, but adds a subshell and a failure state, and a kept line ending in the sentinel text can pass on a dead filter unless the status is also checked. Rejected on runtime complexity.
- **awk or another single-pass rewrite:** fastest measured, but it re-implements matching and adds the differences listed above. Rejected on correctness.
- **Keep the loop and use `+=` on the string:** a reviewer measured 29 s at 120k and about 500 s at 480k. Rejected, still superlinear.
- **Python filter:** adds a runtime dependency to a required check. Rejected.
- **Slice big stacks into smaller pushes:** `quality-ratchet` fails on intermediate prefixes (cuts at commits 11, 26, 49 and 66 fail; about 88 to 90 pass). Rejected.
- **`push-docs --resume` to reuse a green scan:** it deletes staging and rescans (`scripts/git-ops.sh:6395`, `:6440-6460`). Not a reuse path today.

## Rollback Strategy

`git revert` of the single commit, landed like any other change. CI picks up the restored scanner from `main` on the next push. If the new filter is found wrong after landing, also re-scan every range that landed while it was trusted, using the restored scanner.

## Open Questions

1. [FOUNDER DECISION: landing order. Land this on top of the commits already pending on local `main` (recommended, since they need pushing anyway and that scan takes minutes), or cherry-pick it to land first?]
2. Is one real range with a real blocking hit needed, or does a planted one suffice? Planted is assumed, so that private text stays out of test output.

## Related

Scanner history: P919 (server-side check and canary), P936 (third-party email), P1260 (publish-then-scan, ref class), P1438 (known names), P1526 (push gates). Promoted from the 2026-11-04 big-push review. Detection coverage was measured separately and stays out of scope here ([decisions.md](../docs/decisions.md) 2026-09-07).
