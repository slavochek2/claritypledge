---
status: qa
type: bug
rank: 26
severity: medium
workstream: infrastructure
date_reported: 2026-10-05
created_date: 2026-10-05
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [pwa, service-worker, deploy, stale-build]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
date_resolved: 2026-10-05
root_cause: "registerSW.js only registers the worker; a PWA resumed from background makes no navigation, so nothing re-checks sw.js or reloads, and the page keeps running the JS of its last cold start."
resolution: "AppUpdatePrompt at the app root: on resume (throttled), while visible, on online and on controllerchange it calls registration.update() and compares the page's entry module with the live shell's; a different build shows a tap-to-reload toast in its own Toaster."
reproduce_artifact:
  test_file: src/tests/p1416-reproduce.test.tsx
  root_cause: "No code runs on resume: registerSW.js registers only, nothing calls registration.update() or compares builds on visibilitychange."
  confidence: high
  surfaces_in_scope: [app-shell]
  surfaces_deferred: []
  reproduced_at: 2026-10-05
---

# P1416: Installed PWA resumed from background keeps running the old version after a deploy

## Summary

The installed PWA on a phone keeps running the previous build after a deploy, often for days, because
nothing checks for a new version when the app returns to the foreground. Founder report: *"the installed
PWA on a phone often keeps running an OLD version after a deploy."*

## Root Cause

**Confirmed (high confidence).** Three facts, each checked by command on 2026-10-05:

1. **The only service-worker code that runs in the page is the generated `registerSW.js`, and it only
   registers.** `dist/registerSW.js` is exactly
   `if('serviceWorker' in navigator) {window.addEventListener('load', () => {navigator.serviceWorker.register('/sw.js', { scope: '/' })})}`
   (`injectRegister: 'script-defer'`, `vite.config.ts:159`). No `registration.update()`, no reload,
   no update signal to the app. `grep -rn "registration.update\|virtual:pwa-register\|useRegisterSW\|onNeedRefresh" src/`
   returns nothing. decisions.md 2026-09-30 already records: "the auto-injected `registerSW.js` has no
   reload logic".
2. **The browser checks `sw.js` for updates on navigations** (and on some functional events), but
   **resuming an installed PWA from the background is not a navigation.** The page stays alive and keeps
   running the JS it loaded at its last cold start.
3. **P838 (navigations NetworkOnly) does not reach this case.** It guarantees that the *next
   navigation* loads the newest shell. A resumed app makes no navigation, so the running JS stays old
   until the OS kills the app. With `skipWaiting` + `clientsClaim`, even a worker that *does* update
   swaps underneath a page that is still executing the old bundle, and nothing tells the user.

**Second trap, which shapes the fix:** at a cold start after a deploy, the page already loads the
*new* shell from the network (NetworkOnly), while the browser's navigation-triggered update check
swaps the worker a moment later and fires `controllerchange`. "Worker changed" therefore does **not**
mean "this page is old". A prompt keyed on `controllerchange` alone would show on every first launch
after every deploy, including on the page that is already current.

## Invariants

- **P838:** navigations stay NetworkOnly online. A deploy lands on the next online load. Nothing here may
  add a navigation cache or a cache-first shell.
- **P864:** no navigation fallback to a non-precached URL.
- **P1369 (src/pwa/workbox-config.ts header, invariants 1–5):** the app boots offline from one build.
  Nothing here may change the precache, the runtime rules, or let the worker touch Supabase.
- **Never reload silently.** A reload can lose a half-typed story. Only a user tap reloads.
- **No loop.** After the tap-reload the page runs the newest build, so the prompt must not reappear for
  it. No code path reloads on its own.
- **Never offline.** If the app is offline, it must not prompt. The tap would boot the precached shell,
  which is the opposite of what the prompt promises.
- **Not on first install, and not on a page that is already current.** "Update available" means the
  build that is live on the server differs from the build this page is running, not that a worker
  changed.

## Reproduction Steps

1. Install the PWA on a phone (Android Chrome "Install app", or iOS "Add to Home Screen") and open it.
2. Switch to another app, leaving Clarity in the background (do not swipe it away).
3. Deploy a new build to production.
4. Switch back to Clarity.
5. Observe: the app keeps running the old build. No prompt appears, and the new code never loads until
   the OS evicts the app or the user force-closes it.

**Reproduction rate:** 100% for any deploy that happens while the app is backgrounded. Resume is not a
navigation, so nothing runs. The real-device reproduction is the founder's report. The mechanism is
reproduced deterministically by the canary below (jsdom, `visibilitychange` resume, a newer build
served at `/`).

## Expected Behavior

When the app comes back to the foreground (and periodically while it is visible), it checks whether a
newer build is live. If one is, a small non-blocking message appears:
**"New version available, tap to refresh."** (copy approved by the founder). Tapping it reloads into the
new version. The message never appears offline, never on a page that already runs the live build, and
never reloads on its own.

## Actual Behavior

Nothing happens on resume. The page keeps the old JS until a cold start.

## Affected Files

- `vite.config.ts:158-160`: `VitePWA({ injectRegister: 'script-defer', registerType: 'autoUpdate' })`.
  The generated `registerSW.js` registers and does nothing else.
- `src/App.tsx`: the app shell, which mounts no update watcher.
- No existing file implements resume-time update checks. The fix adds them.

## Severity

**Medium.** Every installed-PWA user runs stale code after each deploy until a cold start, so fixes reach
them late or never. A workaround exists (force-close the app).

## Fix Approach

**Rejected-alternatives check.** P838 (decisions.md 2026-05-15, alternative C) rejected "SW update
prompt with reload" as "UX cost, doesn't help users who never see the prompt because they don't relaunch
the PWA between deploys". The new evidence is that this bug is exactly the users who *resume* rather than
relaunch. Resume is where a prompt is seen, and P838's NetworkOnly navigation cannot help them. The
founder approved the prompt and its copy for this case (2026-10-05).

1. **When to check:** on resume (`visibilitychange` to visible, plus `pageshow` and `focus` while
   visible, which is what an iOS standalone app reliably fires), throttled to one per 60 s; every 30
   min while visible; on `online`; on `controllerchange`. Every check calls `registration.update()`,
   whether or not an update is already pending. That keeps the worker and the offline shell current.
2. **Compare the app, not the deploy.** Every deploy rehashes the entry chunk, because the Sentry
   release id (the commit) is baked into it, and most deploys change only docs, skills or tests. So the
   build stamps `<meta name="app-build">` with a fingerprint of its own inputs
   (`src/pwa/app-build-fingerprint.ts`): `src/**` minus tests, `public/**`, `index.html`,
   `package-lock.json`, `vite.config.ts`, `tailwind.config.js` and `postcss.config.js`. The running
   page's meta is compared with the meta in a `no-store` fetch of `/?__app_update=<ts>`. Like
   `isAppServerReachable` (`src/lib/reachability.ts`), no service-worker rule matches that request. If
   either side has no meta, the fallback compares the `/assets/` entry module. A failed fetch, or a
   page that is not our shell, is "can't tell": it never prompts and does not count against the
   throttle.
3. **A pending update is revalidated.** Past the throttle gap, a resume re-checks. If the server no
   longer has a newer build (a rollback), the offer is withdrawn. Inside the gap, a resume re-offers it
   from memory. A poll never re-offers.
4. **Prompt:** a sonner toast in its own root-level Toaster (`toasterId`), at the bottom (80 px up, clear
   of the mobile bottom nav). It appears 1.5 s after the trigger, so a tap meant for the page does not
   land on it, and lasts 15 s (sonner pauses the timer while the app is hidden). The whole toast is one
   button, which reloads only if online. The toast is never shown on `/live` or `/transcribe` (a reload
   there ends the room), comes down on entering them, and is re-offered on leaving them.
5. **Never offered:** offline (the `offline` event takes it down, and a check that answers after the
   connection dropped does not offer), inside an iframe (an embed on another site), or in dev builds.
   It is dismissed when the prompt unmounts.

## Acceptance Criteria

- [x] Resuming the app (tab or installed PWA becomes visible) while a newer build is live shows
      "New version available, tap to refresh."
- [x] Tapping the message reloads the page. Nothing reloads without a tap.
- [x] No message when the live build equals the running build (first install, or a cold start that
      already loaded the new build).
- [x] No message while offline, or when the check's network request fails.
- [x] On resume the service worker is asked to update (`registration.update()`).
- [x] Checks are throttled on rapid app switches, and also run periodically while the app is visible.
- [x] Offline boot invariants unchanged: `src/tests/p1369-sw-config.test.ts` still passes, and
      the `vite.config.ts` workbox options and `src/pwa/workbox-config.ts` are untouched (vite.config.ts only
      gains the fingerprint plugin).
- [x] A deploy that changes nothing users run (docs, skills, tests) does not prompt; an app change does.
- [x] Never offered on `/live` or `/transcribe`; offered after leaving them.
- [x] The offer comes down when the connection drops, and a tap while offline does not reload.
- [x] Regression test passes: `src/tests/p1416-reproduce.test.tsx`.
- [ ] [post-deploy] [on-device] Installed PWA on a phone, backgrounded across a deploy, shows the
      message on resume, and the tap loads the new build.

## Resolution

**Files:** `src/lib/app-update-check.ts` (when to check, how builds are compared),
`src/app/components/pwa/app-update-prompt.tsx` (the toast, its own Toaster, route, offline and iframe
gating), `src/pwa/app-build-fingerprint.ts` (build-time fingerprint plugin), `vite.config.ts` (registers
that plugin; workbox options untouched), `src/App.tsx` (mounted beside `OfflinePackPreloader`).
`src/pwa/workbox-config.ts` is untouched.

**Design points:**
- **Its own Toaster** (sonner `id` / `toasterId`, mounted once at the root, bottom-center). The shared
  Toaster lives inside each route's layout and remounts empty on navigation, and some routes render
  none. Default Toasters ignore toasts that carry a `toasterId`, so nothing shows twice, and the two
  never overlap.
- **15 s, not permanent, offered after 1.5 s.** Sonner pauses the timer while the app is hidden.
- **"Can't tell" is not "no".** A failed or offline check does not count against the 60 s throttle,
  so a resume that catches the radio still waking up is retried on the next trigger.
- **The fingerprint covers inputs, not outputs.** A file missing from the list costs a missed prompt
  (the next app change prompts). A file wrongly on it costs a needless prompt. Measured over the last 7
  days on `main`: 508 first-parent commits, of which 171 touched app inputs outside `src/tests`. So
  roughly two thirds of deploys no longer prompt.

## Review round (2026-10-05)

Three reviewers, three reports (Opus: SHIP-WITH-FIXES, Codex: SHIP-WITH-FIXES, Gemini: BLOCK). Every
fix was applied with a fail-first test:

1. **[HIGH] Every deploy changed the entry hash** (verified on prod: the entry carries the Sentry release
   = `origin/main` HEAD). Fixed by the app fingerprint (Fix Approach 2). Vercel `ignoreCommand` was
   rejected: it changes deploy behaviour, and a missed path silently withholds a deploy.
2. **[MEDIUM] Accidental-tap reload:** 1.5 s delay, never on `/live` or `/transcribe`, Toaster moved to
   bottom-center.
3. **[MEDIUM] A pending update could go stale:** revalidated past the throttle gap, withdrawn on a
   rollback; `registration.update()` runs on every check.
4. **[MEDIUM] Offline after the check started:** `navigator.onLine` is re-checked before offering, the
   `offline` event takes the toast down, and the click is guarded.
5. **Entry selection:** the module script under `/assets/`, not the first module script.
6. **iOS standalone resume:** `pageshow` and `focus` (visible only, same throttle).
7. **Dismissed on unmount.**
8. **No watcher inside an iframe.**
9. This spec corrected.

**Evidence:**
- Fail-first: before each fix, 10 unit tests and 8 component tests failed, and the fingerprint module
  did not exist. After the fixes: 88/88 across `p1416-reproduce` (15), `p1416-app-update-check` (36),
  `p1416-app-build-fingerprint` (15) and `p1369-sw-config` (22).
- 15 new mutations, one per fix, each fail ≥ 1 test. That is in addition to the 13 from the first
  round.
- `npm run build` (twice): `<meta name="app-build" content="ac11c3aaa80eaa2f">` is in
  `dist/index.html`. It was identical across both builds and equal to a direct
  `computeAppBuildFingerprint` of the worktree.
- Full suite: 499 files / 5540 tests pass. eslint is clean. `tsc -p tsconfig.node.json` passes. No
  `tsc -p tsconfig.app.json` errors in the changed files.
- Real browser, production build, service worker controlling the page:
  - A simulated docs-only deploy (new entry hash, same fingerprint): the check ran, no message.
  - A simulated app deploy (new fingerprint): not shown at 0.7 s, shown by 2.5 s at
    `data-y-position=bottom`, 80 px above the viewport bottom (375 px).
  - Leaving `/live` re-offered it. "Not shown on `/live`" is proven by the unit test (mutation-checked);
    in the browser run the toast had already timed out before navigating, so that observation is weak.
- First round: a tap reloads into the new build, with no loop. The React #321 / `removeChild` console
  errors after a simulated reload were shown to come from the rename-only simulation (a control load
  reproduces them without the prompt).

**Accepted limitations (reviewed, not deferred work):**
- Changing a build-time env value (`VITE_*`) without a code change does not prompt.
- A rollback to an older app build prompts to "update" to it. A tap loads what is live, so it is
  harmless.
- A docs-only deploy no longer prompts, but it still rehashes the chunks. A page that then lazy-loads a
  route whose old chunk is gone hits the existing `ChunkErrorFallback` ("New version available").
  This is unchanged from before P1416.
- **Opus L2:** `registration.update()` lets `skipWaiting` swap the worker under a still-old page.
  Lazily loaded CSS (e.g. KaTeX) can then miss and land on the same `ChunkErrorFallback` path (P988).
  The browser's own navigation-time updates already did this.
- **Opus L3:** there is no check on mount. The page just loaded the live shell (NetworkOnly). A boot
  from the precached shell after the 4 s timeout is caught on the next resume, `online` or poll.
- The service-worker bypass of `/?__app_update=` is proven by test for every `runtimeCaching` rule
  (with known-good controls). For the precache route it rests on reading Workbox's URL variations.
  The deployed `sw.js` was not probed.
