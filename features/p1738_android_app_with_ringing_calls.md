---
status: week
type: story
rank: 363
created_date: '2026-11-26'
tags:
  - calls
  - android
  - app
  - notifications
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
related:
  - p1688
  - p1711
  - p1593
  - p1325
  - p1380
spec_review_hash: 9ad998ee0db7df1b1e829d0ee4cb1ee20bcaf6a63f2bd43b47e512b06f45e7da
spec_review_vendors: [codex, gemini, openrouter]
---

# P1738: An Android app in Google Play whose calls ring

## Problem

> Founder framing, verbatim, 2026-11-26: *"I think in-app calls have limited power if people don't
> receive them."* And, after the options were laid out: *"people need to ring"*.

**Situation:** Clarity Pledge installs as a home-screen web app (P1593: "Install as app" in the
avatar menu) and sends no notifications of any kind. No code in `src/` or `supabase/functions/`
calls `PushManager` or `showNotification` (grepped 2026-11-26). Calls exist on a development page
(P1688, ready to ship). The call inside a chat, including a direct call that rings the other
person's open browser tab, is built on P1711's branch and not shipped.

**Complication:** Once rooms have calls, only people who already have the room open can join. A
person whose phone is in their pocket cannot be reached from inside the product. A home-screen web
app can show notifications, but it cannot ring the way a phone call does. Ringing means a ringtone
that continues until answered and a full-screen Accept / Decline over the lock screen. On Android
that full-screen alert goes by default only to apps "that provide calling and alarm
functionalities" ([source.android.com](https://source.android.com/docs/core/permissions/fsi-limits),
read 2026-11-26).

**Question:** What does an installable Android app look like that rings a person when someone calls
them in a room, while the website keeps working exactly as before for everyone who never installs
the app?

## Appetite

**Blast radius:** high. It adds a new platform: an Android app published under the project's name
in a public store. It touches every sign-in path, since email links and Google sign-in must work
inside the app. It also adds a table of registered phones, a push step on P1711's ring, a decline-by-token path,
and an external service (Firebase Cloud Messaging), and it exposes native phone functions to the
live website.
**Reversibility:** medium. Website changes revert with git, and the table and functions can be
dropped. A store listing can be unpublished, but installed copies stay on phones until their owners
remove them.
**Decision density:** high, now answered (D1 to D14). What remains is conditional on the shell
proof (Open Questions).

## Resolved Decisions

| # | Date | Decision | Source |
|---|---|---|---|
| D1 | 2026-11-26 | Calls must ring. A notification alone is not enough. | Founder: *"people need to ring"* |
| D2 | 2026-11-26 | The app is the existing website inside an Android shell, plus native parts for ringing and for keeping a call alive. No full native rewrite. Which shell is used is settled by the proof in Solution 0. | Founder: *"i guess fully naitve means rewriign everhing!?! we cant or dont want to do that"* |
| D3 | 2026-11-26 | The website stays as it is. People who never install the app keep using it unchanged. | Founder: *"some peopel might stillw ant to use the website"* |
| D4 | 2026-11-26 | Google Play first. iPhone / App Store is a later, separate spec. | Founder: *"c- yes google first"* |
| D5 | 2026-11-26 | The founder sets up the Google side (developer account, payment, identity check, Firebase project, testers) in a separate session. None of it is build work in this spec. | Founder, same conversation |
| D6 | 2026-11-26 | A locked phone shows the caller's name and photo and the room, like WhatsApp. | Founder chose the recommended option after the spec review |
| D7 | 2026-11-26 | Inside the app, the Stripe membership and donation buttons are hidden. People pay on the website. The partnership package's "Buy for €1,450" button (`offers-section.tsx:473`), found after the question was asked, is the same kind (a card purchase) and is hidden with them, as the agent's reading of this answer. | Founder chose the recommended option after the spec review |
| D8 | 2026-11-26 | Part A and Part B go to Google Play together; Part A is never released alone. | Founder chose the recommended option after the spec review |
| D9 | 2026-11-26 | **Ringing follows P1711's direct call, unchanged.** Only direct chats ring; group and event calls show a Join line and ring no phone. Who may ring is P1711's join check (chat member, calls on, no block either way, founder-only until P1711 requirement 9). It rings for 45 seconds (`ring_until`). P1711's limit applies: a fourth unanswered ring of the same person by the same caller within 15 minutes is refused. No answer ends the call as missed, with a line in both chats and "No answer" and Call again for the caller. Busy, Accept on another device and the rest are P1711's D15 to D23. This spec adds the delivery to a locked phone and nothing to the rules. | Founder, verbatim: *"we already answered it and there is the session P1688 is being is working and it will be shipping shouldn't we go with what we decided there"*; P1711 D15 to D23 on `feature/p1711-calls-in-chats` |
| D10 | 2026-11-26 | A ring reaches a locked phone within 5 seconds in at least 19 of 20 tries on Wi-Fi, and 19 of 20 on mobile data. | Founder: *"yes all recommended"* |
| D11 | 2026-11-26 | App ID `com.claritypledge.app` (permanent once published), name "Clarity Pledge", "Clarity" under the icon, the existing site icon. The name and short name match the web app's manifest. | Founder: *"yes all recommended"* |
| D12 | 2026-11-26 | Once the app is public, the Android browser's install offer goes to Google Play, with a small "or install the web version" link under it for phones without Google Play. If the store app is already installed, the offer reads "Open the app". iPhone, iPad and computers keep the web install unchanged. Before the app is public, the offer stays as it is. | Founder: *"yes all recommended"*, after asking how devices are told apart |
| D13 | 2026-11-26 | The agent drafts the store listing in the site's current voice. The founder approves it on one page, together with P1711's call wording page. | Founder: *"yes all recommended"* |
| D14 | 2026-11-26 | A company developer account, in the name of the founder's company (named in the private account registry, `.private/docs/accounts.md`), not a personal one. The setup session checks three things before paying: the company's business ID number, whether the listing can show "Clarity Pledge" as the developer, and whether the 12-tester rule really does not apply to company accounts. | Founder: *"better company accoutn"* |

## Release order

- **Part 0, the shell proof:** can start as soon as P1688's development call page is on main.
  See Solution 0. It settles which shell is used, before any of Part A is built.
- **Part A, the app without ringing:** can be built alongside P1711. It covers the shell, sign-in
  inside the app, the phone registering itself, the version handshake, hiding the install offer in
  the app, and the store listing. It does not touch the call code.
- **Part B, ringing:** needs P1711 shipped, including its direct-call ring (D15 to D23), which
  this part reuses. It covers ringing, Accept / Decline, missed calls, and keeping the call
  alive with the screen locked.
- **Part A's criteria need the founder's developer account** (D5, D14), because they run on a build
  Google Play delivers (Play App Signing changes the fingerprint App Links and the TWA check). An
  internal-track upload is a test, not a release: D8 forbids a closed-test or production release
  of Part A alone, not internal testing.
- **The closed test,** if the company account needs one (D14): needs Part B on prod **and** P1711
  requirement 9 (privacy) done. Until then the invariant below allows rings only between the
  founder's own test accounts, so testers would have nothing to test.

**Shipping:** one spec ships at once, so Part A, built early, waits on its branch for Part B (D8).
A Part A build without ringing is the "website in a box" that Google's minimum-functionality policy
is most likely to reject (Risks).

## Solution

0. **The shell proof (Part 0).** Two candidates. Both wrap the live website, and neither is a
   rewrite (D2):
   - **A Trusted Web Activity with native services.** The page runs in Chrome. The app package adds
     a native push receiver, the call screen and a call service, so ringing is native and never
     needs the page. It shares Chrome's storage, so an email link opened in Chrome lands in the same
     session. Google sign-in works because it is Chrome. A TWA opens without the browser bar only
     when the site's `assetlinks.json` vouches for the app, so that file is required for a TWA
     whether or not App Links are used; if it fails, the app falls back to a Chrome tab with the
     address bar showing. Unknown: whether a call running in Chrome stays connected with the screen
     locked, since the app's own call service does not protect Chrome's process. Also unknown: how
     the page learns it is inside the store app, and how the push token the native part holds
     reaches the server under the person's session. A TWA has no script bridge like Capacitor's,
     so this is tested in the proof (Decision Criteria 5), not assumed.
   - **A Capacitor shell loading the live site.** The page runs inside the app, so a native call
     service can keep it alive. But Capacitor's own documentation says loading a remote URL "is not
     intended for use in production"
     ([capacitorjs.com](https://capacitorjs.com/docs/config), read 2026-11-26). Google sign-in
     needs a native sign-in path, and the native bridge is exposed to the live site (Solution 9).

   Built on one Android phone against P1688's development call page, with a prod-shaped email, as a
   locally signed build. App Links and the TWA check are verified again on a Play-delivered build
   in Part A's criteria, since Play re-signs the app. The choice follows Decision Criteria below. Until the proof runs, the promise that "website changes
   reach the app without a store release" holds only for whichever shell passes criterion 4.

1. **The app.** ID, name and icon as D11. Built as a signed app
   bundle with Play App Signing, targeting the Android version Play requires of new apps at
   submission time (read then; Play raises it yearly). If the site cannot be reached, the app shows
   its own "can't reach Clarity Pledge, retry" screen.

2. **Signing in inside the app.** Three paths, each with a different problem:
   - **Email links** (`signInWithEmail` `src/app/data/api.ts:457`, `createProfile` `api.ts:371`,
     the /live verification `src/app/pages/me-page.tsx:38`) **finish in any browser.** The
     templates point at `/auth/verify` with a `token_hash`, which needs no PKCE code verifier
     (decisions.md 2026-09-16 [technical], P1325; `src/auth/AuthVerifyPage.tsx:17-19`). The
     problem is where the link opens. A link that opens in Chrome signs the person in in Chrome
     while the app stays signed out. Every auth link is also wrapped in the email provider's
     click-tracking redirect (same P1325 entry), so the link the phone receives is not a
     claritypledge.com address and Android App Links may never fire. The fix must work with
     prod-shaped email: either turn off click tracking for auth mail, or show that the redirect
     still hands off to the app. A typed code is not a free fallback. P1325 rejected it ("it adds a
     credential form to three screens"), and it would reverse that ruling.
   - **Event-email links** (`/auth/event-link`, P1380) open a peek-then-press ticket page and end
     at `/auth/verify`. They keep their confirmation step and their admin and host exclusion, so a
     test needs a non-admin account.
   - **Google sign-in** (`signInWithGoogle`, `api.ts:493`; the button appears on four screens).
     This is the only path where PKCE binds the sign-in to where it started. Google refuses sign-in
     inside an embedded browser. Under a Capacitor shell it needs native Google sign-in followed by
     a token sign-in from the page. Under a TWA it works unchanged.
     `[FOUNDER DECISION, only if the shell is Capacitor and native Google sign-in fails the proof:
     hide the Google button inside the app?]`.
   - **If App Links are used,** they claim only the sign-in paths, never `/` or the whole site,
     because every shared claritypledge.com link would otherwise open the app. The host is the apex
     only, since `www` redirects (`vercel.json`) and verification does not follow redirects.
     `assetlinks.json` lists the Play App Signing fingerprint, not only the upload key.
   - **Sign-in started in Chrome, with the app installed.** Under a TWA, Chrome and the app share
     one session, so it is signed in in both. Under Capacitor, App Links open the email link in the
     app, which signs in there and leaves Chrome signed out. Without App Links, the link signs in
     Chrome only, and the app stays signed out until the person signs in from inside it.
   - **The host is a build setting.** The test build trusts the named test host (Done-When); the
     store build trusts the apex only. That covers App Links, `assetlinks.json` and Solution 9's
     bridge origin, so one build never trusts both.

3. **The phone registers itself.** A signed-in app stores its push token. The token is unique, and
   registering re-points it to the current person, so on a shared phone only the account signed in
   now rings. Each registration is bound to the person's auth session, and the push step sends
   only to registrations whose session still exists. That covers sign-out on this phone, a global
   sign-out from another device, an expired session and an offline sign-out, none of which runs a
   client hook. The session is the `session_id` claim of the person's access token at
   registration; the push step checks with the server role that this session still exists and has
   not passed its `not_after`, the same check P1711's respond function makes (D16). A sign-out made offline cannot reach the server, so until the phone
   reconnects that session stays live; the phone-side check in Solution 5 covers that window. A token is registered only once notification permission is granted and "receive
   calls" is on, since Android issues a push token even without permission. Registrations are
   deleted with the account (a foreign key to the account with
   cascade, covered by an integration test). A token Firebase reports as unregistered is deleted.
   Tokens are written only by their own session and read only by the server role that sends.

4. **Ringing is P1711's direct call** *(Part B, D9)*. No new ring record and no new rule: the ring
   is the `chat_calls` row that P1711's `chat_call_ring` creates, with its `ring_until` deadline,
   and its outcome is the row's end reason. This spec adds one thing to that step. When the row is
   created, the server sends a high-priority Firebase Cloud Messaging message to each phone
   registered to the person called (Solution 3). It uses a service-account credential and an access
   token it caches. The push is sent only for a row `chat_call_ring` created, so a ring P1711's
   rules refuse sends nothing. Group and event calls create no ringing row and push nothing. The
   message carries the call id, the caller's name and photo and the chat (D6), the deadline, and a
   ring token (Solution 5). A failed send never fails the ring: the browser tabs still ring as P1711
   designs.

5. **The incoming call** *(Part B)*.
   - **Permissions.** The app asks for notification permission when the person turns on
     "receive calls", not at install. It checks whether it may use the full-screen alert, and if
     not, it sends the person to the setting. When either is off, the app says calls cannot ring.
     The caller needs no new message: P1711's caller sees "Calling…" until a device reports it is
     ringing, then "Ringing…", so a phone that cannot ring leaves the caller on "Calling…", as an
     iPhone does today (P1711 D21, D22).
   - **The ring.** A ringtone that continues until the call is answered, declined, cancelled or
     past its deadline, and the full call screen on the lock screen, showing the caller's name,
     photo and chat (D6). The phone reports `ringing` once, as P1711's ringing tabs do, so the
     caller's screen moves to "Ringing…".
   - **Accept** opens the app in that chat, and the page then runs P1711's Accept (microphone first,
     then `accept`, D21). Join is authorised again at that moment by P1711's rules.
   - **Decline from the lock screen** works without the page, so it has no signed-in session to
     send. The push carries a single-use ring token for that call, and the native screen posts it
     with the project's public key, which the functions gateway accepts (any signed, unexpired
     project token, `supabase/selfhosted/functions-main/index.ts:96-98`). This is a token path into
     P1711's respond logic, for two actions only: `ringing` and `decline`. It takes the same locks as
     `chat_call_respond`, so it cannot race an Accept or a cancel, and it returns the row as it now
     stands. The token is the authority for that call only and dies when the ring ends. It is never
     added to `supabase/no-verify-jwt-functions.txt`.
   - **No answer** is P1711's: the call ends as missed at `ring_until` (45 seconds), the caller sees
     "No answer" with Call again, and both chats get the missed-call line. The phone stops itself at
     the deadline and shows "Missed call from {name}".
   - **Permissions turned off later.** If the person turns notifications or the full-screen alert
     off in Android settings while the app is closed, nothing runs to tell the server. The app
     re-checks at every open and unregisters if either is off. Until that next open, a ring can be
     sent and silently not shown. The caller then stays on "Calling…", the same as for an iPhone
     (Risks).
   - **Stopping.** When the call stops ringing for any reason (cancelled, declined, answered in a
     browser tab or on another phone, missed), the server sends that person's phones a second
     message. It replaces the call screen with a visible notice: "Missed call from {name}"
     (cancelled or missed), "Answered on another device", or nothing after this phone's own Decline.
     It is never a silent high-priority message. Delivery is best effort, so the deadline is the
     backstop: a phone whose stop message is lost still stops at `ring_until`. A phone ignores a
     ring that arrives after its deadline or after its stop message. Before it rings, it checks that
     the ring is addressed to the person signed in on it now, so a message queued before a sign-out
     or account switch shows nothing.

6. **Keeping the call alive** *(Part B)*. While a call runs, the app keeps a foreground call
   service with an ongoing-call notification. It is started from the foreground after Accept,
   because Android refuses a microphone service started from the background. It uses the call
   service type, which needs Android's own-calls permission and the self-managed calling
   framework, so an incoming phone call during a Clarity call is handled the way calls handle each
   other: answering the phone call puts the Clarity call on hold (microphone and sound off, still
   in the room), and ending it resumes the Clarity call. Under Capacitor the page runs in the app's own process, so the app also holds the
   microphone permission and adds the microphone service type. Under a TWA the microphone is
   Chrome's, and the app's service does not cover it. The proof settles whether either keeps the
   page's audio running with the screen locked. With the screen locked the page is hidden, so
   P1711's hidden-tab decision applies inside the app too, and the app must not fall below it.

7. **Older app versions.** The first release already reports its version to the page. The website
   shows "please update" with the store link to a shell too old for it, and never while a call is
   on. The website's own new-version prompt (`src/lib/app-update-check.ts`, P1416) also stays
   quiet during a call. Whether the site's service worker runs inside the shell is decided in the
   proof, and the native bridge must be present after a page load the service worker controlled.

8. **The install offer.** Inside the app, no "Install as app" row and no install nudge.
   `getIsInstalled()` (`src/hooks/use-pwa-install.tsx:66-73`) checks only for standalone display
   mode, so without a change an embedded shell would offer to install the app it already is.
   **The store-app check is not that check.** The home-screen web app is also standalone, so
   reusing it to hide payments (Solution 10) would hide them from people who installed the web app
   too, which D3 forbids. The store-app check must be true only in the store app: the native
   bridge under Capacitor, or a launch marker the app sets under a TWA that survives a reload and
   in-app navigation. In a
   browser, P1593 named the offer "Install as app" because it "does not imply an app store"
   (decisions.md 2026-10-29 [product]). Once the app is public, D12 changes it on Android only:
   the offer goes to Google Play, with a small "or install the web version" link under it, and
   reads "Open the app" when the store app is installed. Whether the store app is installed is
   asked of Chrome, which answers only once the site and the app vouch for each other (the same
   `assetlinks.json`). When that answer is unavailable, the offer goes to the Play page, which shows
   "Open" itself. The site's existing device check decides who counts as Android
   (`use-pwa-install.tsx:50-63`). Its known edges: an Android phone without Google Play gets the
   fallback link, while a phone set to "desktop site" and a Chromebook count as computers and keep
   the web install. This is the stated exception to D3.

9. **The native bridge's boundary** (Capacitor only). Native functions answer only pages loaded
   from the top-level origin `https://claritypledge.com`, never frames and never other hosts. The
   functions the page can reach are listed in the code and kept to the minimum (register token,
   report version, call state). The site's script policy allows inline script
   (`'unsafe-inline'` in `vercel.json`). So any script injection on the site could reach those
   functions, and tightening that policy later must be checked against the shell.

10. **The store.** The steps:
    - **Listing** text and screenshots, drafted by the agent and approved by the founder with P1711's
      call wording page (D13).
    - **Declarations** for the full-screen alert and the call service, with the demo video Play
      requires.
    - **Reviewer access:** two of the founder's own test accounts on the ring allowlist, so a
      reviewer can make a call between them without the invariant being broken. No submission
      asks a reviewer to call anyone else before P1711 requirement 9 is done.
    - **Data form:** a full inventory drawn from `src/app/content/privacy.md`. That means name,
      email and photo, messages and stories, audio and transcripts, app activity (Mixpanel),
      diagnostics (Sentry), and device identifiers (the push token), checked against what the chosen
      shell and the Firebase library actually send, plus how long ring and registration records
      are kept (rings: deleted after their outcome is final plus a set period, decided in `/dev`). The privacy policy gains a
      line naming Firebase. The account-deletion web address for the listing is a public page that
      explains the steps and what is deleted, linking to the Settings page
      (`src/app/pages/settings-page.tsx:170`, behind sign-in). Whether Play accepts a page behind
      sign-in alone is UNVERIFIED, so the public page avoids the question.
    - **Payments:** the site sells a membership and takes donations through Stripe
      (`src/app/components/landing/offers-section.tsx`, `src/lib/donate-links.ts`). Play's payments
      policy limits purchases inside an app that bypass Play billing. Inside the app these buttons are
      hidden (D7), behind the store-app check in Solution 8.
    - **Known gaps:** buttons that download a generated file (share images, badge, calendar file)
      may do nothing in the app. List them, and fix or accept each (Acceptance Criteria).

## Decision Criteria

Pre-registered for Solution 0, before the proof runs. Each candidate is scored on one Android phone.

1. **The call survives the lock.** Two people join P1688's development call. The phone's screen is
   then locked for 5 minutes, and both still hear each other in every 30-second spot check. That
   page leaves a call after 2 minutes hidden (P1688 Solution 6), so for the proof run that limit is
   switched off (the page is development-only), and the page logs its visibility. A run counts
   only if the log shows the page hidden for the whole lock.
2. **Email sign-in lands in the app.** A sign-in email sent through the same mail provider and
   click-tracking setting the release will use, to the test host, ends with the person signed in
   inside the app. If the fix is turning tracking off for auth mail, the run uses tracking off and
   the release ships that setting; otherwise it uses tracking on, as prod has it today. This is checked both when
   sign-in is started in the app and when it is started in Chrome on the same phone.
3. **Google sign-in works in the app**, including sign-up and the pledge and return-to-page steps
   that follow it, or the founder accepts hiding the button (Open Questions).
4. **Website changes need no store release.** A change deployed to the site appears in the
   installed app on its next open.
5. **One ring end to end.** The page can tell it is inside the store app (the home-screen web app
   cannot pass for it) and learns the app's version. The app's push token reaches the server
   registered to the signed-in person's session. A test message to that token rings the locked
   phone natively, and Accept opens the app signed in as the same person.

**Pick:** the candidate that passes all five. If both pass, the TWA wins, because it carries fewer
native parts: no bridge to secure and no separate Google sign-in. If neither passes criterion 1,
stop and bring the result to the founder. Neither shell can ring usefully if the call drops when the
phone locks. If one passes 1 but fails 2, 3, 4 or 5, bring that trade-off to the founder. If the pick is
Capacitor, the vendor's "not intended for production" warning goes to the founder with the result,
as a risk to accept or a reason to stop, before Part A starts.

## Invariants

- **Browsers are unchanged** (D3). App-only code is gated by a shell check that is false in every
  browser, and the room call in a browser behaves exactly as P1711 ships it. The only exception is
  Solution 8's browser install offer, and only if the founder chooses it. Under Capacitor with
  App Links, an email link tapped in Chrome on a phone that has the app opens the app instead: a
  second, conditional exception to record with the founder if Capacitor is picked.
- **Who may ring is decided in the database** by one rule, including blocks, with no copy of it in
  the functions or the app. This mirrors P1688's invariant for who may join.
- **No ring reaches anyone but the founder's own test accounts** until P1711 requirement 9
  (privacy) is done. This extends the P1688 / P1711 invariant on whose media reaches the call
  engine. It is enforced by an allowlist the ring rule reads, not by convention.
- **The Firebase service-account credential stays server-side.** No build-time variable carries it,
  and no log prints it. Push tokens and ring tokens are kept out of analytics, error reports and
  URLs.
- **One microphone opening per tab** (decisions.md 2026-11-17 [technical], P1688). The native part
  never opens the microphone itself. The page does, exactly as in a browser.
- **A phone is rung only for the account whose session is live on it** (Solution 3).
- **Who may ring, and the ring's outcomes, are P1711's alone** (D9). This spec adds no rule, no
  second ring record and no second deadline. A push is sent only for a row P1711's ring function
  created.
- **The ring-token path accepts only the call's own token, for `ringing` and `decline` only**
  (Solution 5). It is never added to `supabase/no-verify-jwt-functions.txt`. The token dies when
  the ring ends.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Google rejects the app under its minimum-functionality policy | MITIGATE | Ship with ringing, never as a Part A shell alone (Release order); the declarations and demo video show the native call functions |
| Google does not accept the "calling app" declaration, so the full-screen alert is off by default | MITIGATE | The app detects it and sends the person to the setting (Solution 5); the criteria test both states |
| The call drops when the phone locks, under either shell | MITIGATE | Solution 0 tests it first; failure stops the work and goes to the founder |
| Phone makers' battery savers delay or drop the wake-up message | MITIGATE | The Part B device runs, and the closed test if one is needed, record each missed ring with its phone model |
| The email provider's tracking redirect keeps links from opening the app | MITIGATE | Solution 2; Decision Criteria 2 uses prod-shaped email, because test mail has no tracking redirect and would pass falsely |
| A test build signed with the upload key verifies App Links while the store build does not | MITIGATE | `assetlinks.json` carries the Play App Signing fingerprint; Part 0 runs on a local build, so Part A's criteria re-run sign-in on a Play-delivered build |
| Permissions turned off in Android settings while the app is closed: a ring is sent and not shown, and the caller is not told | ACCEPT | Nothing runs on the phone to report it; the app re-checks and unregisters at its next open (Solution 5). The caller sees an unanswered ring, as with a phone on silent |
| People run an old app version after a native change | MITIGATE | Solution 7 |
| Ringing is used to pester people | MITIGATE | One database rule including blocks, per-caller and per-recipient limits (Solution 4) |
| A late stop message leaves a phone ringing | MITIGATE | The ring's expiry is enforced on the phone too (Solution 5) |
| If a closed test is needed (D14): it is judged too thin and production access is refused | ACCEPT | Recruit 14 to 15 testers for the required 12; a refusal costs another test window and a resubmission |
| The company account cannot show "Clarity Pledge" as the developer, or still needs the tester period | MITIGATE | The setup session checks both before paying (D14); a tester period would add about two weeks before production |
| Firebase ties ringing to Google's services | ACCEPT | D4 chose Google Play; another build could use another transport later |

**Non-Goals**
- Do NOT build an iPhone app or anything for the App Store (D4).
- Do NOT rewrite any screen natively (D2). Native code is limited to ringing, the call service, the
  version handshake, Google sign-in if Capacitor needs it, and what the shell itself needs.
- Do NOT change how browser users start or join calls (D3).
- Do NOT add notifications to the home-screen web app. That would be a separate spec.
- Do NOT add notifications for anything other than calls (messages, events, reminders).

## Acceptance Criteria

Part 0:
- [ ] Both shells are scored against the five Decision Criteria, the results are recorded in this
      spec, and the choice follows the pick rule.

Part A, on a build delivered by Google Play's internal track:
- [ ] The app opens the site. With the site unreachable, it shows its retry screen.
- [ ] Email sign-in, started in the app, ends signed in inside the app, using a prod-shaped email.
- [ ] Email sign-in started in Chrome on the same phone, with the app installed, behaves as
      designed in Solution 2.
- [ ] Google sign-in works inside the app, or is hidden, as the founder decided.
- [ ] An event email's "Continue as …" link, for a non-admin account, ends signed in inside the app.
- [ ] Inside the app there is no "Install as app" row, no install nudge, and no membership or
      donation button (D7). In Chrome on the same phone, and in the home-screen web app, the site
      looks and behaves as before, apart from the browser install offer if the founder changes it
      (Solution 8).
- [ ] Each button that downloads a generated file (share image, badge, calendar file) works in the
      app, or its gap is listed in this spec and accepted by the founder.
- [ ] A shell older than the site supports shows "please update" with the store link. That screen
      never appears during a call.
- [ ] Two accounts used in turn on one phone: only the account signed in now registers and rings.
- [ ] Under Capacitor only: a page in a frame, or on any host other than the build's trusted one,
      cannot reach any native function, including after a reload.

Part B, with the screen locked, each criterion run with the app in the background **and** again
with it swiped away (not force-stopped). The runs cover at least two named phones from different
makers on two Android versions, one of them the newest Play requires, with each phone's model,
Android version, notification and full-screen settings, and Do Not Disturb state recorded here:
- [ ] A direct call rings the person's phone with the ringtone and the full call screen showing the
      caller's name, photo and chat (D6), within 5 seconds in at least 19 of 20 tries on Wi-Fi and
      19 of 20 on mobile data (D10), and the caller's screen moves to "Ringing…".
- [ ] A call started in a group or event chat rings no phone.
- [ ] With the full-screen alert or notifications turned off, the app says calls cannot ring, and
      the caller stays on "Calling…".
- [ ] Accept opens the chat with the call joining, and both people hear each other.
- [ ] Decline from the lock screen ends the call as declined (the caller sees "Call declined"); no
      answer ends it as missed at 45 seconds ("No answer" for the caller, a missed-call line in both
      chats, "Missed call from {name}" on the phone).
- [ ] The caller cancelling while it rings stops every connected phone of the person called within
      5 seconds, showing "Missed call from {name}". A phone whose stop message is withheld in the
      test stops at the deadline. Answering in a browser tab or on another phone stops this phone,
      showing "Answered on another device".
- [ ] A Decline token used twice, used after the ring ended, or used for another call changes
      nothing.
- [ ] A ring message delivered late (after its expiry, after its stop message, or after the phone
      switched to another account) shows nothing.
- [ ] A ring P1711 refuses (a block either way, calls off, not yet allowed in the founder-only
      period, a fourth unanswered ring within 15 minutes, busy) sends no push, and the phone does
      nothing.
- [ ] After signing out on the phone, and after a sign-out of all devices from another phone,
      ringing that account does not ring that phone.
- [ ] With the screen locked for 5 minutes, the call behaves as P1711's hidden-tab decision
      defines for a hidden page. Part B already waits on P1711, so that decision exists before this
      runs; if it keeps the call connected, both still hear each other.
- [ ] Answering an incoming phone call during a Clarity call puts the Clarity call on hold, and
      ending the phone call resumes it, with both people hearing each other again.

## Done-When

- [ ] The conditional founder decisions in Open Questions are answered and recorded here if the
      shell proof makes them apply.
- [ ] Firebase Cloud Messaging has a sourced row in the registry in
      `docs/technical/metered-services.md`, added in the same change that first calls it.
- [ ] Every Acceptance Criterion passes on an internal-track build pointed at a named, stable test
      host. That host serves `assetlinks.json`, is not behind deployment protection, sends sign-in
      mail through the release's mail setup (Decision Criteria 2), and its name is written here.
      Whether the apex domain serves the same association correctly can only be seen after the
      push, and is checked in Store steps 5.

## Store steps (outside the repo, founder-owned)

These are not checkboxes, because no merge can tick them. They are recorded so nobody forgets them.

1. **Developer account and Firebase project.** Payment, identity check and device check are done
   in the founder's setup session (D5).
2. **Internal test track.** Available as soon as a build exists, with no waiting period.
3. **Closed test, only if the company account still needs one (D14).** Once Part B is on prod and P1711 requirement 9 is done, at least 12 testers
   stay opted in for 14 days in a row before production access can be requested. The rule applies
   to personal accounts created after 2023-11-13
   ([Google](https://support.google.com/googleplay/android-developer/answer/14151465), read
   2026-11-26).
4. **Production access request, then Google's review.** How long the review takes was not checked.
5. **After the push,** `https://claritypledge.com/.well-known/assetlinks.json` returns the Play
   App Signing fingerprint with no redirect, an email sign-in on the store build lands in the app,
   a ring between two founder test accounts on the prod build rings the founder's phone, and Sentry
   shows no new errors in the first 10 minutes.

## Cost Budget

The services are Supabase (a push step on P1711's ring, a token path, and a table of registered
phones) and Firebase Cloud Messaging (new). Call
minutes are P1711's budget and are not counted here.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | Registration: 1 upsert per install, token change or sign-in, plus 1 delete per unregistered token. Ringing: P1711's ring call (P1711's budget), plus `phones` sends for the ring and `phones` sends for the stop, so `2 × phones` sends per ring. Lock-screen Decline: 1 token call, plus 1 `ringing` report per phone. The caller's screen already follows the call row (P1711) | Bounded by P1711's limits: at most 3 unanswered rings of one person by one caller per 15 minutes, so `12 × 2 × phones` sends per caller-person pair per hour, under P1711 D3's per-person rate. Refused requests are not capped by the limit, since a refusal still costs one function call; each costs 1 call and 1 counter update, no sends. Firebase retries are not ours (no extra request) Access-token mint: about `1 per function instance per hour` (cached) | The e2e for both functions: `N cases × 1 call`, with N set by `/dev`. Firebase is stubbed in e2e. Real sends happen only in manual phone tests: `20 + 20` tries for the ring-delay criterion = 40 rings, so `40 × 2 = 80` sends |
| Egress (bytes) | One small payload per send (opaque ring id, display fields) | Negligible next to the call | Negligible |
| Log lines | 1 per ring, 1 per failed send; refusals are counted, not logged one per request, so a flood of refused calls cannot flood the logs | Bounded by the rate limits | 1 per case |
| Service unit × registry price | Firebase quota: 600,000 messages a minute per project ([Firebase](https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas), read 2026-11-26). Price: no per-message price is known, but this is UNVERIFIED until the registry row cites Firebase's pricing page | `12 × 2 × phones` per pair, far under 600,000 a minute | 80 sends |

The limits are P1711's (D9). This spec adds none, so a change there moves these numbers.

## Pre-deploy Checklist

### Secrets to provision
- [ ] The Firebase service-account credential set as a Supabase secret on the active test server
      and on prod. The founder provides it from the setup session (D5) by filling a placeholder,
      never through the clipboard or chat (`.claude/rules/credentials.md`).

### Deploy commands
- [ ] The migration adding the registered-phones table and the push step on P1711's ring applied to the active test server;
      prod is applied by `/push` step 2.5 for the pushed commit (P1211: `/ship` never migrates prod)
- [ ] The push sender and the ring-token function deployed to test; prod is deployed by `/push` step 7
      for the pushed commit
- [ ] `assetlinks.json` (required for a TWA, and for App Links if used) served from the test host's
      `/.well-known/` path and present in the prod build output, with the Play App Signing
      fingerprint

Post-deploy verification is in Store steps 5, as prose, because no box can be ticked before the push.

## Alternatives Considered

| Option | Verdict |
|---|---|
| **TWA with native services** | A candidate in Solution 0. It can ring, because ringing is native. Its open question is whether the call survives the lock. |
| **Capacitor shell loading the live site** | A candidate in Solution 0. The call service can protect the page, but the vendor documents remote loading as not for production, and Google sign-in and the bridge boundary need work. |
| Capacitor shell with a bundled copy of the site | Rejected. Every website change would need a store release or a third-party live-update service. A bundled shell runs at `https://localhost`, which the functions' origin check refuses (`supabase/functions/_shared/cors.ts:19-22`). Sign-in links built from `window.location.origin` would also point at localhost. |
| Full native rewrite (like the founder's separate TalkBridge app) | Rejected by the founder (D2): every screen would be built twice, and the two would drift apart. |
| Notifications from the home-screen web app only | Rejected for this spec by D1: it cannot ring. It could be a later, separate spec for people who don't install the app. |
| Sideloading or alternative stores first | Rejected (D4). Since 2026-09-30, Google requires developer verification even for sideloaded apps in four countries, with a global rollout announced for 2027 ([Google](https://support.google.com/android-developer-console/answer/16561738), read 2026-11-26). |

## Open Questions

Everything the founder was asked is answered (D1 to D14). What remains applies only if the shell
proof picks Capacitor:

1. Accept the vendor's "not intended for production" warning, or stop (Decision Criteria pick rule).
2. Accept that an email link tapped in Chrome opens the app instead (Invariants, browsers).
3. Hide the Google button in the app, if native Google sign-in fails the proof (Solution 2).

## Related

- P1688: the call core, on a development page; Part 0's proof uses it. P1711: the call in the chat;
  Part B reuses its direct-call ring (D15 to D23) and needs its requirement 9 and hidden-tab rule (D7).
- P1593: the install offer and its label.
- P1325: email sign-in links redeem in any browser; the click-tracking redirect; the typed code was rejected.
- P1380: event-email sign-in tickets.

## Spec review, 2026-11-26

Reviewers: Gemini ok · GLM ok · Codex ok · Opus ok · 4 of 4 received. The load-bearing claims were
checked by command before being folded in:

- Email links finish in any browser (decisions.md 2026-09-16 [technical], P1325).
- The click-tracking redirect wraps auth links (same entry).
- Google sign-in exists (`api.ts:493`).
- Capacitor says remote loading is not for production (vendor docs).
- The functions' origin check (`cors.ts:19-22`).
- `chat_blocks` exists.
- Inline script is allowed (`vercel.json`).
- The standalone-only install check (`use-pwa-install.tsx:69`).
- Gate 3.5 counts every box under the checklist heading, including sub-headings
  (`scripts/ship-gates.sh:819-850`).
- Stripe checkout links are on the site.

Not folded in:

- Gemini's claim that the default Supabase email link goes through supabase.co was superseded by
  the P1325 templates.
- Gemini's "paid tier" payments claim misread P1711, where the paid tier is the call vendor's plan
  and not something sold to users. The real payments question comes from the Stripe links.
- GLM's "FCM quota figure is stale" is contradicted by Firebase's page, read today.
- The first draft's claim that the PKCE flow binds email sign-in was the drafter's own error,
  corrected above.

### Round two (the one re-review)

Reviewers: Gemini ok · GLM ok · Codex ok · 3 of 3 received (Opus reviewed round one only, by the
skill's re-review roster). Verified by command and folded in:

- A lock-screen Decline has no session. The functions gateway accepts any signed, unexpired
  project token (`supabase/selfhosted/functions-main/index.ts:96-98`), so the ring token is the
  authority. Applies to Solution 5 and Invariants.
- Standalone display mode is true for the home-screen web app too, so it cannot be the store-app
  check (Solution 8).
- A TWA needs `assetlinks.json` regardless of App Links (Solution 0, Pre-deploy Checklist).
- A third Stripe purchase button exists, "Buy for €1,450" (`offers-section.tsx:473`; D7).
- P1688's development page leaves a call after 2 minutes hidden (P1688 Solution 6; Decision
  Criteria 1).
- Shipped specs tick "applied to test; prod by `/push`" before the ship (P1402, P1594), so the
  prod steps belong to `/push` and not to a pre-ship box.
- Other folds, design rather than claims:
  - per-person ring outcomes
  - a derived expiry instead of a server timer
  - phone-side checks for late and wrong-account messages
  - a stop deadline with an expiry backstop
  - criterion 5, an end-to-end ring
  - device coverage for Part B
  - hold and resume during a phone call
  - the test host's mail setup
  - the reviewer path

Not folded in:

- Gemini: name the exact Android manifest permissions. That is `/dev`'s call, and the spec
  names each permission's purpose.
- Gemini: sub-minute expiry needs a scheduler. This is moot, because expiry is derived from the
  record.
- GLM: the cascade delete conflicts with "written only by its own session". It does not, because
  the database owner's cascade is not a client write.
- Codex counted gate 3.5's four unticked boxes as a deadlock. Unticked boxes before `/dev` are
  expected. The deadlock class was a box that can only be ticked after the push, and none remain.

