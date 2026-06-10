---
title: "Mobile scroll bounce causes page refresh in /live"
type: bug
status: qa
priority: high
created_date: 2026-03-16
p_number: P528
tags: []
rank: 1000020.0
delivery_stage: ship
pipeline_ran: [reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p528-reproduce.spec.ts
  root_cause: "No `overscroll-behavior` set anywhere (grep -rn overscroll → 0 hits). Browser default `auto` lets an overscroll at the top of the inner `.live-scroll` container chain up to the viewport → native pull-to-refresh → full document reload → /live session state lost."
  confidence: high
  fix_target: "html, body { overscroll-behavior-y: contain } in src/index.css (app-wide scope, founder-chosen 2026-06-10)"
  surfaces_in_scope: [global-body-overscroll]
  surfaces_deferred: []
  reproduced_at: 2026-06-10
  canary_kind: mechanism-proxy   # native pull-to-refresh gesture is not automatable; canary asserts the CSS guard, not the reload
  fix_caveat: "overscroll-behavior historically needs iOS Safari 16.4+ to govern pull-to-refresh. The CSS-presence canary goes green even on a device where the gesture is NOT suppressed — /fix must confirm target-device coverage separately."
---

# Mobile scroll bounce causes page refresh in /live

## Problem

On mobile devices, scrolling up triggers the browser's pull-to-refresh behavior, which reloads the page and kicks the user out of an active /live session. Session state is lost — the user must rejoin via session code.

Observed during Pair C session (2026-03-14). This is a session-killer for facilitated sessions.

## Fix Hint

Apply `overscroll-behavior: none` on the /live page container to prevent pull-to-refresh from triggering during active sessions.

## Root Cause

**Confirmed (high confidence, 2026-06-10.)** Nothing in `src/` or `index.html` sets `overscroll-behavior` — `grep -rn overscroll src/ index.html` returns 0 hits, so every scroll surface inherits the browser default `auto`.

The /live active-session root (`clarity-live-page.tsx:4454`) is `flex flex-col h-screen overflow-hidden`, so the document/body does not scroll; scrolling lives in inner `.live-scroll` containers (`live-mode-view.tsx:105/107/1391`, `overflow-y-auto`). When such a container is at the top and the user overscrolls, `overscroll-behavior: auto` lets the gesture **chain up to the viewport**, where the browser fires native pull-to-refresh → full document reload → session state lost (rejoin via code required).

**Fix target (founder-chosen, app-wide scope):** `html, body { overscroll-behavior-y: contain }` in `src/index.css`. Robust across every /live view state (waiting / active / free) and removes the wasteful full-document reload everywhere in the SPA. Owned by `/fix`.

**Caveat for /fix (Falsify-Before-You-Rely, unverified this session):** `overscroll-behavior` historically required iOS Safari 16.4+ to govern pull-to-refresh. The canary is a CSS-presence check and **cannot** catch a device where the property is set but the gesture still fires — confirm target-device coverage during /fix. Pair C's device is not recorded.

**Reproduction note:** The native pull-to-refresh gesture is not automatable (browser-compositor/OS gesture, unreachable by Playwright touch emulation). The canary (`e2e/p528-reproduce.spec.ts`) is therefore a **mechanism proxy** — it asserts the document contains overscroll (`overscroll-behavior-y` ≠ `auto`) rather than observing the reload. Pre-fix it FAILS (`received "auto"`); post-fix it PASSES.

**Surface audit:** The bug exists on any surface where an inner scroll container can chain overscroll to the viewport (/live, plus `.live-scroll` letter reading/preview and free-mode). The app-wide body fix subsumes all of them in one rule — nothing deferred, no follow-up tickets.

## Acceptance Criteria

- [ ] Scrolling up on mobile in /live does not trigger page refresh [device]
- [ ] Normal scrolling within the page still works [device]
- [ ] Session state is preserved during scroll interactions [device]
- [x] `e2e/p528-reproduce.spec.ts` passes (body `overscroll-behavior-y` is `contain`/`none`, not `auto`)
