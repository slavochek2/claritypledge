---
name: status
description: Session status — what we did, what we achieved, what's outstanding, what's next. Run after context compaction or any "where are we?" question.
when_to_use: After context compaction, mid-session check-in, or any "what now / what did we do / what's outstanding" message.
---

# /status

Session snapshot — not git history.

> **Principle:** What happened in THIS conversation. Not repo state, not recent commits — what we just did together.

## Usage

```bash
/status    # Session snapshot
```

---

## Output

**From conversation context only — no git commands needed.**

**Format (≤20 lines, no preamble):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done this session:
  ✓ P424: visibility model — full PRD + arch + security (shipped)
  ✓ P425: AI story core loop — PRD + UX complete
  ✓ P427: story edit/delete — quick spec filed
  ✓ Lean agent: added Step 0 (groundwork before advising)
  ✓ KDD: 2 decisions captured, definitions updated

Outstanding:
  → P425: needs /architect (blocked_by P424 ✓ shipped)
  → P419: needs /ux after P425 architect
  → Commit: review p422 diff (777 additions from parallel session)

Next:
  → /architect features/p425_ai_story_core_loop.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Rules:
- **Done:** What was completed or advanced in this session (specs created, decisions made, files updated, features shipped)
- **Outstanding:** What was started but not finished, or what was identified as the next required step
- **Next:** ONE concrete command — the most important thing to do now
- If nothing was done yet: "Session just started — no work done yet"
- If nothing outstanding: "All session goals complete"
- Uncommitted changes worth flagging: mention briefly in Outstanding

---

## When to Use

- After context compaction (agent loses memory of what was happening)
- Mid-session: "where are we?" or "what have we done?"
- End of session: before /kdd, to confirm what to capture
- Any "what now / what's next / what did we accomplish" message

---

## Related

- `/kdd` — Capture learnings and close out the session
- `/pick-flow` — Decide which flow to use for a given feature
