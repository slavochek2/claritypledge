---
status: week
type: bug
rank: 99
severity: medium
workstream: canvas
date_reported: '2026-11-05'
created_date: '2026-11-05'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [canvas, mirror-agent, copy]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1625: Canvas drops short true points and does not say which or why

## Summary

A short point in the owner's own words, like "They are angry", can never pass the evidence check, and the reply gives no way forward.

> "I'm saying they're also angry. We have two problems. They're thirsty is one and the second one they're angry."

## Root Cause

`sharesWords` requires two shared content words between a statement and its quote, "however short the statement is". "They are angry" has one content word, so it fails even against a verbatim quote. Confirmed by running the real function: "They are angry" and "Customers are angry" are false against the founder's sentence; "They want juice" is true. **UNVERIFIED:** what the model wrote in the founder's runs. Another check could add to the same count, so `/reproduce` must capture it.

## Invariants

- "Nothing invented" stands: a point the owner's words do not support is still dropped (P1536).
- The Dropbox-from-memory refusal stays. A request with no facts writes nothing.

## Reproduction Steps

1. Signed in as a canvas owner, open a draft and its thread with the mirror agent.
2. Send: "Problem one more card here they are angry".
3. Observe: "Nothing changed on the canvas. I left out 1 point I could not tie to your words."

**Reproduction rate:** seen 3 of 3 by the founder on prod; the check's result is deterministic, the model's wording is not.

## Expected Behavior

- "Customers are angry" and "They are angry" are added when the owner said "they're also angry".
- A dropped point is named, with the reason and the next step.

## Actual Behavior

The point is dropped and the reply does not name it, so the owner repeats it.

## Affected Files

- `supabase/functions/_shared/canvas-support.ts` — `sharesWords`
- `supabase/functions/_shared/canvas-parse.ts:118` — `vetEvidence`
- `supabase/functions/_shared/canvas-reply.ts` — the reply text

## Severity

**Medium** — real points are lost and the message misleads, but the owner can reword, and P1621 adds writing a card by hand.

## Fix Approach

Founder-approved rule: for a statement too short to share two words, generic person words (customers, users, clients, people, buyers) need not match, and every other meaningful word must be in the quote. Test both ways, using these as fixed cases:

| Statement | Quote | Result |
|---|---|---|
| Customers are angry | they're also angry | added |
| They are angry | they're also angry | added |
| Customers are angry | customers love us | dropped |
| Customers pay monthly | customers hate it | dropped |

The word list needs testing. A statement whose only word is generic must not pass.

[FOUNDER DECISION: wording of the drop message. It must name the point, the reason and the next step. Draft: "I couldn't add "They are angry" because it doesn't match what you said closely enough. Say it once more with a bit more detail, like who is angry and about what."]

The dropped text comes from the model, so it passes the same name and link cleaning as other model text before it is shown.

## Acceptance Criteria

- [ ] The four table cases behave as listed, against the real check
- [ ] "They are angry" reaches the canvas on a real run on test
- [ ] A dropped point is named with its reason and next step, and never shows another person's name or a link
- [ ] A request with no facts, such as asking for Dropbox's canvas from memory, still writes nothing
- [ ] Longer points behave as before: the existing canvas suites pass

## Related

P1536 · P1621 (cards by hand)
