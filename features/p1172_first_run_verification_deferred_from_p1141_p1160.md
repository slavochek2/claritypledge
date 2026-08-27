---
status: week
type: task
rank: 77
workstream: infrastructure
created_date: '2026-08-27'
tags: [verification, specs, events, stories]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1172: The first-run checks deferred from P1141 and P1160 — and the rule that stops specs collecting them

## Problem

**Situation:** P1141 (story carries a video) and P1160 (events pipeline orchestrator) both have
shipped, working code sitting on `main`. Neither can close.

**Complication:** What blocks them is not unfinished code. It is completion criteria that describe a
**future operational run** rather than the artifact being shipped:

- P1141: *"For one real story, every timecode lands within a few seconds of the words it points at,
  verified by playing it"* — there is no filed agent story yet.
- P1160: six items of the shape *"Invoked against a past completed event, the orchestrator
  reports…"* — each already carries an honest `UNVERIFIED — requires a live run` note written by
  its own implementer.

Nothing can check these at ship time, by construction. Under P1169's gate 2.5 — which reads the
checkboxes rather than a status label — a spec carrying one of these is blocked **permanently**.
Before P1169 they were invisible: the specs were waved through or hand-closed, which is how P1141
reached `qa` with three of them open.

**Question:** Where do first-run checks live, so the code can ship and the check still happens?

> Founder framing, verbatim: *"who will check if it if not you? , same for p1160 - it will stick
> there forever or what?"*

## Appetite

Blast radius: low — this spec holds checks; it changes no code. Reversibility: total.
Decision density: zero for the checks themselves; one rule proposal, below.

## Solution

**1. Hold the deferred checks here**, verbatim, each naming the occasion that triggers it. Each is
a real check that must still happen — moving it does not discharge it.

**2. Propose the rule that prevents the next occurrence.** A completion criterion must be checkable
against the artifact at ship time. A check that needs a future run belongs in a follow-up spec whose
trigger is that run — never in the shipping spec's own checklist, where it converts "done" into
"blocked forever". Routes to `.claude/rules/features.md` via `/slava:maintain:claude-md`; not applied
here because that gate has not been run for it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Deferring becomes the way to make any inconvenient criterion disappear | MITIGATE | The moved items are reproduced verbatim with their originating P-number and a named trigger. A deferral with no named trigger is the smell — reject it. |
| The trigger occasion never arrives, so this spec strands too | ACCEPT | It strands honestly, as one spec that says "waiting on the first real run", rather than as two specs that look like unfinished features. The `/day` scan (P1169) surfaces it. |
| The rule proposal is treated as applied | MITIGATE | Stated above as unapplied and gated. |

**Non-Goals**
- Do NOT re-open P1141 or P1160, or re-verify what they already evidenced.
- Do NOT weaken gate 2.5 to accommodate first-run criteria.

## Deferred from P1141 — trigger: the first real agent story is filed

- [ ] Filed story text uses the subject's full name and contains no pronoun referring to the subject
- [ ] For one real story, every timecode lands within a few seconds of the words it points at,
      verified by playing it
- [ ] Nothing a reader sees claims the named person holds the position the agent states

## Deferred from P1160 — trigger: the next real event promotion run

- [ ] Invoked against a **past completed** event, the orchestrator reports all four stages done and
      attempts no re-promotion (read-only stages only)
- [ ] Invoked against an event whose `<slug>.json` shows platforms done and whose
      `<slug>.groups.json` is absent, the orchestrator reports the groups stage as **pending**
- [ ] The staleness check **fires** on a deliberately stale fixture (a blurb naming a past event's
      date with zero unresolved `{placeholder}` tokens) — the stop observed, not inferred
- [ ] Auth/session preflight in `promote-all` reports all five platforms' login state before any
      copy review, in one pass
- [ ] Invoked with `promote-all`'s cache showing platforms done, the orchestrator's **kickoff run
      record** (not the absence of a file) is what reports the groups stage pending
- [ ] The combined copy review runs once — `promote-all` step 3b does NOT also stop for its own
      blurb review, verified by counting approval turns in one full run

## Done-When

- [ ] Every box above is ticked, or explicitly retired with its reason recorded
- [ ] The ship-time-checkability rule is put through `/slava:maintain:claude-md` and either applied
      to `.claude/rules/features.md` or rejected with the reason recorded

## Related

- **P1141**, **P1160** — the specs these checks came from; both closed on their shipped code.
- **P1169** — made the blockage visible by replacing the status-label gate with a criteria gate.
