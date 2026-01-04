# P32: Ideas in /live (Level 1 Foundation)

## Problem

Users in `/live` ask **"why must I do this?"** — the explain-back ritual feels pointless without stakes.

Currently, two people enter a session and verify understanding on... nothing specific. There's no anchor. The conversation floats.

**The insight:** Verification matters when there's an **idea** where agreement or disagreement has consequences.

## Solution

Add **ideas** to `/live` sessions:

1. Leader can seed ideas (text, or voice → transcribed)
2. Both parties mark positions: **agree / disagree / don't know**
3. Select an idea → enter verification flow
4. Certification recorded **per idea**

Now "why must I do this?" has an answer: *"We're checking if you understand THIS idea, which you disagree with."*

## User Flow

```
1. Leader creates session
   └── Optionally pre-seeds ideas

2. Partner joins

3. Session view shows:
   ┌─────────────────────────────────────────┐
   │  IDEAS                                  │
   ├─────────────────────────────────────────┤
   │  ▢ "The pledge means slowing down       │
   │     even when uncomfortable"            │
   │     You: [Agree] [Disagree] [?]         │
   │     Partner: Disagree                   │
   │     Status: Not verified                │
   ├─────────────────────────────────────────┤
   │  ▢ "AI should assist, not replace"      │
   │     You: Agree                          │
   │     Partner: [?]                        │
   │     Status: Not verified                │
   ├─────────────────────────────────────────┤
   │  [+ Add idea]                           │
   └─────────────────────────────────────────┘

4. Either party taps idea → "Verify understanding"
   └── Enters existing /live verification flow

5. After verification completes:
   └── Certification recorded against that idea
   └── Status updates to "Verified ✓"
```

## Why This Matters

From [Theory of Change - Section 6.1](../docs/visions/v0_theory-of-change.md#61-the-facilitation-ladder):

> **The Core Insight:** Users in /live ask "why must I do this?" — the ritual feels pointless without **stakes**. The answer: verification matters when there's an **idea** where agreement/disagreement has consequences.

This is **Level 1** of the Facilitation Ladder — the foundation for all group features.

## Scope

### In Scope (Priority 1)

- [ ] Leader can create ideas (text input)
- [ ] Ideas displayed in session view
- [ ] Both parties can mark position: agree / disagree / ?
- [ ] Positions visible to both parties
- [ ] Select idea → enter /live verification flow
- [ ] Certification recorded per idea
- [ ] Verification status shown per idea

### In Scope (Priority 2 - Mutual Seeding)

- [ ] Non-leader can also add ideas
- [ ] Ideas show who created them
- [ ] Both directions can be verified (mutual understanding)

### Out of Scope (Future)

- Voice-to-text idea creation (nice-to-have)
- AI refinement of ideas (future)
- Idea statistics/analytics (Level 4)
- Group/multi-person sessions (Level 2-3)
- Topology visualization (Level 4)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Who creates ideas? | Leader first, then mutual | Keeps MVP simple, validates core loop |
| Position options | Agree / Disagree / Don't Know | Matches meme platform vision, surfaces real disagreements |
| Verification flow | Reuse existing /live | Don't rebuild what works |
| Certification storage | Per idea, not per session | Enables future topology ("who understands whom on WHAT") |

## Data Model (Sketch)

```typescript
interface Idea {
  id: string;
  sessionCode: string;
  text: string;
  createdBy: string;        // odId of creator
  createdAt: string;
  positions: {
    [odId: string]: 'agree' | 'disagree' | 'unknown';
  };
  verifications: {
    speakerId: string;
    listenerId: string;
    certifiedAt: string;
    // Could link to existing certification data
  }[];
}
```

## Success Criteria

- [ ] Users no longer ask "why must I do this?"
- [ ] Sessions have at least 1 idea before verification starts
- [ ] Positions are marked before verification (surfaces disagreement)
- [ ] Certifications are queryable by idea (for future topology)

## Related

- [Theory of Change - Facilitation Ladder](../docs/visions/v0_theory-of-change.md#61-the-facilitation-ladder)
- [Meme Platform Vision](../docs/visions/v1_vision-meme-platform.md) — long-term ideas architecture
- [P28.1 Audio Data Capture](./p28_1_audio_data_capture.md) — parallel work on recording

## Open Questions

1. **Idea text length limit?** — Probably yes, force conciseness
2. **Can positions change after marking?** — Probably yes, understanding evolves
3. **What happens if no ideas exist?** — Prompt to create one before verification?
4. **Pre-set ideas vs. always create?** — Leader could have template ideas (like pledge content)

---

## For PM

**Context:** Read [Theory of Change Section 6.1](../docs/visions/v0_theory-of-change.md#61-the-facilitation-ladder) for full strategic context.

**What to do:** Break this into stories with acceptance criteria. Suggested story breakdown:

1. **Idea Creation** — Leader can add idea text to session
2. **Idea List Display** — Both parties see ideas in session
3. **Position Marking** — Mark agree/disagree/? on each idea
4. **Verify on Idea** — Select idea → enter verification flow
5. **Certification per Idea** — Record certification against specific idea
6. **Mutual Seeding** — Non-leader can add ideas (Priority 2)

**Key constraint:** Reuse existing /live verification flow. Don't rebuild it.
