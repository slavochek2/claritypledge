---
status: in-progress
type: story
rank: 1000092
workstream: transcription
created_date: '2026-09-09'
tags: [transcribe, ux, mobile, chat]
feature_type: frontend
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

- [x] With the list at the bottom, a new message keeps it at the bottom
- [x] Scrolled up, a new message does not move the viewport — **mutation-proved**: removing the guard makes this test fail (`expected 1500 to be 100`)
- [x] The return button appears only while detached, and re-attaches on tap
- [x] The threshold treats "close enough to the bottom" as bottom, so a few pixels of
      momentum or a rounding error does not silently detach the reader
- [x] Touch target is at least 40px (visual-qa.md) — 44px (`w-11 h-11`)
- [x] The button is not a second full-width primary action and does not trip the p955 gate — full suite green, p955 gate included
- [x] Screenshots at 375px, 320px and desktop, in both states
      **Done 2026-09-09** via `e2e/p1294-chat-follow-visual.spec.ts`, 3 passed. Both states at
      each width, with the button's bounding box asserted (>=40px, and `x + width <= viewport`
      so it cannot clip off the right edge at 320). The 320px detached shot was read: control
      sits bottom-right, circular, 44px, fully inside the viewport, no overflow or clipping,
      empty-state copy unobstructed, and it is not competing with the screen's one primary
      action ("End Session").

## Notes

- **Not a duplicate of P1288.** That is about the same line being written twice; this is about
  not being able to see lines at all. They were reported in the same session and are unrelated.
- The interim-text line and the status banner sit outside this container and are unaffected.
- `messages` is replaced wholesale on every realtime event (full-refetch subscription), so the
  effect must key on something stable — a length or last-id — rather than array identity, or
  it will fire on every reconciliation poll and fight the reader every 15 seconds.


## Implementation, 2026-09-09

`src/hooks/useStickToBottom.ts` + `src/tests/p1294-stick-to-bottom.test.ts` (6 tests), wired
into the room's message list with a 44px circular "Jump to newest" control that renders only
while detached.

Three decisions worth keeping:

- **Keyed on a scalar, not the array.** `messages` is replaced wholesale on every realtime
  event *and* on a 15-second reconciliation poll. Keying on array identity would re-scroll on
  that timer and fight the reader every 15 seconds. The key is
  `` `${messages.length}:${interimTranscript.length}` `` — interim included so the words being
  spoken right now stay on screen rather than sitting just below the fold.
- **The stick flag is a ref, not state.** With `isAtBottom` in the effect's dependencies,
  re-entering sticking would itself trigger a scroll.
- **A 48px threshold, and it is not cosmetic.** `scrollHeight - scrollTop - clientHeight` is
  rarely exactly 0 — fractional device pixel ratios, sub-pixel line heights and momentum all
  leave a pixel behind. At zero, a reader sitting visibly at the bottom silently counts as
  detached and following stops: this feature failing in exactly the way it was asked to fix.

**Incidental finding from the visual run, unrelated to this spec:** the "Reconnecting
microphone…" banner renders even in the headless fixture with a stubbed `getUserMedia`. The
recogniser fails to start there too, so that banner is not specific to the founder's phone —
worth knowing for whoever picks up the recogniser churn (P1288's open thread).
