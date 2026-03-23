---
status: week
type: story
rank: 1
tags:
  - epic-story-first
  - letters
  - comprehension
  - async
  - screening
  - workshop
  - briefing
created_date: 2026-03-23T00:00:00.000Z
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P581: Letters with Comprehension Assessment

**Epic:** story-first (P523 vision)
**Supersedes:** P561 (comprehension slider on story cards), P575 (letter/story delivery)
**Depends on:** P560 (story filing without position — shipped)
**Tests:** H-StoryFirst (async gap revelations), H-WTP-Pain (gap → felt cost), H-Stories-ColdStart (filed content as return trigger)

---

## Problem Statement

**Current state:** Comprehension can only be assessed inside /live sessions — a rigid 3-click protocol that requires Slava to facilitate. Stories and points exist as cards in a feed, but there's no way to *send* them to someone as a deliberate act and collect understanding data back. A workshop participant, co-founder partner, or Person B in the briefing protocol has no curated entry point — they land on a feed, not a letter addressed to them.

**Pain points:**
1. **Gap revelations require Slava present.** The product can't deliver the "holy shit" moment (discovering you're miscalibrated about your own understanding) without a facilitator running /live. This doesn't scale past Slava's personal capacity.
2. **No async understanding measurement.** The listener's confidence guess and the speaker's belief — the two numbers that produce the gap — only exist inside /live. There's no way to collect them asynchronously from stories.
3. **Stories are ambient, not addressed.** Content exists but there's no intentional delivery. The gap between "content exists" and "someone receives it with intention" is unserved. Without a delivery container, stories are ambient content, not pre-work for a live session.
4. **/live sessions start cold.** Without pre-work, sessions default to whatever's top-of-mind. No triage of "where is the gap biggest?" means /live time is spent discovering what to talk about, not going deep on known gaps.
5. **Workshops lack an async component.** False-belief workshops (P567) surface intellectual surprise in the room, but there's no structured follow-up where participants privately connect the broken belief to their specific relationship cost. The group can surface the belief; only a private instrument can surface the pain.

**Who's affected:**
- **Facilitator (Slava):** Can't scale sessions. Every gap reveal requires his presence. Needs an instrument that works without him.
- **Workshop participants (5-15 people):** Experience intellectual surprise in group, but leave without private pain connection. Need async follow-up that triggers personal reflection.
- **Co-founder pairs with Clarity Partner Agreements:** Need structured pre-work between recurring /live sessions. Currently have "what should we talk about?" problem.
- **Person B in briefing protocol:** Receives no curated entry point. Lands on feed, not a letter from their partner.

---

## Intention (Why This Matters)

**Strategic importance:** This is the mechanism that could make the product independently valuable — delivering gap revelations without Slava present. The letter is the async instrument: it collects the two numbers (listener confidence + author prediction) that produce the gap, in a ritual context that creates the private moment needed for personal pain connection. If this works, it scales the facilitated experience into the product itself. This is the path from "Slava is the MCP" to "the product is the MCP."

**Why now:** Three signals converge:
1. H-WTP-Pain is approaching kill threshold (28 sessions, zero pairs named a cost). The false-belief workshop (P567) is the active testing mechanism, and step 4 of the workshop flow explicitly requires "verify understanding via comprehension slider" — which doesn't exist yet.
2. First Clarity Partner Agreement signed (Jan + Nejc, Mar 22). They need structured pre-work between sessions. Without it, the agreement is aspirational — no instrument to practice with.
3. Story filing (P560) just shipped. Stories exist. Points exist. The content is there. What's missing is the delivery container + measurement instrument.

**Impact if not solved:** ClarityPledge remains a facilitator-dependent service with zero standalone product value. Workshops produce intellectual surprise but no follow-up instrument. Partner agreements have no async practice tool. The product can't test H-StoryFirst (async gap revelations) because the measurement mechanism doesn't exist. H-WTP-Pain testing stalls because the workshop flow's step 4 has no implementation.

---

## Business Requirements

**Must-haves:**

1. **Letter as container.** A person (facilitator, partner A) can select one or more existing stories and package them into a letter addressed to a specific person. The letter is a deliberately curated collection — not a share link, not a feed filter.

2. **Author prediction per story.** When composing a letter, the sender predicts (0-10) how well the receiver will understand each included story. This prediction is hidden from the receiver until they rate themselves. The prediction is the speaker's half of the gap equation.

3. **Ritual reading experience.** The receiver opens a letter and reads stories one at a time in a full-screen, deliberate-pacing experience. Not a list to scroll through — a sequence to progress through. Each story requires engagement before the next appears.

4. **Understanding rating (mandatory, 0-10).** For each story in the letter, the receiver must rate their understanding: "How confident am I that I understand what [Author] means by this?" This is the listener's half of the gap equation. Rating is mandatory — the receiver cannot proceed to the next story without rating.

5. **Gap reveal per story.** After the receiver rates, the author's prediction is revealed alongside the receiver's self-rating. Gap = |prediction - self-rating|. This is the async equivalent of the gap reveal in /live.

6. **Points appear after story rating.** After rating understanding on a story, any points extracted from that story appear sequentially. The receiver can optionally take positions on points (-3 to +3, disagree to agree). Position is always optional. Understanding rating is the gate; position is the reward.

7. **Gap map (post-letter summary).** After the receiver finishes all stories in the letter, a summary view shows all gaps at a glance: which stories have big gaps (worth checking in /live), which are aligned (skip in /live). This gap map IS the triage for the next /live session.

8. **Works for both contexts equally.** Letter mechanics must serve (a) facilitator → workshop participants (1-to-many, curated false-belief content) and (b) partner A → partner B (1-to-1, personal stories between recurring sessions). Same instrument, different content.

9. **Letter is triage, not verification.** Both parties guessing high does NOT confirm understanding — it means /live might not be needed. A large gap means it probably is. Frame as screening, never as proof.

**Success conditions:**
- A facilitator can send a letter to a workshop participant and receive understanding data back without being present
- A co-founder can send stories to their partner and see where the gaps are before their next /live session
- Gap data from letters correlates with where /live sessions actually get stuck (validates screening value)
- At least one participant connects a gap revealed via letter to a specific personal cost (H-WTP-Pain test)

**Constraints:**
- Must not break existing story/point/position functionality
- Must work on mobile (workshop participants on phones)
- Receiver must have a ClarityPledge account (no anonymous rating — assessments are tied to identity for gap tracking)
- Assessment is mandatory within the letter context, but receiving a letter is not mandatory (no one is forced to open a letter)
- Author prediction is sealed until receiver rates (prevents anchoring)

---

## User Stories

### Letter Composition (Sender)
- **As a facilitator preparing a workshop follow-up,** I want to select 3-4 false-belief stories and send them as a letter to each participant, so they can privately assess their understanding after the group session
- **As a co-founder (partner A),** I want to select stories I've filed about our decisions and send them to my partner before our next /live session, so we can identify where the gaps are before we meet
- **As a letter sender,** I want to predict how well the receiver will understand each story (0-10), so the gap between my prediction and their self-rating reveals miscalibration

### Letter Reading (Receiver)
- **As a letter receiver,** I want to read stories one at a time in a focused experience, so I engage deeply with each story rather than skimming a list
- **As a letter receiver,** I want to rate my understanding of each story (0-10), so the author knows how their reasoning landed
- **As a letter receiver,** I want to see the gap between my self-rating and the author's prediction immediately after I rate, so I can experience the gap reveal in the moment (not aggregated later)
- **As a letter receiver,** I want to optionally take positions on points extracted from each story, so I can express agreement/disagreement alongside understanding

### Gap Map (Both Parties)
- **As a letter sender,** I want to see a summary of all gaps across all stories in a letter, so I know where to focus the next /live session
- **As a letter receiver,** I want to see a post-letter summary of my gaps, so I know which stories I may have misunderstood
- **As a pair preparing for /live,** I want the gap map to show which stories are "worth checking" vs "aligned," so our session time is spent on the biggest misalignments

### Assessment Integrity
- **As a letter receiver,** I want the author's prediction to be hidden until I submit my own rating, so I'm not anchored by their number (sealed-bid)
- **As a letter sender,** I want to see the receiver's rating only after they submit, so I know they rated independently

---

## Jobs to Be Done

**When I've just facilitated a false-belief workshop:**
- I want to send participants a structured follow-up with the stories we discussed, so they can privately connect the broken belief to their own relationship — the thing the group setting couldn't do (motivation: the private pain connection is where conversion happens)

**When my partner and I have a recurring /live session coming up:**
- I want to send them my new stories and see where they rate their understanding, so our session starts at depth instead of cold (motivation: /live time is expensive — don't waste it on discovery)

**When I receive a letter from my partner or facilitator:**
- I want a focused reading experience that asks me to actually assess my understanding, so I engage honestly with the content rather than skimming (motivation: the ritual creates conditions for honest self-assessment — rushing produces garbage numbers)

**When I see a gap revealed (I rated 8, author predicted 3):**
- I want to understand why I might be wrong about how well I understand, so I can calibrate my metacognitive accuracy (motivation: the "holy shit" moment — discovering I was miscalibrated about my own understanding)

**When I've finished reading a letter:**
- I want to see all my gaps at a glance, so I know what to bring to the next /live session (motivation: walk into /live with a map, not a blank page)

---

## Outcomes (Success Metrics)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Letters sent by facilitator after workshop | ≥1 letter to ≥3 participants per workshop | Count: letters created within 48h of a workshop event |
| Letter completion rate | ≥60% of receivers finish all stories | Count: receivers who rate all stories / total receivers |
| Gap prediction accuracy | Author predictions average ≥2 gap from receiver self-rating | Mean |prediction - self_rating| across all assessments |
| Workshop → personal cost connection | ≥1 participant names a personal cost after letter gap reveal | Qualitative: facilitator observation / follow-up |
| Pairs use letters between sessions | ≥1 letter exchanged between /live sessions for active pairs | Count: letters sent by non-facilitator users |
| Gap map → /live topic selection | Facilitator or pair uses gap map to select /live focus | Qualitative: "we started /live on the biggest gap from the letter" |
| Time-to-depth in /live | /live sessions after letter reach depth faster than cold starts | Compare: rounds-to-gap-reveal with vs without letter pre-work |

---

## Acceptance Criteria

### Letter Composition
- [ ] Sender can create a letter by selecting one or more of their own stories
- [ ] Sender addresses a letter to a specific ClarityPledge user
- [ ] Sender predicts understanding (0-10) for each story in the letter
- [ ] Sender's predictions are sealed — not visible to receiver until receiver rates
- [ ] Letter can be sent (receiver can access it from their account)
- [ ] Sender can send letters to multiple receivers (same content, individual predictions per receiver)

### Letter Reading
- [ ] Receiver sees a dedicated letter view (not a feed — a focused, sequential experience)
- [ ] Stories appear one at a time — receiver progresses through the sequence
- [ ] For each story, receiver must rate understanding (0-10) before proceeding
- [ ] Rating prompt: "How confident are you that you understand what [Author] means by this?"
- [ ] After receiver rates, the author's prediction is revealed alongside receiver's rating
- [ ] Gap displayed: "You: [X] · [Author]: [Y] · Gap: [|X-Y|]"
- [ ] After rating a story, extracted points from that story appear
- [ ] Receiver can optionally take position on points (-3 to +3)
- [ ] Receiver can proceed to next story (or finish if last)

### Gap Map
- [ ] After completing all stories, receiver sees a summary view
- [ ] Summary shows per-story: receiver rating, author prediction, gap
- [ ] Stories with gap ≥ 3 flagged as "worth checking in /live"
- [ ] Stories with gap < 2 shown as "aligned"
- [ ] Sender can view the same gap map for their sent letter

### Data & Integration
- [ ] Assessment data reuses the JourneyToUnderstanding display pattern (receiver rating = listener confidence, author prediction = speaker belief)
- [ ] Assessment data persists — visible on story detail page for both sender and receiver
- [ ] Letter status visible to sender: sent, opened, in-progress (N of M stories rated), completed
- [ ] Works on mobile (touch-friendly slider, full-screen reading)

### Integrity
- [ ] Receiver cannot see author's prediction before submitting their own rating (sealed-bid)
- [ ] Receiver cannot change their rating after seeing the prediction (committed)
- [ ] Sender's predictions are committed at send time (cannot edit after receiver starts)

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Letter composition CTA | "Send a letter" | Profile page or story detail page |
| Prediction prompt | "How well will [Receiver] understand this?" | Composition, per story, 0-10 slider |
| Understanding prompt | "How confident are you that you understand what [Author] means by this?" | Letter reading, per story, 0-10 slider |
| Gap display | "You: 8 · [Author]: 3 · Gap: 5" | After receiver rates, per story |
| Worth checking flag | "Worth checking in /live →" | Gap ≥ 3 |
| Aligned flag | "Aligned" | Gap < 2 |
| Letter status (sender view) | "Sent · Opened · 2 of 4 rated · Completed" | Sender's letter list |
| Position prompt | "[Point text]" with -3 to +3 scale | After story rating, optional |
| Gap map header | "Gap map: [Sender] → [Receiver]" | Post-letter summary |

---

## Resolved Decisions (from conversation research 2026-03-22/23)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Slider on story cards in feed or only inside letter? | Only inside letter. The letter is the container. Orphaned slider on feed cards lacks context and addressability. |
| D2 | Questions as part of the flow? | Dropped. Gradual reveal (story first, then points sequentially, commit before seeing next) does the anti-anchoring work that questions were trying to do. |
| D3 | Understanding mandatory or optional? | Mandatory within letter. You can choose not to open a letter, but once you start reading, understanding rating per story is required. |
| D4 | Position on points mandatory or optional? | Always optional. Not placing a position = "I don't understand enough to agree/disagree" or "the premise feels wrong." This is itself a signal. |
| D5 | Author "counter-assesses" or "predicts"? | Predicts. The author predicts BEFORE the receiver reads, not after. This is sealed-bid, not reactive. The prediction reveals the author's calibration, not their judgment of the receiver's answer. |
| D6 | UX feel? | Ritual, not feed. Deliberate slowness. Full-screen, one story at a time. "The moment before a meditation teacher rings the bell." Gamification explicitly rejected. |
| D7 | Receiver can revise rating after gap reveal? | No. Rating is committed. Revising after seeing the prediction defeats the purpose — the gap is between your honest self-assessment and the author's prediction. |
| D8 | Multiple receivers per letter? | Yes. Same stories, but predictions are per-receiver (facilitator predicts differently for each workshop participant). |

---

## Open Questions

1. **Can receiver reply with their own letter (ping-pong)?** Likely future feature, not V1. V1 is one-directional: sender → receiver.
2. **Does gap map feed into /live session setup?** Ideally yes — "start /live on story with biggest gap." But this is P562 territory (live simplification). V1 gap map is informational only.
3. **How does receiver discover they have a letter?** V1: they see it when they visit the site (inbox/notification badge). Email notifications are a separate spec (P573).
4. **Can sender include stories by other authors?** V1: sender can only include their own stories. Curating others' stories is a future capability.
5. **Understanding × agreement scatter plot?** Designed in conversations (four quadrants: genuine consensus, genuine disagreement, false consensus, noise). Likely a P563/future feature, not V1. V1 shows gap per story as a list.

---

## Out of Scope

- Notifications for letters or assessments (P573)
- /live simplification or gap-map-to-/live integration (P562)
- Position provenance / engagement depth visibility (P563)
- AI-assisted point extraction (P572)
- Story reputation / bridging value scoring (future)
- Mirror agent prediction (future)
- Understanding × agreement scatter plot (future, designed but not V1)
- Reply letters / ping-pong calibration (future)

---

## Next Steps

1. Run `/challenge-prd` to stress-test business requirements
2. Run `/ux` to design the letter composition, reading, and gap map flows
3. Run `/architect` to design data model (letters table, assessments, sealed-bid mechanics)
4. Run `/generate-tests` for test automation
5. Run `/dev` for implementation
