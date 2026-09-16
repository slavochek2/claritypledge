---
status: week
type: task
rank: 106
workstream: infrastructure
created_date: '2026-09-16'
tags: [day, gates, hooks, reliability]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1324: `/day` completeness is not machine-checkable, and its findings leave as prose

## Problem

**Situation:** `/day` is ~2,000 lines of prose across two files (`~/.claude/commands/day.md`
dispatcher, `.claude/commands/slava/maintain/day-cp.md` sub-day) instructing an agent to run
~21 checks. Three deterministic gates exist — D1 (calendar push receipt), D6 (dispatcher
continuity, P1205), D7 + the Stop hook (dropped pass, P1206) — and all of them grade the pass
as **one lump**.

**Complication:** Measured across all 13 real `/day` runs since the 2026-08-28 split, by
matching tool-call inputs in the session transcripts rather than trusting each run's own
report: **1 run of 13 executed all 21 steps.** Median 18/21. Coverage is predicted by
*position in the file*, not by importance:

| Segment | Steps | Coverage |
|---|---|---|
| Before the sub-day returns | `0a` whisper, `0d` gate:start, `0e` gcloud, `0f` due board, `1` dispatch, cp waves 1/2/3 | 11–13 of 13 |
| After the sub-day returns | `1b` gate:subday-return | **4 of 13** |
| | `11` gate:finish | **7 of 13** |
| | cp Wave 2b Mixpanel | 7 of 13 |
| | cp Wave 3 privilege-floor | 8 of 13 |
| | `8b` gate:verify, `2a` gcp-credits | 9 of 13 |
| | `2a` ai-keys, `3` agent-vm-health, cp Wave 2 Sentry | 10 of 13 |

**The three gate calls are the three most-skipped steps in the file.** The mechanism that
exists to catch skipping is the first thing dropped, and by construction it cannot report
its own absence within the pass.

Founder framing, verbatim:

> "slash day command is not running deterministically everything that it should … right now,
> for example, it's running only compressed and doesn't do all of it, but it should do all of
> it, right? So we should prevent it making decisions and skipping things."

And on the second half:

> "if you look in the chat history, you will find that often I would start to talk to slash
> day session and it's weird. I think it's always the same thing."

The 2026-09-16 run stated the compression out loud — *"I'm compressing to the highest-signal
checks given effort constraints"* — and listed 11 unrun checks. That run was on Sonnet 5, but
Sonnet only made it legible: the same cliff is present in the Opus runs.

**Second, independent defect in the same pass.** `grep -i "create-bug\|INBOX\|file a bug"`
returns **zero hits in both `/day` files**. A finding has no exit path. The same 2026-09-16 run
surfaced four anonymous-executable prod functions not on the allowlist, wrote them into chat
prose, and there the finding ended. So every `/day` finding has exactly two fates: fixed inline
right now — which is what turns `/day` into an unbounded working session — or lost.

**Question:** what makes "a complete `/day`" a fact a machine can check, and what makes a
finding leave the session as tracked work rather than as prose?

## Appetite

**Blast radius: high.** A Stop hook runs on every turn of every session in every repo. The
ledger governs the founder's only daily driver.
**Reversibility: high** for the scripts and manifest (git revert); **medium** for the hook —
unregistering it is one edit to `settings.json`, which is the documented escape and the
precedent (2026-08-19).
**Decision density: zero remaining.** Both calls were made in the filing conversation and are
recorded under Alternatives Considered.

## Related — read before designing

- **[P1205](done/2026-06-10/p1205_day_dispatcher_continuity_check_and_step_ordering_fix.md)** — D6,
  the dispatcher-continuity gate. Grades a pass on the push receipt. Extended here, never
  revisited.
- **[P1206](done/p1206_day_needs_a_forcing_mechanism_outside_the_agents_control.md)** — the Stop
  hook. Its own Open Question 4 names this spec's gap in advance: *"the observed agent dropped 8
  of 11 steps, so dropping the 9th is a difference of degree."* P1206 deliberately scoped itself
  to the whole-pass shape; this is the step-level successor.
- **[P1317](done/2026-06-10/p1317_board_renders_deferred_work_inbox.md)** — the task inbox CLI (`scripts/inbox.sh`),
  shipped 2026-09-15. The rail findings will leave on. Already exists; do not build a second one.

## Invariants

Every entry below is an existing recorded ruling, not a new constraint. Removing one requires
explicit founder approval.

- **A hook with N checks computes all N every run and reports them together — it never branches
  to the first check that fires, and a retry budget suppresses only its own check, never the
  whole hook.** (decisions.md 2026-08-19: a second check added above an existing one consumed
  the block the safety check needed, and an exhausted budget disabled the safety gate for the
  rest of the session.)
- **`stop_hook_active` is true on every Stop after the first block in a continuation chain.**
  Any retry counter must be bumped **before** deciding, and must return *the limit* — not 0 — on
  an IO failure, or an unwritable counter directory makes the gate block forever.
  (decisions.md 2026-08-19, both directions of that bug.)
- **Every block must name its own escape in the block text.** The 2026-08-19 blocking hook was
  unregistered the same day for three reasons: it blocked a documented recovery, it named no
  escape, and it was bypassable. The first two are defects; the third is a property to state
  plainly, not to deny.
- **Hooks fail open on a missing script, and a local settings flag disables all of them
  untraceably.** Liveness is therefore reported from a *different* mechanism on a *different*
  trigger — the D7 pattern, where D6 and the hook watch each other because a stopped checker
  cannot report that it stopped.
- **`day-cp.md` may not read or write any home-directory state**, including the ledger. It is a
  public-repo file and its own contract table forbids it. The sub-day records steps only through
  a path the dispatcher hands it.
- **The completion marker's write stays ungated.** Step 10 settled this: gating it pins `$SINCE`
  and truncates every other section's reflection window to 6am today.
- **A run-keyed check is not a scheduled check.** P1031 ("Recurring Checks Do Not Belong Inside
  Skills") does not reach this work: the thing under test *is* the session.
- **Tests must be hermetic.** Hardening the P1206 suite exposed 15 of 119 cases that had silently
  become machine-dependent, passing or failing on whether the hook happened to be installed. Every
  new case stubs the global state it reads.

## Solution

Four parts. Parts 1–3 answer "did every step run"; part 4 answers "where did the findings go".

**1. A step manifest — the list that does not exist today.**
A machine-readable declaration of every required step: id, kind (`cmd` = must be executed
through the runner · `attest` = MCP/skill/browser step recorded with evidence), and whether it
is `hard` (never skippable) or `skippable` (a genuinely conditional step, recorded with a
reason). The dispatcher owns its own manifest; the sub-day contributes a fragment discovered at
run time by the same dynamic-discovery rule that already finds the sub-day itself — never a
hardcoded project list, and never a home-directory read from the public file.

**2. A per-pass ledger, written by the command that runs — not by the agent claiming it.**
A runner records each step's id, exit code, duration and output size at the moment it executes.
The ledger is scoped to the pass (`pass_id`, already minted by `day-gates.sh --mode=start`) and
to the **session id**, which also closes an existing weakness: today's dispatcher state is
global, so a genuine pass within 2h can mask a dropped one.

A step that **ran and failed** is recorded as run. Only a step that *never executed* is missing.
This distinction is the whole point — conflating them is the ambiguity the existing gates were
built to remove.

**3. Enforcement at the two places the agent cannot reach.**
- `day-gates.sh --mode=finish` refuses `DISPATCHER: pass complete` while any required step is
  unrecorded, and names each one. This is necessary but not sufficient — finish itself ran 7/13.
- The existing `day-pass-guard.py` Stop hook gains a second check: while a `/day` pass is open in
  *this session* and required steps are unrecorded, it blocks the stop and hands the agent the
  list of what is owed. The harness invokes it, so no step in either file can opt out of it.
  Both checks compute every run and report together (Invariant 1).

**4. Findings leave as tracked work, and `/day` ends with a hand-off prompt.**
Checks record findings into the ledger alongside steps. A new final step files every unfiled
finding into the task inbox via the existing `scripts/inbox.sh`, de-duplicated by a stable
fingerprint so a standing fault does not file a new entry every morning, and prints one
copy-pasteable prompt that starts a *separate* fixing session.

`/day` does not fix. The single exception is a narrow allowlist: a check may declare itself
mechanically auto-fixable (frontmatter drift, stale spec status), and only those run inline.
Nothing on the ALWAYS-ASK list is reachable — the finding that prompted this spec was prod
EXECUTE grants.

## Alternatives Considered

- **Another prose reminder.** Rejected on the repo's own record: this exact failure class has had
  three prose fixes (2026-08-13, 2026-08-28, 2026-09-01), two of which are quoted in `day.md`
  today. The third paragraph is in the file now and the step it guards ran 4 times in 13.
- **Report-only, no blocking** (founder call, asked explicitly and declined). It is what exists,
  and it sits at 4/13 precisely because emitting the warning is itself a skippable step.
- **Warn-only for one week before arming** (offered, declined). Costs a week at 18/21; the
  false-positive risk it buys down is addressed instead by running `/day`'s own documented
  workflows through the gate before it arms (epistemic gate 7c).
- **`/day` spawns subagents to fix what it finds** (offered, declined). Unbounded session length,
  and it puts an autonomous actor within reach of prod-grant-class findings.
- **Extracting every bash block into standalone scripts.** Deferred, not rejected: it is the
  stronger anti-fabrication story, but the observed failure is *omission under budget pressure*,
  not fabrication, and the churn across 2,000 lines is its own risk. The ledger records a body
  hash and output size so fabrication is at least visible.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The hook blocks a legitimate workflow, as the 2026-08-19 hook did | MITIGATE | Gate 7c: run `/day`'s own documented paths through it before arming — an abandoned pass, a pass that aborts at the gcloud gate, a pass where a step legitimately fails, a non-`/day` session. Each must pass through untouched. |
| A blocking hook traps the founder | MITIGATE | Three independent limits: `stop_hook_active` honoured, a per-pass block counter bumped before the decision and failing open on IO error, and an explicit abandon verb. Every block prints the escape. |
| The agent escapes the block by marking steps skipped | MITIGATE | `hard` steps refuse `skip` outright; skips require a reason, are counted, and print in the final report. |
| Filing findings every morning floods the inbox | MITIGATE | Stable fingerprint per finding; an open entry with the same fingerprint is annotated, never duplicated. |
| The ledger becomes a second source of truth that drifts from the files | MITIGATE | The manifest is the single source; a step id present in a file but absent from the manifest (or vice versa) is itself a gate failure. |
| The hook is bypassable by unregistering it or by a local settings flag | ACCEPT | True of every hook, and it is the documented escape. Stated plainly; D7 already reports the hook's liveness from a different mechanism. |
| Blocking yields only one forced continuation per user turn | ACCEPT | `stop_hook_active` semantics. One forced continuation carrying an explicit list is the improvement; the next pass's finish gate carries the rest. |

**Non-Goals**
- Do NOT revisit D6's receipt-based grading, or D1's calendar verdict. Both work and are tested.
- Do NOT gate the completion marker's write on anything.
- Do NOT let `day-cp.md` read home-directory state.
- Do NOT add a second Stop hook — extend the one that already owns `/day`.
- Do NOT refactor the bash blocks out of the prose in this spec's scope.
- Do NOT have `/day` fix anything outside the declared auto-fixable allowlist.

## Done-When

Evidence: `day-step.test.sh` 40 · `day-gates.test.sh` 134 · `day-pass-guard.test.sh` 40 ·
`test-p1324-day-ledger.sh` 13 — **227 cases, 0 failures**, and none of them writes
`~/.claude-day-ledger` (asserted by the suites themselves).

- [x] A manifest exists listing every required `/day` step, and a check fails if a step id in
      either skill file is absent from it or vice versa — `day-step.sh check-sync`, watched
      failing in BOTH directions and on a prefix collision (`q.onexyz` does not satisfy
      `q.one`), and watched catching a real deleted step (`cp.w1`'s receipt removed, exit 1;
      restored, exit 0)
- [x] Running `/day` and dropping a step makes `day-gates.sh --mode=finish` exit non-zero and
      name that step — `d8 FIRES: finish refuses while a required step never ran: exit 1`,
      naming `MISSING z.two`
- [x] The Stop hook blocks a simulated pass with unrecorded steps, and the block text names both
      the owed steps and the escape — `rc=2`, text carries `MISSING x.one` and `ESCAPE`
- [x] A step that ran and FAILED does not block; a step that never ran does — both demonstrated
      (`exit 3` step recorded, `MISSING x.two` named, `x.one` absent from the missing list)
- [x] Gate 7c pass: an abandoned `/day`, a `/day` that aborts at the gcloud gate, and an ordinary
      non-`/day` session each stop normally with the hook installed — abandoned `rc=0`, complete
      pass `rc=0`, other-session pass `rc=0`, no ledger at all `rc=0`
- [x] `stop_hook_active: true` is in the test fixture set and exits without blocking — `rc=0`
- [x] The block counter fails OPEN when its state directory is unwritable — demonstrated by
      `chmod 444` on the ledger plus `chmod 555` on its directory. **Corrected during
      implementation:** the first version returned *the limit*, which is still a blocking value
      because the caller releases on `n > limit` — so an unwritable ledger would have blocked on
      every Stop forever, the exact bug wearing the fix's wording. Its own test caught it; the
      sentinel is now `limit + 1`
- [x] Every new test case stubs the global state it reads; the suite passes on a machine with the
      hook uninstalled — verified by the stronger control: a live `state=open` ledger for THIS
      session was planted at `~/.claude-day-ledger` and both suites still returned 40/40 and
      134/134. Two pre-existing leaks were found and closed while doing it (`--mode=start` in
      both suites was overwriting the founder's real ledger)
- [x] A `/day` finding files an inbox entry via `scripts/inbox.sh`, and a second run with the same
      finding annotates rather than duplicating it — run 1 filed `INBOX-P1` + `INBOX-1`; run 2
      annotated both; `grep -c "^## "` still 1 per store
- [x] `/day` ends by printing a copy-pasteable hand-off prompt naming the filed entries — Step 9b
- [ ] One full real `/day` run records 21/21 in the ledger — **the only item outstanding.** It
      needs tomorrow morning's actual pass; nothing in a fixture can stand in for it, since what
      it tests is whether the wiring survives contact with the real dispatcher.

## Open Questions

1. Whether the Mixpanel/Sentry MCP steps can be `cmd` rather than `attest` — they are MCP calls,
   so attestation may be the only honest option. Resolve during implementation; `attest` with
   required evidence is the fallback and is not a blocker.
