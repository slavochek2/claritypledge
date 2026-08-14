---
status: backlog
type: story
rank: 20
tags:
  - ai-coach
  - post-session
  - onboarding
supersedes: p41
created_date: 2026-03-18T00:00:00.000Z
---
# P547: AI Post-Session Coach — Transcript-Based Education Trigger

**Supersedes:** P41 (AI Coaching Teaser — original was a landing page, this is the actual coaching mechanism)
**Created:** 2026-03-18 based on transcript corpus analysis of 28 sessions

## Problem

Transcript analysis revealed that users consistently hit the same confusion patterns that a facilitator catches but the app doesn't:

- **Agree/understand conflation (~60%)** — users can't distinguish "do you agree?" from "do you understand?" (Jb: "Is it about clarity or agreement?")
- **Surface paraphrase (~60%)** — repeating words instead of interpreting meaning (Slava to Jb: "You just repeat it. You didn't add any information.")
- **Premature agreement / "False 10" (~30%)** — social pressure to rate high (Blanka: "Can we just put 10?")
- **Role confusion (~70% of first-timers)** — who speaks, who listens, what the buttons do

Currently: only a live facilitator (Slava) catches these. Without facilitation, pairs produce shallow sessions with contaminated data.

## Concept

After a /live session ends and transcription completes, an AI coach analyzes the transcript for confusion patterns and sends a **personalized education email** walking the user through the relevant ClarityPledge points.

### Flow

```
Session ends → Transcription completes (async, ~2-10 min)
    → AI analyzes transcript for confusion signals
    → If confusion detected:
        → Generate personalized email referencing their specific session
        → Send via ops@claritypledge.com or magic link email
        → Email walks through relevant points with examples from THEIR session
    → If no confusion detected:
        → Send lighter "your session summary" email (optional)
```

### Confusion Detection Signals

| Signal | Detection Method | Points to Teach |
|--------|-----------------|-----------------|
| Agree/understand conflation | Rating given when listener says "I agree" / "I disagree" instead of explaining back | Point 1 (understanding ≠ agreement), Point 2 (calibration) |
| Surface paraphrase | High text similarity between speaker's words and listener's explain-back (cosine sim > 0.8) | Point 3 (explain-back = interpretation, not repetition) |
| Premature 10 | Score of 10 given within first 30s of round, or without substantive explain-back | Point 3, Point 4 (PTS protocol) |
| Role confusion | Multiple "who goes first?" exchanges, overlapping speaker/listener actions | Point 4 (protocol structure) |
| Topic inadequacy | Session < 3 min, only 1 round, no gap > 2 points | Suggest Level 3 topics for next time |

### Email Content Structure

```
Subject: What your clarity session revealed (and how to go deeper next time)

Hi {name},

Your session with {partner} surfaced a gap of {gap} points —
{you thought you understood at X, but {partner} rated it Y}.

One thing I noticed: {specific confusion pattern detected}.

Here's what that means and how to improve next time:
{relevant point explanation, personalized to their transcript}

→ [Read the full guide: 8 points for calibrated understanding]
→ [Start another session with {partner}]
```

### The 8 Points as Education Curriculum

Users don't need all 8 upfront. The AI coach walks them through the **relevant** ones based on what went wrong:

- **Light confusion (1-2 signals):** Email covers 1-2 specific points with session examples
- **Heavy confusion (3+ signals):** Email links to full guided walkthrough of all 8 points
- **No confusion:** Summary email with their gap data + "want to go deeper?" prompt

## Relationship to Other Specs

- **P518 (Session Bookends)** — pre/post session UX within the app. P547 is the **asynchronous** education layer sent after.
- **P546 (Transcription Quality)** — P547 depends on good transcripts. Diarization fixes must ship first or simultaneously.
- **P495 (Live Session Transcription)** — P547 consumes the transcript P495 produces.

## Dependencies

- Transcription pipeline producing readable transcripts (P546 quality improvements)
- Email sending infrastructure (ops@claritypledge.com SMTP already working)
- LLM access for confusion detection + email generation (Gemini via existing edge function pattern)

## Open Questions

1. **Trigger timing:** Email sent immediately after transcription, or wait 24h? Immediate = fresh memory. Delayed = less intrusive.
2. **Both participants or just the one who struggled?** If one person surface-paraphrased and the other didn't, send different emails?
3. **Opt-in or opt-out?** Currently no email consent beyond session participation. May need a checkbox.
4. **LLM for detection vs. rules-based?** Surface paraphrase detection could be cosine similarity (no LLM needed). Agree/understand conflation needs semantic analysis (LLM). Start rules-based, add LLM for nuance?

## Done When

- [ ] Confusion detection runs on new transcripts automatically
- [ ] At least 1 email template works (agree/understand conflation — most common signal)
- [ ] Email sent to 3 real session participants, manually verified for quality
- [ ] Confusion signals logged per-session for analysis
