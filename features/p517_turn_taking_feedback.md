---
status: today
type: story
rank: 0.125
tags:
  - live
  - ux
  - feedback
  - turn-taking
locked_at: '2026-03-15T14:22:52.432Z'
created_date: 2026-03-14
---

# P517: Turn-Taking, Listener Guidance, and Real-Time Feedback

## Why This Is Urgent

**Session-killing UX failures observed in facilitated sessions (March 2026):**

1. **Accidental mode switches on mobile:** Users with long nails miss intended buttons and accidentally hit "speak freely" instead. No visual feedback on which mode they're in afterward. Session flow breaks.
2. **Position removal with no feedback:** Clicking an already-taken position silently removes it. Users don't realize they've un-positioned. Facilitator has to verbally recover.
3. **Agreement vs understanding confusion:** Participant requested a slider showing "how much I agree" — but agreement ≠ understanding. Without clear separation, users conflate "I agree" with "I understood," which is the core anti-pattern ClarityPledge exists to fix.
4. **No visible turn state:** In facilitated sessions, Slava verbally manages turns. In self-serve or event contexts, there's no turn indicator — both people talk/type simultaneously and the protocol collapses.

**Pre-event blocker:** Without these fixes, the next workshop/event will have the same UX friction that confused Participant C (therapist/channel partner). Polished /live is prerequisite for credible events and coach demos.

## Problem

During live sessions, it's not clear:
- Who is currently speaking (no explicit "token" indicator)
- What the listener should do (explain back? ask a question?)
- How much each person agrees/understands in real-time
- Whether an action (position taken, mode changed) actually registered

## Scope (Single Feature)

This combines related session UX observations into one feature:
1. **Speaker token** — visual indicator of who holds the floor
2. **Listener guidance** — exactly two choices: "Explain back what I heard" OR "Ask a clarifying question." No third option. Visible token shows who speaks next.
3. **Real-time feedback sliders** — separate sliders for agreement and understanding (NOT combined). Agreement slider is informational; understanding score is the calibration metric.
4. **Action feedback** — visual confirmation when position is taken/removed, mode is switched, or any state change occurs. No silent state changes.

<!-- NOTE: Explain-back prompting (app prompts user to paraphrase) is a future enhancement for the slider version. Not part of MVP. -->

## User Stories

- As a listener, I want exactly two clear options (explain back OR ask question), so I'm not confused about my role
- As a speaker, I want to see who has the floor, so turn-taking is unambiguous
- As both participants, I want to signal agreement and understanding separately, so the app doesn't conflate "I agree" with "I understood"
- As a participant on mobile, I want visible confirmation when I take/remove a position, so I know my action registered
- As a facilitator running an event, I want polished /live UX so the tool looks credible to potential channel partners

## Related

- **P518** (Session Bookends) — P517 fixes the in-session UX; P518 wraps it with pre/post framing
- **P549** (1-to-many /live for events) — P517 polishes the dyadic flow; P549 extends it to groups
- **H-TopicDepthGate** — better UX reduces the % of sessions that fail for non-topic reasons
- **Process learning:** "Mobile UX bugs are session-killers" (process-learnings.md)

## Status

Pre-event priority. Needs `/ux` design before implementation.
