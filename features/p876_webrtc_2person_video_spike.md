---
status: week
type: comment
rank: 0
created_date: '2026-06-02'
tags:
  - webrtc
  - live
  - video
  - spike
delivery_stage: architect
pipeline_ran:
  - create-spec
  - challenge-prd
  - architect
---

# P876: WebRTC 2-Person Audio/Video Spike for Clarity Live

## Problem

**Situation:** Clarity Live is a two-person session today (6-char room code, Supabase
Realtime syncing session state, mic captured via `MediaRecorder` for ML training and
uploaded to GCS). Partners must be co-located or on a *separate* call (Zoom/FaceTime)
to actually see and hear each other.

**Complication:** Running a session today needs **two tools** — a video call
(Zoom/WhatsApp) *and* clarity-live — which means two joins, two things that must work, and
a harder invite. One tool collapses that to a single join, which is the activation path
the letter→live thesis rests on ("easy to start and join"). Two sharper reasons:

1. **Coordination friction on the activation path.** Inviting someone is much easier when
   it's one tool, not "join this call, then both also join clarity-live, and hope both
   work." This friction sits exactly where the documented failure mode lives — "product
   works in the room; conversion breaks after the room."
2. **Mobile mic contention may make the two-tool model non-functional (hypothesis, not
   asserted).** On iOS especially, a backgrounded Safari tab likely loses `getUserMedia`
   while a foreground call app (WhatsApp/Zoom) holds the mic — the OS gives the foreground
   call exclusive audio. If true, "speak on WhatsApp + capture clarity audio in the
   browser on the same phone" fails, and one-tool is a *necessity*, not a convenience.
   This would also explain why all 28+ sessions to date were facilitator-led (likely
   desktop, where two apps can share the mic). **Cheapest disproof (~5 min):** on an
   iPhone, start a WhatsApp call → open Safari to a `getUserMedia` test page → background
   Safari → check whether capture survives. Run this *before* the WebRTC build — it
   either elevates priority or downgrades it to convenience-only, at zero build cost.

For exactly two people the architecture is peer-to-peer WebRTC — no media server needed —
and the signaling transport already exists in our Supabase Realtime channels (currently
used in `postgres_changes` mode; this spike uses the unused `broadcast` mode). What's
unproven in *our* stack: whether two real browsers on **different networks** can connect,
including the TURN relay fallback that ~10–20% of real connections require.

**Question:** Before investing in any UI or `/live` integration, (a) does the current
two-tool model even function on mobile, and (b) can we establish a working 2-person P2P
audio/video call using Supabase Realtime broadcast as the signaling transport, Google
public STUN, and a managed TURN fallback — across different networks and on iOS Safari?

**Scope note (strategic sequencing):** This spike is feasibility + mobile-viability
evidence only. *Productionizing* in-app video into `/live` is a phase-2 flywheel feature
that the 2026-06-02 pivot parked "until the first paid loop closes." The spike is
justified now (blast-radius-zero, de-risks a mission-central path, includes the ~5-min
mobile test); the build-now-vs-after-paid-loop decision remains a deliberate founder call
gated on the spike result.

## Appetite

**Blast radius:** None on production. The spike is throwaway code on the dev-gated `/tree`
prototype routes (P872) and touches nothing in the real `/live` flow. **Reversibility:**
Fully reversible — delete the prototype page, no schema/DB/prod changes. **Decision
density:** Low — one minor founder decision (TURN provider, free tier). The architecture
was already decided (raw P2P WebRTC over existing Supabase signaling).

## Approach

A bare standalone page under the dev-gated `/tree` routes that exercises the full
connection path and nothing else:

- Generate / enter a room code → a Supabase Realtime **broadcast** channel keyed by it
  (broadcast, not `postgres_changes` — signaling messages are ephemeral, no DB writes).
- `getUserMedia({ video: true, audio: true })` → local video preview.
- One `RTCPeerConnection` per peer, wired to the broadcast channel for the SDP
  offer/answer handshake and ICE candidate exchange. Use the **polite-peer pattern** to
  handle simultaneous offers (glare).
- ICE servers: Google public STUN (`stun:stun.l.google.com:19302`) + one managed TURN
  credential.
- Remote video element shows the other peer.
- **Evidence panel** (the point of the spike): live readout of `iceConnectionState`,
  `connectionState`, and — derived from the selected candidate pair — whether the
  connection is **direct (host/srflx) or relay (TURN)**. Plus a toggle to force
  `iceTransportPolicy: 'relay'` so the relay path can be validated in isolation.

The spike proves the *hard* path (cross-network + relay), not the laptop-tab illusion
(same machine always connects P2P and never touches TURN — that would be a false positive).

**Founder decision:** [FOUNDER DECISION: TURN provider] — Cloudflare Realtime TURN (free
tier) or Metered (free tier). Either works for the spike; this only sets which credential
we obtain. Recommend Cloudflare for the spike unless you have a Metered account already.

## Risks / Non-Goals

### Risks
- **iOS Safari WebRTC quirks** (autoplay policy on the remote stream, HTTPS-only
  `getUserMedia`, codec handling) — the most likely place to break. Mitigation: iOS Safari
  is an explicit research question; test it early, not last.
- **Supabase broadcast latency/reliability** could stall the handshake. Mitigation: log
  every signaling message with timestamps; the evidence panel surfaces stalls.
- **No public TURN we should trust** — a free-tier credential is a hard prerequisite, not
  optional. Mitigation: obtain it before building (see Done-When item 0).
- **Same-network false positive** — testing on one machine/network proves nothing about
  TURN. Mitigation: the pass criteria are explicitly cross-network + forced-relay.

### Non-Goals
- Do NOT touch the real `/live` page, `clarity-live-page.tsx`, or any production route.
- Do NOT fork the recording `MediaStream` or integrate with `use-audio-recorder.ts` —
  that is the next spec, only if this passes.
- Do NOT build mute / camera-toggle / hang-up controls, styling, or video-tile layout.
- Do NOT add reconnection / ICE-restart / mobile-handoff handling (known follow-up work,
  not part of proving feasibility).
- Do NOT add DB tables, migrations, or RLS changes.
- Do NOT build an SFU or evaluate group (3+) calling — out of scope for 2-person.

## Done-When

- [ ] 0. **Mobile two-tool pre-test (~5 min, no build):** on a phone with a call app
      (WhatsApp/Zoom) foregrounded, record whether a backgrounded browser tab still
      captures audio via `getUserMedia` (works / fails-how). This gates how much the rest
      matters — run it first.
- [ ] 1. TURN credential obtained (provider per founder decision) and wired into the
      `RTCPeerConnection` ICE config.
- [ ] 2. SDP offer/answer + ICE exchange completes over Supabase Realtime broadcast on
      **3 successful handshakes across desktop Chrome, mobile Chrome, and iOS Safari**,
      each within ~10s of room join (logged with timestamps). "Reliably" = these three,
      not one lucky connection.
- [ ] 3. Two people on **different networks** (home Wi-Fi ↔ phone on cellular) see and
      hear each other — confirmed by both parties, screenshot/recording as evidence.
- [ ] 4. **TURN relay path confirmed in isolation** — with `iceTransportPolicy: 'relay'`
      forced, the call still connects and the evidence panel shows the selected candidate
      pair is `relay`.
- [ ] 5. **iOS Safari result recorded** — the call works, OR the specific failure mode is
      documented as a finding. (A falsification result, not a checkbox to wave through —
      a hard iOS failure is a legitimate and important outcome.)
- [ ] 6. Findings written up (see Deliverable).
- [ ] 7. **Throwaway `/tree` page deleted and committed** in the same session as the
      writeup, regardless of outcome (no IKEA-effect debt).

## Research Questions

1. **(Highest value)** Does the current two-tool model even function on mobile — can a
   browser capture clarity audio while a call app is foregrounded? I.e. is one-tool a
   convenience or a necessity?
2. Does Supabase Realtime `broadcast` carry the WebRTC signaling handshake reliably and
   with acceptable latency for connection setup?
3. Do two peers on genuinely different networks connect via STUN/TURN?
4. Does the TURN relay actually carry media when direct P2P is forced off?
5. Does the call work on iOS Safari, and if not, what exactly breaks?

## Time Box

Falsification-bounded, not clock-bounded: stop and report the moment all five research
questions have a yes/no answer — **or** the moment any question returns a hard no that
blocks feasibility (e.g. iOS Safari fundamentally cannot establish the connection). Do not
push past a hard blocker trying to fix it; report it as a finding so the go/no-go decision
can be made with it on the table.

## Deliverable

A **feasibility + mobile-viability finding** that feeds — does not by itself make — the
productionization decision (which stays sequencing-gated per the Scope note). Contents:
the mobile two-tool result (works / fails-how), which network conditions connected
directly vs needed relay, the iOS Safari result, signaling-reliability observations, and
any constraint that would reshape the follow-up `/live` integration spec or its priority.
The throwaway `/tree` page is the artifact that produced the evidence, not a deliverable
to keep (see Done-When 7).

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] Strategic Fit: spike maps to no active hypothesis; Zoom already provides video at €0; facilitator-led sessions already have a call open | Reframed Problem with founder domain context | Friction is coordination (two tools, two joins, harder invite) on the letter→live activation path — not aesthetics. Main WARN closed by grounding the problem. |
| 2 | /challenge-prd | [WARN] Assumption Validity: hidden, untested desirability assumption that "Zoom friction is a material barrier" | Promoted to testable Research Q1 (mobile two-tool viability) + ~5-min disproof | Founder raised mobile mic-contention: two-tool model may be non-functional on mobile, making one-tool a necessity. Converts an untested preference into a falsifiable constraint tested cheaply, first. |
| 3 | /challenge-prd | [WARN] Strategic sequencing: in-app video is phase-2, parked until first paid loop (2026-06-02 pivot) | Accepted + scoped | Added Scope note: the *spike* is justified now (zero blast, de-risks mission-central path); *productionization* stays a deliberate founder call gated on the spike result. Sequencing tension named, not hidden. |
| 4 | /challenge-prd | [WARN] Testability: "exchange reliably" undefined | Defined | Done-When 2 = 3 successful handshakes across desktop Chrome / mobile Chrome / iOS Safari, each within ~10s. |
| 5 | /challenge-prd | [WARN] Testability: item "works on iOS Safari or document failure" is always-passable | Reframed as falsification result | Done-When 5 names a hard iOS failure as a legitimate, important outcome — not a checkbox waved through. |
| 6 | /challenge-prd | [WARN] Bias: IKEA effect on ~300 lines of working WebRTC code framed "throwaway" | Explicit deletion step | Done-When 7 = delete + commit the /tree page in the same session as the writeup, regardless of outcome. |
| 7 | /challenge-prd | [NOTE] Appetite: "signaling transport already exists" overstates (broadcast mode unused) | Corrected in Problem | Noted that current usage is `postgres_changes`; the spike uses the as-yet-unused `broadcast` mode. |

## Technical Architecture

### Technical Analysis

**Reuse inventory — verified against the codebase:**

| Reusable artifact | File path | How it is used here |
|---|---|---|
| Supabase singleton | `src/lib/supabase.ts` — `export { supabase }` | Import directly: `import { supabase } from '@/lib/supabase'`. All channel calls go through this. |
| `postgres_changes` channel pattern | `src/app/data/api.ts:1254, 1623, 1949, 1986, 2737, 4126` — `.channel(name).on('postgres_changes', …).subscribe()` | Reference only — the spike uses a **different event type** (`broadcast`), but the subscribe/unsubscribe lifecycle (return channel, call `supabase.removeChannel(ch)` on cleanup) is identical. |
| `useMicrophonePermission` hook | `src/hooks/useMicrophonePermission.ts` — `requestPermission(): Promise<boolean>`, `status: MicrophoneStatus` | Do NOT import — the hook stops the stream immediately after permission grant (its purpose is permission-check only). The spike needs the stream to stay alive for `addTrack`. Call `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` directly and keep the stream ref. |
| Prototype page location | `src/app/pages/prototypes/new-live-prototype.tsx` — named export `NewLivePrototype` | Follow this location + named-export pattern. New file: `src/app/pages/prototypes/webrtc-spike.tsx`, named export `WebRTCSpike`. |
| `/tree` route registration | `src/App.tsx:70, 755` — `lazy(() => import(…).then(m => ({ default: m.NamedExport })))` + `{import.meta.env.DEV && <Route path="/tree/…" …>}` | One new `lazy` const + one single-line gated `<Route>`. Form must put both `import.meta.env.DEV` and `path="/tree/webrtc"` on the same line — `pre-commit-checks.sh` validates this. |

**Broadcast mode is unused today.** Every existing channel uses `.on('postgres_changes', …)`. The spike is the first to use `broadcast`. There is no existing wrapper to reuse for broadcast; the API call is direct.

**Bundle-landing caveat (App.tsx:729 comment, confirmed):** The `lazy(() => import())` const for the spike component is not tree-shaken in the prod build. Any module the spike page statically imports — including TURN credentials read from `import.meta.env` — lands in the prod chunk. This directly constrains the TURN credential decision (see Decision 3 below).

---

### Architecture Decisions

#### Decision 1 — Signaling contract over Supabase Realtime `broadcast`

**Chosen:** Four event types on a single per-room channel, polite/impolite role assigned by join order.

**Channel name:** `webrtc-signal:${roomCode}` — matches the existing `name:${id}` convention in `api.ts` (e.g. `clarity_session:${sessionId}`).

**Channel config:**
```ts
supabase.channel(`webrtc-signal:${roomCode}`, {
  config: { broadcast: { self: false } },
})
```
`self: false` suppresses loopback — each peer receives only the remote peer's messages.

**Message types and payloads:**

| `event` | `payload` | Direction | Notes |
|---|---|---|---|
| `join` | `{ peerId: string }` | peer → channel | Sent on subscribe. Both peers emit; the one that arrives first is impolite. |
| `offer` | `{ sdp: RTCSessionDescriptionInit }` | impolite → polite (or re-offer) | Full SDP object. |
| `answer` | `{ sdp: RTCSessionDescriptionInit }` | polite → impolite | Full SDP object. |
| `ice-candidate` | `{ candidate: RTCIceCandidateInit \| null }` | either → other | `null` signals end-of-candidates (trickle ICE end). |

**Polite/impolite assignment (glare resolution):**

Use **lexicographic peer-id comparison**, not join order. Join order via broadcast has a race window: both `join` messages can arrive out of order if emitted near-simultaneously. A stable rule avoids ambiguity:

1. Each peer generates a random `peerId` (e.g. `crypto.randomUUID()`) on page load, stored in component state.
2. On receiving a remote `join` message, each peer compares `myPeerId < remotePeerId`.
3. `myPeerId < remotePeerId` → I am **polite** (defer my offer, rollback on glare).
4. `myPeerId > remotePeerId` → I am **impolite** (never rollback — keep my offer on glare).
5. Equal (astronomically unlikely with UUID v4) → treat as impolite to avoid deadlock.

This is deterministic, symmetric, and does not depend on delivery order.

**Glare handling (simultaneous offers):** Both peers call `onnegotiationneeded` and fire offers at the same time if they both have video tracks. The polite peer detects glare via `pc.signalingState !== 'stable'` when receiving a remote offer — it rolls back its local description (`await pc.setLocalDescription({ type: 'rollback' })`) before applying the remote offer. The impolite peer ignores a remote offer that arrives while it already has a pending offer.

**Broadcast reliability caveat (Research Question 2):** Broadcast delivery is best-effort — a dropped ICE candidate degrades connectivity quality but should not deadlock because:
- ICE candidates are individually idempotent (each is a separate candidate path).
- If candidate messages are lost, the connection may still complete via STUN reflexive candidates already gathered.
- As a defensive measure: after all local candidates are gathered (the `null` sentinel), wait 2 s and re-send the full gathered list (deduplication by `candidate` string). This is simpler than a full non-trickle fallback and handles the most common drop scenario (single missed message).

**Rationale:** Four events + one channel is the minimal surface for full P2P signaling. Using the existing Supabase client avoids a new dependency. Lexicographic peer-id comparison is deterministic and side-steps the join-order race.

**Trade-off:** Polite-peer rollback requires `setLocalDescription({ type: 'rollback' })` which is not supported on all old Safari versions (supported in Safari 15+, which covers iOS 15+ — acceptable for the spike). If rollback fails, the connection stalls; this is a logged failure mode, not silent.

**Alternative rejected:** Join-order assignment (first-to-join = impolite). Rejected because broadcast delivery order is not guaranteed — two peers joining within milliseconds of each other may receive `join` messages in different orders, making the assignment inconsistent between peers (both believe they are impolite, or both polite). Lexicographic comparison is symmetric by construction.

---

#### Decision 2 — ICE server config and TURN credential placement

**Chosen:** `iceServers` array with Google public STUN + one managed TURN credential; credentials read from `import.meta.env` (`.env.local` only, never committed).

**ICE config shape:**
```ts
const iceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: import.meta.env.VITE_TURN_URL,        // e.g. 'turn:…'
    username: import.meta.env.VITE_TURN_USER,
    credential: import.meta.env.VITE_TURN_PASS,
  },
];
```

**Where the credential lives:**
- `.env.local` (gitignored) — the ONLY place. Never `.env`, `.env.development`, or any committed file.
- `.env.local` is read by Vite in dev mode and baked into the local dev bundle.
- `.env.local` is NOT read by Vercel builds — so even if a prod deploy ran, the TURN credential would be absent (baked as `undefined`), which causes the TURN server entry to be skipped at ICE negotiation time. This is the correct prod behavior for a dev-only spike.

**Why this is acceptable for the spike:** The route is dev-gated (unreachable in prod). The `.env.local` value never reaches the prod bundle — Vercel does not read `.env.local`. The credential is still present in the local dev bundle (a feature of VITE_* vars), but that bundle never leaves the developer's machine.

**Productionization path (noted, not designed):** For any production use, TURN credentials must be short-lived (TTL ≤ 24 h) and minted server-side per session via the provider's REST API (Cloudflare Realtime TURN ephemeral key API, or Twilio NTS token endpoint). The client receives the credential via a server action or edge function call at session start — never a static env var. This keeps the long-lived API key on the server and exposes only time-limited tokens to the browser.

**TURN provider for the spike:** [FOUNDER DECISION: TURN provider already noted in Approach — Cloudflare Realtime TURN free tier or Metered free tier]. Whichever is chosen: obtain credentials → add three lines to `.env.local` → confirm `.env.local` is in `.gitignore` (it is, verified).

**Rationale:** Keeping secrets in `.env.local` is the standard Vite/Supabase pattern already in use for `SUPABASE_SERVICE_ROLE_KEY` and other dev-only values. It does not require a new pattern.

**Trade-off:** The VITE_* value is in the local JS bundle. Any developer who receives the project with the `.env.local` populated can read the credential from the compiled JS. For a disposable spike this is acceptable; for production it is not (hence the ephemeral-credential productionization path above).

**Alternative rejected:** Supabase Edge Function as a TURN credential proxy. Adds a new edge function deploy for a throwaway spike. The risk (credential in local bundle) is already accepted under the dev-only constraint.

---

#### Decision 3 — `RTCPeerConnection` lifecycle

**Chosen:** Single `RTCPeerConnection` instance per page load, created after `getUserMedia` succeeds, torn down on component unmount or room exit.

**Lifecycle sequence (per peer):**

```
getUserMedia({ video: true, audio: true })
  → store localStream ref
  → attach local tracks to local <video> element
  → create RTCPeerConnection({ iceServers })
  → pc.addTrack(track, localStream) for each track   ← triggers onnegotiationneeded
  → subscribe to Supabase broadcast channel

onnegotiationneeded (impolite peer fires first, or after polite rollback):
  → await pc.setLocalDescription()           ← browser generates offer
  → broadcast({ event: 'offer', payload: { sdp: pc.localDescription } })

onicecandidate = ({ candidate }):
  → broadcast({ event: 'ice-candidate', payload: { candidate } })   ← null = end-of-candidates

on broadcast 'offer' received:
  [impolite peer] if signalingState !== 'stable': ignore (keep own offer)
  [polite peer]   if signalingState !== 'stable': await pc.setLocalDescription({ type: 'rollback' })
  → await pc.setRemoteDescription(sdp)
  → await pc.setLocalDescription()           ← browser generates answer
  → broadcast({ event: 'answer', payload: { sdp: pc.localDescription } })

on broadcast 'answer' received:
  → await pc.setRemoteDescription(sdp)

on broadcast 'ice-candidate' received:
  → if candidate is null: ignore (end-of-candidates sentinel, no action needed)
  → else: await pc.addIceCandidate(candidate)

ontrack = ({ streams }):
  → attach streams[0] to remote <video> element (srcObject)
  → Note: iOS Safari requires <video> to be muted + playsInline for autoplay

Teardown (useEffect cleanup):
  → localStream.getTracks().forEach(t => t.stop())
  → pc.close()
  → supabase.removeChannel(channel)
```

**`iceTransportPolicy` forced-relay toggle:** The evidence panel exposes a React state boolean `forceRelay`. When toggled, the current `pc` is closed and a new one is created with `{ iceServers, iceTransportPolicy: 'relay' }`. This recreates the full negotiation — the simplest implementation for a spike (no ICE-restart complexity).

**Rationale:** A single `pc` per page load matches the spike's scope (one call, no reconnection). The `addTrack` call after `getUserMedia` reliably fires `onnegotiationneeded`, which is the spec-compliant trigger for offer creation (avoids manual `createOffer` calls).

**Trade-off:** Recreating the `pc` for the relay toggle causes a brief media interruption. Acceptable for a diagnostic spike — the point is to test the relay path, not provide seamless UX.

**Alternative rejected:** Non-trickle ICE (gather all candidates before sending offer). Simplifies the broadcast reliability concern but adds 1–5 s of gathering delay before the call starts. The evidence panel needs to show candidate-gathering in real time; trickle ICE makes that visible. Non-trickle fallback is kept as a last resort if broadcast proves unreliable (Research Q2).

---

#### Decision 4 — Evidence panel: stats extraction

**Chosen:** `setInterval`-based `pc.getStats()` poll every 500 ms, reading the succeeded candidate pair and deriving connection type from local/remote candidateType.

**Stats extraction logic:**
```ts
const stats = await pc.getStats();
let localCandidateId: string | undefined;
let remoteCandidateId: string | undefined;

// Step 1: find the nominated (succeeded) candidate pair
stats.forEach(report => {
  if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
    localCandidateId = report.localCandidateId;
    remoteCandidateId = report.remoteCandidateId;
  }
});

// Step 2: read candidateType from the local and remote candidate reports
let localType: string | undefined;
let remoteType: string | undefined;
stats.forEach(report => {
  if (report.type === 'local-candidate' && report.id === localCandidateId) {
    localType = report.candidateType;   // 'host' | 'srflx' | 'prflx' | 'relay'
  }
  if (report.type === 'remote-candidate' && report.id === remoteCandidateId) {
    remoteType = report.candidateType;
  }
});

const isRelay = localType === 'relay' || remoteType === 'relay';
```

**Panel live readouts:**
- `pc.iceConnectionState` (event-driven: `oniceconnectionstatechange`)
- `pc.connectionState` (event-driven: `onconnectionstatechange`)
- Selected candidate pair: local type / remote type — polled at 500 ms once connected
- Derived: `DIRECT` (host or srflx) vs `RELAY (TURN)` — shown prominently
- Broadcast signaling log: timestamped list of each message sent/received (event name + relative ms from room join)

**`state === 'succeeded' && report.nominated`:** The `nominated` flag identifies the candidate pair actually in use. Without it, multiple `succeeded` pairs may exist (one per valid path); only the nominated one carries media.

**Rationale:** `getStats()` is the only standards-based way to determine which candidate pair is active. The 500 ms poll is cheap (no network I/O) and sufficient for a diagnostic display.

**Trade-off:** `getStats()` field names vary slightly between browser implementations (Chrome vs Firefox vs Safari). The `nominated` field is widely supported (part of the W3C spec) but should be guarded with `report.nominated !== undefined`. On Safari, `candidate-pair` reports may use `selected` instead of `nominated` in older versions — add a fallback: `report.nominated ?? report.selected`.

**Alternative rejected:** `RTCDtlsTransport` / `RTCIceTransport` APIs. Less widely supported and not needed — `getStats()` is sufficient and universal.

---

### Security Review

Proportionate to a disposable, dev-gated prototype. Each ⚠️ is tagged **spike-OK** (with
reason) or **must-fix-before-spike**, plus the gate that applies *before this ever touches
`/live`*.

**RLS Policies — ✅ No surface.** Broadcast is transport-layer pub/sub, not a DB write; it
is outside RLS by Supabase's design. No new tables/columns/policies (matches Non-Goals).

**Authentication / Access (room-code channel) — ⚠️ spike-OK.** Anyone holding the public
`VITE_SUPABASE_ANON_KEY` (already in every bundle) can subscribe to any broadcast channel
by name; the room code is the only barrier (same trust model as today's 6-char clarity
code). A stranger who guesses the code within the call's lifetime could eavesdrop on
signaling metadata (SDP, ICE candidates → network-topology hints) or attempt to join the
negotiation. **Spike-OK** because the route is dev-gated/unreachable in prod, no PII or
auth tokens flow through it, and it's deleted after (Done-When 7). **Productionization
gate:** JWT-authenticated channels with RLS on `realtime.messages` (room code as a token
claim bound to the authed user), or a presence/room table with RLS; raise code entropy to
≥12 chars for session-scoped codes.

**Input Validation (signaling payloads) — ⚠️ must-fix-before-spike.** The design wires
broadcast payloads into `setRemoteDescription()` and `addIceCandidate()`. Malformed input
throws a `DOMException` — catchable, but it would make the cross-browser test results
(the spike's entire purpose) ambiguous, and on a guessable channel a third party could
inject malformed SDP/candidates. **Required:** a shape guard before each WebRTC call,
matching Decision 1's *actual* payload shapes (note: the offer/answer payload nests the
description under `.sdp`, and the ICE payload's `.candidate` is an object **or `null`**
sentinel — so the guard is not `typeof === 'string'`):

```ts
// offer/answer — payload = { sdp: RTCSessionDescriptionInit }
if (!payload?.sdp || !['offer','answer'].includes(payload.sdp.type)
    || typeof payload.sdp.sdp !== 'string') return;
// ice-candidate — payload = { candidate: RTCIceCandidateInit | null }
if (payload.candidate === null) { /* end-of-candidates sentinel — ignore */ }
else if (typeof payload.candidate?.candidate !== 'string') return;
```

Cheap, and prevents the hard crashes that would corrupt test signal. **Productionization
gate:** strict schema validation (Zod or equivalent) on every signaling message.

**Data Protection — ✅.** `getUserMedia({video,audio})` triggers the browser-native
consent dialog (no bypass); the stream is never forked to `MediaRecorder`/GCS and nothing
is persisted (matches Non-Goals). `getUserMedia` works only on HTTPS/localhost — satisfied
by Vercel (always HTTPS) and local dev. *Functional note for Done-When 5 (not a security
finding):* iOS Safari needs the remote `<video>` to be `muted` + `playsInline` to autoplay.

**Secrets / Credentials — ⚠️ spike-OK.** A TURN credential is inherently delivered to the
browser (the client authenticates to the relay), so it is never fully secret — the only
question is static-long-lived vs ephemeral. **Spike-OK** to use a static free-tier
credential held in `.env.local` *only* (gitignored; Vercel does not read `.env.local`, so
it is absent from prod builds and the TURN entry is simply skipped there — the correct
dev-only behavior). Free-tier blast radius is a bandwidth cap, not a bill. **Must-fix
hygiene:** never hardcode the credential in source; keep it in `.env.local`; confirm no new
`.env.*` variant escapes `.gitignore`. **Productionization gate:** ephemeral, short-TTL
TURN credentials minted server-side per session (Cloudflare Realtime TURN / Twilio NTS
REST API) via an auth-gated edge function — never a static `VITE_*` baked into a build.

**Summary**

| Area | Verdict | Spike status | Productionization gate |
|---|---|---|---|
| RLS | ✅ none | N/A | N/A |
| Channel access (room code) | ⚠️ | spike-OK (dev-only, throwaway) | JWT/RLS channels + ≥12-char code |
| Signaling payload validation | ⚠️ | **must-fix-before-spike** (4-line guard) | Zod schema on all messages |
| Camera/mic consent | ✅ | fine as-is | — |
| HTTPS / getUserMedia | ✅ | enforced | — |
| Media persistence | ✅ none | fine as-is | — |
| TURN credential (static) | ⚠️ | spike-OK (free-tier, `.env.local`, dev-gated) | ephemeral server-minted creds |

---

### Implementation Approach

#### Build Sequence

1. Obtain TURN credential (founder action) → populate `.env.local` with `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS`.
2. Create `src/app/pages/prototypes/webrtc-spike.tsx` — room-code entry form + `getUserMedia` call + local `<video>` element only. Confirm camera/mic works in browser.
3. Add the broadcast channel: subscribe to `webrtc-signal:${roomCode}`, log received messages. Confirm both browser tabs see each other's `join` events.
4. Wire `RTCPeerConnection` — `addTrack`, `onnegotiationneeded` → offer, `onicecandidate` → ice-candidate broadcast. Open two tabs, confirm SDP handshake completes in the logs.
5. Handle inbound messages — **validate payload shape first** (per Security Review: guard against malformed `sdp`/`candidate` before `setRemoteDescription`/`addIceCandidate`, matching Decision 1's payload shapes incl. the `null` ICE sentinel), then apply remote offer/answer/ice-candidate. Confirm `remote <video>` shows the other tab's stream (same-machine test).
6. Add evidence panel — live `iceConnectionState`, `connectionState`, candidate-pair stats poll, signaling log.
7. Add forced-relay toggle — creates new `pc` with `iceTransportPolicy: 'relay'`.
8. Cross-network test and iOS Safari test — the actual spike validation (Done-When 2–5).
9. Write up findings → delete the `/tree` page → commit deletion.

#### Files to Create

- `src/app/pages/prototypes/webrtc-spike.tsx` — named export `WebRTCSpike`. Self-contained: no imports from `api.ts` or production app components. Only imports: `supabase` singleton from `@/lib/supabase`, React hooks, browser APIs.

#### Files to Modify

- `src/App.tsx` — add two lines in the dev/prototype section:
  1. Lazy import const (line ~70, after `NewLivePrototype`):
     ```ts
     const WebRTCSpike = lazy(() => import("@/app/pages/prototypes/webrtc-spike").then(m => ({ default: m.WebRTCSpike })));
     ```
  2. Gated route (line ~755, after `/tree/new-live` route — same-line form required):
     ```tsx
     {import.meta.env.DEV && <Route path="/tree/webrtc" element={<LazyRoute><WebRTCSpike /></LazyRoute>} />}
     ```

## Pre-deploy Checklist

**N/A — dev-gated spike, no prod deploy.** `VITE_TURN_URL` / `VITE_TURN_USER` /
`VITE_TURN_PASS` live in `.env.local` only and are **intentionally NOT** provisioned to
Vercel prod: the `/tree/webrtc` route is gated by `import.meta.env.DEV` (unreachable in
production), and a static TURN credential must not be baked into a prod bundle (see
Security Review). The component chunk ships to prod (not tree-shaken, per `App.tsx:735`)
but the credentials resolve to `undefined` there and the TURN entry is skipped — correct.

**Promotion gate:** if any artifact from this spike is ever moved to a non-dev-gated route
(the follow-up `/live` integration spec), replace this section with a real provisioning
checklist using **ephemeral, server-minted** TURN credentials (Security Review
productionization gate) — never the static `.env.local` values.
