---
status: backlog
type: story
disclosure: public
rank: 1000096
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - reply-thread
  - bridging
  - letters
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1455: Reply threads — close the gap after it is shown

> **PLACEHOLDER spec.** Captures the idea, why it exists and its boundary. Do NOT design the
> build yet. Expand when the P1437 letter loop has shown at least one real gap end to end.

> Founder framing, verbatim (2026-10-12): *"Then I guess it's about making sure that letters can be exchanged continuously or something."*

## Intention

Once a letter in chat has made a gap visible (Bob's sealed number vs Alice's rating, the lower
one shown), give both people a way to keep going until the gap closes: Alice answers with her
own story, Bob explains it back, numbers move, the exchange ends when both say "understood".
In chat a letter is a **private thread**; an answer is **another private thread linked to the
first**. No separate "answer letter" object.

## How the idea was born

2026-10-12, while scoping the P1437 prototype. The founder: *"now a letter practically becomes
a thread... and then an answer letter is a thread, another thread"*, and earlier: *"it's about
making sure that letters can be exchanged... letter, letter, letter, instead of letter, talk,
letter, talk."* Closing the gap was deliberately left out of the P1437 build so the prototype
tests one thing: does the gap become visible.

## How it relates

- **P1437** (Clarity Chat prototype) produces the first thread and its numbers. This spec is
  the next link. Blocked by P1437 reaching UAT.
- **P948** (Answer Letter: responses become the receiver's own story) and its named
  downstream "letter back" spec: same job in the no-account letter page. This spec is the
  in-chat form; it references P948, it does not replace it.
- **P949** (async letter calibration scoring): the scoring rules a reply thread would reuse.
- **Placeholder P1459 (clarity ledger)** records what each reply thread revealed and closed.
- **Placeholder P1456** keeps the no-account path; a reply from a non-member happens there.

### Dependency found in review (Codex, 2026-10-12)

For members, a reply is a second private thread linked to the first. For non-members, the reply
goes through the letter page and needs P948 plus its downstream "letter back" spec, which is not
written yet (P948 stops at the receiver's own story). The member path does not wait for it.

## Why it matters

Chain: data in → find the moment → show the gap → **close the gap**. Showing a gap without a
way to close it risks leaving two people more upset than before. This is the step that turns a
measurement into a repair.

## Deliberately out / trade-offs considered

- Live sessions (/live) as the closing mechanism. Async threads first; /live stays the
  synchronous option.
- Agents scoring explain-backs. Decided 2026-10-12: the speaker scores; agents never do.
- Unlimited back-and-forth. Some stopping rule is needed (open question below).
- Rendering replies inline in the shared DM: replies stay private threads until submitted,
  same as the first letter (sealed numbers must stay sealed).

## Open questions

- Does the second thread reference the first visually (quoted card) or only by link?
- What ends an exchange: both rate ≥ 8, a max number of rounds, or either side closing?
- Who may start a reply thread: only the receiver, or either side?
- Does a reply need its own point, or always the same point?

## Done-when for promoting out of placeholder

- P1437 prototype shows at least one gap end to end with a real pair, and
- the founder (or a tester) asks "what now?" after seeing the numbers.
