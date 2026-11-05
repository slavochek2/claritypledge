---
status: in-progress
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
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p1625-reproduce.test.ts
  root_cause: "The Problem box's shape makes the model write 'Today customers are angry.'; sharesWords needs two shared content words, and only 'angry' is shared. The reply carries a count, not the point."
  confidence: high
  surfaces_in_scope: [sharesWords, vetEvidence, canvas-reply]
  reproduced_at: 2026-11-05
---

# P1625: Canvas drops short true points and does not say which or why

## Summary

A short point in the owner's own words, like "They are angry", can never pass the evidence check, and the reply gives no way forward.

> "I'm saying they're also angry. We have two problems. They're thirsty is one and the second one they're angry."

## Root Cause

`sharesWords` requires two shared content words between a statement and its quote, "however short the statement is". "They are angry" has one content word, so it fails even against a verbatim quote.

**What the model wrote.** The founder's prod output no longer exists: a run stores counts, never the model's response, and that draft was discarded. The evidence is a replay of the founder's message through the real prompt, engine and model, with the database faked and a reconstructed base point: 5 of 5 runs wrote `Today customers are angry.`, citing `they are angry which is the or problem too`. No other check refused it. Numbers and names passed; the only shared content word is "angry".

**"Today" comes from us.** The Problem box's shape is `"Today <customer> <A + cost>; ..."`, so the fix must allow it. The rule as first written would still drop this point, since "today" is a meaningful word absent from the quote.

**The second founder message did not reproduce.** "I'm saying they're also angry..." was reworded and accepted in 5 of 5 replays, against prod's drop. The replay's base point is reconstructed, so the cause of that difference is unknown. The third drop, 05:47, came from a message with no stored text and was not replayed.

**Negation.** "not" and "never" are not content words, so without a guard the short rule would accept "They are not angry" against "they're also angry". The existing P1536 tests also pin "Not profitable" and "Profitable" as refused.

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

## Founder Decision: Best Guess, Then Correct

Supersedes the "dropped" handling in the rule below. "Nothing invented" (P1536) becomes **nothing added without showing the owner the words it came from**. A point that fails the two-word check, but shares a meaningful word with a sentence the owner typed, is added, and the reply says so: `I added "Customers are angry" to Problem, from your words "they are angry". If you meant someone else, tell me who and I'll change it.` Corrections happen in chat. Picking among versions is not built; build it only if corrections prove common.

Still refused: a sentence that denies, hedges, asks, supposes or requests; a number the owner never said; another person's name; a quote not in the owner's material.

## Known Limitations

- A wrong guess the owner does not correct stays on the draft and can be published.
- A correction uses a run, and a draft has 5. The cap is unchanged.
- The denial and request word list is open, and only the sentence holding the quote is read.
- A run with dozens of guesses can exceed the stored reply's 4,000 characters, and the notes past that point are lost.
- A word the owner typed can be shown back or capitalised on a point, including a surname.
- The model sometimes writes a longer statement that fails these checks, so a true point can still be refused on one run and added on the next (1 of 2 in the last replay).

## Fix Approach

**Superseded by Founder Decision above; kept as history.** Founder-approved rule: for a statement too short to share two words, generic person words (customers, users, clients, people, buyers) need not match, and every other meaningful word must be in the quote. Test both ways, using these as fixed cases:

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
- [ ] An added best guess is told with the words it came from and how to correct it; a dropped point is named when its words are safe to show; neither shows another person's name (other than one the owner typed) or a link
- [ ] A request with no facts, such as asking for Dropbox's canvas from memory, still writes nothing
- [ ] Points with two shared words behave as before; the existing canvas suites pass, except P1536 cases the best-guess decision changes, each listed to the founder

## Related

P1536 · P1621 (cards by hand)
