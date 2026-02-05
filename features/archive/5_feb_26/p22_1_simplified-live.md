# P22.1: Simplified Live Protocol

> **Note:** This conceptual doc has evolved into [P22_2: Live Referee Mode](./p22_2_live-referee-mode.md) which contains the implementation-ready spec. See P22_2 for current design decisions and MVP scope.

**Status:** Superseded by P22_2
**Priority:** High
**Builds on:** P22 (Unified Ideas Architecture)
**Date:** 2025-12-23

---

## Summary

Radically simplify the Clarity Conversation experience for **live, in-person meetings**. The phone becomes a quiet protocol enforcer, not a chat interface. Two people talk naturally while the app captures, structures, and documents their journey to mutual understanding.

---

## Core Promise (Unchanged)

> **A pledger helps a non-pledger experience what it feels like to be truly understood.**

This feature must serve this promise. Everything else is secondary.

---

## The Insight

### What the App Is NOT

| Old Mental Model | Problem |
|------------------|---------|
| Chat tool | Requires typing, reading, tapping - breaks presence |
| Real-time messaging | Competes with eye contact and natural conversation |
| Something to stare at | Distracts from the human moment |

### What the App IS

| New Mental Model | Benefit |
|------------------|---------|
| Protocol enforcer | Structure forces behaviors humans naturally avoid |
| Quiet witness/referee | Captures without demanding attention |
| Before/During/After phases | Minimal interaction during live conversation |

---

## The Protocol

### The Rules

1. **No speaking without selecting role first**
2. **Two roles:** Speaker (sharing idea) or Listener (paraphrasing)
3. **Listener rates:** "I think I understand X/10"
4. **Speaker rates:** "You understood me X/10"
5. **If mismatch:** Keep paraphrasing until 10/10
6. **If speaker flags "that's not a paraphrase, that's a new idea":** Branch decision
   - **Stay:** Finish current idea to 10/10 first
   - **Branch:** Park current, explore new idea, return later

### Why This Works

Without structure:
- People dodge hard paraphrases
- Assume understanding without checking
- Move on when it gets uncomfortable

With structure:
- Must sit in discomfort until actual understanding emerges
- Calibration is quantified, not assumed
- Deviations are captured and categorized

---

## Conversation Flow

### BEFORE (Optional - Async)

```
Ideas can be pre-submitted (preparation)
OR submitted live via speaking (zero friction)
```

**Key decision:** Non-pledger doesn't NEED to prepare. They can just show up and talk. When they speak in "Speaker" role, that's submitting an idea.

This preserves low friction entry for non-pledgers.

### DURING (Live - Minimal UI)

```
┌────────────────────────────────┐
│  Recording                     │
│                                │
│  Your role:                    │
│  [Speaking]      [Listening]   │
│                                │
│  Current idea: (auto-captured) │
│  Status: Paraphrasing (Try 2)  │
│                                │
│  [That's a new idea]  [Flag]   │
│                                │
│  Understanding: [___/10]       │
│                                │
│  Progress: 2/5 ideas at 10/10  │
└────────────────────────────────┘
```

**Interactions during live conversation:**
- Tap role before speaking (Speaker/Listening)
- Rate understanding (simple slider or buttons)
- Flag "that's a new idea" when listener branches
- Branch/Stay decision when flagged

**Everything else happens via voice** - captured by transcription.

### AFTER (Async)

```
├── Transcript auto-structured into idea graph
├── Each idea shows paraphrasing attempts + ratings
├── Calibration scores visible (predicted vs actual)
├── Branches visualized as tree/graph
├── "Common knowledge" = ideas at 10/10
├── "Gaps" = ideas that didn't reach 10/10
└── Can continue async or schedule follow-up
```

---

## Value Stack

| Output | Type | Value |
|--------|------|-------|
| Experience | Emotional | Non-pledger *felt* truly understood |
| Calibration scores | Quantitative | "We went from 3/10 to 9/10 aligned" |
| Documented trail | Historical | What was said, how understanding evolved |
| Common knowledge | Outcome | Ideas both parties *confirmed* they share |
| Documented gaps | Outcome | Where understanding never reached 10/10 |

---

## How P22 Concepts Map

| P22 Concept | How It Maps to Live |
|-------------|---------------------|
| Ideas as orphan entities | Ideas submitted live via "Speaking" role |
| Elevation from chat | Every "Speaking" turn = idea captured |
| Verification unlocks votes | 10/10 understanding = verified |
| Graph/tree of ideas | Branches when speaker flags new idea |
| Stats on people | Calibration accuracy tracked per person |

**P22 isn't replaced - it's the data backbone. This feature is the live UI layer.**

---

## Open Gaps (Need Resolution)

### Gap 1: The Uncomfortable Moment (CRITICAL)

**Problem:** When paraphrasing is hard and someone wants to bail, what happens?

This is where value is created. The structure must protect this moment.

**Ideas to explore:**
- [ ] Speaker can flag deviation types (new idea, judgment, avoidance)
- [ ] App prompts "Understanding still at X/10 - continue?"
- [ ] Gentle audio cue when role hasn't been selected
- [ ] Post-conversation reflection on abandoned branches
- [ ] (More ideas needed - brainstorm session)

### Gap 2: Technical - Transcription

**Options:**
| Approach | Pros | Cons |
|----------|------|------|
| Live transcription | Immediate feedback | Accuracy issues, complex, latency |
| Post-conversation | Simpler, more accurate | No live structure |
| Hybrid | Best of both? | Complexity |

**Recommendation:** Start with post-conversation transcription. Live UI tracks roles/ratings only. Transcript mapped to structure after.

### Gap 3: Role Selection Enforcement

How strictly to enforce "select role before speaking"?
- Hard enforcement (can't proceed)?
- Soft nudge (reminder)?
- Honor system (just recommended)?

### Gap 4: Branching UX

When listener introduces new idea:
- How is "new idea" different from "bad paraphrase"?
- Who decides - speaker or listener?
- How to visualize branches during conversation?

### Gap 5: Two-Phone vs One-Phone

**Scenario:** Same room, but do both people have app open?

| Setup | Pros | Cons |
|-------|------|------|
| One phone | Simpler, less distraction | One person manages everything |
| Two phones | Each rates independently | More tapping, coordination needed |

---

## Relationship to Current UI

### What Changes

| Current | New |
|---------|-----|
| Chat bubbles with text | Minimal live UI, transcript after |
| Type messages | Speak naturally |
| Tap many buttons | Tap role + rating only |
| Sequential flow enforced by UI | Sequential flow enforced by protocol |

### What Stays

- P22 unified ideas as data model
- Verification concept (10/10 understanding)
- Calibration scoring
- Pledger/non-pledger dynamic

---

## Success Criteria (Before Implementation)

- [ ] Core concept survives stress-testing by critical thinker
- [ ] Open gaps have proposed solutions
- [ ] Alternative approaches considered and rejected with reasons
- [ ] Non-pledger can understand value prop in 30 seconds
- [ ] MVP scope defined (what's in, what's out)
- [ ] Technical feasibility confirmed (especially transcription)

---

## Next Steps

1. **Stress-test concept** - Consult Innovation Strategist or Creative Problem Solver
2. **Brainstorm "uncomfortable moment"** - Generate 10+ ideas, evaluate rigorously
3. **Resolve technical gaps** - Especially transcription approach
4. **Define MVP scope** - Minimal testable version
5. **Prototype** - Paper or single-screen mockup
6. **Test with real humans** - Before full implementation

---

## Design Thinking Session Log

**Date:** 2025-12-23
**Participants:** Slava, Maya (Design Thinking Coach)

### Key Insights from Session

1. **Sync vs Async tension** - User research points to live meetings as where real understanding happens, but current UI optimized for async chat

2. **Protocol enforcer reframe** - The app isn't a chat tool, it's a structure that forces behaviors humans naturally avoid

3. **Non-linear is natural** - Real conversations branch; P22 unified ideas supports this

4. **Friction concern** - If non-pledger must prepare, that's friction. Solution: ideas submitted live via speaking

5. **Core promise check** - Validated that concept still serves "pledger helps non-pledger experience clarity"

### Evolution of Thinking

```
Start: "Should we do UX polish or P22 first?"
    ↓
Insight: Live meetings are key, but UI is async
    ↓
Reframe: App = protocol enforcer, not chat tool
    ↓
Clarify: Before/During/After phases
    ↓
Resolve: Ideas submitted live (no prep friction)
    ↓
Current: Documented concept, ready for stress-test
```

---

## Related Documents

- [P22: Unified Ideas Architecture](./p22_unified-ideas.md) - Data model backbone
- [Design Thinking Session](../docs/bmad/design-thinking-2025-12-21.md) - Previous session notes
