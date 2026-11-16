---
status: week
type: story
rank: 341
created_date: '2026-11-16'
tags:
  - calls
  - video
  - chat
  - live
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: fable
exec_model: opus
exec_effort: high
related:
  - p876
  - p1437
  - p1529
  - p1390
spec_review_hash: 05c6fe5fe02c3fe501d1e018d5dd356c44266051acb6964ee3c0f4520a7e0df1
spec_review_vendors: [codex, gemini, openrouter]
---

# P1688: Calls, step one — people talk and see each other on real phones while the room transcribes

## Problem

> Founder framing, verbatim (2026-11-16): *"I guess the next step is having our own video
> conferencing and people being able to call."* · *"It's like something mix of Google Meet and
> Telegram."* · *"once we prove that we can do audio and video calls and simple functions like call,
> enable video, disable video. Then we can, over time, integrate everything."* · *"you build
> something in a tree that works."*

**Situation:** A chat room holds the people, the messages, the canvases and (when someone turns it
on) the live transcript. It carries no voice or picture between people who are not in the same
physical room, so an online session needs a second tool opened beside the room.

**Complication:** The sales mastermind's second session is online, and its spec leaves this open:
*"How do pairs talk, and do they use the event room next to a video call?"* (P1529, Open Questions
1). No ruling parks in-app calls: P876 read the 2026-06-02 pivot as covering video, but that
decision's own list (certification, franchise, club, tooling co-invest, future equity) does not
name it, and neither decision log holds another entry on the subject.

The room already opens the microphone for its transcript. A call needs the same microphone. On
phones, two openings of one microphone is where browser audio is known to break, and a similar
conflict on Android was not fixed by sharing a stream (decisions.md 2026-09-03, recorder against
speech recognition). Whether a call and the room's capture can run together on real phones is not
known, and everything about putting a call inside the room depends on the answer.

**Question:** Can members of a chat talk and see each other through an engine we do not write,
on real phones, in both starting orders, without silencing or ending the room's capture?

## Appetite

**Blast radius:** medium. The call itself lives on a development-only page. Two things reach
production code: the room's capture changes how it opens and releases the microphone (the part that
can do damage), and a new sign-in-gated server function plus one database change ship closed.
**Reversibility:** high. The capture change is one seam; the function, the column and the
dependency can be removed. Nothing user-visible ships.
**Decision density:** low: who creates the engine account, and which phones are on hand.

## Resolved Decisions

| # | Date | Decision | Source |
|---|---|---|---|
| R1 | 2026-11-16 | In-app calls are built now. No earlier ruling is overturned (see Complication). | Founder: *"ok lets go"* |
| R2 | 2026-11-16 | Calls first; breakouts later, on the same engine. | Founder accepted the recommendation; earlier, *"Maybe just video and audio call."* |
| R3 | 2026-11-16 | Engine: LiveKit, rented (LiveKit Cloud) for now. Own server stays an option, costed in step two. | Founder: *"up to you to explain and decide"* |
| R4 | 2026-11-16 | No separate benchmark of engines: one sourced research pass, its claims re-checked by command, then a proof on real phones. | Same |
| R5 | 2026-11-16 | This spec is step one: the call core and its proof on a development-only page. The call button in the room is step two, a separate spec filed after the proof. Decided after a four-reviewer spec review showed that six parts of the room integration each depend on the proof's result. | Agent decision under R3's delegation; founder's own words, *"you build something in a tree that works"* |

## Solution

A development-only page where a signed-in person picks one of their chats and joins that chat's
call: audio first, camera on request, a tile per person, and controls for microphone, camera and
leave. The page also carries the room's capture bar, so a call and a transcript can run together.

**Parts:**

1. **A call engine, not written here.** LiveKit's open-source client connects each browser to a
   LiveKit server that relays audio and video. The server's address and keys are server-side
   settings. Exact library versions are pinned.
2. **One microphone opening per tab, behind one owner.** A small module opens the microphone once
   and hands each consumer its own copy of the track; the microphone is released when the last
   consumer lets go. The room's capture takes its audio from this owner instead of opening the
   microphone itself, so either side can start first. The call always publishes a **copy**, never
   the original, and never lets the engine stop a track on leave (its default does). Capture
   lets go through the owner on every path where it stops tracks today, including a start that is
   abandoned while the microphone is still opening; a copy that is stopped must never read as the
   device having gone away.
3. **A server function that hands out call passes.** It takes a chat id and nothing else. It
   checks the caller is signed in, then asks the database one question through one function: may
   this person post in this chat (the existing rule, blocks included), and are calls switched on
   for this chat. Any refusal or error returns no pass.
4. **The pass, exactly.** Lifetime 5 minutes (it only gates joining; the engine renews it for
   connected people). Identity is the caller's user id and the display name comes from the
   database, never from the request. The call's name is derived on the server from the environment (test or live) and the chat id, so
   a test call can never be a live chat's call.
   It permits joining that one call, publishing a microphone and a camera, and receiving others.
   It grants no administration, no recording, no screen sharing and no data messages. The pass is
   never logged.
5. **A switch per chat, in the database, off by default.** A new column on the chat; the function
   refuses a pass when it is off. In this step the founder turns it on by hand for test chats that
   hold only his own test accounts, checking the member list before each run. No signed-in or
   anonymous client can write the column; only the database owner can. There is no control for it
   in the app yet.
6. **Limits on the development page,** so a forgotten tab cannot spend the month's allowance: a
   person is taken out of the call after 30 minutes, and after 2 minutes with the page hidden.
7. **Where it runs.** The page is a `/tree` route, registered only in development builds, working
   against the test project. Nothing in this spec ships to main until the proof has passed.
8. **The call panel:** tiles (picture, or avatar and name when the camera is off), a mark on the
   current speaker, and the three controls. Muting the call must not silence the transcript, and
   pausing the transcript must not mute the call.

**How phones reach the page.** Android over USB, the method already used for capture work
(decisions.md 2026-09-03): the phone loads the page from the development machine while its own
network carries the call. No iPhone is on hand, so none is tested in this step.

## Decision Criteria

Pre-registered. Each numbered run is 3 minutes with the screen on and the page in front.

1. **Capture survives a call.** On a real Android phone in Chrome, for each order (capture
   first, call first): 3 runs. A run passes when the level meter moves throughout, the
   transcript holds the words spoken, and leaving the call neither ends nor silences capture.
   **Pass: 3 of 3 in both orders.** Anything else is a fail for that order. Desktop Chrome is
   covered by the automated Acceptance Criteria, not by these runs. iPhone Safari is not run in
   this step (no device) and stays unmeasured.
2. **On any fail: stop.** Report the failing cell and what was observed. Step two is not specified
   and nothing further is built until the founder approves a revised design. The two known
   candidates (the call pauses capture on that platform and says so; capture moves to the engine's
   side) each need a revised spec, because the second is a Non-Goal here.
3. **Transcript quality with the call on.** One speaker reads the same 100-word script twice,
   call on and call off. Score = words missing + substituted + inserted against the script.
   **Pass: call-off score at most 15 (so the baseline is a usable transcript) and call-on score
   at most 5 higher than call-off.** Worse is recorded as a finding for
   step two, with both scores. No setting is changed to chase it here: audio processing belongs to
   the one opened microphone, so changing it for the call changes it for capture too.
4. **Echo and bleed.** Two laptops on their built-in speakers and microphones, in separate rooms,
   two people alternating for 3 minutes with capture running on one. Recorded: whether either
   person hears their own voice back, and how many of the other person's words appear in the
   capturing person's transcript. **Pass for echo: neither hears themselves.** The bleed count is a
   measurement for step two's consent decision, not a pass or fail.

## Acceptance Criteria

On the development page, using test chats with the switch on.

- [ ] A person joins a chat's call, allows the microphone, and sees their own tile. No camera
      prompt appears on join.
- [ ] A second member joins the same chat's call and both hear each other.
- [ ] Turning the microphone off and on is seen and heard by the others; with it off, that
      person's transcript keeps arriving.
- [ ] Turning the camera on asks for the camera once; turning it off, or leaving, releases the
      camera (every video track has ended, so the browser's camera indicator goes off), and the
      others see the avatar and name.
- [ ] With three people every person has a tile and the current speaker is marked.
- [ ] Capture first, then join and leave the call: the level meter keeps moving and the transcript
      keeps arriving (desktop Chrome, automated with stand-in devices).
- [ ] Call first, then start and stop capture: the others keep hearing the person throughout.
- [ ] Pausing capture during a call does not mute the person in the call.
- [ ] Refusing the microphone shows a message and leaves a running capture untouched.
- [ ] When the microphone is unplugged during a call with capture running, both say it is lost and
      neither reopens it without the person asking.
- [ ] Signing out ends the call and releases the camera and the microphone.
- [ ] The call connects with the engine forced onto its relay path (the route a restrictive
      network needs).
- [ ] Two people on different networks (Wi-Fi and mobile data) hear and see each other.
- [ ] The phone runs in Decision Criteria 1, 3 and 4 are done and their results are written into
      this spec.
- [ ] A signed-in member's direct attempt to switch calls on for a chat is refused by the
      database.
- [ ] No pass is given to: a signed-out caller; a signed-in person who is not in the chat; a
      member the chat has blocked; a member of a chat whose switch is off; any caller when the
      database check errors.
- [ ] A decoded pass shows the caller's own user id, the display name held in the database (a
      name sent in the request is ignored), a call name derived from the environment and the chat
      id, a lifetime of at most 5 minutes, publishing limited to microphone and camera, and no
      administration, recording, screen-sharing or data permission.
- [ ] A person is taken out of the call after 30 minutes, and after 2 minutes with the page
      hidden (tested with the limits shortened).
- [ ] Starting capture during a call and abandoning the start, then leaving the call, leaves no
      microphone open.
- [ ] Every existing room-capture test passes unchanged.

## Done-When

- [ ] 1. `docs/technical/metered-services.md` has a registry row for the call engine, read from
      the vendor's pricing and quota pages and dated, including the downstream-data limit.
- [ ] 2. The engine account's own usage page shows what else has been spent this month, and the
      Cost Budget verdict below is confirmed or corrected against it.
- [ ] 3. A test exhausts the pass request's retries and asserts the request count (at most 3
      attempts, with backoff and jitter between them); the engine's reconnect is configured with a stated attempt count and total time,
      and a test exhausts those too.
- [ ] 4. The engine's client libraries are pinned to exact versions.
- [ ] 5. The engine choice (R3) and the proof-first split (R5) are recorded in `docs/decisions.md`.
- [ ] 6. The proof ended one of two ways, and the matching record exists: it passed and the
      step-two spec is filed with "Carried to step two" and the results; or it failed and the stop
      report (Decision Criteria 2) is with the founder.

## Invariants

- **One microphone opening per tab.** Room capture and the call take copies from the one owner.
  (The chat composer's dictation and voice notes open their own microphone today; they are not on
  the development page, and step two must settle them before a call reaches the room.)
- **Neither consumer ends or silences the other.** Leaving or muting the call never stops or
  silences the track capture records; stopping or pausing capture never drops the person from the
  call.
- **Capture's existing rules hold:** it re-checks the world after every wait, never reopens a lost
  microphone on its own (decisions.md 2026-10-02 [technical], P1388), and never runs where its bar
  is hidden (P1307 D13).
- **Who may join is decided in the database,** by the rule that decides who may post plus the
  chat's switch. No copy of either in the function or the client.
- **The function takes a chat id only** and derives everything else. It fails closed.
- **The engine's secret stays server-side.** No build-time variable carries it; the pass is never
  written to a log.
- **Nothing turns echo cancelling off.** The microphone is opened the way capture opens it
  today (a plain audio request, which leaves the browser's echo cancelling at its default).
- **No one's media reaches the engine except the founder's own test accounts** until step two's
  privacy items are done. The switch is turned on only for chats that hold nobody else.

## Alternatives Considered

Sourced on 2026-11-16. Claims marked ✔ were re-read from the primary page by command in this
session (vendor pricing and quota pages, the client source, package registries, repository
licence records, the Jitsi architecture page, Cloudflare's pricing page, Google's Meet release
notes); unmarked claims rest on the research pass alone.

| Option | Why not first |
|---|---|
| **LiveKit, rented (chosen)** | Open source under Apache-2.0 ✔; accepts an existing microphone track ✔. Free allowance 5,000 participant-minutes a month as a hard cap ✔, next tier $50 a month for 150,000 ✔. |
| LiveKit on our own cloud server from day one | Recommend rented over own server because stability: no machine of ours sits in the call path during a live event. Own server adds one VM, a UDP port range and certificate renewal as failure modes. The vendor documents no minimum machine size and recommends Redis for production, so its cost on cloud credits is unknown; step two costs it. |
| Jitsi | Open source; needs at least four server processes ✔; arrives as its own meeting screen, so the transcript and numbers cannot sit inside it without rebuilding that screen. |
| mediasoup, Janus | Building blocks; the room logic, reconnection and quality handling would be ours to write and to keep working. Janus is GPL-3.0 ✔. |
| Cloudflare RealtimeKit | Breakouts built in and a larger free allowance (10,000 minutes, then $0.002 a minute ✔), but closed and not self-hostable. The nearest rival if LiveKit fails the proof. |
| Daily, 100ms, Twilio, Agora, Amazon Chime | Closed; no path to our own server. |
| Google Meet's developer products | The Meet developer overview lists an add-ons kit (your app inside Meet) and an API that creates meetings; neither puts a call inside another app. The Meet Media API is being turned off on 2027-01-15 ✔. Other Google products were not surveyed. |
| Direct browser-to-browser (P876) | No server, but stops working well beyond three or four people, so it cannot carry groups or tables. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A call and capture cannot share a microphone on a real phone | MITIGATE | This is what the spec measures, with a stop rule |
| Changing how capture opens the microphone breaks capture in production | MITIGATE | With no call present the owner must behave exactly as capture does today (same plain audio request, tracks stopped when capture releases). Every existing capture test passes unchanged; Codex ran 53 of them green before the change as a baseline |
| The function is reachable on the live project once shipped | MITIGATE | Closed unless a chat's switch is on, and no chat has it on; negative tests in the criteria |
| The free allowance is one hard cap across every free project on the account, so test calls and any later live calls spend the same 5,000 minutes | ACCEPT | Step one is the founder's testing only; the budget below counts it. Step two decides the paid tier before calls open to anyone |
| iPhone silences the microphone when the page is hidden | ACCEPT | Known and unfixable for a web page (decisions.md 2026-10-02 [technical], "Browser audio capture fails by writing silence"). Runs keep the page in front; step two designs the notice |
| No iPhone is on hand (founder, 2026-11-16), so iPhone behaviour stays unmeasured | DEFER | Unblocked by anyone running the iPhone cells of Decision Criteria 1. Until then step two offers no call on an iPhone |
| A service worker left on the phone's development address blocks the engine's connection | MITIGATE | Confirm none is registered there before the phone runs |
| The engine's client changes often and has open iPhone audio issues | MITIGATE | Exact version pins |

**Non-Goals**

- Do NOT add a call button, banner or any call surface to the chat room, the event screens or
  `/live`. Step two.
- Do NOT make the development page reachable on the live site, and do NOT change the live site's
  security headers. Step two.
- Do NOT build breakouts or moving people between calls, and do NOT use the engine's "move
  participant" call or any other rented-service-only feature.
- Do NOT record calls on the engine's side, and do NOT route other people's call audio into
  capture in software. (Sound from a loudspeaker reaching the microphone is a different thing;
  Decision Criteria 4 measures it.)
- Do NOT add device switching, screen sharing, background blur, a noise filter add-on, ringing or
  notifications.
- Do NOT route the composer's dictation or voice notes through the microphone owner. Step two.
- Do NOT change room capture beyond replacing how it opens and releases the microphone.

## Cost Budget

Service: LiveKit Cloud, Build plan. Read 2026-11-16 from the vendor's pricing and quota pages:
5,000 WebRTC participant-minutes a month, 100 concurrent connections, 50 GB downstream data, hard
cap (new requests fail, no overage), shared across all free projects on one account.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (Supabase) | `1 pass request per join x (1 function call + 1 database call) = 2`; a failed request retries at most 2 more times: worst case `3 x 2 = 6` | `0`: the engine renews passes for connected people, the function is not called again | Unit tests: `0`, the function's database and the engine are stand-ins. Function test against the test project: `5 refusal cases + 1 success = 6 function calls + 6 database calls`, signed in as existing seeded test accounts, `0` users created or deleted |
| Egress (bytes) | `about 1 KB per pass response` | `0` from Supabase | `6 x 1 KB = 6 KB` |
| Log lines | `1 per pass request`, `+1` on a refusal | `0` | `6 + 5 refusals = 11` |
| Service unit | `1 participant-minute per person per minute`, visible or hidden | `60 per person` | Automated runs: `0` (stand-in). Phone proof, once: criteria 1 `1 platform (Android) x 2 orders x 3 runs x 3 min x 2 people = 36`; criteria 3 `2 runs x 2 min x 1 person = 4`; criteria 4 `3 min x 2 = 6`; relay and two-network checks `2 x 3 min x 2 = 12`; total `58 participant-minutes` |

Transcription during the proof uses the room's existing capture and its existing budget-capped
key: `36 + 4 + 3 = 43 minutes of audio` in total, inside what capture already spends in ordinary
testing; nothing new is added to that path.

Downstream data, phone proof: assuming 2 megabits a second of video per receiving person,
`58 min x 15 MB = about 0.9 GB` of 50 GB.

1. **Fits the plan limit today?** `monthly participant-minutes = proof (58) + build-time manual
   testing (people x minutes, read from the account's usage page) + other projects on the account
   (same page)`, against 5,000. Fits provided that page shows the account is otherwise unused;
   Done-When 2 confirms it.
2. **Fits at 10x?** Yes for this step: `10 x 58 = 580`.
3. **Upgrade if a later step does not fit:** Ship plan, $50 a month, 150,000 participant-minutes.

**Rule 2:** two local timers, neither making a request: the 30-minute and hidden-page limits
above, which exist to bound engine minutes. **Rule 3:** a hidden development page leaves the call
after 2 minutes; the standing exception a live call needs is carried to step two. **Rule 4:** Done-When 3.
**Rule 6:** counted above; automated tests spend no engine minutes.

## Pre-deploy Checklist

Nothing below runs until the proof has passed; a failed proof ships nothing to the live project.

### Secrets to provision
- [ ] The engine's key, secret and address as edge function secrets on the **test** project,
      registered in the edge-function secrets registry (P834).
- [ ] The same three on the **prod** project before this ships to main: the deploy guard refuses a
      project that lacks a secret the function reads.
- [ ] No `VITE_*` variable is added: the address reaches the browser in the pass response.

### Deploy commands
- [ ] The migration (the chat's switch column, default off, and the database function that checks
      posting rights and the switch) applied to test, then to prod with the push. It only adds;
      it carries `-- client-safe`.
- [ ] The pass function deployed to test, then to prod with the push.

### Post-deploy verification
- [ ] On the live project, a signed-in member's direct request for a pass is refused (no chat has
      the switch on). A pass being returned is a failure: turn the function off and report.
- [ ] Sentry shows no new error type from the pass function or room capture in the first 10
      minutes. Any new one is reported before anything else is done.

## Carried to step two

Findings from the spec review that hold against the code and belong to the call in the room. Step
two's spec starts from these and from the proof's results.

- **"A call is on" needs a source.** The chat's realtime connection is one per person and carries
  only message and member-state changes; nothing records that a call is running. Step two names an
  authoritative source, how a late-opened room learns the state, and how a crashed tab's state
  clears, without polling.
- **Dictation and voice notes** in the composer open their own microphone on the same screen.
- **Leaving authority behind:** removal from the chat, a block, sign-out elsewhere or the switch
  going off must take a connected person out of the call.
- **Unattended calls:** two idle people spend minutes indefinitely; a size limit must be enforced
  by the server.
- **The transcript bar** sits above the page at a fixed layer; the call panel must not cover it,
  checked at 375 and 320 pixels.
- **The live site's headers:** the camera is forbidden today and no call host is allowed; whether
  remote video needs a media rule is unverified. Checked on a preview with production headers,
  with "no report at the site's policy-report address during a two-person video call" as the
  observation.
- **Privacy before anyone but the founder is in a call:** the processor named in the policy, plus
  region, what the engine retains, and what a caller is told.
- **The allowance:** account-wide protection, and the paid tier, before calls open.
- **Own server on cloud credits:** costed, not assumed.
- `[FOUNDER DECISION]` Other callers' voices can reach a microphone that is being transcribed. The
  consent rule (decisions.md 2026-10-02 [product], P1388) rests on a visible clip-on microphone,
  which a remote caller cannot see. Recommended: the call panel shows everyone when anyone in the
  call is transcribing. Criteria 4 measures how much actually bleeds.
- `[FOUNDER DECISION]` Metered-services rule 3 says a hidden tab makes no requests. A call must
  stay connected while its tab is hidden. This needs a stated exception, with what a hidden tab may
  and may not do.
- `[FOUNDER DECISION]` Copy for every call label and message; who may turn calls on for a chat;
  whether P876 is closed as superseded; and whether online tables (which reverse "online events
  run a fishbowl with no breakouts", decisions.md 2026-09-28 [product]) go ahead.

## Open Questions

None open. Answered by the founder on 2026-11-16:

1. The engine account exists (created by the founder).
2. No iPhone is on hand; Android only. The iPhone cells of Decision Criteria 1 stay unrun, the
   proof passes or fails on Android and desktop, and step two is specified for those two until
   someone runs the iPhone cells. Until then no call is offered to an iPhone.
