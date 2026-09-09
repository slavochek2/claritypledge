---
status: week
type: story
rank: 1000092
workstream: transcription
created_date: '2026-09-09'
tags: [transcribe, ux, mobile, chat]
feature_type: frontend
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: founder
disclosure: public
---

# P1294: the `/transcribe` room does not follow new messages

## Problem

**Situation:** The room's message list (`transcribe-room-page.tsx:468`) is a plain
`overflow-y-auto` container with no scroll handling of any kind — no ref, no effect, nothing.
Messages append below the fold and the reader is left where they were.

**Complication:** This is the one screen where the reader is *speaking*. They cannot hold a
phone, talk, and hand-scroll a list at the same time — and the thing they most need to see is
the line that just arrived, because that is how they tell whether the room heard them. The
founder hit it on the first real prod session, in their own words:

> *"i wish it would scroll alwaxs down automatically.. otheriwse i scroll down and then i
> speak nad need to scroll down myself.. it should stay on the bototm so i always see new
> messages with abiltiy to scorll up and then somehow go down with one lcick and stay again
> down (the bototm right circle butotn to go down ) - i guess standrd interaciton.."*

**Question:** none open. The founder specified the behaviour precisely and it is the standard
chat pattern; this spec exists to record it and bound it, not to decide it.

## Behaviour

1. **Stick to the bottom by default.** A new message scrolls the list to the bottom.
2. **Reading wins over sticking.** If the reader has scrolled up, new messages must NOT yank
   them back down. Sticking resumes only when they return to the bottom themselves.
3. **One-click return.** While detached, a circular button sits bottom-right of the list. One
   tap scrolls to the bottom and re-attaches. It is absent while stuck to the bottom.

## Acceptance Criteria

- [ ] With the list at the bottom, a new message keeps it at the bottom
- [ ] Scrolled up, a new message does not move the viewport
- [ ] The return button appears only while detached, and re-attaches on tap
- [ ] The threshold treats "close enough to the bottom" as bottom, so a few pixels of
      momentum or a rounding error does not silently detach the reader
- [ ] Touch target is at least 40px (visual-qa.md)
- [ ] The button is not a second full-width primary action and does not trip the p955 gate
- [ ] Screenshots at 375px, 320px and desktop, in both states

## Notes

- **Not a duplicate of P1288.** That is about the same line being written twice; this is about
  not being able to see lines at all. They were reported in the same session and are unrelated.
- The interim-text line and the status banner sit outside this container and are unaffected.
- `messages` is replaced wholesale on every realtime event (full-refetch subscription), so the
  effect must key on something stable — a length or last-id — rather than array identity, or
  it will fire on every reconciliation poll and fight the reader every 15 seconds.
