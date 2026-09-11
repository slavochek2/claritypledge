---
status: rejected
type: story
rank: 97
workstream: transcription
created_date: 2026-09-11
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [transcribe, live, navigation, architecture]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1305: Transcription survives leaving the page — and what that makes /transcribe

> **Rejected 2026-09-11, superseded by P1307** (on branch `feature/p1307-event-transcription`
> until it ships). Merged with P1298 and P1299 into one spec: capture that follows the person
> across pages, the always-visible bar and the `/live` pause/resume are P1307 part 5. Retained as
> the rationale record.

## Problem

> Founder framing, verbatim: *"maybe we want to create a spec to widen this so slash transcribe
> when it starts that it can continue everywhere... they move between pages and it will continue
> the transcription. And visually, I also see people see that it's being transcribed, and they
> can end it."*

And the reason it matters, in his words:

> *"the idea is, you know, I have many people in the room in the event but they will leave the
> transcribe page and today no audio will be there."*

A room full of people at an event is exactly the case this feature exists for, and it is the
case that breaks: the moment anyone opens their own profile, the feed, or a letter, their
microphone is released and their contribution to the shared transcript stops. Nothing tells
them. They come back to a room that has been listening to everyone except them.

## The premise that turned out to be false

The founder asked, reasonably:

> *"In life, I guess it's similar, right? So when people are in life, in slash life, they can
> move away to other pages and it continues to record, right?"*

**No. Verified 2026-09-11: `/live` releases the microphone on navigation too.**
`src/hooks/use-audio-recorder.ts:279-293` — a cleanup effect commented *"Cleanup on unmount
(handles tab close / navigation)"* calls `getTracks().forEach(track => track.stop())`.
`/transcribe` does the same thing in `transcribe-room-page.tsx`, deliberately, because capture
must not outlive the consent screen's promise.

So this is **not** "make /transcribe behave like /live". Neither one does it. It is a new
capability for both, and `LiveSessionBanner` is not the precedent it looks like — that banner
renders *inside* the live page and replaces its nav; it is not a persistent cross-page bar.

**This matters for sequencing:** there is no working implementation to copy. Anyone who starts
by reading /live expecting one will lose a day.

## The harder half — what is /transcribe, really

The founder's own model, verbatim:

> *"transcribe is I guess like something like live many to many, right? And clarity session is,
> clarity live is one to one."*
> *"we will extend it with more functionalities until maybe at some point it just like consumes
> life fully or life can be started from there."*

If transcription becomes ambient — running while you are anywhere in the app — then two
recording surfaces can be live at once, and the questions below stop being hypothetical. They
are the real content of this spec; the banner is the easy part.

1. **Can a person be in a transcribe room and a clarity session at the same time?** One
   microphone, two consumers. `/transcribe` already tees one `getUserMedia` stream two ways
   (live slices + archival chunks), so a third consumer is not absurd — but two *sessions* means
   two consent records, two transcripts, and two answers to "what was I recorded for".
2. **If not, which one yields?** Must one be ended before the other starts, and who decides —
   the participant, or the product?
3. **Two entry points into /live already exist** (event clarity rooms, and "Start a Clarity
   Session"). Each has to have an answer for "you are currently being transcribed".
4. **What does the person see?** One bar for both, or one per session? A bar that says
   "recording" without saying *into what* is worse than no bar.
5. **What ends it?** Closing the tab, navigating to a hard boundary (sign-out, another room), a
   timeout, or only an explicit tap. Today only an explicit tap or unmount does.
6. **Does the consent promise survive navigation?** The consent screen says recording begins
   when you agree and stops when you leave the room. Ambient capture changes what "leave" means,
   and the privacy policy says so too. **Any design here has to be reconciled with
   `src/app/content/privacy.md` §Transcribe rooms, not just with the code.**

## Founder decisions — do not answer these while implementing

- `[FOUNDER DECISION: concurrency]` — may a person hold a transcribe seat and a clarity session
  at once, or is one exclusive?
- `[FOUNDER DECISION: ending]` — what ends an ambient transcription, besides tapping end?
- `[FOUNDER DECISION: visibility]` — what does the always-present indicator say and where?

## Why this is filed rather than decided now

The founder asked directly: *"should we be doing it now here in this session or we file the spec
with all these questions and then when we process the spec we resolve it?"*

Filed. Three reasons, all mechanical rather than preference: the /live premise was false and
that alone changes the shape; the concurrency question above is a product decision, not an
implementation one; and P1298 (segmentation) changes what the live transcript even contains,
which changes what a persistent indicator should show.

## Depends on

- **P1298** — segmentation. An always-on indicator advertising a transcript that invents
  sentences makes the invented sentences more prominent, not less.
- **P1299** — the transcript reaching session history. If leaving the page stops being the
  implicit "end", something else has to trigger the final transcript.

## Acceptance Criteria

- [ ] A participant who navigates away from `/transcribe` keeps contributing to the room's
      transcript, and can see that they are, from any page
- [ ] They can end it from any page, without navigating back
- [ ] The concurrency decision above is implemented AND the losing case is handled visibly —
      never a silent second recording, never a silently dropped first one
- [ ] Both `/live` entry points behave correctly when a transcription is already running
- [ ] `privacy.md` and the consent copy match what the code now does — checked, not assumed
- [ ] Reproduced with two participants, one of whom navigates away mid-session and returns
