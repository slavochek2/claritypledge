---
status: today
type: story
rank: 87
workstream: events
created_date: '2026-11-03'
tags: [events, privacy, rls]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
---

# P1603: Hidden events, visible only with the link

## Problem

Every event is public: anyone can list them all, and the database lets any visitor read every row with the key shipped in the browser. A group that wants an event for its own people, or a test run with friends, cannot have one.

> Founder, 2026-11-03: "i want it private please only visible with link ... so users can also when creating events make their event hidden (with a checkbox i assume)."

## Appetite

Blast radius: high, it changes who may read the events table, which most event pages rely on. Reversibility: medium, the setting is off for every existing event, and the access rule can be reverted by a migration. Decision density: low, wording only.

## Invariants

- Hidden means the database refuses it, not that a screen filters it. A signed-out read of the events table must not return a hidden event. A filter in the app alone is not this feature.
- Every event that exists today stays exactly as public as it is. The setting defaults to off.
- Knowing the full link is enough to see a hidden event, signed in or not, and to RSVP after signing in.
- A hidden event's link cannot be found by listing, and is not realistically guessable when created hidden.

## Solution

**Setting.** A checkbox on the create and edit event forms, using the form's existing checkbox style. [FOUNDER DECISION: proposed label "Hidden event" with helper text "Only people with the link can see it. It won't appear in event lists."]

**Access.**
- Everyone can read an event that is not hidden, as today. A hidden event can be read by its host, by anyone who has RSVP'd, and by the service role.
- A new read, by exact link only, returns one hidden event to anyone holding its link, including signed-out visitors. The event page falls back to it. It offers no way to list.
- A hidden event created as hidden gets a longer random ending in its link.

**Surfaces that need work beyond the access rule** (audited 2026-11-03):
- Event page and its RSVP flow: reachable with the link; the reads a person makes before they have RSVP'd must not depend on seeing the row. This includes the sign-up then auto-RSVP path.
- Share preview: uses the by-link read and tells search engines not to index the page.
- Event room, prep and chat pages for a hidden event: work for the host and for people who RSVP'd, including people who have not yet RSVP'd where those pages are open today.
- Lists, the home rail, group pages, group counts, the "today's event" button, next-webinar, short links, the close page's next-event suggestion, and the tag cloud: the access rule removes hidden events from them. The host and people who RSVP'd may still see it in their own lists, with a "Hidden" mark.
- Operator tools with full database access that pick "the next event" or build audiences: they must skip hidden events unless named explicitly.

**Second write path.** Creating via scripts stays public by default.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A read made before RSVP silently finds nothing, breaking the page or RSVP for a link holder | MITIGATE | Browser test of the whole path, signed out to RSVP'd |
| The new access rule slows every event read | MITIGATE | The check only runs its lookup for hidden rows |
| Someone's RSVP list reveals a hidden event's id | ACCEPT | An id reveals no title or link, and no read by id returns the event to a stranger |
| An existing event switched to hidden keeps its short, older link | ACCEPT | Changing it would break links already sent; helper text is not needed, it is listed here |
| Copies already sent to Luma or other sites stay there | ACCEPT | Hidden is about this site; promote it or do not |

**Non-Goals**
- Do NOT add password protection, invitation lists or approval of attendees.
- Do NOT change who may RSVP or join the chat.
- Do NOT change the visibility of any existing event.

## Acceptance Criteria

- [ ] A host can tick the checkbox when creating an event, and can change it when editing.
- [ ] Signed out, the event page opens from the full link, and a hidden event's details are shown.
- [ ] Signed out, a direct read of the events table with the public key does not return a hidden event, and a public event is still returned. Known-bad control included.
- [ ] A signed-in stranger does not see a hidden event in the events list, a group page, the home rail, the header button, or short links.
- [ ] A person with the link can sign up, RSVP, and reach the event room and chat.
- [ ] The host and an RSVP'd person still see it in their own views, marked hidden.
- [ ] The share preview works from the link and is marked no-index.
- [ ] Existing public events behave as before: the existing event suites pass.
- [ ] A hidden event on TEST with a transcription round posts to its chat.

## Done-When

- [ ] A hidden test event exists on prod for the transcription friends test. `[post-deploy]` created right after deploy.

## Related

- Supersedes the rule in decisions.md "An event row exists only when a real, dated, public session is confirmed. There is no draft/hidden status" for hidden events only; the rest stands.
- [P1461](p1461_clarity_chat_channel_members_settings.md): invite-only channels, a separate surface.
- [P1596](done/2026-06-10/p1596_event_transcripts_one_speaker_per_sentence.md): the friends test this unblocks.
