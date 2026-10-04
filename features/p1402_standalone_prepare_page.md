---
status: in-progress
type: story
rank: 22
workstream: events
created_date: '2026-10-04'
tags: [prepare, onboarding, understanding, stories]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1402: Standalone /prepare — the explainer anyone can open, without an event

## Problem

**Situation:** The preparation flow (P1336) exists only at `/events/:slug/prepare`, for a signed-in,
registered attendee of an event with Preparation on. Its once-per-person parts (intro video,
cognitive-understanding video, principle intro, cmp7) are stored in `person_prep_parts`, which only
`authenticated` can read or write (`supabase/migrations/20261001120000_p1336_event_preparations.sql:168-182`).
Event preparation also **hides** parts a person already completed (`buildPlan` in
`src/app/prototypes/events/prep/prep-plan.ts`).

**Complication:** The homepage (P1392) and a future "become a clarity host" path have nowhere to send
someone into the explainer before an event exists. And the content has no permanent address: if a
step breaks, or someone wants to show a video to a friend, there is no page where it is reliably
found. The same anecdote is also told in two recordings: st1 on the homepage (YouTube
`k4zpMYIKK5A`, "Three kinds of understanding") and prep's story clip
(`event-prep/cognitive-understanding-v1.mp4` on GCS). Verified on prod 2026-10-04; the founder
watched both and confirmed: *"they are one."*

**Question:** What does an event-independent `/prepare` show, who can use it, and how does it share
progress with event preparation without making anyone repeat a part?

> Founder framing, verbatim: *"Slash prepare is kind of like a fallback … what if we have a bug and
> people want to find some specific video … In Slash prepare, they will be always able to find it.
> I'm okay with carrying over, but Slash prepare probably doesn't need to change. So, it doesn't
> need to hide anything."*
>
> On the opener: *"the idea is they need to know why before, and it's important to know why."*

## Appetite

Blast radius: medium. It touches one new route, the shared story video player (every story card
with a video), and the event preparation's read of completed parts. Reversibility: high. A new
route plus one data change on st1 (`video_url`), revertible by restoring the YouTube URL.
Decision density: a few founder calls (route name, copy, end-screen order); scope decided
2026-10-04.

## Decisions taken in conversation (2026-10-04, founder)

1. **Audience and end:** first, a homepage visitor on the way to an event; second, a future host.
   The end screen offers upcoming events first and becoming a host second. The host path itself is
   out of scope.
2. **`/prepare` shows everything and hides nothing.** Completed parts show a done mark and can be
   replayed. It is the permanent home of the content.
3. **Carry-over works in one direction: `/prepare` → event preparation.** Completing a part on
   `/prepare` counts in event preparation, so nobody repeats it there. Signed-out visitors can
   use `/prepare`; their progress is kept in the browser and written to `person_prep_parts` when
   they sign in or register (the `/meet` localStorage pattern, `meeting-terms-page.tsx`).
4. **Opener: keep it simple.** No event welcome video, since its script speaks about "the
   discussion we will have today". One short "why" line leads into the story. A pick-your-why
   opener (personal or professional relationships → short scenario clips from the manifesto,
   `src/app/content/full-article.md` §II) is a **follow-up spec** (P1410), not this one.
5. **One recording of the understanding story:** our own clip, not YouTube. st1 and the prep
   story step both play `cognitive-understanding` from GCS, and completing it in either place
   marks the `cognitive_video` part.

## Founder UAT round 1 (2026-10-04)

> *"This is just learn more about clarity process or something … I think this is connected to the
> one onboarding generally. Just like general onboarding for somebody who is not logged in."*

Applied:
- Framing: general onboarding for someone not logged in, not "prepare for a Clarity Night". Title
  "Learn about the Clarity process" [FOUNDER DECISION: final copy]; principle step "Learn about the
  Clarity Meeting Principle".
- No "Sign in to keep your progress" line on the first screen; the main button reads "Start here".
- Principle question: "Would you follow this principle in your important conversations?"
- After the answer, the event preparation's follow-up is kept as designed: opt in → "Try it now" →
  0-10; opt out → "can I ask you one question?" → 0-10 or "No, continue". Back changes the answer.
  The asker is the founder (the clips are his voice). Nothing is recorded (no event).
- cmp7 uses the event preparation's statements bar: "0 of 7 answered", Continue dimmed until all
  are answered, "Skip and proceed".
- New step 4 after cmp7: the misunderstanding diagnosis (the `misunderstanding` statements, as on
  `/stake/misunderstanding`).

Open (founder): a letter recommendation from the diagnosis (no mapping exists in code), and a
comparison step (P1337's `/compare/:person`, built, unshipped, at `qa`). Related backlog: P1025
(self-serve onboarding), P1003 (3-minute audit → report).

## Founder UAT round 4 (2026-10-04)

> *"some people they need to read transcripts … maybe it's always visible and we've fixed the play
> button and the continue button as we did otherwise everywhere else and both on desktop and
> mobile and also both in the event room and here"*

- Transcripts are always visible under each clip (no "Read the transcript" toggle), in `/prepare`
  and the event preparation (shared `Transcript`).
- Video steps pin Play / Continue on desktop too, in both. With round 2, P1387's "in the page on
  desktop" now holds only for choice steps (principle decision, research, plan, end).
- The thank-you page is the thank-you and one button, "Explore events" (→ `/events/list`); no
  events list, no groups (round 3 superseded).
- Localization of the preparation (switcher, translated text, dubbed clips) filed as P1409. The
  founder's question "summary or a proper transcript?" is open there.

## Founder UAT round 2 (2026-10-04)

> *"on desktop it's not fixed at the bottom but maybe it should be fixed at the bottom because this
> is how I see my progress one out of seven answers"*

- Step 4 reads "Let's find out how you think understanding works between people" (list: "Share how
  you think understanding works between people") [FOUNDER DECISION: final copy].
- Statements steps ("N of M answered", dimmed Continue, Skip) are pinned on desktop too — in
  `/prepare` AND the event preparation. **Narrows decisions.md 2026-10-02 (P1387)**, which put
  every step's actions in the page on desktop; video and choice steps keep that rule.
- The end screen is a destination like the home page: the next events and groups
  (`HomeHighlightsBlock`, the home rail's content), the menus back (`?done=1`), no pinned bar.
  "Want to host one? Book a call" and "Review the steps" are small links. The event
  preparation's end screen is unchanged (stays immersive, P1387).
- Round 3: *"it's the thank you page that's the main thing"* — the thank-you leads, centred; then
  only the next events as compact rows (`NextEventsCompact`), no groups, no big cards.

## Solution

A `/prepare` route, a sibling of `/meet` and `/ready`: no sign-in wall, event-free.

**Steps on `/prepare`:** why line → **story** (the cognitive-understanding clip) → **principle**
(`MeetingPrincipleView` level 3, the same as `/meet`) → **cmp7** (the expected-benefits
statements). The event-only steps stay event-only: `welcome` (event-framed video), `stake`
(the event's statement tag) and `research` (the event's volunteer places). The steps reuse the
existing prep components; this spec does not create a second implementation.

**Progress:**
- Signed-in: read and write `person_prep_parts` directly; no new table.
- Signed-out: the browser holds each part's completion and content version; on sign-in it is
  merged into `person_prep_parts` (an existing completed row is never overwritten with an older
  one).
- cmp7 answers are positions on points. If the existing positions write requires an account,
  signed-out cmp7 [UNVERIFIED: whether positions can be recorded signed-out]. `/architect`
  decides between browser-held answers merged on sign-in and a sign-in prompt at that step.

**Event preparation:** keeps hiding parts already done (P1336 behaviour unchanged). Because
`/prepare` writes the same parts, a person who prepared there sees a shorter event plan.

**One understanding story:**
- The shared story video player (`src/lib/video.ts`, YouTube-only today:
  `VideoProvider = 'youtube'`) learns to play a self-hosted mp4 from the public-media origin.
- st1's `video_url` points to the GCS clip.
- Finishing the clip from the homepage story while signed in marks `cognitive_video`
  [FOUNDER DECISION: yes/no — or the homepage stays a viewing place only and marks nothing].

**Entry points:** `/prepare` gets a place in the menu or links next to `/meet` and `/ready`
[FOUNDER DECISION: where it is linked from — feed, nav, the pinned story's end, or not linked yet].

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Story player changes break existing YouTube story videos | MITIGATE | YouTube stays the default path; mp4 is an added branch; e2e on a YouTube story and on st1 |
| A browser-held completion forged in localStorage marks parts done | ACCEPT | It only shortens the person's own preparation; nothing else reads it |
| Signed-out progress lost (private window, cleared storage) | ACCEPT | Same as `/meet`; the content stays replayable |
| st1's quote timecodes (`video_quotes`) assume the YouTube cut | MITIGATE | st1 has no quotes today (`quotes: []`, prod 2026-10-04); re-check at /dev |
| The mp4 is blocked by production CSP | MITIGATE | `media-src` already allows `storage.googleapis.com` (decisions.md 2026-10-01, P1336/P1385); test against `vercel.json` |
| Shared browser: parts done signed out are credited to whoever signs in next there | ACCEPT | Same rule as anonymous positions today (P502, `AuthCallbackPage.tsx`); only shortens that person's own preparation. Adversarial review 2026-10-04 |
| A sync during an event preparation already under way drops a step mid-flow | MITIGATE | The sync never dates a part before the preparation's `started_at` (unit-tested) |
| Two routes drift (event prep vs `/prepare`) | MITIGATE | Shared step components and one `prep-plan` source; no fork |

**Non-Goals**
- Do NOT build the pick-your-why or scenario opener (follow-up spec P1410).
- Do NOT build the "become a clarity host" path, beyond a link on the end screen if the founder wants one.
- Do NOT change event preparation's hiding behaviour or its step order.
- Do NOT add a new table, and do NOT fork `person_prep_parts`.
- Do NOT delete the YouTube video or other stories' videos.

## Invariants

- A part completed anywhere is never asked again in event preparation unless its `PART_VERSIONS`
  bumps (P1336).
- `/prepare` never hides a part; every clip on it is always playable.
- Public media is served only from an origin the production CSP allows (decisions.md 2026-10-01).

## UX Notes

- **Happy path:** open `/prepare` → why line → story → principle → cmp7 → end screen (upcoming
  events, then host).
- **Returning visitor:** every step is listed with ✓ on the completed ones; they can jump to any step.
- **Signed out:** no wall; a quiet line offers to sign in to keep progress [FOUNDER DECISION: copy].
- **Error:** the video fails to load → the transcript is shown (prep already has transcripts in
  `prep-content.tsx`).
- **Phone layout:** follow decisions.md 2026-10-02 (P1387): content scrolls, the action is pinned in one slim bar.

## UI Contract

- Route: `/prepare` [FOUNDER DECISION: route name — `/prepare` proposed].
- Why line: [FOUNDER DECISION: copy].
- End-screen CTAs and their order: upcoming events (primary), host (link) [FOUNDER DECISION: copy].

## Acceptance Criteria

- [x] A signed-out visitor opens `/prepare` and can play the story, read the principle and reach the end screen without signing in — e2e `p1402-standalone-prepare.spec.ts` smoke (320px, no console errors), 3/3 passed with retries off
- [x] A visitor who completed the story on `/prepare`, then signed in and registered for a Clarity Night, does not get the story step in that event's preparation — e2e: agenda lacks the story row; `person_prep_parts` carries the /prepare date; local store cleared
- [x] A signed-in person who completed every part still sees all steps on `/prepare`, marked done and replayable — e2e
- [x] The homepage pinned story (st1) plays the self-hosted clip, not YouTube; a different story with a YouTube video still plays — on **test** (st1 `video_url` set there): /feed pinned story played to 24s of 84s in our player, no YouTube iframe; YouTube path pinned by `p1402` + `p1141-story-media` unit tests. `[post-deploy]` needs the prod st1 change in the Pre-deploy Checklist
- [x] The clip plays on claritypledge.com under the production CSP — verified by a test against `vercel.json` (`p1385-public-media.test.ts` pins `publicMediaUrl`'s origin in `media-src`; the clip is built only through it). `[post-deploy]` re-check on prod
- [x] Phone (375 and 320) and desktop screenshots pass the visual QA checklist — no horizontal overflow at 320 on any step (`scrollWidth` 320); separate QA reviewer's findings: header wrap fixed; pinned-bar edges, poster overlay and small skip link are the shared P1387 components, unchanged; sparse end screen awaits the copy decision

## Pre-deploy Checklist

- [x] Prod migration `20261004150000_p1402_story_video_public_media_mp4.sql` — founder-approved 2026-10-04; applied by `/push` step 2.5 for the pushed SHA (P1211: `/ship` never migrates prod; the `schema-ready` check refuses a push without it)
- [x] Prod st1 (`883d89f5-…`) `video_url` switch — founder-approved 2026-10-04; a POST-push step (the old frontend reads only YouTube URLs), tracked as INBOX-114 with the revert value

## Done-When

- [x] Founder decisions above are recorded in this spec — four UAT rounds (2026-10-04, sections above); founder approved scope and the prod changes ("yes … then ship")
- [x] A follow-up spec for the pick-your-why or scenario opener is filed — P1410; letter recommendation + comparison filed as P1411; localization as P1409

## Open Questions

1. Can positions (cmp7) be recorded signed-out today, or does that step need a sign-in prompt? (`/architect`)
2. Should finishing st1 on the homepage count as the `cognitive_video` part? (founder)

## Related

- [P1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md): event preparation, `person_prep_parts`
- [P1387](done/2026-06-10/p1387_mobile_prep_screens_scroll_in_two_parts.md): phone layout rule
- [P1392](done/2026-06-10/p1392_feed_first_homepage_and_nav.md), [P1397](done/2026-06-10/p1397_pinned_story_expands_inline.md): st1 pinned on the feed
- decisions.md 2026-10-01 [product] (P1336 scope), 2026-10-01 [technical] (CSP media origin, immersive route), 2026-10-02 [product] (P1387)
