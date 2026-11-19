---
status: week
type: story
rank: 352
created_date: '2026-11-19'
tags: [calls, rooms, capture, p1688]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
spec_review_hash: a391bc4d06eae5f3579e865bd072ed933fa6d29f2585e16b97c7380dd0997408
spec_review_vendors: [gemini]
---

# P1711: In-app calls in the room (step two of P1688)

## Problem

> Founder framing, verbatim: *"If all 6 pass, update Done-When 6 (it is currently ticked on the
> failure branch) and file the step-two spec from "Carried to step two"."*

> Founder direction, verbatim, 2026-11-19: *"our goal is having video calls like a mixture of how
> Telegram calls video calls by the way at the end right now we do audio and then we release right
> and then maybe we do video and then parallel develop our idea that to integrate listening game"*

**Situation:** P1688 step one built the call logic on a development-only page and proved it on a
real Android phone: with a call connected, the room's transcript capture kept hearing and
transcribing the whole spoken script in 6 of 6 three-minute runs, in both orders (call first,
capture first), on 2026-11-19. Nothing user-visible shipped: there is no call button in a room.

**Complication:** An online session still needs a second tool beside the room for voice and
picture. Step one's own review left a list of things a room call must settle before anyone but the
founder is in one ("Carried to step two" in the P1688 spec), and several of them are founder decisions.

**Question:** What does a call inside a chat room look like and enforce, so that people can talk
and see each other in the room while its transcript keeps working?

## Appetite

Blast radius: high. Every chat room gains a call surface; it touches the room's microphone (shared
with capture), a metered vendor, consent, and the live site's security headers. Reversibility:
medium (P1688 adds a per-chat switch, off by default; it reaches main when P1688 ships).
Decision density: high. This spec is filed before its design: the founder decisions below come
first, then the implementing agent proposes a design for each open requirement and the founder
approves it before `/dev`.

## Release order

Decided by the founder, 2026-11-19 (quoted above):

1. **First release: audio calls in the room.** Voice only. The camera control is not offered.
2. **Then video**, aiming at calls that feel like Telegram's video calls. Not specified here.
3. **In parallel: the Listening Game inside calls.** Not specified here; it needs its own spec.

Everything below is scoped to the first release unless it says otherwise.

**Build order (founder decision B, 2026-11-19, replacing A the same day):** P1688's open step-one
checks are proven on P1688's development page before P1688 ships, as permanent regression tests
for the shared call logic (`e2e/p1688-calls.spec.ts`, opt-in). This spec starts from those passing
tests and keeps them passing; the room screen adds its own checks on top. Two items are carried
here by name ("Carried to P1711 by name" in the P1688 spec): Decision Criteria 4 (echo and bleed)
and the founder's choice for an unplug during a call with capture running. Decision Criteria 3 and
the two-networks check run on P1688.

## Solution

Start from the P1688 spec's "Carried to step two" section and its "Proof results so far" (both on
P1688's branch until it ships). Each requirement below needs a design proposal (options and a
recommendation) approved by the founder; the agent does not settle them silently.

1. **"A call is on":** an authoritative source; how a late-opened room learns it; how a crashed
   tab's state clears; no polling.
2. **The composer's microphone:** dictation and voice notes open their own microphone today. Each
   either shares the one microphone owner or is unavailable during a call (decision below).
3. **Leaving authority behind:** removal from the chat, a block, sign-out elsewhere, or the chat's
   switch going off takes a connected person out, and refuses later joins.
4. **Unattended calls:** a size limit and a duration limit enforced by the server. The development
   page's limits (30 minutes; leave after 2 minutes hidden) are browser timers, and a frozen or
   suspended tab does not run them. The 2-minute hidden leave also conflicts with the hidden-tab
   decision below.
5. **The call panel:** three defects found in step one: "ask for the microphone again" shows no
   in-progress state; Leave is a filled primary button beside the transcript bar's own primary;
   the camera control does nothing while the call is reconnecting. The panel does not cover the
   transcript bar at 375 and 320 pixels.
6. **Mute while a lost microphone is being replaced:** a Mute pressed while the engine waits can go
   out live. Two fixes are on record: keep mute unavailable during a replacement, or always hand the
   engine an already-wrapped track and write silence before waiting on it (read in the client's
   source, version 2.23.0).
7. **The live site's headers:** no call host is allowed today, so the first release needs the
   call host allowed. The camera is forbidden today, and whether remote video needs a media rule
   is unverified; both belong to the video release. Pass condition for the first release: no
   report at the site's policy-report address during a two-person audio call on a preview with
   production headers.
8. **Ending capture on the phone during a call** timed out once in a call-first run (2026-11-19)
   and once before (2026-11-17), without failing a run. Reproduce it; fix it, or the founder
   accepts it with what is lost when it happens.
9. **Privacy before anyone but the founder is in a call** (founder-owned): the processor named in
   the policy, region, what the engine retains, what a caller is told.
10. **The allowance** (founder-owned): account-wide spending protection and the paid tier, before
    calls open.
11. **Our own call server on cloud credits** (founder-owned): costed, not assumed.

`[FOUNDER DECISION: consent. Other callers' voices reach a transcribed microphone, and the consent
rule (decisions.md 2026-10-02 [product], P1388) rests on a visible clip-on microphone a remote
caller cannot see. Recommended in P1688: the call panel shows everyone when anyone in the call is
transcribing, including someone who starts mid-call and anyone who joins later.]`

`[FOUNDER DECISION: an unplugged microphone with a call and capture both running. Capture tries the
default input once and carries on; the call waits for a press. Either capture stops trying while a
call runs (a change to capture's own rule), or the P1688 criterion is restated to what capture
does. There is no test of the two together yet.]`

`[FOUNDER DECISION: the hidden tab. Metered-services rule 3 says a hidden tab makes no requests; a
call must stay connected while its tab is hidden. A stated exception, with what a hidden tab may and
may not do, and what replaces the 2-minute hidden leave.]`

`[FOUNDER DECISION: limits and money. The call size and duration limits; how fast a removed person
must be out of the call, and which way a block applies in a group; the paid tier and an account
spending bound; whether to cost our own server.]`

`[FOUNDER DECISION: the composer's dictation and voice notes during a call: share the microphone,
or be unavailable while the call runs.]`

`[FOUNDER DECISION: copy for every call label and message (including what a caller is told about
privacy); who may turn calls on for a chat; whether P876 is closed as superseded; whether online
tables go ahead (they reverse 2026-09-28 [product], under which online events "will run a fishbowl
with an observer and no breakouts").]`

## Invariants

- One microphone opening per tab: the call never opens its own microphone; it and capture each get
  a copy from the one owner (decisions.md 2026-11-17 [technical], P1688). The composer's microphone
  is settled before the room surface ships.
- No one's media reaches the engine except the founder's own test accounts until requirement 9
  (privacy) is done (P1688 Invariant).
- No call is offered on an iPhone in this delivery. Offering it later needs the iPhone cells of
  P1688's Decision Criteria 1 run and passed (P1688 Open Questions, answered 2026-11-16).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The step-one pass rests on an amended meter check, made after seeing data | ACCEPT | Recorded in P1688 and decisions.md 2026-11-18 and 2026-11-19; one phone, one browser, a synthetic voice |
| Transcript quality and echo with a call on are unmeasured | MITIGATE | P1688 Decision Criteria 3 and 4 must pass, or the founder accepts the recorded result, before calls open |
| Ending capture on the phone times out during a call | MITIGATE | Requirement 8 |
| The free allowance is one cap shared by every free project | MITIGATE | Requirement 10, before calls open |

**Non-Goals**
- Do NOT ship the camera or video in the first release (release order above).
- Do NOT build the Listening Game integration here; it gets its own spec.
- Do NOT build breakouts or tables here; that waits on the founder decision above.
- Do NOT change capture's own rules (decisions.md 2026-10-02 [technical]), except as the founder's
  unplug decision directs.
- Do NOT offer calls on iPhone (see Invariants).

## Acceptance Criteria

- [ ] On Android Chrome and desktop Chrome, two people in a chat with calls switched on start or join
      an audio call from the room, hear each other, and the transcript of a spoken script still
      holds its words (the P1688 measure: script words found in the capture room's transcript).
- [ ] No camera control is offered in the first release.
- [ ] A person removed from the chat, blocked, signed out elsewhere, or in a chat whose switch is
      turned off is out of the call within the founder's bound and cannot rejoin, observed on a
      second device.
- [ ] A room opened after a call started shows it; a crashed tab's call state clears.
- [ ] A join beyond the server's size limit is refused, and a call reaching the duration limit is
      ended by the server, including when a tab in it is frozen or hidden.
- [ ] The account spending protection the founder chose is in place and tested before calls open.
- [ ] Unplugging the microphone with a call and capture both running behaves as the founder
      decided, tested with both running.
- [ ] The composer's dictation and voice notes behave as decided during a call, with one microphone
      opening.
- [ ] The three call-panel defects are fixed, and the panel does not cover the transcript bar at 375
      and 320 pixels.
- [ ] Mute pressed during a microphone replacement sends no sound.
- [ ] On a preview with production headers, a two-person audio call connects and no report reaches
      the site's policy-report address (checked that the address receives a deliberately triggered
      report first).
- [ ] The consent decision is implemented as decided and observed in a call, including for a late
      joiner and for someone who starts transcribing mid-call.
- [ ] No call is offered on an iPhone.
- [ ] P1688 Decision Criteria 4 (carried here by name) passes its threshold, or the founder accepts
      the recorded result; Criteria 3's result is read from P1688.
- [ ] Ending capture on the phone during a call is reproduced and fixed, or accepted by the founder.
- [ ] Two people on different networks (Wi-Fi and mobile data) hear each other in a room call.

## Done-When

- [ ] Each founder decision above is answered and recorded in this spec and in decisions.md.
- [ ] A design for requirements 1 to 8 is approved by the founder before `/dev`.
- [ ] The Cost Budget table is filled with arithmetic, the paid-tier decision is made, and our own
      server is costed (requirement 11).
- [ ] The privacy items (requirement 9) are done before the founder-accounts-only invariant is lifted.
- [ ] P1688's regression tests for the shared call logic (`e2e/p1688-calls.spec.ts`) still pass
      against the room build, and the two items carried here by name (Decision Criteria 4; the
      unplug choice) are each run or decided (build order above).

## Cost Budget

Metered service: the call engine (LiveKit Cloud), registry rows dated 2026-11-17 added to
`docs/technical/metered-services.md` by P1688 (on its branch until P1688 ships). The table is filled
when the room surface and its limits are designed; until then the only spend is test calls, counted
per run as in P1688's Cost Budget.

## Related

- P1688 (step one; "Carried to step two", "Proof results so far", Decision Criteria 3 and 4)
- P1709 (meeting invitations; names P1688)
- P876 (earlier two-person video spike; closure is a founder decision above)
