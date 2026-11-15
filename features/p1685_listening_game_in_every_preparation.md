---
status: in-progress
type: story
rank: 339
workstream: events
created_date: '2026-11-15'
tags: [prepare, listening-game, video, onboarding]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
spec_review_hash: 15546fcf02d705ed83837ec3217aa1175225595971593f1c0847c644b013e333
spec_review_vendors: [codex, gemini]
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
- Do NOT add a `PrepPart`, a migration, a numbered step or a step-count change.
- Do NOT put a video on any success/done screen or move the manifesto film.
- Do NOT change the opt-in wording, its follow-up screens or the room flow.
- Do NOT add series recipes or an admin UI for the switch.
- Do NOT push, deploy or upload the video.

## Invariants

- The success screen keeps exactly one primary action (P955; the 2026-11-12 /prepare ruling: its one button is "Read the manifesto").
- `ALL_STEPS`, `STANDALONE_STEPS`, `JOIN_LEARNING_STEPS` and `PART_VERSIONS` are unchanged.

## Acceptance Criteria

- [ ] Standalone `/prepare` (signed out, first time): after the opt-in answer and its follow-up, the Listening Game screen appears before the next step, with "Play the video" and a "Continue without video" link.
- [ ] Join mode (`/prepare?then=join&group=…`): the screen appears after the principle intro, before the statements step.
- [ ] Event preparation, on a Clarity Night event and on a hike event that opens its optional preparation: the screen appears at the same point, and on the in-room learning too.
- [ ] An event preparation pass that skips the principle intro (returning attendee) does not show the screen, and a pass that shows the intro does, even after the intro is recorded mid-step (tests).
- [ ] With the flag off (test, standalone constant and recipe), the principle step behaves exactly as before: same screens, same sub-progress.
- [ ] The rendered header shows the same "Step X of N" in standalone, join and event modes, flag on and off (render tests, not only `prep-plan` tests).
- [ ] The principle step's minute estimate includes the clip when it is shown (unit test).
- [ ] Hiding the in-room learning pauses the video (test).
- [ ] The screen works at 320 px, 375 px and desktop, with no rule text under the action bar (screenshots, visual-qa checklist).
- [ ] Existing preparation tests pass.

## Pre-deploy Checklist

- [ ] Founder approved the wording, the voice decision and the hike-room scope above.
- [ ] `listening-game-v4.mp4` and its poster uploaded to the public media bucket under `event-prep/`, on the founder's go.

## Cost Budget

Google Cloud Storage egress, registry price about $0.12 per GB (provenance caveat in `docs/technical/metered-services.md`). The facade loads only the poster until someone presses play.

| Measure | Per user | Per 100 first-time preparations | At 10x (1,000) |
|---|---|---|---|
| Requests | 1 poster + 1 video (only if played) = 2 | 200 | 2,000 (Class B reads: 2,000 / 10,000 x $0.004 = $0.0008) |
| Egress (bytes) | 0.11 MB poster + 27.7 MB video if played = 27.8 MB | 100 x 27.8 MB = 2.78 GB, so 2.78 x $0.12 = $0.33 (upper bound: everyone plays it to the end) | 27.8 GB, so 27.8 x $0.12 = $3.34 |
| Log lines | 0 new | 0 | 0 |

Repeat views: shown once per person in event preparation and on each standalone or join pass, so one person's re-watching adds at most 27.8 MB each time. Fits today and at 10x with no upgrade.

## Related

- P1402 (standalone /prepare), P1336 (prep plan), P1682 (manifesto film placement ruling), P1592 (not waited for, per the founder).
- Video source: private video folder (role-cards-video, v4).
