---
status: qa
type: task
rank: 89
workstream: infrastructure
created_date: '2026-11-03'
tags: [day, findings, process]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1605: /day shows a fault again after its cause was already evaluated

## Problem

**Situation:** /day fingerprints a finding by check plus fault key or title. Only Park carries across runs; any other answer resurfaces when the fault is reported again. No /day step reads the decision logs before filing.
**Complication:** On 2026-11-02 and 2026-11-03 the test Gemini key produced two differently named findings from one one-off benchmark. In the same fix session, 3 of 5 agent items had already cleared.
**Question:** How does an evaluated cause stay evaluated, without hiding a fault that has really changed?

> Founder framing, verbatim: "How do we avoid these redundancies and me spending attention again and again on the same issues?"

## Appetite

Blast radius: one flow, the founder's daily board. Reversibility: git revert. Decision density: low, approved 2026-11-03.

## Invariants

- A repeated card is never hidden merely for its age: decisions.md P1578 rejected suppressing after N days because it hides stuck work. A hide requires a recorded cause, verdict and expiry.
- Absence proves a fix only under the existing P1578 oracle. A hidden fault is not counted as fixed.
- "Did not look" is not "fixed" (D2, 2026-10-14). A check that did not run never satisfies a record.

## Solution

1. A fix session ends by writing one record per item: cause, verdict (fixed, false, accepted), and an expiry date or a threshold that breaks through.
2. /day consults the records before showing a card. A match within its expiry and threshold is left off the flow and counted in one line; a worse reading or an expired record shows the card with the earlier verdict beside it.
3. One record can cover several fault keys sharing one cause, so a renamed fault does not start over.
4. The fix prompt ends with a KDD step only for items with a decision worth keeping.

Where the record lives is the implementer's call, after reading the runner's `decisions.jsonl` handling.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A record hides a fault that has changed | MITIGATE | Mandatory expiry; worse reading breaks through |
| Agents write "accepted" to clear the board | MITIGATE | Accepted needs a named cause and shows in the one-line count |
| Linking fault keys to one cause is wrong | ACCEPT | Expiry bounds the damage |

**Non-Goals**
- Do NOT change the P1578 outcome logic.
- Do NOT have /day parse free text in decisions.md to decide anything.

## Done-When

- [x] A fix session's accepted item does not appear as a card on the next run, and appears in the one-line count
- [x] A worse reading of that fault shows the card with the earlier verdict
- [x] An expired record shows the card
- [x] A check that did not run shows as not run, despite a record
- [x] A control with no record behaves exactly as today

## Known limitations

- No check files a numeric `reading` yet. "Worse" is proven on fixtures only; a record with a threshold always shows its card until a check files one (fails open).
- A record without a threshold hides at any severity until its expiry (at most 90 days), since the Solution allows expiry or threshold.
- A card whose record no longer holds can be folded under another card sharing its cause slug, and its earlier-verdict line is then not shown.
- A hidden card's check row has no card link, as for waiting and owned cards.
- The printed CLI path is not quoted, so a repo path with spaces breaks the command. The CLI ignores write flags when `--list` is given, and a repeated flag keeps its last value.
- The board's new fold and earlier-verdict line were not checked in a browser in /dev.

## Open Questions

1. How many cards per week are repeats? Not measured; measure before and after as the falsifier.

## Related

P1578, P1432; docs/decisions.md 2026-11-03 "Why /day findings keep coming back after an answer".
