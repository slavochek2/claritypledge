---
status: all-done
type: story
rank: 339
workstream: events
created_date: '2026-11-15'
tags: [prepare, listening-game, video, onboarding]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
spec_review_hash: 15546fcf02d705ed83837ec3217aa1175225595971593f1c0847c644b013e333
spec_review_vendors: [codex, gemini]
completed_at: 2026-11-16
---

# P1685: The Listening Game in every preparation

## Problem

**Situation:** Most people who join go through a preparation (exceptions: members who already learned skip it, and hike preparation is optional): standalone `/prepare` (open to anyone; community join redirects there, `org-join-page.tsx:42`), and event preparation `/events/:slug/prepare` (Clarity Hikes, Sales Mastermind and every other event series). The preparation teaches the principle and asks people to opt in to it. It never shows how to *use* it in a live conversation.
**Complication:** A 90-second explainer of the Listening Game now exists (the role cards with the pause band: talk normally, "Now I want to be the speaker", both bands up = playing, bands down = back to normal talk). The founder sees the game as the practical trigger for the promise people opt in to.
**Question:** Show the game in every preparation, through one shared block.

> Founder, verbatim: "everywhere slash prepare is there, for example, the game should be part of slash prepare somewhere. And also in joining as member and, you know, joining our events and part of Sales Mastermind onboarding practice and part of Clarity Hikes."
> "Maybe one has to be able to enable and disable it, but right now I don't know if it should be disabled anywhere because the game is how we all personalize using the Clarity practice."
> On timing: the founder accepted the recommendation not to wait for P1592: "Oh, you suggest we don't wait. OK, so let's do it then."

The places named ("everywhere slash prepare is there") are: (1) `/prepare` standalone, (2) member/community joining (reaches (1)), (3) event preparation for every series, including (4) Clarity Hikes and (5) Sales Mastermind. All five are served by `PreparePage.tsx` and `EventPrepPage.tsx`.

## Appetite

Blast radius: medium. It changes the principle step of every preparation flow (standalone, join, event, and the learning drawn inside the event room). Preparation gates the room only for series that require it (`gatesRoomOnPreparation`, `series-recipes.ts:254`); hike preparation is optional. Reversibility: high (git revert; no migration). Decision density: a few founder calls (wording, publishing the video, hike room scope).

## Founder decisions, 2026-11-16 (supersede Solution items 2-5 and 7 below where they conflict)

> Founder, verbatim: "don't you think we need a proper description so somebody who doesn't look at the video should make sense how the game works", "why is it not a separate step?", "we made always other videos mandatory, why would we make an exception here? ... we need to make it mandatory to play it and then we can go forward", and on the manifesto film on the success screen: approved ("yes to all but 3").

- **D1. Its own numbered step**, `game`, BEFORE `principle` (founder, 2026-11-16 later: "yes swap them"; the game is experienced first, the principle then formalises it), in standalone, join and event preparation, every series. It is a tracked part (`listening_game`) with a content version, so it is shown once per person, resumes, and counts in "Step X of N". This needs a migration widening the `person_prep_parts.part` and `event_preparations.current_step` CHECK constraints (additive; applied on TEST only until ship). Supersedes the "no part, no migration, no step-count change" Non-Goals and Invariant.
- **D2. Written rules stand on their own**, above the video. Founder-approved text (step 3 to be confirmed against the game by the founder):
  Heading: "How the Listening Game works". Intro: "Each of you holds a card with a sliding band." 1. "Most of the time your band is down. Just talk as you normally would." 2. "When something matters to you and you want to be fully understood, say "Now I want to be the speaker" and slide your band up." 3. "The other person slides theirs up too. Now you're playing: they listen and say back what they understood, until you say "yes, that's it."" 4. "Then you both slide your bands down and talk normally again."
- **D3. The video is required, everywhere** (as every other preparation video since P1529 UAT round 3): "Play the video" only; after it plays, "Continue". No skip link.
- **D4. Success screen of standalone `/prepare`** embeds the manifesto film (the existing component) with "Read the manifesto" below it as the one primary action. Reverses the 2026-11-15 P1682 placement ruling for this one screen, by founder decision.

## Solution

1. **One shared Listening Game screen**: the video plus the rules in at most four short lines. One component, used by `PreparePage` (standalone and join modes) and `EventPrepPage` (event pages and the in-room learning), so a change is made once.
2. **Placement: the last screen of the principle step, in every mode.** It comes after everything the step already does: the intro clip, and, where they exist, the opt-in answer and its follow-ups ("Try it now" / "Yes" / "No, continue", and the 0-10 rating). It sits just before the step completes and the flow moves to the next step. Join mode has no opt-in question (`PreparePage.tsx:362`), so there it follows the principle intro and certificate. The rule is the same everywhere: the step's own finish handler goes through this screen first. It shows as "this is how you use the promise", and it appears whatever the opt-in answer was.
3. **Shown in the same pass as the principle intro clip.** The rule is one snapshot, taken when the principle step opens: if that pass shows the intro clip, it ends with the Listening Game screen; if it skips the intro, it does not. It never reads the `principle_intro` part after the step opens, because the intro is recorded before the game screen (`PreparePage.tsx:527`, `EventPrepPage.tsx:866`). Result: standalone and join `/prepare` always show the intro, so they always show the game; event preparation shows both the first time, then neither for returning attendees. A person who leaves between the intro and the game screen misses the game later (ACCEPT, below). A tracked part would need a migration (`part` CHECK constraint, `20261001120000_p1336_event_preparations.sql:158`) and is a Non-Goal.
4. **Buttons follow the existing video rule** (founder 2026-10-02, `EventPrepPage.tsx:619`): "Play the video" is primary, with a small "Continue without video" link under it; after playing, "Continue". The screen has its own button bar in both pages. `PreparePage`'s `videoBar` (`PreparePage.tsx:327`) has no skip link on purpose, because skipping there would leave a tracked part undone; the game records no part, so its skip link is safe. Back returns to the screen the person came from: the rating, the opt-out "No, continue" prompt, or, in join mode, the intro.
5. **Progress and time:** when the screen is shown, the principle step's sub-progress counts it (`stepCount` / `committedSteps` at `PreparePage.tsx:396`, the join-mode bar at `PreparePage.tsx:385`, and `EventPrepPage.tsx:710`). The step's minute estimate includes the clip only when the flag is on and the intro is shown (a new `CLIP_SECONDS` entry at `PLAYBACK_RATE`, `prep-plan.ts:123`, passed through `stepSeconds`). Numbered steps ("Step 2 of 6") do not change.
6. **Switch:** a `listeningGame` flag on the series recipe (default on), read by `EventPrepPage`, and one constant for standalone and join `/prepare`. Today only `social-hike` has its own recipe; Clarity Night, Sales Mastermind and every other series share `CLARITY_NIGHT_RECIPE` (`series-recipes.ts:211-217`). Turning it off for one of those means first adding that series' recipe entry. That is the existing pattern ("A third series (the sales mastermind) adds one entry here", `series-recipes.ts:9`), and it is deliberately not built now, because nothing is to be off today.
7. **Video file:** `listening-game-v4.mp4` (89.7 s, burned-in on-screen text, so no caption track), plus a poster without text in its centre (P1682). Production URL: `publicMediaUrl('event-prep/listening-game-v4.mp4')`. For local review before the upload, the file sits in a gitignored local folder and the dev server alone resolves it there. That override is dev-only, and the production build never contains a local path.
8. **In-room learning:** when the learning is hidden inside the room (the `active` state of `PrepRoomEmbed`), the video pauses.

[FOUNDER DECISION: the screen's heading and the rule lines. Draft for review: heading "The Listening Game: how to use this in a real conversation"; rules "Talk normally, band down." / "When it matters: 'Now I want to be the speaker.' Slide your band up." / "Both bands up: you're playing." / "Done? Bands down, just talk."]

[FOUNDER DECISION: publish the video with the current placeholder narrator, or wait for the founder's cloned voice.]

[FOUNDER DECISION: scope. Hikers who skip the optional preparation and opt in at the room's Decide step never reach the principle step, so they do not see the game. Should the hike room's Decide step also offer it? Not built until decided.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Another video competes with the next action (P1682 ruling in decisions.md: "a second video on a 'done' screen competes with what the person does next"; the preparation already has the welcome, story and principle clips) | MITIGATE | Not on a done or success screen; once per person; skippable with the existing video-button pattern |
| Longer first preparation, so fewer people finish | ACCEPT | About 78 s at 1.15x, first time only. Compare the share of started preparations that finish, for the 4 weeks before and after; the founder decides on a drop of more than 10 points |
| Video keeps playing while the in-room learning is hidden | MITIGATE | Pause on hide (Solution 8), with a test |
| The video is not publicly hosted yet | MITIGATE | Local-only override until the Pre-deploy Checklist upload |
| A person who leaves after the intro and before the game screen never sees it in event preparation later | ACCEPT | Rare, and standalone `/prepare` still shows it |
| Members who already learned skip `/prepare` on join (`org-join-page.tsx:35`) and never see it | ACCEPT | They met the principle before this existed; showing it to them needs a tracked part (a migration) |
| P1592 later reshapes the preparation | ACCEPT | Self-contained screen that moves with the principle step |

**Non-Goals**
- (Superseded by D1: the game is a numbered step with a tracked part and one additive migration.)
- Do NOT put a video on any success/done screen or move the manifesto film.
- Do NOT change the opt-in wording, its follow-up screens or the room flow.
- Do NOT add series recipes or an admin UI for the switch.
- Do NOT push, deploy or upload the video.

## Invariants

- The success screen keeps exactly one primary action (P955; the 2026-11-12 /prepare ruling: its one button is "Read the manifesto").
- (Superseded by D1.) The step lists change only by inserting `game` after `principle`; no existing step, part or stored value is removed or renamed.

## Acceptance Criteria

- [x] Standalone `/prepare`: a numbered Listening Game step comes BEFORE the principle (step 2 of 5); the header counts it. Evidence: p1685-prepare-page + p1685-plan-recipes tests; browser agenda read 2026-11-16 ("2 The Listening Game: how to reveal the gap in 3 seconds").
- [x] Join mode: the same step before the principle, the join overview numbers the terms row 5. Evidence: p1685-prepare-page join tests, p1549-join-gate.
- [x] Event preparation (Clarity Night, hike, sales mastermind both timings) and the in-room learning: the step before the principle. Evidence: p1685-event-prep, p1685-plan-recipes, p1529 tests.
- [x] The screen follows the step pattern: title, two-sentence subtitle, video, then "The roles" (founder rounds 2 to 4). Evidence: p1685-pause order test; 375 px and 320 px screenshots.
- [x] The video is required: only "Play the video" until played, then "Continue"; no skip link; a failed load can continue without recording the part. Evidence: p1685-prepare-page and p1685-event-prep failure-path tests.
- [x] The step is a tracked part, once per person, resumes, a returning attendee who finished it does not see it. Evidence: p1685-plan-recipes, p1685-event-prep.
- [x] Flag off (standalone constant and recipe): the step is absent and the count is as before. Evidence: p1685-flag-off.
- [x] The minute estimate includes the game step (watch time plus reading time). Evidence: p1685-plan-recipes.
- [x] Hiding the in-room learning pauses the video, and a video mounted while hidden does not autoplay. Evidence: p1685-pause, mp4-video-facade tests.
- [x] The migration widens the part and step constraints only; applied on TEST (self-hosted, 2026-11-16); pre-commit migration check passes. `[post-deploy]` the push applies it on prod before the client deploys.
- [x] Standalone `/prepare` success screen: "Introduction complete", the manifesto film, "Read the manifesto" as the one primary action, "See upcoming events" as a link. Evidence: p1685-prepare-page (incl. click to /manifesto).
- [x] Works at 320 px, 375 px and desktop, nothing hidden under the action bar. Evidence: screenshots 2026-11-16 reviewed by a separate visual-QA agent.
- [x] Existing preparation tests pass (p1336, p1402, p1529, p1542, p1549, p1682: 1,301 passed); full pre-commit suite passed on the last commits.

## Founder decisions, 2026-11-16 (second round, supersede D2 copy and the end-screen words)

- Layout like every other video step: title, one intro line, video, then "How it works" rules below (founder: "everywhere we have the video first").
- Rules text taken from the video script (speaker, listener, observer; 0 to 10, the lower number counts; the listener never argues).
- Step title: "The Listening Game: how to reveal the gap in 3 seconds" (founder wording).
- Intro line: the value is revealing a gap in understanding in seconds and making the check a shared norm, by teaching it fast (founder).
- Standalone /prepare end screen: "Introduction complete" + "You know how to listen for understanding and how to check it. Next, try it with other people at an event. The manifesto explains why it matters." Film kept as is.
- Sales mastermind role times left unchanged (founder: they already allow for it).

## Open founder decisions (from review, 2026-11-16)

- [FOUNDER DECISION: people who learned before the game existed count as "learned" (`hasLearned`) and skip it when joining a group. Keep (current), or require the game too, which sends every existing learner back through it on their next join.]

Accepted from review: people part-way through a preparation when this ships gain one step ("3 of 5" becomes "3 of 6"); finished preparations stay finished (completion reads the finish time), so no one newly blocked from a room. "Played" counts from pressing Play, as for every other preparation video.

## Pre-deploy Checklist

- [x] Founder approved the wording (rounds 1 to 4, 2026-11-16) and the placeholder voice ("Caseholder voice, it's fine", 2026-11-16). The hike-room Decide-step scope is not built and stays a later decision.
- [x] Deploy order: the push applies pending migrations before the client deploys (/push step 2.5), so the widened checks are on prod before code writes `game` / `listening_game`.
- [x] `listening-game-v4.mp4` and `listening-game-v4-poster.jpg` uploaded to the public media bucket under `event-prep/` on the founder's go (2026-11-16); both public URLs return 200 with the right sizes.

## Cost Budget

Google Cloud Storage egress, registry price about $0.12 per GB (provenance caveat in `docs/technical/metered-services.md`). The facade loads only the poster until someone presses play.

| Measure | Per user | Per 100 first-time preparations | At 10x (1,000) |
|---|---|---|---|
| Requests | 1 poster + 1 video (only if played) = 2 | 200 | 2,000 (Class B reads: 2,000 / 10,000 x $0.004 = $0.0008) |
| Egress (bytes) | 0.11 MB poster + 27.7 MB video if played = 27.8 MB | 100 x 27.8 MB = 2.78 GB, so 2.78 x $0.12 = $0.33 (upper bound: everyone plays it to the end) | 27.8 GB, so 27.8 x $0.12 = $3.34 |
| Log lines | 0 new | 0 | 0 |

**D4, manifesto film on the standalone `/prepare` success screen** (sizes measured from the bucket, 2026-11-16): poster 0.09 MB per finish; film 22.2 MB only if played. Per 100 finishes: 100 x 0.09 MB = 9 MB poster + at most 100 x 22.2 MB = 2.22 GB film, so 2.23 x $0.12 = $0.27 (upper bound: everyone plays it to the end); at 10x, 22.3 GB, so $2.68. Requests: 2 per finish (poster + film if played), 200 per 100, 2,000 at 10x (Class B reads: $0.0008). Combined upper bound with the game: $0.60 per 100, $6.02 at 10x. Database: one `person_prep_parts` row write and one progress refresh per first-time game completion, both inside existing calls' volume; 0 new log lines.

Repeat views: shown once per person in event preparation and on each standalone or join pass, so one person's re-watching adds at most 27.8 MB each time. Fits today and at 10x with no upgrade.

## Related

- P1402 (standalone /prepare), P1336 (prep plan), P1682 (manifesto film placement ruling), P1592 (not waited for, per the founder).
- Video source: private video folder (role-cards-video, v4).
