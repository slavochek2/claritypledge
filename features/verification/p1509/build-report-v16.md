# P1509 build report: Clarity Chat v16 (real test-project data)

Route: `/tree/clarity-chat-v16` (dev only; the chunk is not emitted by `vite build`, verified with 0 v16
markers in the production build output). Code: `src/app/prototypes/clarity-chat-v16/`. Branch
`feature/p1509-clarity-chat-v12`, worktree w5, head `2b235e259` plus this report. Nothing pushed.

## How to run it

1. `npx tsx scripts/p1509-seed-personas.ts` seeds seven personas on the **test** project (the script refuses any
   other URL). `--dry-run` prints the plan and what a reset would delete; `--reset` removes only persona rows.
2. Start the dev server in w5 and open `/tree/clarity-chat-v16`; the strip's **Sign in as Bob / Dana** signs in as a
   persona. Leaving the page signs the persona out again.
3. `?real=loading|error|empty` forces every real-data surface into that state; the old mock `?state=` still works.

## Step 0: rebase

Rebased onto `main` (15 commits on top of 41 new ones, including P1506): no conflicts, no v15 test changed.
Post-rebase baseline: 588 test files, 6580 tests, exit 0. Final suite on the head commit: **594 files, 7034 tests,
exit 0**. All ten commits of this run passed the pre-commit hook (ESLint, build, full tests) at commit time.

## Safety: no real email, no prod, no password in source

| Invariant | How it holds | Evidence |
|---|---|---|
| Prod never read or written | Seed aborts unless the URL is the test project; the prototype refuses to mount and every write refuses unless `VITE_SUPABASE_URL` is the test project | `p1509-v16-seed-guard`, UI tests "C3" |
| No real email leaves | **Checked before the first invite: the test project's functions hold a live Mailgun key and no `APP_URL` (links would point at prod).** So: persona addresses use the reserved `.invalid` domain; the seed never invokes an edge function; seeded RSVPs are pre-marked as mailed for every scheduled kind; the invite flow refuses any non-persona recipient **before any request** | Live: invite to an outside address shows "Prototype invites go only to test personas." and the network log shows **0 requests** after the click (no `clarity_agreements` POST, no `create_agreement_with_profile`, no `send-agreement-emails`), repeated twice |
| No new tables or migrations | None added | diff vs main |
| Only real writes: seed, RSVP, guarded invite | Join/leave and positions are local overlays labelled "Not saved: prototype"; Home cards drop the production ⋯ (its Delete is a write) | UI tests "C8", "fix 3b" |
| Password not in source or a VITE_ variable | Each seed run writes fresh random passwords to a file **outside the repo** (0600, dir 0700). A dev-server-only endpoint (`apply: 'serve'`) signs in and returns only a session; it checks loopback, no proxy headers, Host, Origin, Sec-Fetch-Site and JSON | Reproduced that an in-repo git-ignored file was served by Vite (HTTP 200), then moved it; live probes: forged Host/Origin/proxy/text-plain all 403; `/@fs/` path to the file 403 |
| Seed reset deletes only its own rows | Tag = ownership. The reset derives every foreign key from the migrations (104 edges into deleted tables, cross-checked against the live schema: 127/127) and refuses, deleting nothing, if any row it would cascade or be blocked by belongs to someone else or to nobody | Live known-good control 0 problems, known-bad control 5; real reset + reseed run several times, exit 0 |

## Real versus mock

| Surface | Real or mock | Source |
|---|---|---|
| Sign-in / viewer | **Real** (persona session; viewer = signed-in profile's slug) | persona endpoint + `supabase.auth.setSession` |
| Home feed (stories, points) and its Events/Groups widgets | **Real** | `feedRead` (getPublicPointsFeed + getPublicStoriesFeed), getPointsForStories / getStoriesForPoints, production Home widgets |
| Share picker | **Real** (own points held and own stories, private ones excluded) | getPointsForProfileDisplay, getStoriesByAuthor |
| Profiles, "You share" | **Real** | getProfileBySlug, getMembers, getEventAttendees |
| Letters (Inbox, Drafts, Published) | **Real** list; opening a letter goes to the production page | getInboxItems, getDocsByUser, getAllSentLetters |
| Groups, directory, group page, General members | **Real** | groupsRead, getOrganizationBySlug, getMembers, getMyMembership |
| Events list, event page, attendees, RSVP / cancel | **Real**, RSVP writes through the unchanged flow | getEventBySlug, getEventAttendees, isUserRsvpd, rsvpToEvent, cancelRsvp |
| Partners (Active, Invite sent) | **Real** | getAgreementsForProfile, getIncomingInvitations |
| Invite partner | **Real** for persona recipients only, with production's suggested terms and Visibility | createAgreement (unchanged) behind the persona guard |
| Admin entry | **Real** probe (server asserts `is_admin`); no persona is admin by design (single-admin index) | getAdminTopics |
| Chat channel names and dates | **Real** event title and date where the event is seeded | loadMyEvents |
| Channel access (event channels = RSVPs) | **Real** for the viewer's own seats and groups | isUserRsvpd, directory memberships |
| Messages, 1:1s, threads, forwards, unread, archive, mark-as-unread, search over chats | **Mock** (no chat tables exist; backend is follow-up 0) | `state.ts`, `mock-data.ts` |
| Mirror agent, Clarify, Rename | **Mock** | `state.ts` |
| Transcribe button | **Coming soon** (see decisions) | none |
| Voice note | **Mock**, says "no audio is recorded" | none |
| Topic vote on the event page, New draft, Invite to Clarity Live | **Coming soon** | none |
| Settings | Link to the production page | none |

## Named seeded records and the test-project query for each

| Surface | Record shown (verified in the browser as Bob) | Query (test project, REST) |
|---|---|---|
| Profiles | Bob Keller, Alice Moreau … (slugs `p1509-*`) | `profiles?select=id,slug,name&slug=like.p1509-*` |
| Home / Share picker | point "Disagreement is information, not a threat" | `points?select=statement&first_validator_id=eq.<bob>` |
| Home stories | "We left the map in the car and agreed to say out loud…" | `stories?select=content&author_id=eq.<bob>` |
| Letters Inbox | letters from Alice and Carol | `letter_deliveries?select=receiver_name,clarity_letters(sender_id,status)&receiver_profile_id=eq.<bob>` |
| Letters Drafts / Published | "Why I run the Chiang Mai circle" / "Notes from Clarity Night, Oct 2" | `clarity_docs?select=title,visibility&owner_id=eq.<bob>` |
| Groups | Communication Activism Community · Chiang Mai (organizer) | `membership?select=role,organization(slug,name)&user_id=eq.<bob>` |
| Event page | "Clarity Night, Oct 17", 4 participants | `events?select=slug,title,status&slug=like.p1509-*` |
| Partners | Alice active, Fay "Invite sent" | `clarity_agreements?select=status,partner_display_name&creator_profile_id=eq.<bob>` |

## States

Every real surface has a skeleton, an inline error with Retry (Retry refetches) and an explicit empty state.
Screenshots at 1280 for Home, Letters, Groups, Event, Partners and the Share picker in each state (18 shots,
`.qa-p1509/v16/`, names `d1280-state-<surface>-<state>.png`). All passed the live check.

## Design-system check

Rules used: `docs/design-system.md` (Button Decision Rules) and `.claude/rules/src.md`.

**Mapped:** every labelled action is the shadcn `Button`: `PrimaryButton` (the one filled button, `bg-blue-600`,
which the Tailwind config maps to the same colour as `bg-blue-500`), `OutlineButton`, `QuietButton`, and the
`destructive` variant for Leave and Delete. Blue only for actions and selection; red only for destructive actions,
failures and the LIVE pill; green only for success. No amber, orange, yellow or purple (grep). Sheets are the shared
Radix `Dialog`. A test scans the main surfaces for a 40px touch floor and one primary per view.

**Exceptions** (each with its reason in the builder's list):
- 71 raw `<button>` controls that are not buttons in the design-system sense: 22 icon controls (the 40px floor is
  above `Button size="icon"`'s 36px), 15 hand-rolled menu rows (menus open at the pointer, as a sheet or upward),
  14 card or composite controls, 10 list rows, 6 inline text links, 3 tabs, 1 segmented control.
- Copied from production on purpose: the org-page and letters-page tab classes (not exported), the certificate ink
  colour, and production's own Join / Reserve-a-seat button strings.
- Neutral chat chrome uses `gray-*` classes (about 200 uses), as v11 to v15 did, instead of the `muted` tokens.
- About 45 arbitrary pixel sizes for chat typography and row heights (15px message body, 11px labels, 60/68px rows,
  248/64px sidebar), which have no design-system token.
- Production components keep their own styling: the green "You're Hosting" and "Active" badges, the certificate
  placeholder, the org-header avatar stack.

## Page audit (parity and navigation)

The route list is derived from `src/App.tsx` at run time by `scripts/p1509-route-audit.mjs` (TypeScript AST,
follows `/events/*` into its own router, fails loud on any route it cannot read): **103 routes**. The table below is
the first live audit; the losses marked restored afterwards are listed under it. Every v16 in-app view passed Back
and Forward.

#### E1. Every route in routes.json (103)

| # | Route | Reachable from v16? (entry) | Back | Forward | Prod bar @375 | Lost vs production |
|---|---|---|---|---|---|---|
| 1 | `/` (redirect) | No (v16 logo goes to v16 Home, not `/`). Direct: redirects to `/feed`, loads | n/a | n/a | shown | none |
| 2 | `/builders` | Profile menu / sheet "For builders" (new tab) | n/a (new tab) | n/a | shown | none |
| 3 | `/hiring` | Profile menu "For hiring" (new tab) | n/a | n/a | shown | none |
| 4 | `/coach` | Profile menu "For coaches" (new tab) | n/a | n/a | shown | none |
| 5 | `/hospitals` | Profile menu "For hospitals" (new tab) | n/a | n/a | shown | none |
| 6 | `/hospital` (redirect) | No. Direct: redirects to `/hospitals`, loads | n/a | n/a | shown | none |
| 7 | `/pricing` | No. Direct: loads | n/a | n/a | shown | not reachable at all in v16 (pricing/Champions offer) |
| 8 | `/program` (redirect) | No. Direct: redirects to `/pricing`, loads | n/a | n/a | shown | none |
| 9 | `/offers` (redirect) | No. Direct: redirects to `/pricing`, loads | n/a | n/a | shown | none |
| 10 | `/login` | No. Direct while signed in: redirects to `/p/p1509-bob` | n/a | n/a | shown | none (signed-out login not testable from a persona session) |
| 11 | `/signup` | No. Direct while signed in: redirects to `/p/p1509-bob` | n/a | n/a | shown | none |
| 12 | `/sign-pledge` | No. Direct: loads "Take the Pledge" | n/a | n/a | shown | not reachable from v16 |
| 13 | `/sign-pledge/confirm` | No. Direct: lands on `/sign-pledge` | n/a | n/a | shown | none |
| 14 | `/me/calibration` | No. Direct: loads "Listening calibration" | n/a | n/a | hidden | **LOST**: production profile shows a "Listening calibration" section/link; v16's profile has none |
| 15 | `/me` | No. Direct: redirects to `/p/p1509-bob` | n/a | n/a | shown | none |
| 16 | `/sessions` | Profile menu "Session History" (new tab) | n/a | n/a | shown | none |
| 17 | `/p/:id/partners` | No (v16 Partners view replaces it in-app). Direct `/p/p1509-bob/partners`: loads "My Partners" | n/a | n/a | shown | **LOST in v16 Partners**: production lists PENDING INVITATION with **Resend** and **Revoke**; v16 shows the pending invite as "Invite sent / Pending" with no action. Production Active row opens the agreement; v16 Active row opens the chat (see row 25) |
| 18 | `/p/:id` | In-app equivalent: v16 profile view (event participants, chat header, Members). Direct `/p/p1509-alice` loads | In-app: Back works (tested from event, chat) | In-app: Forward works | shown | **LOST**: production profile shows Stories (n), Points (n) with real cards, "Compare with me", Listening calibration, Clarity Partner list; v16 profile shows only name, role, bio, "You share…", Message, Invite/Partner, and a link to the pledge page |
| 19 | `/p/:id/badge` | No. Direct `/p/p1509-bob/badge`: loads "Badge Not Found" (Bob has no badge) | n/a | n/a | shown | not reachable |
| 20 | `/p/:id/pledge` | Profile "See my Clarity Pledge →" and own profile "View My Pledge" (new tab; popup URLs `/p/p1509-alice/pledge`, `/p/p1509-bob/pledge`) | n/a | n/a | shown (alice) | none |
| 21 | `/create` | **No** (direct: loads "Share a Story") | n/a | n/a | hidden | **LOST**: production Home has a "Share a Story" button; v16 Home has none, so authoring a story is not reachable |
| 22 | `/agreements/new` (redirect) | No. Direct: redirects to `/agreements/new/create` | n/a | n/a | hidden | none |
| 23 | `/agreements/new/create` | In-app equivalent: v16 Invite partner (sidebar "Invite partner", partners page button, chat header, profile, phone sheet). Direct production page loads | In-app: Back/Forward pass (sidebar-invite, partners-invite-btn trials) | pass | hidden | **LOST**: production has a **Visibility Public/Private** choice and labels the button "Seal & Send"; v16's form has no Visibility choice. **Present**: "Use suggested terms" |
| 24 | `/agreements/confirm-email` | No. Direct: redirects to `/feed` | n/a | n/a | shown | none |
| 25 | `/agreements/:id` | **No.** Partners row "Alice Moreau" opens the **chat with Alice** (in-app), not the agreement. Direct `/agreements/<id>` loads "Your Agreement / Download Image / Share" | In-app (to chat) Back/Forward pass | pass | hidden | **LOST**: view the sealed agreement, Download Image, Share |
| 26 | `/agreements/:id/accept` | No (email link). Direct: loads "This invitation has expired or is invalid" for the active agreement | n/a | n/a | hidden | not reachable (recipient flow) |
| 27 | `/partner-template` | No. Direct: loads | n/a | n/a | shown | not reachable |
| 28 | `/agreements/:id/declined` | No. Direct: loads "You've declined the invitation" (for an *active* agreement; production page is not state-aware) | n/a | n/a | hidden | not reachable |
| 29 | `/blog-subscribed` | No. Direct: loads "Check your inbox" | n/a | n/a | shown | not reachable |
| 30 | `/story/:id` | Home / Share picker card "Details" opens a new tab (popup `/story/<id>`) | n/a | n/a | shown | none |
| 31 | `/explain-back/:id` | Needs a param, not exercised (no seeded id known). Made-up `/explain-back/abc` redirects to `/letters` | n/a | n/a | shown (after redirect) | n/a |
| 32 | `/point/:id` | Home Points card "Details" (new tab, popup `/point/<id>`) | n/a | n/a | shown | none |
| 33 | `/compare/:slug` | Needs a param, not exercised. Made-up `/compare/abc` loads "We could not find that person." | n/a | n/a | shown | **LOST** entry: production profile "Compare with me" has no v16 counterpart |
| 34 | `/admin/users` | Only for `is_admin` (profile menu Admin group). Bob and Dana have no Admin group (verified). Admin persona not seeded, so the Admin entry is **not exercised**. Direct as Bob: "4 0 4 Page not found" | n/a | n/a | shown | n/a |
| 35 | `/admin/topics` | Same as row 34 | n/a | n/a | shown | n/a |
| 36 | `/topics` | Tools "Pick next topic" (new tab) | n/a | n/a | hidden | none |
| 37 | `/pledgers` | Profile menu "Pledgers" (new tab) | n/a | n/a | shown | none |
| 38 | `/s/:code` (redirect) | Needs a code, not exercised. Made-up `/s/ZZZZ` lands on `/feed` | n/a | n/a | shown | n/a |
| 39 | `/clarity-champions` (redirect) | No. Direct: redirects to `/pledgers` | n/a | n/a | shown | none |
| 40 | `/understanding-champions` (redirect) | No. Direct: redirects to `/pledgers` | n/a | n/a | shown | none |
| 41 | `/donate` | No. Direct: leaves the app for an external payment-link page (path `/eVqcN5epPex1dbR4i01Jm05`); I only looked at it | n/a | n/a | hidden | not reachable |
| 42 | `/donate/:amount` | Needs a param; **not opened on purpose** (payment flow) | n/a | n/a | n/a | n/a |
| 43 | `/machines` | No. Direct: loads "How agent accounts work" | n/a | n/a | shown | not reachable |
| 44 | `/about` | Profile menu "About" (new tab) | n/a | n/a | shown | none |
| 45 | `/intro` | No. Direct: loads (Google Calendar iframe; body text empty by design) | n/a | n/a | hidden | not reachable |
| 46 | `/auth/callback` | No. Direct: redirects to `/feed`, stays signed in | n/a | n/a | shown | n/a |
| 47 | `/auth/event-link` | No. Direct: loads "This link is incomplete" | n/a | n/a | shown | n/a |
| 48 | `/auth/verify` | No. Direct: loads "This link can't be used" | n/a | n/a | shown | n/a |
| 49 | `/manifesto` | Profile menu "Manifesto" (new tab) | n/a | n/a | shown | none |
| 50 | `/article` (redirect) | No. Direct: redirects to `/manifesto` | n/a | n/a | shown | none |
| 51 | `/privacy-policy` | No. Direct: loads | n/a | n/a | shown | not reachable (legal footer links absent in v16) |
| 52 | `/terms-of-service` | No. Direct: loads (my crash regex matched the word "application errors" in the legal text, false positive) | n/a | n/a | shown | not reachable |
| 53 | `/meet` | Tools "Clarity meeting principle" (new tab) | n/a | n/a | hidden | none |
| 54 | `/ready` | Tools "Ready" (new tab) | n/a | n/a | hidden | none |
| 55 | `/prepare` | Tools "Learn the Clarity process" (new tab) | n/a | n/a | hidden | none |
| 56 | `/settings` | Settings view is a **stand-in**: text plus a link "Open settings" (new tab) | In-app Back/Forward to the Settings view pass | pass | shown | **LOST** in-app: settings are not in v16, only a link out |
| 57 | `/co-create` | No. Direct: loads | n/a | n/a | shown | not reachable |
| 58 | `/demo` | No. Direct: loads "Clarity Partners" | n/a | n/a | shown | not reachable |
| 59 | `/clarity-demo` (redirect) | No. Direct: redirects to `/demo` | n/a | n/a | shown | none |
| 60 | `/chat` (redirect) | No. Direct: redirects to `/create` ("Share a Story") | n/a | n/a | hidden | none |
| 61 | `/clarity-chat` (redirect) | No. Direct: redirects to `/create` | n/a | n/a | hidden | none |
| 62 | `/feed` | In-app equivalent: v16 Home (sidebar Home, logo, tab Home, `Home` chat). Direct loads | In-app Back/Forward pass (sidebar-home, m-home) | pass | shown | **LOST on Home**: "Share a Story" button; production Home card ⋯ present in both |
| 63 | `/video/:videoId` | Needs a param, not exercised. Made-up `/video/abc` shows the 404 page | n/a | n/a | shown | n/a |
| 64 | `/stake/:tag` | Tools "Points" tab links, e.g. `/stake/cmp7` (new tab, popup captured) | n/a | n/a | hidden | none |
| 65 | `/feed/:tag` (redirect) | No (v16 tag chips open `/feed?tag=…` in a new tab, popup captured). Direct `/feed/cmp7`: redirects to `/feed?tag=cmp7&sort=oldest&version=latest` | n/a | n/a | shown | none |
| 66 | `/live` | Tools "Start a Clarity Session" (new tab) | n/a | n/a | shown | none |
| 67 | `/live/:code` | Needs a code, not exercised (made-up `ZZZZZZ` renders "Joining session…") | n/a | n/a | shown | n/a |
| 68 | `/transcribe` | Tools "Transcribe" (new tab). Chat header "Transcribe" is "Coming soon" in every chat | n/a | n/a | hidden | **LOST** in chat: capture from the chat header is Coming soon |
| 69 | `/transcribe/:code` | Needs a code, not exercised (made-up code loads "Join the transcription room") | n/a | n/a | hidden | n/a |
| 70 | `/letters` | In-app equivalent: v16 Letters view (sidebar, bottom bar). Direct loads | In-app Back/Forward pass | pass | shown | **LOST**: New Draft is "Coming soon" in v16 (production creates drafts); production Inbox rows show "Unread." and "0 of 1 steps / Open" progress, v16 shows name and date only plus a Read button on hover |
| 71 | `/letters/drafts/:docId` | Letters Drafts "Edit" (new tab, popup `/letters/drafts/<id>`) | n/a | n/a | hidden | none |
| 72 | `/docs` (redirect) | No. Direct: redirects to `/letters?tab=drafts` | n/a | n/a | shown | none |
| 73 | `/d/:docId` (redirect) | No. Direct: redirects to `/letters/drafts/<id>` | n/a | n/a | hidden | none |
| 74 | `/letter/:docId/compose` | Letters Drafts "Prepare" (new tab, popup captured). Loads with almost no text (112 chars) in my 3.8 s wait; not inspected further | n/a | n/a | hidden | none known |
| 75 | `/letter/:docId/preview` | No. Direct: loads "For your recipient" | n/a | n/a | hidden | not reachable |
| 76 | `/letter/:id/overview` | Letters Published "Open overview" (new tab, popup captured). Loads "No recipients on this letter yet." | n/a | n/a | hidden | none |
| 77 | `/letter/:id/results` | Inbox rows of completed letters would show "Results"; both seeded inbox rows are unread so the button is "Read", **not exercised via v16**. Direct (sent letter id) loads "Public link letter" | n/a | n/a | hidden | n/a |
| 78 | `/letter/:letterId/confirm` | No. Direct: shows "Saving your responses…" and stays there (left alone) | n/a | n/a | hidden | not reachable |
| 79 | `/letter/:id` | Letters Inbox "Read" (new tab, popup `/letter/<id>`). Loads "For Bob" | n/a | n/a | hidden | none |
| 80 | `/founder` | Profile menu "For co-founders" (new tab) | n/a | n/a | shown | none |
| 81 | `/events/:slug/room` | Event page "Event Room" tab (new tab, popup captured as `/events/p1509-night-oct16/ready`; direct `/room` redirects to `/ready`) | n/a | n/a | hidden | the in-app event page has the tab, the room itself is production |
| 82 | `/events/:slug/ready` | Same popup as row 81 | n/a | n/a | hidden | none |
| 83 | `/events/:slug/prepare` | No. Direct: redirects to `/events/p1509-night-oct16` | n/a | n/a | shown | not reachable |
| 84 | `/events/:slug/close` | **Not exercised on purpose** (evening close) | n/a | n/a | n/a | n/a |
| 85 | `/events/:slug/arriving` | No. Direct: loads "See you soon" | n/a | n/a | shown | not reachable (email link) |
| 86 | `/events/:slug/meet` | No. Direct: loads "Clarity Meeting Principle" | n/a | n/a | hidden | not reachable from event page |
| 87 | `/events/:slug/host` | No. Direct as Bob (host): loads host panel ("Start round 1"). Not clicked | n/a | n/a | hidden | **LOST**: a host cannot reach the host panel from v16's event page |
| 88 | `/events/*` | No. Direct `/events/p1509-night-oct16/zzz`: renders an empty page with only the production bottom bar (no 404 text) | n/a | n/a | shown | production behaviour, not v16 |
| 89 | `/events` | No. Direct: redirects to `/groups/cm` | n/a | n/a | shown | none |
| 90 | `/events/list` | In-app equivalent: v16 Events view (sidebar Events, Home "All events", phone sheet). Phone sheet "Events" is, per the source (`ProfileMenuItems`, an `<a target=_blank>`), a new tab to `/events/list`; I did not click that one (sheet checked at 375 only for open/close and the Partners/Tools/Invite items) | In-app Back/Forward pass (sidebar-events, home-all-events) | pass | shown | none |
| 91 | `/events/experiment` (redirect) | No. Direct: redirects to `/events/list?series=lost-cofounders` | n/a | n/a | shown | none |
| 92 | `/events/webinar` (redirect) | No. Direct: same redirect | n/a | n/a | shown | none |
| 93 | `/events/new` | Group page "Host event" (new tab, popup `/events/new?org=cm`) | n/a | n/a | shown | none |
| 94 | `/events/:slug` | In-app equivalent: v16 event page (Home card, Events list, group page, chat). Direct `/events/p1509-night-oct16` loads | In-app Back/Forward pass (home-event-card, events-list-card, group-event-row, directory) | pass | shown | **LOST**: the topic vote ("Vote on tonight's topics") is a literal placeholder sentence, not the production vote (bug 7) |
| 95 | `/events/:slug/edit` | No. Direct: loads "Edit Event" | n/a | n/a | shown | **LOST**: organiser cannot reach Edit from v16's event page |
| 96 | `/events/:slug/confirm` | No. Direct: loads "You're Registered!" | n/a | n/a | hidden | not reachable |
| 97 | `/cm` | Tools "Chiang Mai event calendar" (new tab) | n/a | n/a | hidden | none |
| 98 | `/groups` | In-app equivalent: v16 Directory ("Browse groups", Home "All groups"). Direct loads "Clarity Groups" | In-app Back/Forward pass (groups-browse, home-all-groups) | pass | shown | none |
| 99 | `/groups/:slug` | In-app equivalent: v16 group page. Direct `/groups/cm` loads | In-app Back/Forward pass (groups-card, home-group-card, directory-group, event-back-to-group) | pass | shown | **LOST**: production splits "Upcoming (1) / Past (5)"; v16 lists all in one list with "· past" tags. Invite opens a dialog in v16 (works) |
| 100 | `/groups/:slug/join` | In-app equivalent: v16 join view (Dana: group page "Join as member"). Direct `/groups/cm/join` loads the terms | In-app Back/Forward pass (Dana) | pass | hidden | none (v16 join is a local overlay, the confirm step was not clicked) |
| 101 | `/org` (redirect) | No. Direct: redirects to `/groups` | n/a | n/a | shown | none |
| 102 | `/org/*` (redirect) | No. Direct `/org/cm`: redirects to `/groups/cm`; `/org/cm/zzz` shows the 404 page | n/a | n/a | shown | none |
| 103 | `/*` (404) | No. Direct `/no-such-page-xyz`: 404 page, bottom bar shown | n/a | n/a | shown | none |

Unlisted route seen in v16: `/presi` (Tools "Slides", new tab) is **not in `routes.json`** (it 302s to `/presi/`, a static page, bottom bar absent). The list of 103 does not cover Tools' "Slides" target.

#### E2. Every view INSIDE v16 (the `view=` states and overlays)

v16's own bar at 375x812 was read from `nav[aria-label="Places"]` (visible or not); the production bar was never present (`nav[aria-label="Mobile navigation"]` count 0 on every v16 view).

| View (URL) | Reached from | Back (browser) | Forward | v16 bar @375 | Lost vs production page |
|---|---|---|---|---|---|
| `view=chats` (list) | sidebar Chats, bottom bar Chats, sidebar Search (focus), Log Out | pass | pass | shown | n/a (mock) |
| `view=chats&chat=<id>` (1:1, General, event channel, mirror) | chat list, profile Message, event "Open event chat", partners row, partner badge | pass | pass | hidden | n/a (mock). Transcribe "Coming soon" in all headers; ⋯ menus are minimal (1:1: "Invite to Clarity Live"; mirror: "Rename") |
| `…&members=1` (members) | General/event header click (desktop header click did not open it in my trial; reached via URL) | in-app arrow works | n/a | hidden | n/a |
| `…&thread=<msg>` | "N replies" link | pass | pass | hidden | n/a (mock) |
| `view=home` (`&tab=points`) | sidebar Home, logo, bottom bar Home | pass | pass | shown | see row 62: no "Share a Story" |
| `view=events` | sidebar Events, Home "All events" | pass | pass | shown | none |
| `view=event&event=<slug>(&group=)` | Home/Events/Group cards, chat | pass | pass | shown | topic vote placeholder; no Edit / host panel entry |
| `view=groups` | sidebar Groups, bottom bar Groups | pass | pass | shown | none |
| `view=directory` | "Browse groups", Home "All groups" | pass | pass | shown | none |
| `view=group&group=<slug>(&tab=)` | Groups card, Directory, Home, event "Back to group" | pass | pass | shown | no Upcoming/Past split |
| `view=join&group=<slug>` | group page "Join as member" (Dana) | pass | pass | hidden | local overlay, no real membership write (by design) |
| `view=letters` (`&tab=drafts|sent`) | sidebar Letters, bottom bar Letters | pass (tab switches replace the entry, so Back skips them by design) | pass | shown | New Draft Coming soon |
| `view=partners` | profile menu/sheet "Partners", chat "Partner" badge | pass | pass | hidden | no Resend/Revoke; row opens chat instead of agreement |
| `view=invite(&with=)` | sidebar "Invite partner", partners button, phone sheet, profile | pass | pass | hidden | no Visibility choice; suggested terms present |
| `view=profile&person=<id>` | event participants, chat header, Members, profile menu "My Profile" | pass | pass | hidden | thin profile (see row 18) |
| `view=tools` | sidebar Tools icon, phone sheet "Tools" | pass | pass | shown | none (all entries new tab) |
| `view=settings` | profile menu/sheet "Settings" | pass | pass | hidden | stand-in only |
| Share picker dialog | composer paperclip | n/a (overlay) | n/a | n/a | n/a |
| Forward / Rename / Leave group sheets, group Invite dialog | message menu, mirror ⋯, group "Manage membership → Leave", group "Invite" | n/a (overlay; Invite dialog opened and closed, not submitted) | n/a | n/a | n/a |
| Profile menu (desktop popover / phone bottom sheet) | sidebar profile picture, bottom bar Profile | n/a | n/a | n/a | phone sheet adds Invite partner, Tools, Events (new tab) |
| Signed-out screen | strip, Log Out | Back after Log Out returns to the previous URL still signed out | n/a | n/a | n/a |

Not reached / not exercised in v16: Members view by header click on desktop (opened only via URL), forward-with-thread card, Mark as unread, Transcribe (Coming soon), General-channel lock copy beyond the header, Clarify on mirror messages (out of scope of this pass).

**Special check from the spec ("suggested partner terms" must be present in v16's invite flow): PRESENT.** "Use suggested terms" appears on the certificate (desktop-invite-certificate.png) and fills the three-line template quoted in section C.

#### E3. Losses vs production (summary)

1. Partners: no Resend, no Revoke for a pending invite; Active row opens the chat, not the agreement (no sealed-agreement view, Download Image, Share).
2. Invite form: no Visibility (Public/Private) choice; button reads "Send invite" instead of "Seal & Send".
3. Profile: no Stories/Points lists, no "Compare with me", no Listening calibration.
4. Home: no "Share a Story" button, so `/create` is unreachable from v16.
5. Letters: "New Draft" is "Coming soon" (cannot create a draft); inbox rows lack the "Unread" label and "0 of 1 steps" progress shown in production.
6. Event page: topic vote is placeholder text; no entry to Edit event, host panel (`/host`) or `/close`.
7. Group page: no Upcoming / Past split.
8. Settings: link out only.
9. Phone bottom bar: production bar has "Today's event", Tools, Home, Letters, Partners, Groups, My Profile; v16 has Chats, Home, Groups, Letters, Profile. "Today's event" shortcut and top-level Partners are gone (Partners and Tools are in the profile sheet).
10. Chat: Transcribe is "Coming soon" in every chat header (the spec allows this fallback; the acceptance line "starts capture in one press" is unmet).
11. Footer/legal pages (`/privacy-policy`, `/terms-of-service`), `/pricing`, `/sign-pledge`, `/donate`, `/machines`, `/partner-template`, `/co-create`, `/demo`, `/intro` are not reachable from v16.

**Restored after this audit** (links into the production page, in a new tab): Share a Story (`/create`); the
agreement view for each partner (`/agreements/:id`); host-only Edit event and Host panel; Upcoming / Past split on
the group page; the invite form's Visibility choice and "Use suggested terms"; inbox Unread dot and step progress;
See full profile and Compare with me. Deep links and reloads now keep their view.

**Still lost, deliberately or for you to decide:**
- Resend and Revoke for a pending invite: not restored, both send mail. Resend is on the production agreement page.
- Share, Edit and Delete from a Home card: the ⋯ is removed because Delete is a real write (Edit and Delete remain
  one tap away on the production point and story page via Details).
- Settings: a link out only. Profile: no inline Stories/Points lists (link to the full profile instead).
- Event `/close`: not linked (it ends the evening). Topic vote: Coming soon.
- Phone bottom bar: production's "Today's event" and top-level Partners are gone. This is the decided order.
- Not reachable from v16 at all: `/pricing`, `/sign-pledge`, `/privacy-policy`, `/terms-of-service`, `/donate`,
  `/machines`, `/partner-template`, `/co-create`, `/demo`, `/intro`, `/me/calibration`.
- `/presi` (Tools "Slides") is a static deck, not an `App.tsx` route, so the derived list does not include it.

## Acceptance criteria (v16)

| AC | Status |
|---|---|
| Rebased; full suite and pre-commit pass | Done (see Step 0) |
| Seeded record per surface, paired with its query | Done (table above) |
| Skeleton, error-with-Retry, empty per surface (screenshots) | Done |
| Invite outside the seeded domain refused; no email sent | Done (0 requests, twice) |
| Design-system check, exceptions listed | Done with exceptions (raw button classes, production-copied classes); production components keep their own green "You're Hosting"/"Active" badges |
| Mobile opens on Chats; bar Chats · Home · Groups · Letters · Profile | Done |
| Desktop sidebar per decision; collapse; logo goes Home | Done |
| Mobile profile sheet closes on swipe-down and outside tap | Done (live) |
| "Invite partner" only; name and email; suggested terms | Done (persona recipients only, by the safety rule) |
| No "+ New", no "New chat" | Done |
| Transcribe in every header starts capture in one press | **Not met: Coming soon** (decision for you below) |
| Tools beside the profile; no More; Use cases and Learn in the profile menu | Done |
| General: lock and "Members only" | Done |
| Thread forward "Thread · N replies" opens the thread | Done (tests) |
| Mirror: Clarify everywhere, Rename, role shown, no back bar | Done |
| Share picker card: no Add point / ⋯; Share the one primary | Done |
| Letters cards act only through their buttons | Done |
| Non-admin persona never sees Admin (test) | Done |
| Mark as unread on desktop and touch | Done (tests) |
| Parity/navigation table, no unexplained loss | Done (above) |
| Separate visual QA at desktop, 375, 320 | Done: first pass FAIL (41 items), defects fixed; retry FAIL (A1 to A4 and B items), fixed; final re-check **PASS** on the changed views. Agents saw screenshots only, never code |
| Founder click-through and approval | **Open: yours** |

## Reviews

Every report requested was received: **29 of 29** reviewer reports across 16 rounds (Gemini review model in every
round; Codex in 8; Opus adversary in 4; one Sonnet criteria reviewer), plus a live browser audit, two re-checks and
three visual-QA passes. Highest-impact findings, all fixed: Vite served the first password location (reproduced 200);
DNS rebinding could read persona tokens (plugin middleware runs before Vite's host check); the seed reset could have
deleted other users' rows through cascades, and could wedge on a trigger (a room linked to an event). Two
regressions introduced by a fix round were caught by the next review and fixed.

**Open findings from the last round** (reported to you rather than given another round, per the stopping rule):
1. While an agent's identity is still loading, a story card shows the raw "Agent · Name" text, and that click is not
   caught, so it leaves the prototype tab (Codex, reproduced).
2. A slow initial seat read can overwrite a fresh RSVP write, so the event page and the channel disagree until
   reload (Codex, reproduced with a delayed response).
3. Clicking a person in a group roster can open two destinations (Codex).
4. Author links in cards open the production profile in a new tab instead of the in-prototype profile (Gemini).
5. Minor polish from the final visual pass: a wrapped "· 4 going" line starts with the separator; the 320px event
   header becomes four short lines; the first row of the phone profile sheet shows a focus ring when it opens.
6. Services return an empty list on a database error, so a few failed reads show as "empty" with no Retry. This is
   in shared production services, which v16 reuses unchanged.

## Decisions for you

- **Transcribe.** `createRoom` joins the newest open room with the same event (with no event: any open ad-hoc room on
  the whole project), so a press in a chat would stream the mic into someone else's room. Per-chat rooms need an RPC
  change, which the spec defers; so it says Coming soon everywhere, the spec's own fallback.
- **The test project sends real email.** Its functions have a live Mailgun key and no `APP_URL`. Unsetting the key
  (or pointing it at a sandbox domain) and setting `APP_URL` would make every future test-project invite safe by
  construction rather than by the prototype's guard.
- **v12 to v15 still ship as dead chunks** in the production bundle (unreachable, as the repo's prototype rule
  accepts). v16 does not. The same one-line change would drop the older ones.
- **Found outside scope and filed:** an event with a linked transcription room cannot be deleted (the foreign key's
  SET NULL is refused by the room's immutable-column trigger), on prod too. INBOX-189.

## Known limitations

- Seed: the preflight and the deletes are separate requests (a transaction would need a migration, which v16
  forbids), so a row created between them could be cascaded. Latent parser gaps that no current migration uses:
  dynamic `CREATE TRIGGER` inside a DO block, `RENAME CONSTRAINT`, NOT NULL expressed as a CHECK.
- Route audit: nested-route shapes the app does not use (an absolute child under `/`, a nested `*` under a prefix,
  inline `<Routes>` in a mount's element) are not modelled; App.tsx has no nested routes today.
- Test changes made because the spec or the data changed (none to make a failing test pass): the seed tests now
  expect no persona admin (single-admin index) and an author position on their own point (70% of real authors have
  one); the UI tests follow the removed views, the Visibility default and the new labels.
