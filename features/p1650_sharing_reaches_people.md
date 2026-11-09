---
status: in-progress
type: story
rank: 114
workstream: clarity-chat
created_date: '2026-11-06'
tags: [sharing, canvas, letters, chat]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 7322b4cd02f7476db6dcb865858ec173c23f3dc1093c726a8c8e880b2cb14bc8
spec_review_vendors: [codex, gemini, openrouter]
---

# P1650: Sharing reaches people: people before typing, any-word search, current events, and invited letter recipients in chat

## Problem

**Situation (verified 2026-11-07 against main):**
- The canvas Share field builds its list as people, then events, then groups
  (`canvas-share-control.tsx:247-258`). People come from `search_profiles`, which needs 3 typed characters, so on
  focus the list holds only events and groups. Events and groups are filtered client-side by substring.
- `search_profiles` matches the start of the whole name or the handle, ordered by name, 8 rows
  (`p878_search_profiles_rpc.sql`). The admin branch searches every profile; others search their relationship
  scope (letters, accepted agreements, witnesses: `p1486_scope_accepted_agreements_only.sql`).
- The events offered (`get_canvas_share_targets`, `p1515_share_targets_no_cutoff.sql:30-46`) are every event the
  owner hosts or was admitted to, of any age. P1515 3k removed a 90-day cut so the list equals what `share_canvas`
  accepts.
- **Chat delivery exists (P1545).** A new canvas grant posts a canvas card to a person's 1:1 or an event's or
  group's channel (`share_canvas`, `p1536_canvas_draft_versions.sql:788-797`); a re-share posts nothing; a failed
  post is a warning and the share still succeeds. A one-to-one letter delivery posts a letter card in the 1:1
  (`p1545_artifacts_data.sql:488-520`). One-to-many letters are public links whose readers enrol themselves on
  open (`p1321_letter_delivery_public_only.sql`), and post nothing by design (`p1545_artifacts_data.sql:487`).
- A 1:1 is opened only if it exists or the pair has a shared reason (accepted agreement, same group, same event in
  its window: `_chat_shared_reason`). A letter alone is not one. Otherwise nothing is posted and nobody is told.

**Complication:** At founder UAT on a phone (2026-11-06) the Share list opened on past hikes and Clarity Nights whose
long titles overlapped. The founder typed a three-letter name, saw no person, and concluded people could not be
found (no profile started with those letters; second and third names are never matched). Recipients the founder
invites by email to a public (one-to-many) letter get email only, never a chat card.

> Founder, verbatim: "what demotivates me a bit is that I first finding events and only then people."
>
> "Also sharing with an event that is outdated, that makes no sense or does it? I mean only with current or
> upcoming events, right?"
>
> "when letters are sent to people, they are notified in chat. And also when canvases are shared, it's
> probably the same" (and "future artifacts too probably")

**Question:** Show people before anything is typed, find a person by any word of their name, offer only events
that still matter, reach invited letter recipients in chat, and tell the owner when a share could not be delivered.

## Appetite

Blast radius: medium-high (the search every people picker uses, the letter delivery trigger, the share RPC's
return). Reversibility: medium. Decision density: low after the founder answers below.

## Decisions already made (founder, 2026-11-06)

- **D1 Order:** people, then events, then groups.
- **D2 Events offered:** upcoming, running (now is before start plus duration) and recently started only. This reverses P1515 3k for new additions.
  Window (founder, 2026-11-07): not started, running, or started within the last 7 days.
- **D3 Chat delivery for every artifact share,** letters and canvases now, later artifacts by kind.
- **D4 Paperclip:** shared canvases join points and stories in the chat attach menu; letters do not.
- **D5 Reach:** no open search by handle for non-admins; the admin finds everyone (already true); strangers connect
  through the personal code (P1556).

## Solution

1. **People before typing.** On focus, the People section lists up to 8 people above Events and Groups: for a
   member, people in their relationship scope ordered by the latest of letter sent or received, agreement accepted,
   witness, or chat message with them; for the admin, the same relationships (not the whole directory). It comes
   from a new owner-only read; `search_profiles` keeps its minimum and rate limit. Typing narrows as today. Row text
   wraps to at most two lines and never overlaps another row at 320px.
2. **Search by any word.** `search_profiles` matches when the query is a prefix of the whole name, of any word of
   the name (split on spaces, hyphens, apostrophes and periods), or of the handle. A query with a space keeps
   matching the whole name. Whole-name prefix matches rank first. Input stays literal (P878 mitigation 1). Scope,
   admin branch, minimum, rate limit, 8-row cap and the `@`-means-email rule unchanged.
3. **Events offered.** `get_canvas_share_targets` and `share_canvas` apply the D2 window to new additions, so the list
   still equals what the server accepts. Events already on a canvas keep admitting. Today the date of an
   already-shared event row is read from the offered list (`canvas-share-control.tsx:421`), so the panel must also
   return the date of every event already on the canvas. The empty-list text covers an owner whose events are all
   past.
4. **Invited letter recipients reach chat.** A delivery the **sender** creates (sealing or adding a recipient) posts
   a letter card in their 1:1, for one-to-many letters too. A delivery a reader creates by opening a public link
   (`create_letter_delivery`, `create_letter_delivery_on_open`) never posts. The distinction is recorded on the row
   by the server function that creates it, never inferred from status or caller. Recipients without an account get email only, with no backfill.
5. **A share opens the 1:1 (founder, 2026-11-07).** A canvas share with a person, or a delivery the sender creates
   for a letter, may open the 1:1 even when the pair has no shared reason: the sender chose this person, and a letter
   already reaches them by email, the heavier channel. Blocks and the sender's 20-new-DMs-a-day limit still apply,
   and the recipient can block from the chat. Reader self-enrolment on a public letter never opens one (4). Plain
   `start_dm` keeps the shared-connection rule. When a post is still skipped (block, limit), `share_canvas`, the seal and the
   letter recipient add report which recipients were skipped; the Share panel says "Added. Not sent to chat." and the
   letter's send confirmation names the skipped recipients. Not stored.

   > Founder, 2026-11-07: "a rare user would know email of the other person ... writing in chat is much less than
   > sending an email ... a chat right now doesn't trigger any notification"
6. **Paperclip.** The attach menu adds a Canvases tab listing the sender's published canvases this chat may carry, exactly the server rule
   `_chat_can_attach` (`p1536_canvas_draft_versions.sql:1146`): in a 1:1, the other person is on the canvas
   **directly** (a person entry; admission through a group or event does not count); in a channel, that group or
   event is on it, sent as the existing `canvas`
   attachment. Link-only (no direct entry) and unpublished canvases are not listed, though the server
   accepts a link-only one: the card resolves only through admission and a published version
   (`p1536_canvas_title.sql:90-111`), so it would show unavailable to the recipient. Attaching never shares; with none listed, the tab says to share the canvas first.
   Label (founder, 2026-11-07): "Attach" (today "Attach a point or story"; P1618, decisions.md 2026-11-05).

## Invariants

- **A message never grants access or shows a title to someone the artifact does not admit** (cards store ids and
  resolve per reader: `ArtifactAttachmentCard.tsx:3-6`, P1515).
- **Sharing and sealing never fail because of chat** (P1545).
- **Readers of a public letter never cause a post as its author** (P1545 rule, `p1545_artifacts_data.sql:487`).
- **Search scope is unchanged** (decisions.md 2026-06-06 P878; 2026-11-06 P1556).
- **Only the sender's own share or invitation opens a 1:1 without a shared reason.** Plain `start_dm`, handle
  search and reader self-enrolment keep the shared-connection rule; blocks and the 20-a-day limit apply to every
  path. This narrows P1556's "the P1545 share path keeps its rule" (decisions.md 2026-11-06) for shares only;
  record the change at /kdd.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Any-word matching fills the 8-row cap for short admin queries | MITIGATE | Whole-name prefix ranks first; typing more narrows |
| A large invited list counts toward the sender's 20-a-day new-DM limit | ACCEPT | Over it, the post is skipped and the owner told (5) |
| A removed and re-added person gets a second card | ACCEPT | Existing P1545 behaviour |
| Paperclip label is asserted in several tests | ACCEPT | Update with the label |
| Anyone who knows a member's email can open a chat with them by sending a letter; every member can with the admin by sharing a canvas | ACCEPT | Founder 2026-11-07: email is not guessable, chat is lighter than the email already sent, block exists; about 200 members. Revisit on a report of unwanted messages |

**Non-Goals**
- Do NOT change who can read a canvas or letter.
- Do NOT add push, email or a notification centre.
- Do NOT build the live invite in chat (P1644 stays shelved, decisions.md 2026-11-05).
- Do NOT open people search to strangers or change handles (P1651).
- Do NOT add letters to the paperclip.

## Acceptance Criteria

- [ ] As a member with relationships, on a 320px phone, focusing the Share field shows those people above Events
      and Groups before typing, and no row overlaps another; the admin sees their own relationships, not everyone.
- [ ] Every person in that list can be added (the server accepts them).
- [ ] As a non-admin with fixtures "Ana Maria Lopez", "Jean-Luc Picard" and "Sean O'Brien" in scope: "lop", "mar",
      "luc", "brien" and "ana m" each find their person; "%an" and "a_a" match only literally.
- [ ] A non-admin searching a word of a profile outside their scope finds no one (the admin row excepted).
- [ ] A finished event that started 8 days ago is not offered and `share_canvas` refuses it; a 10-day event that
      started 8 days ago, and one that started yesterday, are offered; an older event already on a canvas still
      admits attendees and shows its date.
- [ ] Sealing a one-to-many letter with two invited recipients who share a reason with the sender puts one card in
      each 1:1, including a recipient with no shared reason; a reader opening the public link creates no message;
      sealing succeeds if posting fails, and the confirmation names a blocked recipient as not sent to chat.
- [ ] Adding a person with no chat and no shared reason opens the 1:1 with the canvas card; inviting such a person
      to a letter does the same; a blocked pair gets no card and the panel says "Added. Not sent to chat."
- [ ] Neither person can start a new 1:1 with a stranger through plain New message (rule unchanged).
- [ ] In a 1:1 with someone directly on a published canvas, the paperclip lists it and attaching sends a canvas
      card that opens for them; a canvas they reach only through a group or event, a link-only, an unpublished and
      a not-shared canvas are not listed.

## Related

- done/p1545 (artifact chat delivery) · done/p1515 (sharing model, panel, 3k) · done/p1556 (personal codes) ·
  p1644 (live invite, shelved) · p1469 (letter loop v6) · p1651 (readable handles)
- decisions.md 2026-11-05 (P1644; P1618) · 2026-11-06 (P1556) · 2026-06-06 (P878)
- Promoted from a UAT conversation, 2026-11-07.
