---
status: all-done
type: story
rank: 87
workstream: events
created_date: '2026-11-03'
tags: [events, privacy, rls]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
completed_at: 2026-11-03
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
- An event id is never access. Someone who knows only the id of a hidden event (it was readable from the RSVP list before this feature) cannot read the event, cannot register for it, and cannot read who is in it. The link is the only proof.

## Solution

**Setting.** A checkbox on the create and edit event forms, using the form's existing checkbox style. [FOUNDER DECISION: proposed label "Hidden event" with helper text "Only people with the link can see it. It won't appear in event lists."]

**Access.**
- Everyone can read an event that is not hidden, as today. A hidden event can be read by its host, by anyone who has RSVP'd, and by the service role.
- A new read, by exact link only, returns one event (hidden or not) to anyone holding its link, including signed-out visitors. The event page falls back to it. It offers no way to list and no lookup by id.
- Registering for a hidden event goes only through a new by-link registration function. A direct insert into the RSVP table is refused for a hidden event, so an id read from anywhere cannot be turned into a registration (and so into read access). The function keeps every check of the direct path: signed in, not cancelled, capacity, removed people, the server-stamped time.
- The RSVP list, the practice rooms and the room members of a hidden event are returned only to its host, the people themselves and people already registered. Before registering, a link holder sees no attendee names or count on the page.
- A hidden event created as hidden gets a longer random ending in its link (16 characters from the browser's crypto source).

**Surfaces that need work beyond the access rule** (audited 2026-11-03):
- Event page and its RSVP flow: reachable with the link; the reads a person makes before they have RSVP'd must not depend on seeing the row. This includes the sign-up then auto-RSVP path.
- Share preview: uses the by-link read and tells search engines not to index the page.
- Event room, prep and chat pages for a hidden event: work for the host and for people who RSVP'd, including people who have not yet RSVP'd where those pages are open today.
- Global discovery: the events list and past list, group pages and counts, the home rail, next-webinar, short links, the close page's next-event suggestion, and the tag cloud filter hidden events out explicitly, in the query. The access rule alone is not enough, because the host and the registered CAN read a hidden row and it could otherwise displace a public one. "Today's event" shows a hidden event only to its host or a registered person, from their own reads.
- Personal views keep a hidden event, with a "Hidden" mark: the event page itself, the host's own events, a registered person's own events and chats.
- Pre-registration pages for a link holder (room, prep, chat) are routed from what the by-link read returned; none opens a by-id read of a hidden event.
- Operator tools with full database access that pick "the next event" or build audiences: they must skip hidden events unless named explicitly.

**Second write path.** Creating via scripts stays public by default.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A read made before RSVP silently finds nothing, breaking the page or RSVP for a link holder | MITIGATE | Browser test of the whole path, signed out to RSVP'd |
| The new access rule slows every event read | MITIGATE | The check only runs its lookup for hidden rows |
| An id read from the public RSVP list becomes access (insert your own RSVP, then read the event) | MITIGATE | Direct RSVP inserts are refused for a hidden event; registering takes the exact link; RSVP rows, practice rooms and room members of a hidden event are not returned to strangers. Test: a stranger who knows only the id can do none of it, with a public-event control |
| An existing event switched to hidden keeps its short, older link | ACCEPT | Changing it would break links already sent; helper text is not needed, it is listed here |
| Copies already sent to Luma or other sites stay there | ACCEPT | Hidden is about this site; promote it or do not |

**Non-Goals**
- Do NOT add password protection, invitation lists or approval of attendees.
- Do NOT change who may RSVP or join the chat.
- Do NOT change the visibility of any existing event.

## Acceptance Criteria

- [x] A host can tick the checkbox when creating an event, and can change it when editing. (browser spec: create and edit flows)
- [x] Signed out, the event page opens from the full link, and a hidden event's details are shown. (browser spec) `[post-deploy]` re-check on prod.
- [x] Signed out, a direct read of the events table with the public key does not return a hidden event, and a public event is still returned. Known-bad control included. (integration spec, public control) `[post-deploy]` re-check on prod.
- [x] A signed-in stranger does not see a hidden event in the events list, a group page, the home rail, the header button, or short links. (Design change from spec review: not even its host or a registered person sees it in these global lists; they reach it from its page and their own views.) (events list by browser spec; the others by the explicit filter and unit tests, not each by browser)
- [x] A person with the link can sign up, RSVP, and reach the event room and chat. (RSVP and room by browser and integration tests; the sign-up email leg itself not driven, the slug reaching the door is unit tested; chat access by the existing rule) `[post-deploy]` walk it in the friends test.
- [x] The host and an RSVP'd person still see it on its page and in their own views, marked hidden. (browser spec: Hidden mark)
- [x] The share preview works from the link and is marked no-index. (unit test; noindex by browser spec)
- [x] A stranger who knows only a hidden event's id cannot register for it, cannot read it, and cannot list its RSVPs, practice rooms or room members; a public event is the control. (integration specs, with public controls)
- [x] Registering through the link works for a signed-in stranger and keeps capacity, cancelled and removed checks; a direct insert for a hidden event is refused. (integration specs)
- [x] Global lists, group pages and counts, home rail, next-webinar, close-page suggestion and tag cloud never show a hidden event, even to its host or a registered person; the event page and personal views still do. (filters, unit and browser tests; not every surface by browser)
- [x] Existing public events behave as before: the existing event suites pass. (2026-11-03: 37 passed, 5 failed on P1603; the same 5 fail on main without P1603, 28 passed, 1 flaky)
- [x] A hidden event on TEST with a transcription round posts to its chat. (temporary hidden copy of the P1592 transcript spec: 25 of 25, on the first build; deleted after)

## Cost Budget

Matches [metered-services.md](../../../docs/technical/metered-services.md): the design adds a request on a hidden page view, a function call per page, and test traffic. Registry rows used: Supabase (REST requests, egress); the active TEST server is self-hosted, so the free-plan limits bind only on the hosted fallback.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | An unregistered view of a hidden event page: 1 refused table read (`events` by slug, returns `[]`) + 1 `get_event_by_slug` RPC = 2 requests, against 1 for a public event, so +1. Registered or host: 1 table read = 1 (no extra). Registering by the link: 1 RPC (`rsvp_to_event_by_slug`) replaces 1 insert = +0 | Views per hour x 2, only for hidden events; a viewer who is not registered adds 1 per page view, with no timer, poll or retry (rule 2 and 4 do not apply) | Integration spec `20261103060000`: setup 5 users x 2 + 4 events x 1 + 4 RSVPs + 3 sign-in/out x 2 = 24; tests 10 (storage) + 5 (join) + 8 (rounds) + 12 (rooms) + 14 (functions) + 6 (social proof) = 55; teardown 4 events + 5 users x 2 = 14; total about 93. The earlier P1603 integration spec adds its own setup and 22 tests, about 60. The browser spec is not recounted: each page view is 2 requests |
| Egress (bytes) | Refused read: `[]` plus headers, about 1 KB; RPC: one `events` row plus host embed, about 4 KB; so about 5 KB per unregistered view vs about 4 KB for a public one (+1 KB) | Views per hour x 5 KB | About 93 requests x about 1.5 KB = about 140 KB |
| Log lines | 0 extra: a refused read is an ordinary 200 with `[]`, not an error | 0 | 0 from the app; the server-side refusals in the tests (insert refused, join refused) are 4 error log lines per run |
| Service unit | No Gemini, no edge function added. `send-event-emails` gains one `event_rsvps` lookup per `rsvp` invocation: 1 query x invocations, no new invocations | none | 0 mail sent (refusal tested at unit level) |

1. **Fits the plan limit today?** Yes. Requests per month = views x 2 (hidden) plus runs per month x 150 (both specs); egress per month = views x 5 KB plus runs per month x 200 KB. Both are well inside the registry rows' monthly figures at today's usage (read the current values from the dashboard, never written here); the net change against today is +1 request per unregistered hidden view and the test runs above.
2. **Fits at 10x?** Yes: the added traffic scales linearly with hidden-page views (+1 request each) and test runs, with no per-row or per-user loop. 10x views is +10 requests per original view, still inside the limit.
3. **If either answer is no:** not applicable.

## Known Limitations

All accepted for this release; each is a design choice, not an oversight.

- **A direct RSVP insert answers differently for a hidden id than for an id that does not exist.** The database refuses the insert for a hidden event with a policy error, and for a missing event with a foreign-key error. Needs an event id, reveals only that the id is a hidden event (never its title, link or people). ACCEPT: closing it would mean one error for both, which the policy layer cannot produce.
- **Reviews from before a switch.** A hidden event writes no public review. An event switched to hidden after its reviews were written keeps them and their source id. ACCEPT; removing a published quote is a founder call.
- **The slug is kept when an existing event is switched to hidden.** Its older, shorter link keeps working for people who already have it (see Risks).
- **Order of apply.** All P1603 migrations (`20261103030000`, `040000`, `050000`, `060000`) must be applied together, migrations first, before the client that sets `is_hidden` ships. Earlier migration comments describing an open RSVP list are superseded by `040000`.

## Done-When

- [x] Migrations, client and tests committed, reviewed by Gemini 4 Argon, Codex and Opus; the final round found no open defect.

## After deploy

- [ ] A hidden test event exists on prod for the transcription friends test.
- [ ] On prod, signed out: the link opens it, and the public-key read of events does not return it.
- [ ] `send-event-emails` is deployed with the RSVP guard.

## Related

- Supersedes the rule in decisions.md "An event row exists only when a real, dated, public session is confirmed. There is no draft/hidden status" for hidden events only; the rest stands.
- [P1461](../../p1461_clarity_chat_channel_members_settings.md): invite-only channels, a separate surface.
- [P1596](p1596_event_transcripts_one_speaker_per_sentence.md): the friends test this unblocks.
