# P1210 — loop instrument

**Two numbers, never one.** Quality bought with runaway spend reads as success on a one-axis
scoreboard, and CLAUDE.md ranks cost as dimension (5). Written at the moment corrections are given,
never reconstructed at the end.

corrections given: 0
turns consumed: 14

**Both numbers, read together.** Zero corrections is not a quality claim — the loop ran unattended
and the founder was not asked anything, so there was nothing to correct. 14 turns against a 50-turn
budget (RD-10) for seven predicate modules plus six harness modules, 19 test files, 20 fixture
files, a derivation script and six skill-file edits.

## Ledger

| # | Turn | Correction given | By whom |
|---|---|---|---|
| — | — | *(none — the loop ran unattended; no founder turn was consumed)* | — |

## Self-caught, not founder-caught

Recorded because a zero in the corrections column would otherwise read as "nothing went wrong":

| # | What went wrong | How it surfaced |
|---|---|---|
| S-1 | All five `rule-present` must-fail fixtures came back RESOLVE — the generated header named the deleted rule, so the predicate matched its own strip note. Every control was blind while every run looked green | Running the controls and expecting REJECT. Nothing in the code reads wrong; only the expectation caught it |
| S-2 | Two rules shared one line in `prepare.md`, so deleting one from the fixture deleted both | An explicit collision scan across every rule set before regenerating the fixtures |
| S-3 | The DW-1 table's first draft named four stage-output tokens (`phase_0_note`, `loss_currency`, `room_key`, `arbiter_tag`) that occur **zero** times in any pipeline file | Grepping each token before writing the test, rather than after |
| S-4 | An explanatory sentence in `publish.md` — "Those ask for a *decision*, not for a *value*" — tripped the input-ask scanner it was describing | The scanner, on the real tree. Rephrased rather than marked exempt: a `must-stay-gate` marker on prose would have been a false exemption |
