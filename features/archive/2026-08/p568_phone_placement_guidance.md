---
status: rejected
type: story
rank: 21
tags:
  - recording
  - ux
  - live
  - self-serve
created_date: 2026-03-22
closed_at: '2026-08-14'
---

# P568: Phone Placement Guidance + Mic Check for /live Sessions

> **Closed 2026-08-14 — backlog triage.** Unblock condition is *"self-serve /live sessions happening without facilitator"* ([decisions.md](../../docs/decisions.md) 2026-03-22). Every session type in the active funnel is founder-facilitated ([goals.md](../../docs/goals.md)). Revivable if self-serve returns.
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

## Why Backlog (2026-03-22)

**Premature for current phase.** Speaker attribution without a facilitator only matters for self-serve pairs — a use case that doesn't exist yet. All 28+ sessions have been facilitator-led. The 30-day priority is workshops + €950 de-risking conversion, neither of which needs this.

**Unblock condition:** Self-serve /live sessions are happening without facilitator present, AND speaker attribution quality is a reported problem.

## Problem Statement

Multi-phone /live session recordings capture both speakers on both phones (crosstalk). Speaker attribution accuracy depends on the energy difference between phones — the closer the phone is to its owner, the clearer their voice is on that recording. Currently no guidance is given to users about phone placement, leading to inconsistent recording quality.

P556 benchmarking showed that phone positioning directly affects attribution quality. Users placing phones centrally between them (shared table) get worse separation than phones placed on each person's side.

## Intention

Give users placement guidance + an optional mic check that verifies phone placement quality using cross-phone volume comparison. Bonus: captures a voice sample per speaker for future attribution improvements.

## Design Exploration (2026-03-22)

Extensive UX exploration completed — 30 layout variants (ascii-flows) + 50 interaction approaches (innovation agent) + falsification analysis. Key decisions captured below.

### Winning Layout

Inline card on the idle screen (not modal/overlay/drawer). Auto-dismiss after 5s or tap to dismiss. Shows bird's-eye table diagram with phones on each side. Non-blocking — session buttons remain tappable below.

### Winning Interaction: Cross-Phone Sequential Mic Check

**Falsification winner from 50 approaches.** Host-first sequential turn-taking with cross-phone RMS comparison via existing Supabase realtime channel.

**Flow (~15 seconds, fully optional):**

```
Both phones:  "Quick mic check" + placement diagram
              "Each phone works best when it hears you louder than your partner."
              [Start check]  [Skip]

Host phone:   "Say your name"  (live volume bar)
Joiner phone: "🤫 Stay quiet, [host] is speaking"
              → both phones measure RMS, share via realtime

Host phone:   "🤫 Stay quiet"
Joiner phone: "Say your name"  (live volume bar)
              → both phones measure RMS, share via realtime

Result:       ✅ "All set! Your phones can tell you apart."
         or:  ⚠️ "Move phone closer to you" + [Try again] [Continue anyway]
```

**Why this wins:**
- Cross-phone comparison is definitive (ratio, not absolute threshold)
- No voice identification needed — sync ensures only one person speaks at a time
- "Say your name" produces a voice sample for future speaker attribution (P569)
- Host-first ordering eliminates race condition (session already knows who's host)
- Voice activity detection (silence → speech → silence) auto-advances steps — no extra taps
- Realtime channel already exists for session state

**What was killed and why:**
- Passive detection (during conversation): can't distinguish speakers without turns
- Accelerometer/gyroscope: not available in mobile web
- Simultaneous speech: can't isolate who's louder on which phone
- Single-phone-only comparison: no reliable absolute threshold (room noise varies)
- Interactive live dashboard (red→green as you move phone): phone can't distinguish voices in real-time without ML

### Implementation Notes

- `AnalyserNode.getByteTimeDomainData()` → RMS calculation (~10 lines)
- Broadcast RMS via existing realtime channel (~5 lines)
- Compare ratios: `myPhoneRMS / otherPhoneRMS > 2.0` (6dB) = pass
- VAD state machine: `WAITING → SPEAKING → CAPTURED → next`
- UI: 3 screens (ready, speak, result) — simple state machine
- localStorage `cp_placement_guide_dismissed` for one-time show

## Business Requirements

1. **Placement card on idle screen.** Inline card with bird's-eye table diagram showing correct phone placement. Optional, dismissible, one-time (localStorage).
2. **Optional mic check.** Sequential "say your name" flow with cross-phone RMS comparison. Host goes first (sync via realtime). ~15 seconds total.
3. **Pass/fail verdict.** Green (ratio > 2x) or yellow with adjustment advice + retry option. "Continue anyway" always available.
4. **Voice sample capture.** Save "say your name" audio samples tagged to speaker identity for future P569 energy post-validation use.
5. **No blocking.** Everything is skippable. Nothing gates session start.

## Acceptance Criteria

- [ ] Placement card appears once on idle screen at recording start in /live
- [ ] Card is dismissible (tap or auto-dismiss 5s) and remembers dismissal (localStorage)
- [ ] Card includes bird's-eye table diagram (SVG, no external assets)
- [ ] Mobile-first (phone-in-hand experience)
- [ ] Optional mic check: sequential host-first "say your name" flow
- [ ] Cross-phone RMS comparison via Supabase realtime channel
- [ ] Green/yellow result with adjustment advice if placement is poor
- [ ] "Continue anyway" and "Skip" always available
- [ ] Voice samples saved alongside session audio chunks

## Files to Change

- `src/app/components/live-meeting/placement-guide.tsx` — new PlacementGuide component
- `src/hooks/use-audio-level.ts` — new hook wrapping AnalyserNode for real-time RMS
- `src/app/components/partners/live-mode-view.tsx` — show guide on idle screen

## Related

- **P556** — Speaker attribution benchmarking (showed placement matters)
- **P569** — Energy post-validation (voice samples feed into this)
- **P518** — Pre-session readiness check (considered combining; kept separate — P518 is about emotional readiness, P568 about audio quality)

## Done When

- [ ] Users see placement guidance on first /live recording
- [ ] Mic check validates placement via cross-phone comparison
- [ ] Guidance is non-intrusive, optional, and dismissible
