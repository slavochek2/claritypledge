---
status: all-done
type: story
rank: 1
workstream: events
created_date: '2026-09-21'
tags:
  - events
  - registration
  - opt-in
  - survey
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1055
  - p1114
  - p1179
  - p1256
  - p1337
  - p1380
completed_at: 2026-10-01
---

# P1336: Registering for a Clarity Night carries the preparation, the opt-in and the survey

## Problem

Clarity Night #1 (2026-09-18) spent its practice time on setup: theory, repeats for latecomers,
people unsure what to click ([goals.md](../../../docs/goals.md)). The opt-in to the meeting principle was a
tap made seconds after first hearing the idea. Events now run weekly. Three problems:

| | Problem | Fix |
|---|---|---|
| A | The room spends its time on setup | Preparation moves into registration |
| B | The opt-in is uninformed | Preparation explains cognitive understanding before the choice |
| C | Pairs don't disagree | Per-event positions the host pairs from |

Physical events are not a revenue path; no hypothesis links opt-in to payment (correction
2026-09-22, [hypotheses.md](../../../docs/hypotheses.md) H-ChampionYield retired). Workplace/champion
questions live in [P1337](../../p1337_event_journey_on_screen_steps_rotation_and_ending.md).

## Appetite

One flow (post-RSVP preparation) plus what the host list, the room gate and the event emails read
from it. Reversibility: medium — prep answers persist per person/event; the flow is a code revert.

## Source of truth

The approved prototype `/tree/p1336-d` (founder approved 2026-10-01: "looks good i approve 1336-d") —
`src/app/pages/prototypes/p1336-onboarding-prototype.tsx`
(lives on branch `worktree-agent-afbfbff22be9a62f1`, not yet on main — /dev starts from that branch; round briefs `tmp-journey/round8…18-brief.md` are local only).
Where this spec and the prototype disagree, **the spec wins on state, data, routing and copy**;
the prototype wins only on visual details this spec does not state.
Copy marked **DRAFT** is not founder-final.

## HARD RULE — reuse, never rewrite

Every screen is assembled from existing product components. **No component is copied, forked or
restyled for this flow.** A shared component may only gain an **opt-in prop whose default is the
current behaviour**; every existing call site renders byte-identically. This branch already added
such props (they ship with this spec and each needs a default-behaviour test):

| Screen part | Existing component (path) | Opt-in props used |
|---|---|---|
| Step header | letter header pattern + `LetterProgressBar` (`components/letters/letter-progress-bar.tsx`) | `tone="subtle"` (statement counter) |
| Bottom actions | `FixedBottomBar` (`components/shared/fixed-bottom-bar.tsx`) + `LetterPrimaryCta` (primary / `variant="secondary"`) | — |
| Videos | `Mp4VideoFacade` (`components/shared/mp4-video-facade.tsx`), `look="story"`, `PosterPlayButton` | `pulse`, `onPlay`, `playbackRate`, `durationSeconds` |
| Transcript link | `StoryMedia`'s "Read video summary" pattern (P1349): icon + label, right-aligned under the video | — |
| ST1 story (if rendered as letter) | `LetterFlowContent` + `useLetterReadingState` (preview, reveals off) | reveals-off flag |
| Principle | `MeetingPrincipleView` (`components/agreements/meeting-principle-view.tsx`, extracted from `/meet`), level 3 = `/meet` `DEFAULT_LEVEL` | `header`, `aboveChoice`, `aboveRating`, `question`, `submitLabel`, `ratingBarClassName` |
| 0–10 | `MeetingPrincipleView`'s rating bar (same card as `ComprehensionRatingCard`) | — |
| Statements | `StakePage` (`pages/stake-page.tsx`) | `embedded`, `pointsOnly`, `onlyIds`, `onlyUnstaked`, `linksInNewTab` |
| Registered / end box | `RsvpConfirm` success card, `AddToCalendarMenu`, `GroupChatBlock` line + glyphs, `AttendeeAvatarStack` (EventCard) | — |
| Opted-in avatars | `AttendeeAvatarStack`; room roster stays `RosterGroup` (EventRoomMeet) | — |
| Host line | `GravatarAvatar` | — |
| Research Q&A | product `Dialog` (`components/ui/dialog`) | — |

The prototype's local `EventBox`, `SocialProof`, `Clip`, `Transcript`, `useMeasuredHeight` are
compositions of the above; /dev may keep them as page-local compositions or lift them, but may
not re-implement any listed component.

## Once per person vs every event

| Part | Frequency |
|---|---|
| Step 1 video (how this event is different), step 2 (cognitive understanding), step 3 principle **video screen**, step 4 cmp7 statements | **Once per person.** Never shown again after completion. |
| Step 3 **decision** (opt in/out → try-it or ask → 0–10), step 5 event positions, step 6 research | **Every event.** |
| Statements already answered (any tag) | Skipped **on later visits only**. Within one session, Back shows the same cards (answered ones included). |

A returning person's plan lists only what is left; their minutes are computed from it, and the
header re-indexes to the remaining steps (**Step k of {remaining}**, not of 6).

Once-per-person completion is tracked **per part** — intro video, cognitive video, principle intro,
cmp7 — each with a completed_at and the **content version** it was completed against. Bumping a
part's version re-shows that part. Skipped is recorded separately and is **not** completed.

## Flow (screen by screen, final copy verbatim)

Header on steps 1–6: back arrow + step name + `Step N of M` progress (M = steps this person has; 6 for a new registrant). The plan screen has no header.
Video steps' bar: **Play the video** / secondary **Continue without video** → after first play,
**Continue**. Every clip has **Read the transcript** / **Hide the transcript** (inline expand).

**0. Registered** (after RSVP)
- Box: ✓ **You're Registered!** + event details, **Add to calendar**, **Join WhatsApp group**,
  line *"WhatsApp group: last-minute changes, questions, and getting there. If you need a lift, ask in the group."*,
  **Share** row (LINE, WhatsApp, Telegram, Facebook, **Copy link** / **Copied!**) sharing the event page. (UAT 2026-10-01) On a touch device with a share sheet (phones) the last button reads **More** and opens it (desktop keeps **Copy link** and copies, even where the browser has a share sheet) — Instagram, TikTok, X and the rest live there; no web share link exists for Instagram or TikTok.
- **Do you have {N} minutes to prepare for the event?** (N computed, see Minutes; renders at once with 10 until points load)
- *Your short preparation will make the event discussions more meaningful.*
- Avatars + *"{X} prepared for the last event · {Y} for this event"* (real counts, host excluded). No previous event → only *"{Y} for this event"*; line hidden when the shown count is 0.
- Primary **Prepare now** (or **Continue where you left off** when progress exists); secondary
  **Remind me by email** → *"✓ We'll email you a reminder"* (the existing 24h reminder; no extra email).
- Registration is immediate (one tap RSVP; the pre-commit question variant C is rejected). Above the
  prep question, a short why (DRAFT): *"Our events are different… we ask every participant to prepare."*
  No "how did you hear about us" question. Prototype: `/tree/p1336-d`.
- Once prep has started, the box shows the person's status: **Prepared ✓** or **{k} of 6 steps** — a quiet muted line, not a badge (UAT 2026-10-01: the green pill read as a floating alert); on the event page the prepared state is the same one line, no box
  (k of M for a returning person) so the host can check it on their phone at the door.

**Plan** — (UAT 2026-10-01) the steps' header with a back arrow (no progress bar yet); **Your preparation** (DRAFT) with *"6 steps · about N min"* under it; numbered timeline with per-row minutes; done rows ticked. CTA **Start now** directly under the list, at every width.
1. See how this event is different
2. Learn the definition of cognitive understanding
3. Decide about your participation in a new social norm
4. Share your view on the expected benefits
5. Set your positions on {N} points about "{event topic}"
6. Decide if you'd like to volunteer in R&D

**Step 1** — **How this event is different** · *In our events, we reward revealing gaps in cognitive understanding.* · clip `why-clarity-night` (pulses until played).

**Step 2** — **What is cognitive understanding?** · *I explain back your intended meaning, and you rate me 10 out of 10: verified cognitive understanding. It's not agreement, and it's not feeling what you feel.* · clip `cognitive-understanding` (ST1 video, pulses).

**Step 3a** — **Introducing the Clarity Meeting Principle** · (DRAFT) *It makes the conversations at the event more meaningful. Every attendee can opt in or opt out, both are completely fine. Watch the video, then decide.* · clip `principle`.

**Step 3b** — `MeetingPrincipleView` level 3 with header **Do you want to follow this principle with the attendees at the event?**; above the Opt in / Opt out choice: avatars + *"{X} opted in at the last event · {Y} for this event"*. The full certificate (through THE EXCEPTION) must scroll clear of the bar.

**Step 3c** — host photo, **Slava · event host**, then
- opted in: *"Thank you for opting in. You promised that anybody at the event can ask you a specific question, right? Let's try it now, to show how it works."* → **Try it now**
- opted out: *"Thank you. It's completely okay to opt out. It usually means something is unclear, or you disagree. Before you continue, can I ask you one question?"* → **Yes** / secondary **No, continue** (skips the 0–10)

**Step 3d** — rating bar slides up; host line + *"Thanks for trying it. Here is the question:"* / *"Thanks for letting me ask. Here is the question:"*; question **How much do you think you understand Slava's intended meaning behind this principle?** 0–10, **Confirm**.

**Step 4** — **What is your value perception of the Clarity Meeting Principle?** · `StakePage` cmp7 cards.
**Step 5** — **Set your positions on {N} points about "{topic}"** · (DRAFT) *Your positions help us pair you with someone who sees it differently at the event.* · `StakePage` event-tag cards.
Statement bar (4, 5): counter *"{a} of {n} answered"* (subtle progress, zooms on change; hidden until loaded), **Continue** (enabled when all answered), secondary **Skip and proceed**. Cards open `/point/:id` in a new tab.

**Step 6a** — **Are you open to be one of six volunteers who record their conversations at the event, to contribute to our R&D?** · *We provide you with a USB-C lavalier microphone, or you can bring your own mic.* · clip `research-recording`. Bar: *"{left} of 6 volunteer places left"*, link **Learn how we use your data** (Dialog), **Yes, sure** (primary) | **No, thanks** (outline), side by side. The places-left count is floored at 1 and **Yes, sure** always stays available: overbooking is accepted and the host handles extra volunteers at the event. No waitlist (a possible later upgrade).
Dialog **How we use your data**: the 3 Q&A in the prototype's `RESEARCH_QA`, with the access answer stating that **Clarity Pledge (as a research programme)** reads volunteers' transcripts for research, and event organisers/hosts do not. Then **Terms · Privacy · Read more about our research program** (link stays the GitHub research-programme doc; a readable product page is a later separate task).

**Step 6b** (after Yes) — (UAT 2026-10-01) a centered page that first says why: *(DRAFT) "To use a recording, we need to know who is speaking. That takes your voice loud and clear, louder than the people around you, so the microphone has to sit close to your mouth: a clip-on lavalier mic or a headset."*; then **Does your phone have a USB-C port?** · *iPhone 15 and newer, and most Android phones, do.* · **Yes, USB-C** / **No, I'll bring my own microphone** / **No, and I don't have a microphone** as white buttons in the page, under the question → the last shows *"Thanks. You can still take part in the discussion without recording."* + **Continue** under it (in the page, not pinned) and records the person as not a volunteer.

**End** — box **Thank you for preparing** (same box as screen 0, no status badge: the title says it — UAT 2026-10-01); volunteers see *"You're a recording volunteer. We'll bring a USB-C mic for you."* / *"…Please bring your own microphone."* Below: **Interested in enriching your perspective before the event?** · *Our AI agents predicted how {experts} would answer the {N} points {you took a position on | we'll discuss}. Each position comes with a story that explains it.* · **Read their stories** → `/stake/{event tag}?tab=stories`. Experts = agents with stories on the event tag, read from data, not hardcoded; no stories → this block and its CTA are hidden. When prep was opened from the room gate, the end CTA is **Join the room** instead. (UAT 2026-10-01) The CTA is pinned in the bottom bar, with **Back to the event** under it (it is the only CTA when there are no stories); expert names drop the account prefix ("Simon Sinek", not "Agent · Simon Sinek"). The end screen is not immersive: it carries `?done=1` and the app's top and bottom menus return, as on a completed letter (P932); every step before it stays immersive.

**Zero event points** → step 5 is dropped from the plan and minutes are recomputed.

**Minutes.** Per step: clip seconds (each clip's `durationSeconds` constant) ÷ 1.15; principle adds level-3 words at 200 wpm + 2×20 s; statements 20 s each; research clip + 20 s. Rows round to whole minutes (min 1); the question's N = sum of the rows the person still has. New registrant: every card counted (stable across reloads).

## Per-event setup

- **Preparation switch:** an on/off **Preparation** setting on event create/edit, defaulted from the series (Clarity Night on, hikes off). Any host may switch it on; it uses the founder's Clarity Night intro videos (no per-host videos now; revisit when a second host asks).
- **Statement tag** drives only the positions step: no tag → step 5 hidden, minutes recomputed.
- **Expert names** derived from the tag's story authors; none → the experts block is hidden.
- **Host photo/name** from the event's host profile, labelled *"Your event host"*.
- **Volunteer places:** per-event value, default 6; the founder changes it via terminal/SQL (no UI yet).
- **Social proof counts** are summed across all past events of the series + this event. (UAT round 3, founder wording) Earlier events and this event are two named scopes: *"{P} people opted in at previous Clarity Nights, and {T} for this event"* · *"{P} people opted in at previous Clarity Nights"* (none here yet) · *"{T} people prepared for this event"* (no earlier ones); same shapes for prepared. {P} counts the series' earlier events only. Hidden at 0. Counts are distinct people. Faces are 40px, plain (no pledge ring); **every prepared person has a face** (founder 2026-10-01 — "3 people prepared" beside one face read as a bug; opt-outs are visible in the room anyway), the opted-in faces still show only people who opted in. (UAT 2026-10-01) For a Clarity Night the series is every Clarity Night by the same host (by title), with or without preparation, and an opt-in is a prep answer **or a room answer** — Clarity Night #1 ran the room before preparation existed, and its opt-ins are the proof step 3b exists to show. At most 4 faces; the line carries the number.

## Confirmation prep block (variant D, round E)

The why line is always shown. States: **0 done** → the question + **Prepare now** / **Remind me by email**; **1–5 done** → *"{k} of 6 steps done"* + **Continue your preparation**; **done** → **Prepared ✓**. Never "0 of 6". Rendered inline under the card; pinned to the bottom bar only when inline it would end below the fold.

Copy suggestions from review r20 are not applied; current wording stands.

## Data (per registration unless stated)

**Storage (decided):** prep data does **not** live on `event_rsvps` — its policy is `SELECT USING (true)`
(`supabase/migrations/20260118_create_events.sql:70-71`), so any column added there is world-readable.
New table **`event_preparations`**, one row per (profile, event), linked to the rsvp. RLS: owner
reads/writes own row; the event host reads rows of their event; no anon, no other-attendee access.
Public counts/avatars come only from a `SECURITY DEFINER` aggregate function returning counts and
avatars of **opted-in / prepared** people only — never opt-outs, 0–10 scores or volunteer data.

Architect confirms remaining column shape; the facts to persist:

| Fact | Scope | Notes |
|---|---|---|
| prep choice: `now` / `remind` / none | registration | `remind` feeds the reminder email |
| progress: current step, furthest step, started_at, completed_at | registration | replaces the prototype's localStorage resume; survives device switch |
| per-part completed_at + content_version (intro video, cognitive video, principle intro, cmp7); skipped flag separate | **person** | drives "once per person"; version bump re-shows |
| opt-in answer + timestamp | registration | **canonical owner = the prep row.** `event_room_members.opted_in` (P1114) is seeded from it on room entry; a change in the room writes back to the prep row with a new timestamp. Walk-ins without a prep row use the room's existing flow. Opt-outs never shown to attendees |
| principle 0–10 (nullable: opted-out "No, continue") | registration | host-only |
| statement positions | existing positions tables | no new storage |
| research volunteer state `eligible`/`confirmed` + `mic_setup` (`usbc`/`own`/`none`) | registration | places-left = max(1, 6 − confirmed); confirmed may exceed 6 |
| research consent: consented_at + policy_version | registration | written when the person says Yes; the Dialog's policy text carries that version |

RLS: as in Storage above. No capacity lock and no waitlist: Yes always confirms (overbooking
accepted, decided 2026-10-01). **Pairing takes volunteering into account** (a volunteer's partner is
recorded too); recording pause/resume in the room belongs to [P1337](../../p1337_event_journey_on_screen_steps_rotation_and_ending.md), not this spec.

**Research transcript access (requirement).** Volunteers' recording transcripts are readable for
research by the company (Clarity Pledge research programme) via a service/research-role path, not
by event organisers or hosts. RLS today lets only recorded participants read a transcript
(recording-qa Q1); /architect adds the research path (service role or dedicated research role) and
a test that a host account cannot read another person's transcript.

## Host view

On the host's attendee list, per person: prepared (done / in progress step N / not started / chose remind),
opted in/out + 0–10, positions done (a/n), recording volunteer + mic need (USB-C to bring / own mic).
A summary line: "{v} volunteers · {k} USB-C mics needed" (v above 6 signals overbooking / buying more mics). Host's own account excluded from all counts.

## Video hosting

- Four clips + posters live with the site's other public media on **Google Cloud Storage**, `claritypledge-story-images/event-prep/` (beside the landing page's `founder/` clip): the production CSP allows `media-src` from `storage.googleapis.com` only, so Supabase Storage (the first build) would have been blocked on the live site while every local run passed. One upload serves every environment; a unit test checks each clip URL against `vercel.json`'s CSP. The `p1336-clips` Supabase bucket created by the first migration is unused.
- Each clip has a `durationSeconds` constant in page data; minutes and the facade read it, never the loaded media.
  `public/p1336-clips/` is local-only and is not committed.
- MP4 re-muxed **faststart** (`ffmpeg -movflags +faststart -c copy`), played at **1.15x** via `playbackRate`.
- Transcripts ship as page data next to each clip (the prototype's `TRANSCRIPTS`).
- Cache-busting by versioned filename, not `Date.now()`.
- Night #1 clips show attendees; participant consent obtained, no face blur needed.

## Event room

`/events/:slug/room` (`EventRoomGate`): a registrant whose per-event prep is not complete (or whose
once-per-person intro is not done) sees a gate with two choices: **Prepare now** (prep at their
resume step, with a return target; finishing, or the flow's skip paths, returns them to the room)
and **Join the room without preparing** (enters directly, no confirmation dialog), with the muted line
*(DRAFT) "You'll miss the shared definitions and the meeting principle. You can catch up any time."* under it. The room banner reads **Start your preparation** (0 done) or **Finish your preparation** (in progress). A bypassed attendee can return to prep
anytime from the room (UAT round 2: a *"{k} of 6 steps · Finish your preparation"* link on the Back line; once prepared, a blue check after their answer on the roster, for everyone in the room). Their preparation status (**Prepared ✓** or **{k} of 6 steps**) is visible on
their own phone in the room, so the host can check it.

## Emails

Unchanged in this spec. **Remind me by email** relies on the existing 24h reminder ("Tomorrow"),
which links to the event page; prep is reached from there after normal sign-in.

**Moved to [P1380](p1380_event_starting_soon_email_with_signin.md)** (decided 2026-10-01, by
dependency): the starting-in-15-minutes email, the click-time sign-in redirect endpoint, and the
confirmation **Prepare now** / 24h **Finish preparing** buttons. Those two buttons exist to open prep
signed-in in one click, so they depend on the redirect endpoint and ship with it, not here.

## Invariants

- A completed once-per-person part is never shown again to that person.
- Opt-outs given in preparation become visible in the room once the person enters it, like every room answer (P1114 public roster, 2026-08-21) — founder decision 2026-10-01: keep visible. Before the room, no opt-out is shown to anyone but the person and the host.
- The host's account is excluded from every count (decisions.md 2026-09-21).
- Every existing call site of a shared component renders as before.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| People skip prep | ACCEPT | Room gate offers prep, status visible on phone + host list |
| Volunteers exceed 6 mics | ACCEPT | Overbooking accepted; host handles extras; waitlist is a later upgrade |
| Clips expose attendees' faces | ACCEPT | Night #1 participant consent obtained |
| Hosts read volunteers' transcripts | MITIGATE | Research access is company-only; host-denied test |
| Two opt-in values drift (prep vs room) | MITIGATE | One value, invariant test |

Non-goals: waitlist; event emails + sign-in links (P1380); recording pause/resume (P1337); automatic matching; round flow (P1337); deck (P1338); writing per-event statements; online/pilot events.

## Acceptance Criteria

- [x] New registrant at 320px completes screens 0 → End without help; every screen's copy matches this spec verbatim
- [x] Returning person (intro done) sees plan rows 3 (decision only), 5, 6; steps 1, 2, 3a, 4 never render
- [x] On a later visit, already-answered statements are not shown; within one session Back shows the same cards
- [x] Reload / other device mid-flow → "Continue where you left off" resumes the same step (DB-backed, not localStorage)
- [x] Minutes on screen 0 equal the sum of the plan's rows for that person; header shows `Step k of {remaining}` for a returning person
- [x] Anon and another attendee querying `event_preparations` get 0 rows; the host gets their event's rows; the aggregate function returns no opt-out, score or volunteer data
- [x] Per-part completion: bumping one part's content version re-shows only that part; a skipped part is not marked completed
- [x] Event with 0 points: step 5 absent, minutes recomputed; no stories: End CTA hidden; no previous event: social-proof line shows this event only, hidden at 0
- [x] Research Yes stores consented_at + policy_version
- [x] Opt-in chosen in prep seeds the room on entry (P1114); a change in the room writes back to the prep row with a new timestamp; a walk-in without prep uses the room's existing flow
- [x] Opted-out "No, continue" stores no 0–10; "Yes" stores one
- [x] Volunteer + mic answers persist; places-left decrements; `none` stores not-a-volunteer
- [x] With 6+ confirmed volunteers the bar still reads "1 of 6 volunteer places left" and **Yes, sure** still confirms; host view shows the volunteer total
- [x] "How we use your data" says the company (research programme) reads volunteers' transcripts and organisers/hosts do not; a host account cannot read a volunteer's transcript, the research path can
- [x] Host list shows per person: prep state, opt-in + 0–10, positions a/n, volunteer + mic; USB-C total; host excluded
- [x] Non-prepared registrant opening `/events/:slug/room` sees **Prepare now** and **Join the room without preparing**; Prepare now lands on prep at their resume step and the End CTA **Join the room** returns them; Join without preparing enters the room, and prep stays reachable from the room
- [x] Registered box and room show **Prepared ✓** or **{k} of 6 steps** on the attendee's phone (room since UAT round 2: the roster check / the Back-line link)
- [x] Screen 0 shows the why line before **Prepare now / Remind me by email**; no how-heard question; "Remind me" triggers no extra email
- [x] Clips load from the storage bucket, start playing before full download (faststart), play at 1.15x; transcript toggles
- [x] Existing-behaviour tests for every opt-in prop pass (StakePage, MeetingPrincipleView, Mp4VideoFacade, LetterProgressBar, LetterFlowContent) and `/meet`, `/stake`, letters render unchanged

- [x] Event create/edit has a **Preparation** on/off setting defaulted by series (Clarity Night on, hikes off); off → no prep block or room gate for that event
- [x] Event without a statement tag: positions step hidden, minutes recomputed; tag with no story authors: experts block hidden; expert names come from story authors, not hardcoded
- [x] Host photo/name come from the event's host profile under "Your event host"; a non-founder host's event plays the founder's intro videos
- [x] Volunteer places read from a per-event value (default 6) changed via SQL
- [x] Social proof sums prepared/opted-in across past series events + this event; each count hidden at 0
- [x] Confirmation block: 0 done shows question + Prepare now / Remind me by email; 1–5 shows "{k} of 6 steps done" + Continue your preparation; done shows Prepared ✓; "0 of 6" never renders; pinned to the bottom bar only when inline it would end below the fold
- [x] Room gate skip opens no dialog and shows the consequence line; room banner reads Start / Finish your preparation by state

UAT round 1 (founder, 2026-10-01):
- [x] Step 3b's opted-in line counts past Clarity Night **room** opt-ins (Clarity Night #1 had no preparation); distinct people; host, opt-outs and other series excluded; at most 4 faces (integration `UAT: opt-ins given in past Clarity Night rooms…`, 13/13; test DB mirroring prod reads "11 people opted in at Clarity Nights")
- [x] The step 3b question is the page heading: centered, same size as every step's title
- [x] Step 6b says why a close mic is needed before the USB-C question; answers are white buttons in the page; after "No, and I don't have a microphone" the note and **Continue** stay in view at 320px (E2E `mic-why`; screenshots 390/320/1280)
- [x] End screen: app menus return (`?done=1`); the CTA is pinned with **Back to the event**; no status badge; expert names without the "Agent ·" prefix (E2E walk)
- [x] **Prepared ✓** is a quiet line (registered box, event page), never a green pill

UAT round 2 (founder, 2026-10-01):
- [x] In the room, "prepared" is a small blue check after the row's answer ("8/10 ✓"), explained on hover / tap; the unfinished-preparation link sits on the Back line; nothing is shown once prepared (integration `get_event_room_prepared` — completed prep, still registered, in the room; walk-ins never; readable only by people registered for the event or its host; anon refused — 14/14; E2E `room-roster-prepared` + tap shows "Prepared for the event")
- [x] Social-proof line names two scopes, "previous Clarity Nights" and "this event", never a sum (unit `socialProofLine`; integration `optedInPrevious`); faces 40px, no pledge ring; every prepared person has a prepared face, an opt-out never an opted-in face (integration)
- [x] Plan screen: the steps' header with a back arrow; "Your preparation" + "{n} steps · about {N} min"; **Start now** under the list at every width (E2E `plan-summary`)
- [x] End screen's WhatsApp glyph is WhatsApp green; the button stays outlined

## Pre-deploy Checklist

- [x] Clips: upload the 8 faststart files (`*-v1.mp4` + `*-v1-poster.jpg`) to `gs://claritypledge-story-images/event-prep/` with a one-year cache, BEFORE `/push`, and confirm each is served (HTTP 206 on a range request). Same bucket for every environment. **Done 2026-10-01:** all 8 return 206, `video/mp4` / `image/jpeg`, `cache-control: public, max-age=31536000`; `moov` at byte 36 in all four MP4s (faststart); bucket has no lifecycle rule (nothing auto-deletes), 7-day soft delete.

## Post-deploy (after `/push` applies the migrations)

These cannot run before the merge: the `statement_tag` column arrives with the migration, and the group link is the founder's own Edit-event action. Without either the flow still works (no step 5 / no group button).

- Set `statement_tag = 'ikigai1'` on the 6 Oct Clarity Night (prod).
- Add the WhatsApp group to the 6 Oct Clarity Night (Edit event) — prod has `has_group_chat = false` for it today.

## Founder decisions

Decided 2026-10-01: P1336 = core prep flow; emails + sign-in redirect split to P1380. No research
waitlist (places-left floored at 1, overbooking accepted; waitlist a possible later upgrade).
Pairing takes volunteering into account; recording pause/resume is P1337. Late arrivals may join
without preparing and return to prep anytime; status visible on their phone. Immediate registration
(variant C rejected), short why on confirmation, no how-heard (prototype `/tree/p1336-d`).

Decided 2026-09-30: emails + magic-link sign-in; company-only research transcript access; no face
blur (consent obtained); research link stays GitHub; room-opened prep ends with
**Join the room**; copy suggestions not applied (current wording kept, DRAFT labels remain).

## Related

- [p1337](../../p1337_event_journey_on_screen_steps_rotation_and_ending.md) room journey · [p1338](../../p1338_clarity_night_deck_cut_theory_and_run_rounds.md) deck
- [p1055](../../p1055_norm_measurement_instrument.md), P1114, P1179 opt-in · [p784](../../p784_st1_st6_restructure_two_needs.md) ST1 · P1256 event email cron · [P1358](p1358_disagreement_pipeline_attribution_summaries_story_models.md) statements slot
