---
status: backlog
type: story
disclosure: public
rank: 1000097
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - onboarding
  - letters
  - delivery
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1456: Path for people without an account — letter by link, verify to save

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.

> Founder framing, verbatim (2026-10-12): *"So this letter format is, I guess, or current letter format is for people who don't have account yet."*

## Intention

Bob prepares a letter in Clarity Chat, but Alice is not on Clarity Pledge. Deliver it by
**email, WhatsApp or a link**. Alice answers on today's letter page without logging in. At the
end she is asked to **verify (email or WhatsApp number) to save** her answers. Once she has an
account she lands in the chat with Bob. People who already have an account (event attendees)
skip all of this and receive it in chat directly.

## How the idea was born

2026-10-12. The founder: *"this letter format is, I guess, or current letter format is for
people who don't have account yet. But once they have account... they are immediately in the
chat."* And: *"There are bots on WhatsApp that can help you verify your WhatsApp number."* Also:
*"everybody needs to go through /prepare so everybody knows... what cognitive understanding
is."*

## How it relates

- **P1437**: the chat delivery for members. This spec is the non-member branch.
- **letters workstream** (existing letter page, P948, P949): reused as the no-account surface,
  not rebuilt.
- **/prepare**: candidate first step after verification.
- **Placeholder P1455 (reply threads)**: a non-member's reply happens on the letter page.
- **Placeholder P1460 (connection levels)**: a new member starts at "unknown" or "known".
- Blocks real-world use of P1437 with anyone who is not already a member.

### Prerequisites found in review (Codex, 2026-10-12)

- **Connection state.** P1437 assumes both sides accepted the Clarity Partner Agreement. A
  non-member has not. This spec carries the minimal state it needs itself ("invited, not yet
  connected"); the full unknown/known/partner ladder stays in the connection-levels spec, so this
  spec is not blocked by it.
- **Return delivery.** P948 ends at turning the receiver's responses into their own story and
  explicitly excludes sending a letter back. The non-member branch of a reply therefore depends on
  P948's named downstream "letter back" spec, which does not exist yet; it is tracked here until
  it does.

## Why it matters

Chain: **show the gap** for the most common real case: the other person is not on the platform.
Without it the loop only works between existing members.

## Deliberately out / trade-offs considered

- Answering inside chat without an account (needs auth-less chat, a large security surface).
- Building a WhatsApp bot now: verification by email first unless WhatsApp proves necessary.
- Forcing an account before answering: the letter page exists precisely to avoid this friction.

## Open questions

- Verify before or after answering? (Founder leaned after: "after they fill the letter".)
- Is /prepare mandatory for new members, or offered?
- Which channel does Bob pick to send, and who sends it: Bob, or Bob's agent?
- How does a later account claim answers given anonymously?

## Done-when for promoting out of placeholder

- P1437 prototype is accepted, and a real test needs a counterpart who is not a member.

## Update 2026-10-13 (from the v5 walk-through, see P1469)

- **WhatsApp becomes the default for contacts imported from WhatsApp.** Bob sends the letter link from his own WhatsApp (by hand first; through Beeper later). A message from Bob's number reads as Bob; one from a company number reads as a stranger.
- **The link is not proof of identity.** Alice confirms her number with a WhatsApp one-time code (WhatsApp authentication templates, offered by providers such as Twilio Verify; per-message cost; needs a Meta-verified business sender). Email stays the fallback.
- **Beeper transport:** in its on-device mode messages go from the device straight to WhatsApp, end-to-end encrypted; the older cloud mode decrypts on Beeper's servers. Check the mode before relying on it.
- The prototype (P1469) sends by email only.
