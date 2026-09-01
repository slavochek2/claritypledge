---
status: qa
type: task
rank: 1000056
workstream: infrastructure
created_date: '2026-09-01'
tags: [day, skills, process, monitoring]
delivery_stage: dev
pipeline_ran: [create-spec, dev, finish]
drafted_by: sonnet
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1205: `/day`'s sub-day dispatch has no mechanical continuity check, and `day.md` has a live step-ordering bug

## Problem

**Situation:** `/day` (`~/.claude/commands/day.md`, personal, outside this repo) dispatches to a
per-project sub-day skill — for cp, `.claude/commands/slava/maintain/day-cp.md` — and is supposed
to resume its own remaining steps (personal health checks, Agent VM check, the CM Events calendar
refresh, personal triage, save-to-memory, writing the completion marker) once the sub-day returns.

**Complication:** On 2026-09-01, an agent ran `day-cp.md` in full, produced a polished-looking
final `/day` summary (health, reflection, goals, branches), and never touched any dispatcher step
after the sub-day dispatch — the calendar refresh (marked *unconditional, always invoked*) silently
did not run. The only evidence was the completion marker showing the previous day's timestamp,
found only because the founder asked directly why the calendar hadn't refreshed and noted this had
happened before ("*i asked for that before it didn't work?*"). A same-session prose-only fix was
applied, then found by adversarial review to have real defects of its own: it told the sub-day file
(`day-cp.md`) to read the completion marker directly, contradicting that same file's own contract
table, which forbids reading any home-directory state from a file that lives in this public repo.
The prose fix has been reverted to a plain note (no marker read) pending this spec.

**Separately, while investigating this:** `day.md` has two different sections both numbered
`### 8.` — "CM Events Calendar Refresh" and "Due Board." Step 1 (which dispatches the sub-day)
consumes `$DUE_VERDICT`, computed by the *later* "Step 8" (Due Board) — meaning a top-to-bottom
read invokes the sub-day before the block that produces its input has run. `day-cp.md` already
handles an empty verdict by printing nothing, so this is a silent failure, not an error: a normal
run can produce an empty-looking Due Board indistinguishable from "nothing was due."

**Question:** What mechanism actually closes this gap, given that a prose reminder has now failed
twice for the same underlying reason (2026-08-28, and again this session), and given that a
2026-08-13 decision (see Related below) already planned — but never built — a broader `/day`
status-verification mechanism for exactly this failure class?

> Founder framing, verbatim: *"can you fix so next time it runs for sure? i asked for that before it didn't work?"*

## Appetite

**Blast radius:** medium — affects the founder's own daily-cadence tooling (personal `day.md`,
outside this repo, plus the cp-scoped `day-cp.md` inside it), not product code or users.
**Reversibility:** high — both files are prose/skill instructions plus one small script addition;
easy to revert.
**Decision density:** a few — primarily the receipt-fabricability design (see Invariants) and
whether to extend `day-gates.sh` now versus deferring per the P1031 tension named below.

## Related — read before designing

**`docs/decisions.md` 2026-08-13 [process]: "`/day` is the third instance of 'reports success it
did not achieve'..."** — Phase 1 of a 3-phase plan (a verifier script, `day-gates.sh`, following
the `ship-gates.sh` pattern) was implemented and is live today (`--mode=start`, `--mode=verify`,
both used successfully this session). **Phase 2 — "the remaining status surface (three mechanisms:
artifact gates, receipt files for MCP checks a script cannot make, skill relays)" — was planned but
never built.** This spec is effectively resuming Phase 2, scoped to the specific failure mode found
this session (sub-day non-return), not attempting the full original Phase 2 scope.

That entry names a constraint this spec inherits directly: **"a known weakness — an agent-written
receipt is a checkbox it ticks, so Phase 2's receipts need a non-fabricable field derived from the
response, to be resolved before building."** Any mechanism this spec builds must satisfy that
before implementation, not after.

It also names a tension this spec must address explicitly, not silently ignore: **"this sits
partly against `.claude/rules/skills.md` 'Recurring Checks Do Not Belong Inside Skills' (P1031) —
the detection half is a knowingly-accepted stopgap on credential grounds (keychain-bound token,
local-only APIs that CI cannot reach), with a local scheduled job as the named end state."** The
sub-day-return check has no keychain/credential dependency (it only reads a local marker file), so
this spec should evaluate whether that stopgap justification actually extends to it, or whether a
cron-based check is viable here even though it wasn't for the calendar half.

**Duplicate gate:** `DUPLICATE|RELATED|NONE` — **RELATED**, not duplicate. Searched:
"dispatcher continuity", "sub-day return", "day-gates subday". `docs/decisions.md` 2026-09-01
[process] entry (same day, this session) records the incident and the reverted prose fix; this
spec is the follow-on implementation work that entry's Consequences field points to.
**Rulings (job 2):** found 2 — both the 2026-08-13 entry above (Phase 2 unbuilt + the
non-fabricable-receipt constraint) and the P1031 skills-rule tension it names. No prior ruling
found on the `day.md` duplicate-Step-8 ordering bug (C below) — searched "Due Board", "Step 8".

## Solution

**Part B — sub-day-return check.** Extend `~/.claude/scripts/day-gates.sh` with a new mode (e.g.
`--mode=subday-return`) that reads the dispatcher's completion marker directly and reports whether
its content changed since the value captured at the start of the current `/day` run — the same
non-fabricable-comparison shape `--mode=verify` already uses for the calendar receipt (compare a
stamp against a captured baseline, not against "today"). This keeps the marker-reading entirely in
the dispatcher's own script, so `day-cp.md` never needs to touch home-directory state and the
contract-table contradiction found this session cannot recur. Call it from `day.md` at the point
the sub-day returns, and print its loud line the same way the calendar check's lines are already
printed and relayed verbatim (`day.md`'s existing rule: never summarize a gate's output, relay it).
**Exercise its failure path before trusting it** (this repo's own epistemic gate 7) — simulate a
run where the dispatcher's back half genuinely doesn't execute and confirm the mode reports it,
before relying on it in a live `/day` run.

**Part C — fix `day.md`'s step ordering.** Dedupe the two `### 8.` headers (renumber one — "Due
Board" is the better candidate to move, since nothing but Step 1 depends on it) and move the Due
Board block to run before Step 1, so `$DUE_VERDICT` is always populated by the time the sub-day
dispatch needs it. Update the one cross-reference (`Step 1: "Pass ... $DUE_VERDICT (Step 8)"`) to
point at the corrected step number.

**Scope discipline:** do not attempt the full original Phase 2 scope from the 2026-08-13 plan
(artifact gates and skill relays for other `/day` sections) — only the sub-day-return check (B)
and the ordering bug (C) found this session. Read the 2026-08-13 entry's "Consequences" field for
what remains out of scope.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| New `day-gates.sh` mode has an untested failure path and reports clean when it isn't | MITIGATE | Simulate the failure per epistemic gate 7 before trusting it in a live run |
| Extending a skill-adjacent script for a "recurring check" cuts against P1031 (`.claude/rules/skills.md`) | DEFER | Unblocks on the founder's call (Open Question 1): does the 2026-08-13 credential-based stopgap justification extend to this check, or should it be a cron job instead |
| Reordering `day.md`'s steps breaks a cross-reference this spec didn't find | MITIGATE | Grep every `Step 8` / `Step N` reference in the file after renumbering, not just the one cited above |
| Three redundant guards for one failure (prose in `day-cp.md`, prose in `day.md`, plus the new script check) | MITIGATE | The lean-critic review this session recommended the script supersede the prose, not stack on it — trim the prose reminders to a one-line pointer once the script mode exists and is verified working |

**Non-Goals**
- Do NOT attempt the full 2026-08-13 Phase 2 scope (artifact gates or skill relays for sections
  other than the sub-day dispatch return).
- Do NOT touch the calendar-refresh check itself (`--mode=start`/`--mode=verify`) — it already
  works and is out of scope here.
- Do NOT re-litigate whether `day-cp.md` may read home-directory state — the contract (no) is
  settled; this spec's job is to make the check work without needing an exception to it.

## Done-When

- [x] `day-gates.sh` has a new mode that detects a non-executed dispatcher back half, verified by
      simulating the actual failure (not just a happy-path run) and confirming a non-zero/loud
      signal
      — three modes added: `--mode=subday-return` (Step 1), `--mode=finish` (Step 11), and D6
      grading inside `--mode=start` (Step 0d). Failure paths simulated in `day-gates.test.sh`
      section 12: `next start catches a pass that never finished: exit 1`, `a forged marker does
      not buy a clean grade: exit 1`, `finish fails when the receipt never moved: exit 1`,
      `subday-return names a skipped Step 0d: exit 1`, `an unwritable snapshot fails the pass:
      exit 1`. Suite: **119 passed, 0 failed, exit 0** (70/0 before this change).
- [x] `day.md` calls the new mode at the sub-day return point and relays its output verbatim,
      matching the existing rule for the calendar gate's output
      — Step 1, immediately after the sub-day returns; verdicts print under their own
      `── DISPATCHER VERDICT ──` header so they can never be read as the calendar's.
- [x] `day-cp.md`'s prose reminder is trimmed to a one-line pointer at the script check
      — 23 lines of incident narrative replaced by a short pointer naming all three script calls.
      Still reads no home-directory state, so the contract table stands.
- [x] `day.md`'s duplicate `### 8.` headers are deduped and the Due Board block runs before Step 1
      — Due Board moved to `### 0f`; exactly one `### 8.` remains. A stray duplicated
      ```` ```bash ```` fence and a doubled `---` seam were repaired in transit.
- [x] Every `Step 8` / `Step N` cross-reference in `day.md` re-checked after renumbering
      — all 37 enumerated with `grep -n -o`; every `Step 8` means CM Events. The one reference to
      the old Due Board now reads `(Step 0f)`. `day-cp.md`'s references checked too.
- [x] A live `/day` run (or a faithful simulation) confirms `$DUE_VERDICT` is populated when Step 1
      needs it — the 0f block executed read-only in its new position:
      `DUE_VERDICT populated? [PP-WEEKLY: never run]`, non-empty before Step 1 consumes it.
- [x] The P1031 tension (Risk row 2) is explicitly resolved one way or the other
      — resolved: P1031 does not reach a run-scoped gate. See Open Question 1.
- [x] **The fabricability constraint the Appetite cross-referenced is resolved** (added after
      adversarial review — the spec pointed at an "Invariants" section that was never written, and
      the first implementation shipped past it). Completion is graded on the calendar **push
      receipt**, written by `pipeline.py` and already cross-examined by D2/D3 — not on the
      completion marker, which is one agent-written `date` command. Proven both ways: before the
      fix a forged marker returned `previous pass completed`, exit 0; after, the same forgery
      returns `PREVIOUS PASS INCOMPLETE`, exit 1.

## Adversarial review — findings and disposition

One reviewer, 1 of 1 reported, all seven attack areas covered, 20 scenarios plus the suite.

| # | Finding | Disposition |
|---|---|---|
| H1 | Blind to a pass that skips Step 0d as well | **Not fixable in-band** — a gate only runs if the agent runs it. Mitigated by a NOTE when the newest snapshot is over 36h old; the real fix is filed as **P1206**. |
| H2 | Marker is agent-written, so one `date` command launders a skipped back half | **Fixed** — completion graded on the push receipt. |
| H3 | False positive on the abandon path `day.md` itself mandates (unanswered Step 0e prompt) | **Fixed** — verdict no longer assumes a report existed; 2h in-flight grace added. |
| H4 | FAIL line asserted "every dispatcher step was skipped", which the marker cannot evidence | **Fixed** — claim bounded to what the artifact shows. |
| M1 | `DISPATCH_VERDICT` bypassed `_safe_echo`; file content could smuggle `<`/`>`/`|` into a relayed report | **Fixed** at source (sanitized on read). |
| M2 | `_safe_echo`'s exit 3 aborted the run over marker *content*, printing a calendar verdict having checked nothing | **Fixed** by the same change. |
| M3 | Two concurrent `/day` passes graded each other as failures | **Fixed** — `pass_id` plus a 2h in-flight window. |
| M4 | A skipped Step 0d was diagnosed as two things that did not happen | **Fixed** — named directly via a snapshot-staleness branch. |
| L1 | Header claimed the script writes only the seen-stamp | **Fixed.** |
| L2 | A directory-shaped state file left one temp file per run | **Fixed**, with a regression test. |
| L3 | Doubled `---` at the Due Board's new seam | **Fixed.** |
| L4 | `[D0]` missing-beeper-dir prints `CALENDAR: STALE` in start mode | **Out of scope** — pre-existing, not introduced by P1205. |

## Open Questions

1. **RESOLVED — no founder call needed; P1031 does not reach this check.**
   `.claude/rules/skills.md` rejects *scheduled, recurring detection* inside a skill because
   detection latency then becomes "whenever the founder opens a session" — the failure it was
   written to fix. That has no purchase here: the thing under test **is** the session. This is a
   run-scoped gate keyed to one `/day` pass, structurally the same as `ship-gates.sh`, not a health
   probe on a clock. A cron job cannot know a `/day` pass started, which one stopped, or what its
   baseline was. No exception is being taken, so the 2026-08-13 credential-based stopgap
   justification is not needed either. Recorded in `day-gates.sh`'s header so it is not
   re-litigated.
   **Note the boundary:** P1031 *does* reach P1206, which needs a check that fires whether or not a
   `/day` pass happened. That is scheduled detection, and it belongs outside a skill.

## References

- `features/p1206_*` — the residual hole this spec could not close (H1), with the two
  candidate mechanisms and the reason each is or is not safe to build first.

- `docs/decisions.md` 2026-09-01 [process]: "`/day`'s sub-day dispatch had no mechanical check
  forcing a return to the dispatcher..."
- `docs/decisions.md` 2026-08-13 [process]: "`/day` is the third instance of 'reports success it
  did not achieve'..." (the Phase 1/2/3 plan, Phase 1 live, Phase 2 unbuilt)
- `~/.claude/commands/day.md`, `~/.claude/scripts/day-gates.sh` (both outside this repo)
- `.claude/commands/slava/maintain/day-cp.md`
- `.claude/rules/skills.md` "Recurring Checks Do Not Belong Inside Skills" (P1031)
- `.claude/rules/epistemic.md` gate 7 ("Exercise a gate's failure path before trusting it")
