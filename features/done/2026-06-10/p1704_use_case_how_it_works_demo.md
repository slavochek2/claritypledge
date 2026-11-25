---
status: all-done
type: story
rank: 347
workstream: landing
created_date: '2026-11-17'
tags: [landing, video, analytics, use-cases]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: heuristic
spec_review_hash: c7e014900e9878ed50e2f6437add61ef5160611d60dd40cb4505388b11a4908e
spec_review_vendors: [gemini, openrouter]
completed_at: 2026-11-25
---

# P1704: Use-case pages show the product: a "How it works" section with the demo, and the founder's photo in place of the founder clip

## Problem

**Situation:** The "Use cases" pages show the problem, a 0-10 exchange, the Group Terms and the founder, but not the product. P1674 removed "How the platform works" because it claimed something unbuilt. Each page's one video is the founder talk clip, played 5 times in 180 days against 2,675 landing visitors.
**Complication:** A product demo video is being made in another session, and on 2026-11-17 the founder ruled where it goes (docs/decisions.md 2026-11-17 [product], P1701 exploration): on every use-case page, inside a "How it works" section, in place of the founder clip.
**Question:** Build that section on every use-case page, swap the founder clip for the founder's photo, and measure the demo by plays among people who saw it.

> Founder, verbatim (this session): "On every use-case landing: (1) replace the founder video in the founder section with the founder's photo from ladischenski.com, keeping the credibility text; (2) add a "How it works" section with the product demo video (from the media bucket; placeholder if it isn't there yet) plus 3-4 short steps under it, with step and heading wording marked [FOUNDER DECISION] for me to fill in; (3) keep the Group Terms section. One video per page. Add a play event and an on-screen event for the demo, with the page as location. Exception: the communities page will later get the Third Condition film instead (not part of this build)."

**The set "every use-case landing" ranges over** the seven "Use cases" menu entries (`AUDIENCE_LINKS`, nav-links.ts): /builders, /change-managers, /communities, /hiring, /founder, /hospitals, /coach. /communities is excluded by the founder (above). The other six get the full build. All six already render the shared founder section, and no other production route does (grep for `<FounderCredibility`, 2026-11-17: builders-fable = /builders, change-fable = /change-managers, hospitals-page, program-page = /hiring, coach-partnership-page = /coach, old-landing-2 = /founder). Two dev-only prototypes render the same page components and pick the change up automatically: `/tree/landing-fable` (builders-fable) and `/tree/landing-fable-change` (change-fable). They are unreachable in production and send no analytics (Mixpanel tracks in production only, `src/lib/mixpanel.ts`).

## Appetite

Blast radius: six public landing pages and one shared section; no data, auth or migration. Reversibility: git revert. Decision density: a few founder calls, all wording (heading, steps, placeholder text, the talk link under the photo). Placement and events are decided below from the P1701 ruling and the exploration.

## Solution

1. **Founder section shows the photo, not the clip.** In the shared founder section (founder-credibility.tsx), the photo takes the clip's place: left column on desktop, above the text on mobile. The credibility text is unchanged. The photo is the 640×640 one from ladischenski.com (the repo's `public/founder-photo.jpg` is the same picture at 400×400, too small for the desktop column on a 2× screen), uploaded to the media bucket at `founder/founder-photo-640-v1.jpg` and loaded with `publicMediaUrl()`. Square, rounded corners, cropped from the top, at most 320px wide on phones and 360px on desktop, so the section does not grow taller than it is with the clip. The `founder_clip_play` event and the clip constant go with the clip; the component's header comment (which still lists "/" and describes a clip) is updated to say what it now renders and where. The section stays a take-nothing component: no prop is added, because every page that renders it is a use-case page.
   - The link under the clip reads "Watch the full talk on YouTube", which makes sense under a stage clip and not under a headshot. `[FOUNDER DECISION: the link under the photo — draft "Watch my talk on YouTube", or remove it]`.

2. **A "How it works" section on the six pages,** placed **immediately before the Group Terms section** on each. On five pages that is right after the 0-10 exchange; on /hospitals it is after "The value for the hospital", which sits between the two. This follows the P1701 exploration's mock on /change-managers: by then the page has shown the problem, and the next question is what the app does about it. Contents, top to bottom: a heading that names the product, the demo video (click to play, self-hosted, the same player as the manifesto film), then 3 or 4 numbered short steps. One shared section component, so all six render the same thing; the only per-page input is the analytics location. Plain background with the top border the other fable sections use (the exchange before it is muted on five pages, and the Group Terms after it is a dark band on all six). It carries no section number, like the exchange, so existing sections are not renumbered. Anchor id `how-it-works` (/coach already uses `how` and `agreement`).
   - Heading: `[FOUNDER DECISION: heading — must name the product]`
   - Steps: `[FOUNDER DECISION: 3 or 4 steps, each a short title and one line; describe only what is built (P1674)]`
   - Until the founder fills them in, the section renders visible placeholder text in development. Placeholder copy never reaches production (Acceptance Criteria).

3. **The demo video is one constant;** while it is unset the frame shows a placeholder. The demo is not in the media bucket yet (`gcloud storage ls`, 2026-11-17: no demo folder). The constant holds the file, poster, poster alt text, play-button label, optional captions and duration. While it is unset, the 16:9 frame shows a static placeholder with no play button and no events: `[FOUNDER DECISION: placeholder text, draft "Demo coming soon"]`. Setting the constant is the only code change when the video lands.
   - The demo must be 16:9: the player crops to fill a 16:9 frame (`object-cover`), which would cut the edges off a screen recording in another shape. Its poster must have no text in its centre, where the play button sits (P1682).
   - If the video fails to load after Play, the frame falls back to the placeholder frame with an error line (`[FOUNDER DECISION: draft "The video could not load. Please try again later."]`), using the player's existing `onError`. The player shows nothing on its own today, which leaves a black box.

4. **Events.** On each of the six pages, with `location` = the page's path without the slash (`builders`, `change-managers`, `hiring`, `founder`, `hospitals`, `coach`). Not the `landing_page_viewed` variant, which differs from the URL on three pages (`build-right-thing`, `program`, `old-landing-2`) and would make the report harder to read:
   - `demo_video_seen`, once per page view, when at least 35% of the video frame is on screen (the threshold the exchanges use for their own view events).
   - `demo_video_play`, once per page view, on first play (the player's `onPlay`, which fires once per mount).
   - Neither fires while the placeholder is shown, so a placeholder never counts as "seen".
   - `manifesto_film_seen` on the manifesto film, same rule, with the film's existing `location`: `manifesto` on /manifesto and `prepare_end` on the /prepare end screen, matching `manifesto_film_play`. The P1701 ruling judges the demo "by plays among people who saw it, against the manifesto film measured the same way", and the film has a play event but no seen event today.

## Invariants

- **One video per page** (P1701 ruling 2): each of the six pages renders at most one video player, and exactly one once the demo constant is set.
- **The founder section takes no props** and renders the same on every page (2026-07-21 [technical], P1005/P1006). Browser-check every route that renders it.
- **Public media only through `publicMediaUrl()`** to the GCS bucket (P1385; production CSP blocks any other host).
- **No YouTube player on our pages** (2026-11-15 [product], P1682). The talk link-out is a link.
- **The steps describe only what is built** (P1701 ruling 1, P1674).
- **A poster for the centred play button has no text in its centre** (2026-11-15 [product], P1682).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A placeholder in place of the video looks unfinished on public pages | DEFER | Unblocked by the demo upload, or by the founder accepting the placeholder in public (Open Question 1) |
| Steps drafted before the demo exists don't match what it shows | MITIGATE | Steps are founder wording, filled in after watching the demo cut |
| Existing tests assert the founder clip (`src/tests/founder-credibility.test.tsx`, `src/tests/p1674-fable-use-case-pages.test.tsx`) | ACCEPT | Intended behaviour change from a founder ruling; those assertions are rewritten to the photo, not deleted, and `/dev` lists each changed assertion in the spec's build notes |
| The section lengthens six pages that already run long on phones | ACCEPT | Ruled by the founder (P1701); judged by the seen/play events |
| A demo recorded in another shape than 16:9 gets its edges cropped | MITIGATE | The 16:9 requirement is stated above and checked when the constant is set |

**Non-Goals**
- Do NOT change /communities (the Third Condition film goes there later, under its own spec).
- Do NOT build the Third Condition page (/trust) or add any link to it.
- Do NOT write the heading, step, placeholder or link copy beyond the drafts marked above.
- Do NOT touch the hero, exchange, value, Group Terms, norm or closing sections except to insert the new section.
- Do NOT add the demo to /manifesto, /demo, event pages or group pages.
- Do NOT add autoplay or preload the video.
- Do NOT change the other users of `public/founder-photo.jpg` (old landing, a prototype).

## Acceptance Criteria

- [x] On /builders, /change-managers, /hiring, /founder, /hospitals and /coach, a "How it works" section (anchor `#how-it-works`) sits right after the hero's stat band (/coach: right after the hero), unnumbered, with a heading, a 16:9 video frame where the page has a film, and 3-5 numbered steps. *(Amended 2026-11-25 per founder: placement moved up from before the Group Terms; five steps from the film.)*
- [x] A page with no film (DEMO_BY_PAGE null, today /hospitals) shows the heading and steps only, with no frame, no play button and no events; a page with a film shows a click-to-play poster, and a failed load after Play shows the error frame (announced as an alert), not a black box. *(Amended 2026-11-25 per founder: per-page films; no placeholder frame.)*
- [x] On those six pages the founder section shows the founder's photo where the clip was, square and no wider than 360px (260px desktop, 240px phone, per founder 2026-11-25), with the same credibility text and the founder's chosen link (or none); no founder clip plays anywhere.
- [x] Each of the six pages renders at most one video player (exactly one with the constant set).
- [x] /communities renders exactly as before (no new section, no founder section).
- [x] On each of the six pages (one test per page, analytics spied): playing the demo sends `demo_video_play` with that page's location once, the frame coming on screen sends `demo_video_seen` with that location once, and with the placeholder shown neither fires.
- [x] `manifesto_film_seen` fires once when the film comes on screen, with `location` `manifesto` on /manifesto and `prepare_end` on the /prepare end screen; `manifesto_film_play` still fires as before.
- [x] Screenshots at 375, 320 and desktop of /change-managers, /hospitals and /coach, plus desktop of /builders, /hiring and /founder, pass the visual QA checklist, reviewed by a separate agent; the founder photo is checked at the same widths. *(36 shots, 2026-11-25: no overflow at 320/375; the one major finding (sticky header over an anchor jump) fixed with a 96px scroll margin and verified in Chrome (section top 96px below an 81px header); in-section orphans fixed with text-pretty. Pre-existing minors outside this change left: the primary button label wraps at 320px, founder eyebrow/subhead orphans.)*
- [x] No `[FOUNDER DECISION` text appears in the production build: heading, steps, error line and link are the founder's wording before `/ship` (verified: `npm run build` exit 0, then `grep -l "FOUNDER DECISION" dist/assets/*.js` matched no file; the remaining dist hits are source maps and older /presi pages outside this change).

## UX Notes

- **Happy path:** heading, then the video poster with a centred play button, then the steps. A visitor who never presses Play still reads that there is a product and what it does.
- **No video yet:** the 16:9 placeholder frame with the placeholder text; steps unchanged.
- **Video fails to load:** the error frame (Solution 3).
- **Reduced motion:** the section follows the pages' existing reveal behaviour.

## UI Contract

- Heading: `[FOUNDER DECISION: heading]`
- Steps: `[FOUNDER DECISION: step 1..4 title + one line]`
- Placeholder: `[FOUNDER DECISION: draft "Demo coming soon"]`
- Error line: `[FOUNDER DECISION: draft "The video could not load. Please try again later."]`
- Link under the photo: `[FOUNDER DECISION: draft "Watch my talk on YouTube", or remove]`
- Play-button label (screen readers): "Play the product demo"
- Poster alt text: describes the chosen poster frame; written when the poster is chosen.
- Photo alt text: "Vyacheslav Ladischenski, founder of Clarity Pledge"
- Photo: square, rounded, cropped from the top, 240px max on phones, 260px on desktop with the text beside it (founder, 2026-11-25).
- Events: `demo_video_seen` / `demo_video_play` `{ location }`; `manifesto_film_seen` `{ location }`.
- Colours: blue for step numbers and accents (design system; no green, amber, purple).

## Pre-deploy Checklist

- [x] Upload the 640×640 founder photo to `gs://claritypledge-story-images/founder/founder-photo-640-v1.jpg` (founder approves the upload) and confirm its public URL returns 200 with `image/jpeg`.
- [x] If the demo is ready: upload it and its poster under `demo/`, set the constant, confirm both URLs return 200 with `video/mp4` and `image/jpeg`. *(v4.8 full cut and poster uploaded 2026-11-25: 200, `video/mp4` 31,188,525 bytes; 200, `image/jpeg` 47,122 bytes.)*

## Cost Budget

The demo is served from the GCS media bucket (registry row "Google Cloud Storage", internet egress about $0.12 per GB, provenance flagged in the registry). It replaces the founder clip, served the same way, and the photo replaces the clip's poster.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 1 photo + 1 demo poster per page view (no poster while the constant is unset) + 1 video stream only on Play | n/a | 0 in unit tests (jsdom loads no media) |
| Egress (bytes) | photo ≈ 0.04 MB (the ladischenski.com file is 39 KB) + poster ≈ 0.1 MB, per view; + video ≈ 30 MB (a 3-minute 720p mp4, estimate) × play rate | n/a | 0 |
| Log lines | 0 | 0 | 0 |
| Service unit | egress GB × $0.12 | n/a | 0 |

1. **Fits?** Monthly cost = (landing visitors per month × 0.14 MB + plays per month × video MB) / 1024 × the registry's egress price per GB. At the founder clip's play rate (5 plays in 180 days), and even at the P1701 falsifier's 1-in-20 play rate, the result is negligible (figure kept private). Verdict: fits. There is no cap, and the clip it replaces cost about the same per play.
2. **Failure mode:** a failed load costs nothing further (no retry loop).
3. **Guard:** click-to-play only; no autoplay or preload.

## Build Notes

- Founder photo uploaded 2026-11-18 to `founder/founder-photo-640-v1.jpg`: HTTP 200, `image/jpeg`, 39,040 bytes (same bytes as the ladischenski.com file).
- Changed assertions in existing tests: `founder-credibility.test.tsx`: link name "Watch the full talk on YouTube" → "Watch my talk on YouTube"; the two clip tests (facade button, `founder_clip_play`) → one photo test (alt text, bucket URL, no play button, no video, no event). `p1674-fable-use-case-pages.test.tsx`: "founder talk clip sends founder_clip_play" (4 pages) → "founder photo present, no founder-clip button". `p1682-manifesto-film.test.tsx`: added `manifesto_film_seen` tests; play tests unchanged.
- New tests: `p1704-how-it-works-demo.test.tsx` (placement on six pages, placeholder, error frame, /communities untouched, section events per location) and `p1704-demo-page-events.test.tsx` (each real page sends both events with its own location; control: /hiring set to "coach" fails it).
- Review: Gemini, GLM, Codex and a criteria reviewer (4 of 4). Fixed: page-level event tests. Set aside, listed to the founder: placeholder copy (blocks ship by design, criterion 9); no retry button on the error frame; `demo_video_play` fires on the Play click rather than on playback (same as `manifesto_film_play`, so the comparison stays like for like); heading not using SectionHeading (it requires a section number, which the spec rules out). Dropped as false: photo not uploaded; unused imports.
- Visual QA (separate agent, 8 screenshots): no overflow at 320/375; issues surfaced to the founder: the desktop demo frame (max-w-3xl) leaves white space beside it next to the full-width steps row; the photo cap (360px desktop, 320px phone) leaves gutters. Older issues outside this change: founder block inset, the YouTube link's touch target, the eyebrow orphan word on phones.

## Open Questions

1. If the demo is not ready when this is built, ship with the placeholder in public, or hold `/ship` until the video is uploaded? Recommendation: hold, since a "coming soon" frame on six public pages reads as unfinished. The photo swap could ship on its own first if wanted.

## Related

- docs/decisions.md 2026-11-17 [product] "The product demo goes on every use-case page in place of the founder video" (P1701 exploration; branch `feature/p1701-video-placements-exploration`, `src/app/tree/video-placements/`)
- docs/decisions.md 2026-11-17 [product] "The change-lead session is the product demo" (the demo film is planned in a separate session)
- 2026-07-21 [technical] P1005/P1006 (take-nothing founder section) · 2026-11-15 [product] P1682 (manifesto film, self-hosted player, poster rule) · 2026-11-13 [product] P1674 (no unbuilt claims) · P1385 (public media host)

### 2026-11-25 — demo set, wording filled, section numbered

- Founder: use the full v4.8 cut (6:26) for now, a shorter cut later; fill the wording around the video from the film. Uploaded `demo/product-demo-v4.8-v1.mp4` (31 MB, faststart, 200 `video/mp4`) and `demo/product-demo-v4.8-poster-v1.jpg` (the five-person call, no text in its centre).
- Heading "How ClarityPledge works"; five steps = the film's own step bar (Increase the will, Agree on expectations, Surface high-stakes decisions, Decrease the friction, Improve the skill), texts from its narration. The section now renders 3-5 steps.
- The section is numbered like its neighbours (founder: "this one misses the numbering"); the sections after it count on by one on all six pages. Tests updated: P1674 numbering lists, the P1506/P1558 button lists now include the demo's Play button (text "6:26").
- Video frame widened to max-w-5xl and centred (visual QA finding 1).
- Per-page films (founder): each page is to get its own film, same five steps, its own people and meeting (/change-managers a rollout meeting, /hiring founder and new hire, /founder co-founders, /coach coach and client, /hospitals a handover). Until then `DEMO_BY_PAGE` gives /builders, /change-managers, /hiring, /founder and /coach the shared demo, and /hospitals no film (heading and steps only, no events): clinical staff would see a software team. Swapping a page's film is one line.
- Review: Codex and GLM, 2 of 2 each round. Fixed: focus lost when Play unmounts the button (shared player; now handed to the video only when the button held focus and the player is not paused); the no-film test now proves the frame is absent. Dropped with reasons: "video flush against heading" (the heading carries the gap, screenshot), hospitals page-level gap (covered by the placement test on the real page).
- Placement moved up (founder: halfway down, 3.5-7 screens, too few see it): same order on all six pages, hero, its stat band, then How it works (unnumbered, the "see it" block); /coach has no stat band, so hero then the film. On /change-managers the 59% band now precedes the opening chat and the hero cue reads "Why it matters" (as on the other pages). Section numbers back to their pre-P1704 values. Review: Codex and GLM 2 of 2 each round; test gaps fixed (exact numbering per page, order on /change-managers, controls run); GLM's /hiring-stakes and stat-card claims false (tests on the real pages pass).
- Founder: the 0-10 gap exchange duplicated the film; removed on /builders, /change-managers, /hiring, /coach, /founder, kept on /hospitals (no film) and /communities. Their `*_exchange_viewed` events stop; dead casts deleted. `/coach#how` kept as an alias inside the demo section. Founder photo smaller (260px) with the text beside it.
- Set aside (pre-existing, site-wide): in-app navigation to any `#anchor` scrolls to the top (scroll manager); a fresh load honours the fragment.
- Founder: the hero's "or Take the Pledge" becomes "or ▶ Watch the product demo" on the five film pages (/hospitals keeps the pledge; closing sections unchanged). The link sends `demo_link_clicked {location}`, scrolls to the film, presses Play (inside the click, so sound is allowed; verified in Chrome with a real click), moves focus to the player, and resumes it on a repeat click. Review: Codex and GLM 2 of 2 each round; fixed focus, per-page targeting, label-based Play lookup, resume, no link without a film. Set aside: focus when the film errors after the jump; a browser that blocks audible autoplay would need a second press, as with the film's own Play button.
- Final branch review by Gemini (gemini-4-carbon, served): 2 HIGH, 3 MEDIUM, 2 LOW. Fixed: error frame announced (`role="alert"`); spec amended to the founder's later calls (no placeholder frame, smaller photo). False: /tree prototypes sending events (analytics is production-only and /tree is dev-gated; the p1671 test passes); smooth-scroll/focus conflict (Chrome, real click: plays, focus on the video); `[FOUNDER DECISION]` left (already resolved). Unverified, for the founder's phone at /verify: whether iOS Safari starts the film with sound from the hero link (the film's own Play uses the same mechanism). Left: unused pledge tracking callbacks on /builders and /change-managers.
