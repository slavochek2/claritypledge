---
status: backlog
type: story
rank: 9
tags:
  - live
  - onboarding
  - psychological-safety
  - wtp
created_date: 2026-03-14T00:00:00.000Z
---

# P518: Emotional Safety Self-Assessment — Pre-Session Readiness Check

**Reframed 2026-03-22:** Stripped qualifying question (done manually by facilitator post-session) and topic depth nudge (solved by false-belief curriculum P567). What remains: emotional readiness self-assessment as product infrastructure.

## Problem

Paraphrasing requires emotional regulation — the listener must hold their own reactions while accurately restating the speaker's position. Without awareness of their current emotional state, participants enter sessions unable to do the core protocol work. Without shared visibility into each other's readiness, neither the facilitator nor the partner can calibrate expectations.

This is a prerequisite for the verification protocol, not a nice-to-have.

## Concept

Wrap the structured /live session with two lightweight moments:

**Before /live** — Goal alignment + topic depth nudge (both optional, 60-90 seconds total)
**After /live** — One qualifying question (optional, 15 seconds)

These bookends don't change the /live protocol itself. They frame it and measure whether it landed.

## Pre-Session: Goal Alignment + Topic Depth

### Goal Alignment (original P518 scope)

Each participant states what they want from this session. Options:

- "Understand my partner's perspective on something specific"
- "Test whether we actually agree (or just think we do)"
- "Practice explaining my thinking clearly"
- "Explore a decision we need to make together"
- Free text

Both see each other's goals before starting. If goals conflict, that's surfaced — not hidden.

### Topic Depth Nudge

After goals, before /live starts, the pair picks (or the facilitator suggests) the topic. The UI presents the **topic depth ladder** as a gentle nudge:

| Level | Label | Example | Signal |
|-------|-------|---------|--------|
| 1 | Facts | "What happened in our last sprint?" | Low — will produce surface paraphrase |
| 2 | Opinions | "What's our biggest risk right now?" | Medium — may surface disagreement |
| 3 | Values | "What matters more — speed or quality? What does your partner think you'd say?" | High — targets false agreement |
| 4 | Fears / Identity | "What are you most afraid of in this partnership?" | Highest — requires vulnerability |

**Default nudge:** Level 3. The UI says something like: "Sessions on values and beliefs reveal the biggest gaps. Want to go deeper?"

Both are optional. If skipped, the session starts normally. The selection is recorded for correlation with post-session signal.

### UX Notes

- This is NOT a gate — pairs can skip straight to /live
- For event demos with facilitator: facilitator selects depth level, not participants
- For self-serve: the nudge is more important (no facilitator to steer)
- Keep it under 90 seconds — preboarding that feels like a form kills momentum

## Post-Session: Qualifying Question

Immediately after the /live session ends (after final scores), one question appears. **One question, not a survey.**

### Candidate Questions

| # | Question | What it measures | Pro | Con |
|---|----------|-----------------|-----|-----|
| A | "How meaningful was this conversation?" (1-5) | Subjective value | Simple, fast | Social desirability bias |
| B | "Did this conversation reveal something you didn't know?" (Yes / No / Not sure) | Discovery signal | Binary = no gaming. "Not sure" is honest. | Doesn't measure pain, only novelty |
| C | "How much could a misunderstanding like this cost you?" (Nothing / Minor friction / A real decision / A lot) | Pain / stakes proxy | Directly tests H-WTP-Pain | Feels transactional |
| D | "Would you want to verify understanding on this topic again?" (Yes / No) | Return intent | Measures pull | People say "yes" to be polite |
| E | Combo: B then C | Discovery + stakes | Best signal coverage | Two questions = feels like survey |

**Recommendation:** Option B as primary. Binary, fast, honest. If "Yes" → follow up with C in-app (not blocking). Gives discovery signal immediately and pain signal for those who found something.

### UX Notes

- Appears once, after session, dismissable
- "Skip" is always visible
- Both participants answer independently
- If both skip → session tagged "unqualified" in data

## Data Model (Sketch)

```
session_preboarding:
  session_id, user_id, goal_text, goal_preset, topic_depth_level, created_at

session_qualifying:
  session_id, user_id, discovered_new (bool/null), cost_estimate (enum/null), created_at
```

## Relationship to Hypotheses

**H-WTP-Pain:** The qualifying question is the measurement instrument. If pairs consistently answer "discovered something new" but "nothing at stake" → gap is entertainment, not painkiller.

**H-TopicDepthGate:** Depth ladder + post-session signal lets us correlate: do Level 3-4 topics produce more "discovered something new" responses than Level 1-2?

## User Stories

### Pre-session
- As a participant, I want to know what my partner expects from this session, so we start aligned
- As a participant, I want guidance on picking a meaningful topic, so the session reveals something real
- As a facilitator, I want to see what depth level the pair chose, so I can steer toward depth if needed

### Post-session
- As a participant, I want a quick way to note whether this session was meaningful, without a survey
- As the product team, I want signal on whether sessions produce discovery and felt stakes, so I can validate H-WTP-Pain
- As the product team, I want to correlate topic depth with session value, to improve topic selection guidance

## Open Questions

1. **Qualifying question timing:** Before or after they see the gap score? Leaning: after — the gap reveal IS the moment that creates the reaction we want to measure.
2. **Onboarding (Points 1-2) — separate spec.** Users need the agree/understand distinction before /live works. That's onboarding, not preboarding. See P547 for post-session education.
3. **Facilitator vs. self-serve UX.** In facilitated sessions, facilitator controls topic depth verbally. In self-serve, the nudge is the only steering mechanism. Build one flow or two?
4. **Event context.** For event-based sessions where the event already sets the topic — skip topic depth selection? Probably yes, but qualifying question still applies.

## Related

- **P547** (AI Post-Session Coach) — async education email after session, complements the in-app qualifying question
- **P546** (Transcription Quality) — better transcripts enable P547's confusion detection
- **H-WTP-Pain** — this spec is the primary measurement instrument

## Status

Revised 2026-03-18 from "Preboarding Goal Alignment" to "Session Bookends" based on transcript corpus analysis. Expanded scope: pre+post.
