# P1210 Verification Contract — adversarial review, 2026-09-03

**VERDICT: REJECT** — the contract, not the design. §§1–11 were not reopened and are unchanged.

Single independent reviewer (Opus), no fan-out. **Reports: 1 of 1.** Codex was attempted first and
returned `ERROR: You've hit your usage limit` — a failed run, not a clean review, and not counted.
The reviewer's fix list truncated at item 1 across three retrieval attempts; the ordering below is
this session's, derived from the findings.

**Deliberately NOT named `review-round-N.md`** — that filename is what `goal-gate.sh` CHECK 5 globs,
and a round with no `SCREENSHOT:` lines hard-fails as *"an empty round is not a round."*

## Findings, with what was independently re-measured

| # | Sev | Finding | Re-verified by command? |
|---|---|---|---|
| 1 | CRITICAL | 8 of 16 MECHANICAL rows demand a verdict on **future agent behaviour** (DW-6,7,8,9,15,16, the blocker half of 12+13+18, and 20). The pipeline is six `.md` files with zero executables — a test asserts prose *contains* a rule, never that an agent *obeys* it | YES — `ls` of the skill dir: 6 files, no executables |
| 2 | CRITICAL | DW-3 is unsatisfiable by the spec's own reasoning. Spec:287-288 says *"exact-string identity does not test this — two paraphrases pass — so the check is a judgment with a fixture"*, while the row demands a deterministic FAIL on a reworded proposition | YES — grep of both sites |
| 7 | CRITICAL | Contract fact #1 is wrong. Whole-file rows close the `-t` spelling only; `it.skip`/`it.todo` reach the same all-skipped state. **All 16 rows can be green with zero assertions executed** | YES — probe file, all-skipped, **exit 0** |
| 8 | CRITICAL | DW-4+5: the loop authors the fixture, the checker AND the expected numbers. The row's own hedge licenses rewriting the expectation to whatever its fixture yields. The canonical-pair tie-break defines no ordering over inference-strength labels, so the loop invents the oracle twice | Partial — hedge text confirmed by grep |
| 3 | MAJOR | DW-2, DW-4+5, DW-17 **are** mechanizable, but only via a checker module the spec never commissions. "Checker" in that sense appears once in 693 lines — in a sentence written into the contract itself | YES — grep count |
| 4 | MAJOR | DW-1 forbids the only thing its test can do: it demands *"not by confirming the prose was copied"*, and a test over static markdown can do nothing else | YES — grep |
| 5 | MAJOR | Condition 7 stale in two sites after RD-4 decided it, while the event doc already said it was evaluable | YES — **FIXED in this commit** |
| 6 | MAJOR | DW-19 "is implemented" is undefined for a prose spec — no artifact, location or observable | No |
| 9 | MAJOR | DW-11 was **already green before the loop started** — all three event-doc properties committed in `0f1fdf7c`/`694f9e97` | YES — 3 greps, 1 hit each |
| 10 | MAJOR | *"Every MECHANICAL row carries paired controls; the Done-When lines already name the must-fail fixture for each"* is **false for ~9.5 of 20 lines** | YES — per-line scan corroborates |
| 11 | MAJOR | DW-12 is an all-empty probe: exactly one occurrence (`positions.md:89`). Deleting that line makes it permanently green, and it misses `find`, `$HOME`, any other spelling. No known-bad control | YES — grep, 1 hit |
| 13 | MAJOR | The pin is **not on `origin/main`** — CHECK 7 survives only on the local `main:` fallback, so the merge-boundary guarantee the gate advertises is not in force | YES — `git show origin/main:…` fails |
| 14 | MAJOR | DW-12+13+18 is ci-tier but depends on `~/.local/share/agent-store/index.db` and four home stores. CHECK 2's tier heuristic routes only `playwright`/`e2e/` to local | YES — db exists locally; heuristic read |
| 15 | MAJOR | **The committed fixture is a PII trap.** "Same three contradiction sentences" verbatim names four real people; the fixture must also carry the position values the pairing rule reads. Anonymizing the roster to A1–A5 does not help when the sentences reconnect the names — the exact invariant at §Invariants, and the reason P1208 was redacted hours earlier | YES — grep of the sentences |
| 12 | MINOR | CHECK 4 is pure self-report; no UAT row links to a contract row, a command or an exit code | No |
| — | MINOR | A-4 miscounted its own table (3 multi-line rows, not 4; total reached 20 by coincidence) | YES — **FIXED in this commit** |

**Sound on Q2 and on the hashing mechanics.** All 20 Done-When lines are covered exactly once, no
line uncovered, no double-claim — verified independently here by extracting every `DW-n` from the
row set. No cell contains a `|`; the section carries no `../` links; the contract is the file's last
section, so appending headed sections leaves the digest intact (un-headed prose at EOF would not).

## Repair order

1. ~~Decide the fork.~~ **DONE 2026-09-03 — founder chose CODE (RD-5).** The spec now carries §12,
   commissioning a `scripts/points/` module in `.mjs` that the six skill files invoke and vitest
   imports — one implementation, two callers. Steps 2–8 are executed against §12, not invented.

**How the repair is actually run: `/goalify p1210` again.** §12 changes the Phase 0 triage input, so
re-running the skill re-classifies every line against a spec where most predicates are now real
functions, emits a corrected contract, and re-pins. This is not a manual edit of the rejected table —
that table was authored under the assumption the checks were prose, and every row rests on it.
2. Rewrite the 8 behavioural rows to what a test can decide, and say so in the row text.
3. Delete the false paired-controls sentence; add a must-fail fixture to every line lacking one.
4. Add a 17th MECHANICAL row scanning the test files for `.skip`/`.todo`/`.only`.
5. Respecify the fixture by named fields and transforms — never "same as the original except X".
6. Commission a deterministic redaction script so the fixture is derived, not authored.
7. Give DW-12 a known-bad line and widen the pattern beyond `ls`.
8. Strike DW-11 or relabel it a regression guard, as DW-14 honestly is.
9. Re-pin, and push so `origin/main` carries the digest CI reads.
