---
status: all-done
type: bug
rank: 1000082
severity: high
date_reported: '2026-09-09'
created_date: '2026-09-09'
drafted_by: opus
exec_model: opus
exec_effort: low
tags: [csp, video, prod-only, infra]
disclosure: public
flow: inline
pipeline_ran: [create-bug, inline]
completed_at: 2026-09-09
---

# P1285: CSP blocks every YouTube host the story video player needs

## Summary

The story video player never played on prod — the enforcing CSP in `vercel.json` omitted all three YouTube hosts, so every reader got the blocked-embed fallback plus a broken thumbnail. Fifth incident in the P805 / P863 / P865 / P906 CSP-audit family.

## Root Cause

The `/(.*)` route CSP was missing three hosts:

- `script-src` had no `https://www.youtube.com` — `loadYouTubeApi()` (`src/lib/video.ts:221`) loads `https://www.youtube.com/iframe_api`, so the promise rejected and `StoryVideoPlayer` set `blocked = true`.
- `frame-src` had no `https://www.youtube-nocookie.com` — `YOUTUBE_PLAYER_ORIGIN` (`src/lib/video.ts:49`), so the embed could not be framed even had the API loaded.
- `img-src` had no `https://i.ytimg.com` — the thumbnail URL built at `src/lib/video.ts:101`, so the fallback card's own image rendered as alt text.

Verified against the live response headers, not just the config file: a `curl -sI` of the deployed `/feed` confirmed all three absent before the fix.

Why no gate caught it: the P1023 blocked-embed fallback is working as designed. A cross-origin embed stopped by an ad blocker fires no load event, so silence is treated as "blocked" and the reader gets a thumbnail card linking to the source. That path cannot distinguish an extension blocking the embed from *us* blocking it, and renders the same calm UI either way — no console error, no thrown exception, nothing for `csp-smoke` or `prod-health-smoke` to observe. A graceful fallback is green by construction.

Vite serves no CSP header locally, so dev never reproduces this class at all.

## Invariants

- Any feature embedding a third-party origin must add that origin's hosts to the CSP **in the same change**, covering every directive that governs it (`script-src`, `frame-src`, `img-src`, `connect-src` as applicable). A degradation path is not a substitute — it is what removes the chance to notice later.
- A CSP canary asserts hosts statically against the config file. It must never depend on a live third-party origin being reachable from CI.

## Reproduction Steps

1. Open the deployed `/feed?tag=aisafety1` as any user, in a browser with **no** ad blocker.
2. Scroll to a story card carrying a video (e.g. the Connor Leahy agent story).
3. Observe the player area.

**Reproduction rate:** 100% on the deployed site before the fix; 0% on local dev (no CSP header served).

## Expected Behavior

The YouTube player loads inline and plays in place. Timecode clicks seek within the embed. The blocked-embed fallback appears only when something outside our control (an extension, a network policy) actually blocks it.

## Actual Behavior

Every reader got the fallback: a black card with a broken-image icon showing the alt text "Video thumbnail — the player is blocked here; opens the source", the notice "The player is blocked here, probably by an extension or a network policy", and a click that navigates off-site to YouTube. The founder reported it as a failed deploy — the UI blames the reader's browser for our own misconfiguration.

## Affected Files

- `vercel.json` — `/(.*)` route, `Content-Security-Policy` header — `script-src`, `frame-src`, `img-src`
- `src/lib/video.ts` — `:49` player origin, `:101` thumbnail host, `:221` IFrame API script (the three consumers; unchanged)
- `src/app/components/shared/story-video-player.tsx` — the fallback that absorbed the failure (unchanged; behaving correctly)

## Severity

**High** — video is the primary content of every agent story on the aisafety1 feed; inline playback was broken for 100% of readers and the failure was self-diagnosing in the wrong direction.

## Fix Approach

Add the three hosts to the `/(.*)` CSP. Lock with a static canary that parses the config and asserts each host in its directive, in the shape of `src/tests/p906-csp-frame-src-calendar.test.ts`.

Rejected: making the fallback distinguish a CSP block from an extension block — the browser deliberately does not tell a page why a cross-origin load failed, so this would present inference as diagnosis. Rejected: asserting inline playback in the deployed smoke gates — that puts a live third-party dependency in the gate path.

## Acceptance Criteria

- [x] `/(.*)` `script-src` includes `https://www.youtube.com`
- [x] `/(.*)` `frame-src` includes `https://www.youtube-nocookie.com`
- [x] `/(.*)` `img-src` includes `https://i.ytimg.com`
- [x] Regression canary `src/tests/p1285-csp-youtube-hosts.test.ts` passes, and its three host assertions fail when the fix is reverted (exercised both directions — epistemic gate 7)
- [x] P906's calendar canary still passes (adjacent directives not regressed)

## Post-deploy Verification

Not an acceptance criterion — unsatisfiable before the deploy exists, and gate 2.5 correctly refuses such boxes (`docs/decisions.md`, gate 2.5 rationale). Run after the push lands:

Open `/feed?tag=aisafety1` in a browser with no ad blocker and confirm the player renders and plays inline, with no blocked-fallback card. `/verify p1285` covers this.

## Known Gap

No gate catches the **next** instance of this class — the canary is per-host, so a sixth external origin added without a CSP audit repeats it exactly. A gate enumerating external origins referenced in `src/` and asserting each appears in the CSP would close it. Not built; recorded in `docs/decisions.md` 2026-09-09 as `(Status: proposed)`.

## Branch

`feature/p1285-csp-youtube-hosts` — implemented inline (no `/dev` or `/fix` run); fix + canary + decisions entry in commit `5088d100d`.
