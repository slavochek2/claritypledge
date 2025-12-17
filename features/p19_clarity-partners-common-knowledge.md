# P19: Clarity Partners & Common Knowledge Engine

**Status:** Planning (Manual Validation Phase)
**Priority:** High
**Dependencies:** Understanding Pledge platform (existing)

---

## Problem Statement

**Trust is slow to build, hard to maintain and easy to break because the path to verified mutual understanding has a lot of frictions.**

The causal chain:
```
No verification → Misunderstandings → Conflicts → Broken trust → No closeness
```

**Two user entry points:**

| Entry | What They Say | Emotion |
|-------|---------------|---------|
| **Conflict-driven** | "Why do we always fight over nothing?" | Frustration |
| **Fear-driven** | "How do I know if I can trust them?" | Fear, guardedness |

**The blocker:** No way to turn "I think I understand" into "I KNOW I understand."

**Constraint:** Only works with pre-existing relationships where trust matters. Strangers won't engage in vulnerable loops.

---

## User Personas

**Primary users:** People who want to build or repair trust in relationships that matter

| Persona | Pain | Goal |
|---------|------|------|
| **Romantic Partners** | Fight over misinterpretation, not disagreement | Prevent "I thought you meant X" conflicts |
| **Colleagues/Co-founders** | Talk past each other on decisions | Align through verified understanding |
| **Friends** | Hang out but never go deep | Move from casual to close |
| **Family** | Years of assumptions block connection | Rebuild through mutual understanding |
| **Trust-Anxious** | Want connection but don't know how to verify safely | Low-risk way to test understanding before vulnerability |

---

## Solution: Common Knowledge Engine

**Value Proposition:**

> "Turn 'I think I understand' into 'I KNOW I understand' — and watch trust follow."

**For conflict-driven:** "Stop fighting over misunderstandings. Verify understanding before reacting."

**For fear-driven:** "A safe way to test if someone truly gets you — before you have to trust them."

### How It Works

1. Share something meaningful
2. Partner paraphrases until you confirm 10/10 understanding
3. Only AFTER verification can they respond/react
4. Trust builds because you KNOW they got it

### Why It Works

- Verification creates safety → you know they understood before they react
- Safety enables vulnerability → can share more when understanding is guaranteed
- Prevented conflicts build trust → no more erosion from misunderstandings
- Trust compounds → each 10/10 loop proves the relationship can handle truth
- Closeness follows → trust → safety → vulnerability → intimacy

---

## MVP Features

### 1. Clarity Partner Invites
- Send link: "Be my clarity partner"
- Mutual partnership (both can initiate)
- Partner list on profile

### 2. Paraphrase Loop (Core)

**Round 1:**
- Partner paraphrases: "Here's what I heard..."
- Confidence estimate: 0-100
- You rate accuracy: 0-100
- You provide correction if needed

**Round 2+:**
- Partner paraphrases correction
- Loop until BOTH at 10/10

**UI:**
- Progress bar: "Understanding: 4/10 → 7/10 → 10/10"
- Round counter
- "Common Knowledge Reached ✓" when complete

### 3. Agreement/Disagreement (Gated)
- Unlocks ONLY after 10/10
- Options: Agree / Disagree / Neutral
- Can't react without verified understanding

### 4. Common Knowledge Artifacts
- Full paraphrase history
- Confidence + accuracy per round
- Private by default

### 5. Calibration Score (Optional)
- Tracks: your confidence vs. actual accuracy
- Lower gap = better calibration
- Profile badge

---

## Database Schema

```sql
CREATE TABLE clarity_partnerships (
  id UUID PRIMARY KEY,
  user_1_id UUID REFERENCES profiles(id),
  user_2_id UUID REFERENCES profiles(id),
  status TEXT CHECK (status IN ('pending', 'active', 'inactive')),
  created_at TIMESTAMP,
  UNIQUE(user_1_id, user_2_id)
);

CREATE TABLE paraphrase_loops (
  id UUID PRIMARY KEY,
  initiator_id UUID REFERENCES profiles(id),
  partner_id UUID REFERENCES profiles(id),
  topic TEXT,
  current_round INT DEFAULT 1,
  understanding_level INT,
  status TEXT CHECK (status IN ('in_progress', 'reached_10')),
  created_at TIMESTAMP
);

CREATE TABLE paraphrase_rounds (
  id UUID PRIMARY KEY,
  loop_id UUID REFERENCES paraphrase_loops(id),
  round_number INT,
  original_text TEXT,
  paraphrase_text TEXT,
  confidence_estimate INT,
  accuracy_rating INT,
  correction_text TEXT,
  created_at TIMESTAMP
);

CREATE TABLE common_knowledge_artifacts (
  id UUID PRIMARY KEY,
  loop_id UUID REFERENCES paraphrase_loops(id),
  final_paraphrase TEXT,
  rounds_json JSONB,
  position TEXT CHECK (position IN ('agree', 'disagree', 'neutral')),
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);
```

---

## User Flows

### Flow 1: First Partnership
1. Send invite link
2. Partner accepts
3. Both listed as clarity partners

### Flow 2: Understanding Practice
1. Start session with partner
2. Share meaningful topic
3. Partner paraphrases (confidence: ~60%)
4. Rate accuracy (7/10), provide correction
5. Partner paraphrases again (confidence: ~80%)
6. Rate again (9/10), clarify nuance
7. Partner demonstrates full understanding
8. Confirm 10/10 → "Common Knowledge Reached"
9. Now can discuss/react from shared foundation

### Flow 3: Network Effect
1. Partner experiences being deeply understood
2. End screen: "Want this for yourself?"
3. Partner signs pledge, invites their own people

---

## Success Metrics

**Primary:**
1. Do users feel closer after sessions? (survey)
2. Do pairs repeat? (retention)
3. Do participants try with other people? (growth)
4. % of loops reaching 10/10 (completion)

**Secondary:**
- Which relationship types see most value?
- Vulnerable topics vs. intellectual only?
- Calibration improvement over time?

---

## Validation Plan

**Before building:** Manual user testing

1. Invite friend to 30min understanding practice
2. Run full 10/10 loop on meaningful topic
3. Measure: rounds, time, closeness increase, desire to repeat
4. Both write reflections after

**Decision criteria:**
- ✅ Both feel closer + want to repeat → BUILD
- ⚠️ Valuable but exhausting → Simplify, iterate
- ❌ No emotional impact → Try different topic/participant
- ❌ Participant declines → Test different relationship type

**After validation:** Test across relationship types (partner, colleague, family)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Loops feel tedious | Start with 1-2 rounds, not strict 10/10 |
| Only works for intellectual topics | Test vulnerable topics after intellectual |
| Awkward to invite friends | Test invitation wording, make casual |
| Tool not needed (manual works) | Build only if manual validates value; tool reduces friction |

---

## Open Questions

1. Is 10/10 too strict? Should 8/10 be acceptable?
2. How to handle abandoned loops?
3. Public vs. private by default?

---

## Next Actions

- [ ] Recruit test participant (friend)
- [ ] Schedule 30min session
- [ ] Execute full 10/10 loop
- [ ] Document results
- [ ] Decide: build or iterate
