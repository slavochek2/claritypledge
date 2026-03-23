---
status: today
type: story
rank: 0.625
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
locked_at: '2026-03-23T14:36:41.737Z'
---

# P581: Letters with Comprehension Assessment

**Epic:** story-first (P523 vision)
**Supersedes:** P561 (comprehension slider on story cards), P575 (letter/story delivery)
**Depends on:** P560 (story filing without position — shipped)
**Related:** P551 (clarity docs — letter shares the grid component but remains a separate spec)
**Tests:** H-StoryFirst (async gap revelations), H-WTP-Pain (gap → felt cost), H-Stories-ColdStart (filed content as return trigger)

---

## North Star: The Hell-Yes Moment

The entire feature optimizes for one moment: **a visible position switch through verified understanding**. On the understanding × agreement grid, the receiver's dot moves — from false consensus to genuine disagreement, or from noise to genuine consensus — and both parties can SEE the arrow. That arrow is proof that a false belief was corrected through understanding, not persuasion. This is the async equivalent of the "holy shit" moment from /live.

---

## Problem Statement

**Current state:** Comprehension can only be assessed inside /live sessions — a rigid 3-click protocol that requires Slava to facilitate. Stories and points exist as cards in a feed, but there's no way to *send* them to someone as a deliberate act and collect understanding data back. A workshop participant, co-founder partner, or Person B in the briefing protocol has no curated entry point — they land on a feed, not a letter addressed to them.

**Pain points:**
1. **Gap revelations require Slava present.** The product can't deliver the "holy shit" moment (discovering you're miscalibrated about your own understanding) without a facilitator running /live. This doesn't scale past Slava's personal capacity.
2. **No async understanding measurement.** The listener's confidence guess and the speaker's belief — the two numbers that produce the gap — only exist inside /live. There's no way to collect them asynchronously from stories.
3. **Stories are ambient, not addressed.** Content exists but there's no intentional delivery. The gap between "content exists" and "someone receives it with intention" is unserved. Without a delivery container, stories are ambient content, not pre-work for a live session.
4. **/live sessions start cold.** Without pre-work, sessions default to whatever's top-of-mind. No triage of "where is the gap biggest?" means /live time is spent discovering what to talk about, not going deep on known gaps.
5. **Workshops lack an async component.** False-belief workshops (P567) surface intellectual surprise in the room, but there's no structured follow-up where participants privately connect the broken belief to their specific relationship cost. The group can surface the belief; only a private instrument can surface the pain.
6. **No proof of correction.** When a false belief IS corrected through understanding, there's no visible artifact. The position switch happened in someone's head — no one can see it. Without proof, the facilitator can't point to it, the participant can't reflect on it, and the pair can't use it as evidence that the process works.

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

1. **Letter as container.** A person (facilitator, partner A) can select existing stories OR create new ones, and package them into a letter addressed to a specific person. The letter is a deliberately curated collection — not a share link, not a feed filter.

2. **Author prediction per story.** When composing a letter, the sender predicts (0-10) how well the receiver will understand each included story. This prediction is hidden from the receiver until they rate themselves. The prediction is the speaker's half of the gap equation.

3. **Ritual reading experience.** The receiver opens a letter and reads stories one at a time in a full-screen, deliberate-pacing experience. Not a list to scroll through — a sequence to progress through. Each story requires engagement before the next appears.

4. **Understanding rating (mandatory, 0-10).** For each story in the letter, the receiver must rate their understanding: "How confident am I that I understand what [Author] means by this?" This is the listener's half of the gap equation. Rating is mandatory — the receiver cannot proceed to the next story without rating. Uses dot picker (discrete dots), not a continuous slider.

5. **Gap reveal per story (sealed-bid → commit → reveal).** After the receiver rates, the author's prediction is revealed alongside the receiver's self-rating. Gap = |prediction - self-rating|. Displayed as dual progress bars (receiver blue, author orange). Severity framing: gap ≥ 3 = "worth checking in /live", gap < 2 = "aligned."

6. **Points appear after story rating with three-button engagement.** After rating understanding on a story, any points extracted from that story appear sequentially. Three-button pattern: ✕ (disagree) / ? (maybe) / ✓ (agree, with degree dropdown). Position is always optional. Author's position is LOCKED until receiver engages (takes position OR files a story) — incentivizes engagement to unlock.

7. **Story filing in response.** Receiver can optionally file a story on any point — to explain their position, or to explain why they DIDN'T take a position (e.g., false premise: "I reject the framing because..."). This is the same story-filing mechanic from P560, triggered from within the letter reading flow. Filing a story triggers a self-understanding rating for that story.

8. **Understanding × agreement grid.** The core visualization — Y-axis: understanding (0-10, no negatives), X-axis: agreement (-3 to +3). Four quadrants:
   - Top-right: **Genuine consensus** (high understanding + agreement) — aligned
   - Top-left: **Genuine disagreement** (high understanding + disagreement) — clear, honest
   - Bottom-right: **False consensus** ⚠️ (low understanding + agreement) — DANGEROUS, the silent killer
   - Bottom-left: **Noise** (low understanding + disagreement) — no basis for anything

   Both parties' guesses create initial dots. After paraphrase/verification, the Y-axis collapses to a verified number — uncertainty is cut. Position on X-axis may shift. The ARROW from initial guess to post-verification position IS the proof of correction (the hell-yes moment).

9. **Gap map as proof of correction.** After the receiver finishes all stories, a summary view shows the grid per point — with dots, arrows, and quadrant labels. This is NOT just "which stories have big gaps." It's a visual record showing: where understanding was verified, where positions switched, and where false consensus was exposed. This gap map serves as (a) triage for the next /live session and (b) proof that the process works — the artifact the participant walks away with.

10. **Works for both contexts equally.** Letter mechanics must serve (a) facilitator → workshop participants (1-to-many, curated false-belief content) and (b) partner A → partner B (1-to-1, personal stories between recurring sessions). Same instrument, different content.

11. **Letter is triage, not verification.** Both parties guessing high does NOT confirm understanding — it means /live might not be needed. A large gap means it probably is. Frame as screening, never as proof. Verification happens in /live through paraphrase.

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
- **As a facilitator preparing a workshop follow-up,** I want to select or create 3-4 false-belief stories and send them as a letter to each participant, so they can privately assess their understanding after the group session
- **As a co-founder (partner A),** I want to select stories I've filed about our decisions and send them to my partner before our next /live session, so we can identify where the gaps are before we meet
- **As a letter sender,** I want to predict how well the receiver will understand each story (0-10), so the gap between my prediction and their self-rating reveals miscalibration

### Letter Reading (Receiver)
- **As a letter receiver,** I want to read stories one at a time in a focused experience, so I engage deeply with each story rather than skimming a list
- **As a letter receiver,** I want to rate my understanding of each story (0-10), so the author knows how their reasoning landed
- **As a letter receiver,** I want to see the gap between my self-rating and the author's prediction immediately after I rate, so I can experience the gap reveal in the moment (not aggregated later)
- **As a letter receiver,** I want to take positions on points using a simple three-button pattern (disagree / maybe / agree), so I can express my stance quickly without cognitive overload
- **As a letter receiver,** I want to file a story on any point — to explain my position OR explain why I didn't take one (false premise), so my reasoning is captured alongside my stance
- **As a letter receiver,** I want the author's position to be LOCKED until I engage (take position or file story), so I'm not anchored by their stance

### Gap Map as Proof of Correction (Both Parties)
- **As a letter sender,** I want to see a grid (understanding × agreement) per point showing where each receiver landed, so I know where false consensus is hiding
- **As a letter receiver,** I want to see my position on the grid alongside the author's, so I can see whether my understanding and agreement are genuine or superficial
- **As both parties after /live verification,** I want to see the ARROW on the grid — from initial guess to post-verification position — so we have visible proof that a false belief was corrected through understanding
- **As a facilitator,** I want the gap map to rank points by risk (false consensus count + disagreement count), so I know which point to start /live on

### Assessment Integrity
- **As a letter receiver,** I want the author's prediction to be hidden until I submit my own rating, so I'm not anchored by their number (sealed-bid)
- **As a letter sender,** I want to see the receiver's rating only after they submit, so I know they rated independently

---

## Jobs to Be Done

**When I've just facilitated a false-belief workshop:**
- I want participants to walk away with proof that their belief was corrected through understanding — a visible artifact showing the arrow from false consensus to genuine position — so they can reflect privately on what holding this belief cost them (motivation: the proof IS the reflection trigger — without it, the correction is invisible and forgettable)

**When my partner and I have a recurring /live session coming up:**
- I want to send them my new stories and see where they rate their understanding, so our session starts at depth instead of cold (motivation: /live time is expensive — don't waste it on discovery)

**When I receive a letter from my partner or facilitator:**
- I want a focused reading experience that asks me to actually assess my understanding, so I engage honestly with the content rather than skimming (motivation: the ritual creates conditions for honest self-assessment — rushing produces garbage numbers)

**When I see a gap revealed (I rated 8, author predicted 3):**
- I want to understand why I might be wrong about how well I understand, so I can calibrate my metacognitive accuracy (motivation: the "holy shit" moment — discovering I was miscalibrated about my own understanding)

**When I want to disagree with a point's framing (not its truth):**
- I want to file a story explaining why the premise is wrong, without being forced to take agree/disagree position, so my "false premise" response is captured as reasoning (motivation: some points deserve rejection of framing, not positioning on the scale)

**When I've finished reading a letter:**
- I want to see my position on the understanding × agreement grid for each point, with the author's position revealed, so I can see which quadrant I'm in — and whether I'm in false consensus without knowing it (motivation: false consensus is invisible; the grid makes it visible)

**When I see the grid after /live verification:**
- I want to see the arrow from my initial guess to my verified position, so I have proof that my belief changed through understanding (motivation: the arrow IS the hell-yes moment — tangible evidence that the process works)

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
- [ ] Sender can create a letter by selecting existing stories OR creating new stories inline
- [ ] Sender addresses a letter to a specific ClarityPledge user
- [ ] Sender predicts understanding (0-10) for each story using dot picker
- [ ] Sender's predictions are sealed — not visible to receiver until receiver rates
- [ ] Letter can be sent (receiver can access it from their account)
- [ ] Sender can send letters to multiple receivers (same content, individual predictions per receiver)

### Letter Reading
- [ ] Receiver sees a dedicated letter view (not a feed — a focused, sequential experience)
- [ ] Progress tracking bar at top shows position in letter (story N of M)
- [ ] Stories appear one at a time — receiver progresses through the sequence
- [ ] For each story, receiver must rate understanding (0-10) via dot picker before proceeding
- [ ] Rating prompt: "How well do you believe you understood this?"
- [ ] After receiver rates, the author's prediction is revealed as dual progress bars
- [ ] Gap severity framed: "A gap of N — worth noting/exploring" (not raw numbers only)
- [ ] After rating a story, extracted points from that story appear sequentially
- [ ] Three-button position pattern: ✕ (disagree) / ? (maybe) / ✓ (agree with degree dropdown)
- [ ] Author's position on each point is LOCKED until receiver engages (position OR story)
- [ ] Engaging unlocks author position reveal (fade-in animation)
- [ ] Receiver can file a story on any point (explain position, explain false premise, explain non-position)
- [ ] Filing a story triggers self-understanding rating for that story
- [ ] Receiver can proceed to next story (or finish if last)

### Understanding × Agreement Grid
- [ ] Grid component: Y-axis = understanding (0-10), X-axis = agreement (-3 to +3)
- [ ] Four labeled quadrants: genuine consensus (top-right), genuine disagreement (top-left), false consensus ⚠️ (bottom-right), noise (bottom-left)
- [ ] Each listener's position rendered as a dot on the grid per point
- [ ] Dot color indicates position stance (green=agree, red=disagree, gray=maybe)
- [ ] Hover/tap a dot reveals listener name, ratings, gap
- [ ] "Show paraphrase movement" toggle: arrows from pre-verification to post-verification position
- [ ] Grid used in both gap map (author view, all listeners) and letter summary (receiver view, own position vs author)
- [ ] Grid component is shared — works inside letters AND inside /live (replaces JourneyToUnderstanding long-term)

### Gap Map (Proof of Correction)
- [ ] After completing all stories, receiver sees summary with grid per point
- [ ] Points ranked by risk: false consensus count × 2 + disagreement count
- [ ] Per-point summary: quadrant distribution counts, average understanding, gap
- [ ] Sender sees same gap map with all receivers' data
- [ ] "Ready for live?" CTA pointing to highest-risk point
- [ ] Linked stories visible per point (receiver and listener stories)

### Data & Integration
- [ ] Assessment data persists — visible on story detail page for both sender and receiver
- [ ] Letter status visible to sender: sent, opened, in-progress (N of M stories rated), completed
- [ ] Works on mobile (touch-friendly dot picker, full-screen reading)
- [ ] Grid component exportable for future use in /live and clarity docs (P551)

### Integrity
- [ ] Receiver cannot see author's prediction before submitting their own rating (sealed-bid)
- [ ] Receiver cannot change their understanding rating after seeing the prediction (committed)
- [ ] Author position on points locked until receiver engages (prevents anchoring)
- [ ] Sender's predictions are committed at send time (cannot edit after receiver starts)

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Letter composition CTA | "Send a letter" | Profile page or story detail page |
| Prediction prompt | "How well will [Receiver] understand this?" | Composition, per story, dot picker 0-10 |
| Understanding prompt | "How well do you believe you understood this?" | Letter reading, per story, dot picker 0-10 |
| Gap display | Dual progress bars (blue=receiver, orange=author) + "A gap of N — worth noting" | After receiver commits, per story |
| Position buttons | ✕ (disagree) / ? (maybe) / ✓ (agree, dropdown: somewhat/agree/strongly) | Per point, after story rating |
| Author position locked | "🔒 Author's position hidden — engage to reveal" | Until receiver takes position or files story |
| Story filing CTA | "+ Add a story — optional" (dashed border button) | Per point, within letter reading |
| Progress bar | Segmented bar showing story N of M | Top of letter reading view |
| Grid quadrants | Genuine consensus (green, top-right), Genuine disagreement (red, top-left), False consensus ⚠️ (amber, bottom-right), Noise (gray, bottom-left) | Grid component |
| Grid Y-axis | "UNDERSTANDING ↑" (0-10) | Always visible, no negatives |
| Grid X-axis | "← DISAGREE ... AGREE →" (-3 to +3) | Toggleable in some contexts |
| Paraphrase toggle | "Show/Hide paraphrase movement (N/M)" | Author view, gap map |
| Risk ranking | Points sorted by: false consensus × 2 + disagreement | Author gap map |
| Ready for live CTA | "Start live session → [highest-risk point]" | Bottom of author gap map |
| Letter status (sender view) | "Sent · Opened · 2 of 4 rated · Completed" | Sender's letter list |
| Gap map header | "Gap map — N listeners" | Post-letter summary / author view |

---

## Resolved Decisions (from conversation research 2026-03-22/23 + prototype iteration)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Slider on story cards in feed or only inside letter? | Only inside letter. The letter is the container. Orphaned slider on feed cards lacks context and addressability. |
| D2 | Questions as part of the flow? | Dropped. Gradual reveal (story first, then points sequentially, commit before seeing next) does the anti-anchoring work that questions were trying to do. |
| D3 | Understanding mandatory or optional? | Mandatory within letter. You can choose not to open a letter, but once you start reading, understanding rating per story is required. |
| D4 | Position on points mandatory or optional? | Always optional. Not placing a position = "I don't understand enough to agree/disagree" or "the premise feels wrong." Filing a story without position is itself a valuable signal (false premise path). |
| D5 | Author "counter-assesses" or "predicts"? | Predicts. The author predicts BEFORE the receiver reads, not after. This is sealed-bid, not reactive. The prediction reveals the author's calibration, not their judgment of the receiver's answer. |
| D6 | UX feel? | Ritual, not feed. Deliberate slowness. Full-screen, one story at a time. Gamification explicitly rejected. Particle effects on commitment moments (from prototype) are acceptable — they mark the weight of the moment, not gamify it. |
| D7 | Receiver can revise rating after gap reveal? | No. Rating is committed. Revising after seeing the prediction defeats the purpose. |
| D8 | Multiple receivers per letter? | Yes. Same stories, but predictions are per-receiver (facilitator predicts differently for each workshop participant). |
| D9 | Dot picker or continuous slider? | Dot picker (discrete 1-10 dots). Feels more intentional, matches prototype. Not a slider. |
| D10 | Author position visible or locked? | Locked until receiver engages (takes position OR files story). Incentivizes engagement. Unlocking is animated (fade-in). |
| D11 | Three-button or 7-point Likert? | Three-button (✕/?/✓) with agree-degree dropdown on ✓. Lower cognitive load. From prototype. |
| D12 | Gap map = list or grid? | Understanding × agreement grid (four quadrants). Both parties as dots. Arrows show movement. Grid is the core visualization across letters and /live. |
| D13 | Relationship to P551 clarity docs? | Separate specs, shared grid component. Letter = addressed reading experience with measurement. Clarity doc = persistent private shared container. A letter could eventually be a "reading mode" of a clarity doc, but V1 they're independent. |
| D14 | Can receiver file stories? | Yes. On any point — to explain position, explain false premise, or explain non-position. Uses P560 story-filing mechanic inline. |

---

## Open Questions

1. **Can receiver reply with their own letter (ping-pong)?** Likely future feature, not V1. V1 is one-directional: sender → receiver.
2. **Does gap map feed into /live session setup?** Ideally yes — "start /live on story with biggest gap." V1 gap map has "Ready for live?" CTA but no deep integration.
3. **How does receiver discover they have a letter?** V1: they see it when they visit the site (inbox/notification badge). Email notifications are a separate spec (P573).
4. **Can sender include stories by other authors?** V1: sender can only include their own stories. Curating others' stories is a future capability.
5. **Does the grid replace JourneyToUnderstanding in /live?** The grid is a superset (shows both understanding AND agreement). Long-term yes. V1: grid lives in letters, JourneyToUnderstanding stays in /live. Migration is a future task.
6. **Can a letter document external paraphrase?** (e.g., "we already discussed this in person, I just want to record it") — async /live alternative. Likely future, not V1.
7. **Guess-line → collapse mechanic:** Both parties' guesses form a line segment on the grid (uncertainty band). After paraphrase, Y collapses to verified number. Visually compelling but may be too complex for V1. Explore in /ux.

---

## Prototype Reference

Working prototypes built in claude.ai (2026-03-23) inform this spec:

1. **Letter prototype (full flow):** Cover → story reading → dot picker rating → CalibCard gap reveal → sequential points with three-button row → author position lock/unlock → story filing → author gap map with quadrant plot + paraphrase movement toggle + listener hover inspection + linked stories + "Ready for live?" CTA.

2. **Grid prototype (dark, interactive):** Understanding × agreement grid with radial gradient background, particle burst on placement, ghost dot on hover, toggleable X-axis, monospace readout. Y-axis 0-10 (no negatives), X-axis -5 to +5.

3. **Screenshot variations (4):** Progress tracking bar, dual progress bars for gap reveal, "commit → reveal speaker's score" sealed-bid flow, feed-style story cards with gap callouts.

Key patterns from prototypes: dot picker (not slider), three-button (not Likert), author lock until engagement, progress bar, dual-bar gap reveal with severity framing, quadrant scatter plot with hover inspection.

---

## Out of Scope

- Notifications for letters or assessments (P573)
- /live simplification or gap-map-to-/live integration (P562)
- AI-assisted point extraction (P572)
- Story reputation / bridging value scoring (future)
- Mirror agent prediction (future)
- Reply letters / ping-pong calibration (future)
- Replacing JourneyToUnderstanding in /live with the grid (future migration)
- Async /live mode (documenting external paraphrases) (future)

---

## Next Steps

1. Run `/challenge-prd` to stress-test business requirements
2. Run `/ux` to design the letter composition, reading, and gap map flows
3. Run `/architect` to design data model (letters table, assessments, sealed-bid mechanics)
4. Run `/generate-tests` for test automation
5. Run `/dev` for implementation
