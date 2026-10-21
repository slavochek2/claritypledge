---
status: in-progress
type: story
rank: 45
workstream: clarity-canvas
created_date: '2026-10-19'
tags: [sharing, privacy, rls, canvas]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: heuristic
---

# P1515: Share an artifact with events and groups; everything inside follows

## Problem

**Situation:** Points and stories are public (anyone) or private (author only), fixed when created
(`docs/definitions.md` §Story Visibility Model). Letters already widen private for their readers,
but by frozen copies of the sender's own stories made at sealing, and one-to-many letters drop
private stories entirely. P1508 builds the first Clarity Canvas and shows others only public points.
**Complication:** The sales mastermind (`docs/goals.md` 3a) runs on attendees reading each other's
canvases, and owners will not publish their business bets to the internet.
**Question:** How does an owner share an artifact, first the canvas, with the people of one or more
events and groups, so that what is inside is readable by exactly them, live, in a model later
artifacts and letters can use?

> Founder, 2026-10-17: "Anybody who sees the Clarity Canvas sees all the points and stories inside
> it, including those attached by others ... my story inherits the privacy paradigm, right?"

> Founder, 2026-10-19: "Is it like artifact in Cloud where I can share the visibility or like notion
> pages where I share with some people whom I know their email or some events or some groups."
> "We do multiple events as well, right? ... Or a group, right? The whole members of the group."
> "Shared can be with different entities including events, groups and later who knows what."
> "What we need to optimize is not speed of execution, but being good. Like if we can reuse
> something, we reuse."

## Reconciliation with shipped P1508 (2026-10-21, /dev)

P1515 was written before P1508's last rounds (R9 to R14) shipped. Where they differ, what shipped
wins, and this spec is read as follows:

| P1515 said | Shipped in P1508 | Read as |
|---|---|---|
| A canvas is its owner's points carrying the "project tag" (a user hashtag) | R9: a canvas is the reserved **system** tag `canvas_<name>`, written only by the service role; a typed `#canvas_x` never becomes a tag | The canvas record is keyed by (owner, **canvas name**), the part after `canvas_`, stored lowercase. "Project tag" anywhere below means this name. Membership is `system_tags` containing `canvas_<name>` plus a box tag, current versions only (`getCanvasPoints`). |
| The address keeps resolving the handle | R14: `/p/<handle>/canvas/<name>` (`canvasPath`) | The canvas function takes the owner's id (resolved from the handle, as today) and the name. Event-page links use `canvasPath`. |
| "The panel gains an add your story composer under the card" | "+ Add a story" already writes a story in place from the panel (`LetterPositionStoryDialog`, `onAddStory`) | No new composer. The existing in-place composer is routed: an admitted reader who is not the owner calls the checked add function (a private added story); the owner keeps the ordinary path. See Decision D-A below for visitors who are not admitted. |
| Canvas reads replaced by one server function | The canvas page serves Back from the shared return cache (`list-return-cache`, surface `'canvas'`; POP only, cleared on auth change and after every own write, never refilled from an older generation) | The new read goes through the page's existing `read()`, so it keeps writing and serving the `'canvas'` entry under the same rules. The new checked writes (position, add story, remove story, share, unshare, host removal) clear the cache, and the P1364 drift guard covers the new RPC names. The focus and panel-open refetches are fresh reads, never a cache serve. |
| Others see public points only until this spec | R14(c): canvas code is on prod but dormant; no canvas exists there | The founder's two draft canvases (sales mastermind, organisations) stay on the **test** database. This build seeds nothing to prod; the migrations reach prod only through `/ship`, and a canvas reaches prod only by a later founder-approved seed. |
| Positions on the canvas: owner and admitted readers | `getCanvasPositions` reads every position the base policy returns | Replaced by the canvas function's positions; compare (`?with=`) builds its people from them. |

**Decisions this raised (founder, pending):**
- **D-A, stories by others on public points.** P1508 shows every author's visible story linked to a
  canvas point (D6). This spec's "nothing else is inside" would drop public stories that visitors
  added from the canvas or the point page. Built default (agent recommendation, reversible in one
  function): keep public stories by anyone on public canvas points; exclude every other non-owner
  story except added stories. Private letter replies stay out either way.
- **D-B, "view as" preview (Open Question 2).** Built default: not in this spec; a follow-up.

## Phase 3: one person, and anyone with the link (founder input, 2026-10-21)

Founder, 2026-10-21, beyond events and groups: (1) share a canvas with one person by their handle or
nickname, like Notion's "Email or group" invite field; (2) a "make public" switch, like Notion's
"General access" or a Claude artifact's "Only you / anyone with link", that opens the canvas with all
its points and stories and can be switched back to private. Reason given: to test the comparison view
from a second account without creating a group or event that day ("overly complicated"). Reference:
the share panels of Notion and of a Claude artifact (one invite field, a "people with access" list, a
"General access" dropdown, "Copy link").

Founder then delegated the remaining calls ("you continue and finalize"). Decided:

- **One invite field** adds a person, an event or a group. People are found through the existing
  `search_profiles` (P878: signed-in, relationship-scoped, prefix match, rate-limited); nobody can
  list all users through it.
- **A person entry** is a new audience kind: that person reads and contributes while the entry exists;
  the owner removes it with ×. The reader line says `Shared with you by <owner name>`.
- **General access**: `Only people added` (default) or `Anyone with the link`. With the link: signed-in
  people read, take positions and add a story; signed-out visitors read only. Switching back ends it on
  the next request. Rows still never change visibility: content is served by `get_canvas` alone and
  never appears in the feed, profiles, point or story pages, the event page list or search.
- `get_canvas` becomes callable by anon again, returning content only while the canvas is open to
  anyone with the link (not-found otherwise, unchanged shape).
- Stories added by someone who later loses access stay as built (they leave with their author; the
  owner still sees them). Self-admission through an open event or public group is allowed; the panel
  says so next to such an entry ([FOUNDER DECISION] wording at UAT).
- All new strings are [FOUNDER DECISION] at UAT (UI Contract).

Phase 3 acceptance criteria:
- [ ] O adds person P by handle: P reads everything, takes a position, adds a story; removing P ends it on P's next request.
- [ ] The invite field finds only people `search_profiles` returns for O; O's own events and groups are listed as before.
- [ ] O switches to `Anyone with the link`: a signed-in stranger reads, positions and adds a story; a signed-out visitor reads and cannot write; switching back returns not-found to both on their next request.
- [ ] While open to anyone, none of the canvas's rows appear in the feed, `/stake`, profiles, point or story pages, or REST for anyone but their authors (curl evidence).
- [ ] The owner control reads `Private · …` or the link state; the panel shows people, events and groups in one list.

## User Stories

1. As an owner, my canvas is private until I share it, and I see at a glance whether it is.
2. As an owner, I share my canvas with events I host or attend and groups I belong to, see who can
   read it, and stop sharing with any of them at any time.
3. As an attendee or group member, I open a canvas shared with me, read everything in it (private
   included), take positions, and add my own stories.
4. As someone who adds a story to another person's canvas, my story is readable only through that
   canvas, never published, and never pulled into any other place by someone else.
5. As a person who leaves a group, or whom a host removes from an event, I can no longer read what
   was shared through it from my next request on.
6. As an attendee, I find the canvases shared with my event on the event page.

## Appetite

Blast radius: high. A new way for private content to reach other people, in the repo's most
incident-prone area. Reversibility: medium (new tables and functions; no existing row or policy
changes meaning). Decision density: low; the founder answered eight decisions on 2026-10-19, and
three review rounds' worth of consequences are written below.

## Solution

### Model (founder, 2026-10-19)

- An **artifact** has an owner and an **audience**: no entries (Private) or a list of entries
  (Shared). An entry is an **event** or a **group**. People-by-email and link entries fit the same
  list later; not built here.
- **Shared is live:** who is in an entry is decided when someone reads (registration, membership),
  never copied onto rows. The owner approves the entry, not each person (founder: "the whole members
  of the group"). The owner can see who is in it at any time.
- **No public switch** *(superseded 2026-10-21 by Phase 3 below: the owner may open the canvas to
  anyone with the link; rows still never change visibility)*. A point's or story's own public/private setting never changes (2026-03-24
  [product]); public content stays public everywhere, so anyone with a canvas link sees its public
  points (P1508). "Private" on the control means: private content only you can read.
- **Letters are not moved** (they reach people by sealed copies, personal links and signed-out
  readers, a different promise). What is reused is the protection pattern letters use: content goes
  out only through functions that check the reader, never by widening table access (2026-10-19,
  founder: reuse where it fits).

### Enforcement: one checked entry point, base access unchanged

- **Every existing read policy on points, stories, story links, positions, versions, histories and
  verifications stays as it is.** Widening them would surface shared private content on the feed,
  `/stake`, point and story pages, profiles, realtime and the offline cache, because those read by
  policy alone (census below).
- Canvas content for anyone but the owner comes from **one server function** that checks the reader
  through an internal access check clients cannot call (same pattern as P1512's chat access check).
  It serves **everyone, owner included**, and replaces P1508's direct reads on the canvas page (the
  owner needs added stories too, which ordinary loaders never return).
- **Writes by the audience go through checked functions too:** take or change a position on a canvas
  point, add a story to a canvas point, remove one's own added story. Each checks current access and
  that the point is in that canvas. Knowing an id grants nothing: today's direct position write
  (any verified user, any point id) stays unchanged for the rest of the product, and a position
  written that way by someone not admitted is never shown on the canvas.
- **The card on the canvas (amends P1508's card contract).** In the canvas side panel the production
  point card renders from the canvas function's data, not from its usual loaders (`getPoint`,
  `getStoriesForPoints`), and its position buttons call the checked position function. The panel
  gains an "add your story" composer under the card and a remove control on the reader's own added
  stories; both call the checked functions. Any other card action that would read or write through
  the ordinary services is hidden on the canvas for content the reader does not own. These are the
  only card changes; feed, `/stake` and point pages keep today's card.
- **Adding a story creates a new story**, private, authored by the reader, recorded as added to this
  canvas point. Existing stories cannot be attached. The author sees it in their own story lists as
  any private story of theirs and may use it as they use any of their own stories; the promise is
  that no one else can move it. It carries no link to the owner's point, so nothing of the owner's
  travels with it (into letters or elsewhere).

### What is inside a canvas (exact, not recursive)

1. The owner's current-version points carrying the canvas's project tag and a box tag (P1508).
   Superseded versions are not inside.
2. The owner's own stories linked to those points.
3. **Added stories:** stories other people added through this canvas, recorded per canvas, written
   only through the checked add function by the story's author. These are not ordinary story links,
   so they never appear under the point elsewhere and are never copied into letters.
4. Positions on those points held by the owner or by people who can currently read the canvas, shown
   with names.

Nothing else: other people's stories linked to the owner's points by other routes (for example
private letter replies) are not inside. Points linked to a returned story, and stories embedded in
one, are returned only if public.

### Who can read

- **The owner**, always, including added stories.
- **An event entry:** the event's host, and people who registered no later than 12 hours after the
  event starts, the existing event window (P1256, reused by P1512 for event channels), minus anyone
  the host removed. Session 2 of the mastermind is its own event; the owner adds it.
- **A group entry:** current members of the organization.
- **Both directions (P1181 lesson):** an entry admits readers only while the owner is still admitted
  to it (hosts or registered for the event, member of the group). An added story is readable by
  others only while its author can still read the canvas; its author always reads it.
- **Adding entries:** the owner may add only events they host or are admitted to, and groups they
  belong to. Removing an entry, deleting the event or group, or deleting the canvas record ends
  access; nothing ever falls back to a wider audience.

### Host removal (founder, 2026-10-19)

Today only the attendee can delete their own registration (`20260118_create_events.sql:77`), and
registering is self-service. This spec adds: the host removes a person from the event, which deletes
their registration and **records the removal so they cannot register again** for that event. The
removal record is authoritative: every event admission check (readers and owners) consults it, so a
registration that races the removal still admits no one, and registering is refused once it exists.

### Canvas record

P1508 has no record. This spec adds one per (owner, project tag), created when the owner first
shares; no record or no entries means Private. The project tag is stored lowercase without `#`; the
address keeps resolving the handle to the owner, so a handle change does not orphan the record.
Entries are deleted with their event, group or canvas (cascade), which only ever narrows access.

### Owner experience (founder, 2026-10-19)

- A control at the top of the canvas, owner only. ONE visibility idea (founder, 2026-10-21): a canvas is
  Private and the owner chooses who else sees it; there is no third "Shared" setting. Words in the UI Contract.
- Its panel, per entry: the event or group name and how many people it admits, with their names for
  events (registration lists are public by design, P1226) and for public groups; a private group shows
  its count only, because members cannot see each other there today (`membership_select`, P1010).
  No combined total across entries. Add an entry from the owner's own events and groups; remove one.
- Readers who are not the owner see one line naming the first entry that admits them, events before
  groups: "Shared with you through <name>". [FOUNDER DECISION: approve or change this line and the
  panel copy at UAT.]
- The event page lists the canvases shared with it (owner name and project tag, linking to the
  canvas) to the people that event entry admits, and to no one else.
- Cards inside look as in P1508.
- **Agents never share:** no agent tool or chat action calls the sharing functions. The database
  cannot tell an agent from a person, so this is a product rule, not a database guarantee.

### Required alongside

- **Letter sealing** must not copy the statement of a private point the sender does not own (today it
  copies every linked point; harmless until audiences hold private point ids, because anyone may link
  their own story to a point id they know). Any such link grants its author nothing else: the canvas
  ignores it (only added stories count) and base read policies are unchanged.
- **`docs/definitions.md` §Story Visibility Model** gains the artifact-audience context once built.
- **Read-path census:** keep the table below in the spec, updated by the build, with one negative
  test per row that must deny.

## Invariants

- Existing read policies on points, stories, story links, positions, versions, histories and
  verifications are not widened. Shared private content is reachable only through the checked
  canvas functions.
- No path makes private content readable to anyone except the owner, the content's author, or a
  person the checked access function admits for an artifact containing it.
- Access fails closed: an unknown entry kind, a missing event or group, a removed person or a failed
  lookup denies.
- The list of entries changes only by the owner's own action in the UI.
- Every point carrying a `canvas_` system tag is private, for every role including the service role (a database
  trigger refuses public + `canvas_`, migration 20261021170000). Rows seeded public before that stay (visibility is
  immutable, p586); `share_canvas` refuses a canvas that still holds one.
- Sharing is refused for a cancelled event. One added story per person per point (unique key), as P465 does for links.

## UX Notes

- Owner, Private: the panel offers the owner's events and groups.
- Owner, Shared: entries with counts; readers listed.
- Admitted reader: everything; the reason line shows.
- Anyone else, signed in or not: not-found, nothing at all, no hint that the canvas or its content exists (founder ruling 2026-10-21: the audience decides everything inside a canvas, so even a point that is a public row says nothing here).
- Access removed: the server refuses from the next request; the canvas page refetches when the tab
  regains focus and when the side panel opens, and shows the reduced view. What was already on screen
  is not recalled. Signing out clears private content at once (P1508). A read that settles not-found
  evicts the Back cache entry, so Back after that asks the server and shows not-found. Back to a cached
  canvas as a READER is followed by a silent fresh read (the owner's Back is unchanged, P1364). A failed
  or timed-out position save re-reads the canvas, so the card shows what the server holds.
- An event the owner shares before anyone else registered admits only the host and the owner.
- A failed share or unshare shows an error and leaves the previous state.

## UI Contract

Founder ruling, 2026-10-21: there is ONE visibility idea. A canvas is **Private**, and its owner chooses
who else sees it; everything inside inherits that (the canvas's audience, not a point's or story's own
flag, decides who reads it there). A shared icon (people) marks the canvas header, each point card and each
story inside, and the composer, so every contributor knows who reads what. No per-item lock is shown inside
a canvas. Every string below is **[FOUNDER DECISION: approve or change at UAT]**.

| Where | String |
|---|---|
| Owner control, nobody added | `Private · only you` |
| Owner control, entries | `Private · shared with <entry names>` (names joined "A, B and C"); fallback `Private · shared` when the audience could not be read |
| Owner panel | title `Who can see this canvas`; line `It is private: only you, until you share it. Everything in it follows, and you can stop at any time.`; empty `Only you can see it.` |
| Panel entry | name; `N person can see it` / `N people can see it`; names for an event or a public group; a private group adds `(names are private)` and shows no names; an entry the owner has left reads `You are no longer part of this, so it shows no one your canvas.` |
| Panel add | label `Share with`, choice `Choose an event or group` (events, then groups; only the owner's own, not already added), button `Add` (shown once something is chosen); remove control named `Stop sharing with <name>`; nothing to add: `You have no events or groups to share with yet. Register for an event or join a group first.` / `That is all of your events and groups.` |
| Panel errors | `Could not share. Nothing changed.` · `Could not stop sharing. Nothing changed.` · `Could not load who this canvas is shared with.` (the list never changes unless the server confirmed) |
| Reader line | `Shared with you through <entry>` (an event links to its page) |
| Shared icon | owner: `Shared with <entry names>`; reader: `Shared with you through <entry>` |
| Composer (a private story) | owner: `Visible to you and <entry names>` or `Visible only to you`; when the canvas is shared but the audience could not be read, `Visible to you and the people you shared this canvas with` (never `only you`; a refresh whose audience read fails keeps the audience already loaded); reader: `Visible to you and everyone <owner name> shared this canvas with`. An owner's story on a public point keeps the public line (`Matches point visibility`). |
| An added story | `Added by you` / `Added by <name>`; its author's control `Remove from this canvas` (the story stays in the author's own list) |
| Event page | section `Canvases shared with this event`; each row `<owner name> · <canvas name>`, linking to the canvas |
| Phase 3: owner control | while the link is open: `Anyone with the link` (instead of `Private · …`) |
| Phase 3: invite field | label `Add a person, event or group`, placeholder `Name, event or group`; people come from the profile search (3+ letters, people the owner has a relationship with), plus the owner's own events and groups; picking one adds it. Kinds shown at the right of each choice: `@handle` / `Event` / `Group`. Nothing found: `No one found. You can add people you already have a letter or an agreement with.` / `Nothing matches yet.` / `Searching…`; nothing to add: `That is all of your events and groups. Type a name to add a person.` / `You have no events or groups to share with yet. Register for an event or join a group first, or type a name to add a person.` |
| Phase 3: who has access | heading `Who has access`; first row `You (owner)` (with `Only you can see it.` while restricted and nobody is added); a person row: name and `Can read it and add to it`; an event row adds `Anyone who registers in time can see it.` and an open group row `Anyone who joins can see it.`; each removable with `Stop sharing with <name>` |
| Phase 3: general access | label `General access`; choices `Only people added` / `Anyone with the link`; notes `Only the people, events and groups above can open it.` / `Anyone with the link can read it. Signed-in people can also take positions and add stories.`; panel line while open `Anyone with the link can open it. Switch it back to "Only people added" at any time.`; error `Could not change who has access. Nothing changed.` |
| Phase 3: copy link | button `Copy link`; `Link copied` / `Could not copy the link.` While the canvas is open to anyone with the link, the copied address carries an unguessable token: `<origin>/p/<handle>/canvas/<name>?k=<token>`; without the token the address opens nothing for anyone not added. Turning general access off and on again makes a NEW link and the old one stops working; the panel says so (`Turning it off and on again makes a new link, and the old one stops working.`). |
| Phase 3: reader | a person entry: `Shared with you by <owner name>`; only the link: `Anyone with the link can see this canvas`; icon `Shared with anyone with the link`; composer `Visible to you and anyone with the link`. A signed-out visitor sees no position buttons and no story prompt. |
| Failures | `Failed to save position.` · `Failed to withdraw position.` · `Failed to save story. Please try again.` · `Failed to remove your story. Please try again.` |

Not on a canvas for a reader, because each opens a page that reads through the ordinary loaders: `Details →`,
the card's `⋯` menu, a story's own page. Signed out, or signed in without access: not-found, no hint.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A read path admits shared private content outside the canvas | MITIGATE | Base policies unchanged; census with a negative test per row; an attendee is also tested outside the canvas. |
| Anyone who registers in time can read event-shared canvases | ACCEPT | Founder, 2026-10-19: owners see the names; the host can remove a person durably. |
| Group membership follows the group's own joining rules | ACCEPT | The owner picks only groups they belong to and sees who is in them. |
| The event room pairs only on public points with the event tag; canvas points carry the project tag (`compare-service.ts:27`) | DEFER | Open Question 1, before the event. |
| The host's event preparation view counts private event-tagged points | ACCEPT | Pre-existing, counts only; out of scope. |
| An agent session calls the sharing function | ACCEPT | Product rule, no agent tool exposes it. |

**Non-Goals**
- Do NOT widen any existing read policy, and do NOT change any point's or story's own visibility.
- Do NOT move letters onto this model; the only letter change is the sealing filter above.
- Do NOT merge or rebase the P1181 branch.
- Do NOT build people-by-email or link entries, host approval of registrations, notifications, or
  the event-origin default (a canvas made for an event starting shared; it moves to the Clarity Chat
  canvas spec, where canvases are created).

## Known Limitations

Accepted, recorded so nobody rediscovers them:

- **Reply letters drop the point.** The people a letter is sent to write REPLY stories, and a reply story links to the sender's
  private points. Since letter sealing skips a private point the sender does not own (migration 20261021100100), a reply letter
  sent back to the point's owner now omits that point from its snapshot. Accepted: the same filter is what closes the leak to third
  parties, and the owner already has the point. (Recorded in the header of migration 20261021170000; the seal file is unchanged.)
- **A removed reader keeps a private point id.** Someone who was admitted, kept a private point's id and was then removed can still
  write a position on it over REST: the ordinary position write policy is unchanged by ruling. `get_canvas` hides it from everyone
  (positions show only for the owner and current readers), but the owner's point page shows it.
- **A host moving `events.datetime` moves the 12-hour window** for everyone registered, because access is computed from it.
- **Decided 2026-10-21 (founder delegated; kept as built):** an added story stops being readable by
  other readers once its author loses access (the owner still reads it).
- A position save that times out and lands late can undo a withdrawal made after it: the shared
  save queue stops ordering past its bound (`use-online-write-guard`), as on the feed. The page
  re-reads after a failed save, so the card ends on what the server holds at that moment.
- The private-canvas-points trigger compares tags case-insensitively while `get_canvas` matches
  exactly; only a privileged writer can create the mixed-case tag. `share_canvas` checks current
  versions at share time only, so deleting a private current version can make an older public
  version current on an already shared canvas (nothing private is exposed).

## Acceptance Criteria

Actors on test: owner O, attendee A (registered in time), late registrant L (after the window),
removed person R, group member G, non-member N, signed-out visitor V.

- [ ] O's canvas with no entries shows Private; A, N and V see not-found (nothing, even where a point is a public row; founder ruling 2026-10-21).
- [ ] O shares with event E: A reads private points, O's stories, positions and the reason line; L, R, N and V do not.
- [ ] A takes a position and adds a story; O and other admitted readers see both with A's name; the story appears under that point nowhere else (feed, `/stake`, point page, profile).
- [ ] O adds group Y: G reads everything; after G leaves Y, G's next request returns not-found.
- [ ] The host removes R: R's registration is gone, R cannot register again, R's next request returns not-found.
- [ ] Removing E removes A's access on A's next request; G keeps access.
- [ ] O leaves Y (or cancels at E): that entry admits no one.
- [ ] O can add only events O hosts or is admitted to and groups O belongs to; a direct call with another event or group is refused.
- [ ] A private letter reply linked to one of O's points is not shown on the canvas.
- [ ] Canvas admission grants no base access: A, while admitted, reads O's private points, O's private stories and the links and positions on them directly (REST, point page, story page, `getStoriesForPoints`) and gets nothing; N and V likewise (curl evidence on test). A still reads A's own rows as today.
- [ ] O sees A's added story; after A loses access, O still sees it and other readers do not.
- [ ] R, after removal, writes a position on O's private point directly; the canvas does not show it.
- [ ] A seals a letter containing a story A wrote; no private statement of O's appears in the letter.
- [ ] Removing access while A has the side panel open: A's next refetch (focus or panel open) shows the reduced view.
- [ ] After that refetch shows not-found, A leaves the page and presses Back: not-found, not the revoked canvas (control: before the removal, Back shows the cached canvas).
- [ ] The panel shows each entry with its count, names for events and public groups, a count only for a private group; only O sees the control.
- [ ] In the side panel A sees the card from the canvas data, takes a position, adds a story with the composer and removes it; no request from the panel goes to the ordinary point or story loaders for O's private content (network log).
- [ ] A links one of A's own stories directly to O's private point id; the canvas does not show it and nothing of O's becomes readable to A.
- [ ] The event page lists canvases shared with E to E's admitted people only.
- [ ] Feed, `/stake`, profiles, point and story pages, and letters show the same content as before for all existing data.
- [ ] `docs/definitions.md` describes the artifact audience.

## Read-path census (review 2026-10-19, latest definitions on main)

| Path | Who reads a private row today | With this spec |
|---|---|---|
| RLS: points, stories, story links, story versions, story-point history, position history | Owner / author (positions: point owner sees all on their points) | Unchanged |
| RLS: story verifications (ALTER in p1278) | Letter and live participants | Unchanged |
| Realtime on stories, points, positions | Same as RLS | Unchanged |
| `getStoriesForPoints`, `getPoint`, `getStory`, `getStoryWithPoints`, `getStoriesByAuthor`, slug resolvers, profile linked stories, offline cache | RLS only | Unchanged; canvas admission adds nothing here (negative test on the owner's private rows) |
| Feed and validator lists (`getPublicPointsFeed`, `getPointsByValidator`, story feeds) | Explicit public filter | Unchanged |
| P1508 canvas reads | Public filter for non-owners | Replaced by the checked canvas function |
| Event room (`getTagStatements`, `getPositionsFor`) | Public points by event tag | Unchanged (Open Question 1) |
| `seal_and_send_letter` | Copies linked point statements with no visibility filter | Drops private points the sender does not own |
| Letter reading functions | Snapshots only | Unchanged |
| `get_letter_position_stories` | Receiver's private stories to the sender, per delivery | Unchanged (model for added stories) |
| `get_event_prep_host_view` | Host; counts private event-tagged points | Unchanged (accepted) |
| P1512 chat attach check (branch) | Public or own | Unchanged |

## Open Questions

1. **The event room.** It pairs people on public points carrying the event tag, so no canvas point
   reaches pairing even when public. Either a follow-up spec lets the room pair on points from
   canvases shared with the event, or the first event pairs by hand. Founder decision before the
   event.
2. **The owner's "view as" preview (moved here from P1508 fifth round, D9).** Founder, 2026-10-21:
   left out of this build. Kept here for a follow-up. The founder wants to
   see the canvas as someone else sees it. A preview built on P1508's page could not match a real
   signed-out view (the card reads the session itself, and a click would write the owner's real
   position). With this spec's server function, the preview can be served by that same function
   for a chosen reader kind: a stranger, or an admitted attendee. Decide whether it ships with this
   spec.

## Related

- P1508 Clarity Canvas (first artifact; this spec adds its record and replaces its non-owner reads)
- P1512 Clarity Chat v1 (event access window and the internal access-check pattern) · P1256 event
  grace window · P1181 community-scoped letters (parked branch; lessons reused, code not) · P1331 ·
  P1089 · P1501 · P1010 organizations · P1226 RSVP lists public by design · P1034 story-link author
  binding · P977 position stories bounded per delivery
- Rulings: `docs/decisions.md` 2026-03-24 [product] "Privacy simplification" (immutable visibility;
  "shared" cut as "all event co-participants", unenumerable and per story; this spec instead puts a
  named, enumerable audience on the artifact and serves it through checked functions);
  2026-10-19 [product] canvas as owner artifact. `docs/technical/database.md:783-785` (consumers
  trust RLS), the reason base policies stay unchanged.
