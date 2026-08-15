---
status: all-done
type: story
rank: 0.5
tags:
  - epic-story-first
  - letters
  - comprehension
  - async
  - screening
  - workshop
  - briefing
created_date: 2026-03-23T00:00:00.000Z
flow: dev
sibling_crs:
  - p651
  - p660
  - p661
  - p932
uat_file: features/uat/p581.md
test_files:
  - e2e/integration/p581-letters-migration.spec.ts
  - e2e/integration/p581-letters-sealed-bid.spec.ts
  - e2e/p581-letter-composition.spec.ts
  - e2e/p581-letter-reading.spec.ts
  - e2e/p581-letter-1to1-flow.spec.ts
  - e2e/p581-letter-completion.spec.ts
  - e2e/helpers/test-letter.ts
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-04-07T11:27:55.247Z'
---

# P581: Letters with Comprehension Assessment

**Epic:** story-first (P523 vision)
**Supersedes:** P561 (comprehension slider on story cards), P575 (letter/story delivery)
**Depends on:** P560 (story filing without position — shipped), P607 (visibility inheritance on creation — pre-req, ensures points/stories inherit parent visibility correctly for snapshot integrity)
**Related:** P551 (clarity docs — letter is an immutable snapshot of a doc; unified data model, separate specs), P586 (visibility & privacy foundation — prerequisite for P551; point RLS, story immutability, `shared` removal), P590 (doc design system + immutable visibility model — shipped)
**Blocked by:** P586 → P551 → P607 → P581 (chain: privacy foundation → doc CRUD → visibility inheritance → letter delivery)
**Tests:** H-StoryFirst (async gap revelations), H-WTP-Pain (gap → felt cost), H-Stories-ColdStart (filed content as return trigger)

---

## North Star: Verification of Understanding

The feature optimizes for **making visible what was invisible** — the gap between what was communicated and what was understood. Verification produces three outcomes (see definitions.md > Verification Outcome States):

- **Flip:** position changes after understanding increases — the classic "holy shit" moment
- **Fork:** both interpretations are valid, position depends on frame — reveals the point needs discussion
- **Verified agreement/disagreement:** understanding confirmed, position holds — proof it's real, not imagined

All three are valuable. The letter completion summary shows WHERE gaps exist (triage). Stories show WHAT kind of gap (diagnosis). The movement from pre-verification to post-verification position (visible in /live, future P624 grid) is the proof that something real happened, regardless of which outcome it was.

---

## Problem Statement

**Current state:** Comprehension can only be assessed inside /live sessions — a rigid 3-click protocol that requires Slava to facilitate. Stories and points exist as cards in a feed, but there's no way to *send* them to someone as a deliberate act and collect understanding data back. A workshop participant, co-founder partner, or Person B in the briefing protocol has no curated entry point — they land on a feed, not a letter addressed to them.

**Pain points:**
1. **Gap revelations require Slava present.** The product can't deliver the "holy shit" moment (discovering you're miscalibrated about your own understanding) without a facilitator running /live. This doesn't scale past Slava's personal capacity.
2. **No async understanding measurement.** The listener's confidence guess and the speaker's belief — the two numbers that produce the gap — only exist inside /live. There's no way to collect them asynchronously from stories.
3. **Stories are ambient, not addressed.** Content exists but there's no intentional delivery. The gap between "content exists" and "someone receives it with intention" is unserved. Without a delivery container, stories are ambient content, not pre-work for a live session.
4. **/live sessions start cold.** Without pre-work, sessions default to whatever's top-of-mind. No triage of "where is the gap biggest?" means /live time is spent discovering what to talk about, not going deep on known gaps.
5. **Workshops lack an async component.** False-belief workshops (P567) surface intellectual surprise in the room, but there's no structured follow-up where participants privately connect the broken belief to their specific relationship cost. The group can surface the belief; only a private instrument can surface the pain.
6. **No proof of what happened.** When understanding is verified — whether it produces a position flip, reveals an interpretation fork, or confirms genuine disagreement — there's no visible artifact. Without proof, the facilitator can't point to it, the participant can't reflect on it, and the pair can't use it as evidence that the process works.

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
2. First Clarity Partner Agreement signed (Mar 22). The pair needs structured pre-work between sessions. Without it, the agreement is aspirational — no instrument to practice with.
3. Story filing (P560) just shipped. Stories exist. Points exist. The content is there. What's missing is the delivery container + measurement instrument.

**Impact if not solved:** ClarityPledge remains a facilitator-dependent service with zero standalone product value. Workshops produce intellectual surprise but no follow-up instrument. Partner agreements have no async practice tool. The product can't test H-StoryFirst (async gap revelations) because the measurement mechanism doesn't exist. H-WTP-Pain testing stalls because the workshop flow's step 4 has no implementation.

**Architectural context:** Letter = immutable snapshot of a Clarity Doc (P551). The doc is the editing surface; "Prepare a Letter" triggers the composition wizard. See D13.

**Three-letter acquisition sequence (2026-03-24):**
Letters serve a larger acquisition flywheel: Letter 1 (educate — recipient reads, rates, gaps revealed) → /live verification → Letter 2 (reproduce — recipient creates their own letter using same points, own stories) → Letter 3 (value assessment + PWIW + distributor CTA). In a compressed workshop, all three happen in one 90-120 min session. V1 builds Letter 1 only. Letter 2 uses the same composition flow (recipient is now a registered user). Letter 3 is a future post-completion screen. See [facilitator-guide.md](../../../docs/facilitator-guide.md#workshop-format-three-letter-compressed-session).

---

## Business Requirements

**Must-haves:**

1. **Letter as snapshot of a doc.** A person (facilitator, partner A) opens or creates a Clarity Doc (P551), curates stories there, then clicks "Prepare a Letter" on the doc page. The composition wizard adds receivers (with mode selector), sets per-story predictions, previews, and seals. The letter snapshots the doc's current stories via `story_versions` — the doc remains mutable, the letter is immutable. No standalone composition flow — the doc IS the editing surface.

2. **Author prediction per story.** When composing a letter, the sender predicts (0-10) how well the receiver will understand each included story. This prediction is hidden from the receiver until they rate themselves. The prediction is the speaker's half of the gap equation.

3. **Ritual reading experience.** The receiver opens a letter and progresses through a full-screen, deliberate-pacing experience. For stories with 2+ points, the first point (anti-point) appears before the story for commit-before-context (Clarity Flip mechanic); for single-point stories, the story provides context first. Not a list to scroll through — a sequence to progress through. Each point requires engagement (position or story) before proceeding. Hidden points in docs do not appear in letters — only visible points are included in the snapshot.

4. **Understanding rating (mandatory, 0-10).** For each story in the letter, the receiver must rate their understanding: "How confident am I that I understand what [Author] means by this?" This is the listener's half of the gap equation. Rating is mandatory — the receiver cannot proceed to the next story without rating. Uses dot picker (discrete dots), not a continuous slider.

5. **Gap reveal per story (sealed-bid → commit → reveal).** After the receiver rates, the author's prediction is revealed alongside the receiver's self-rating. Gap = |prediction - self-rating|. Both numbers shown side by side — the gap speaks for itself.

6. **Conditional ordering per story (D36) with engagement requirement (D37).** For 1-point stories: story first, then the point. For 2+ point stories: first point (anti-point, highest priority from doc) appears before the story for commit-before-context (Clarity Flip mechanic), then the story, then remaining points. Three-button pattern: ✕ (disagree) / ? (maybe) / ✓ (agree, with degree dropdown). Receiver must position OR file a story on each point before proceeding — can't skip silently (D37). Author's position is LOCKED until receiver engages (takes position OR files a story) — incentivizes engagement to unlock.

7. **Story filing in response.** Receiver can optionally file a story on any point — to explain their position, or to explain why they DIDN'T take a position (e.g., false premise: "I reject the framing because..."). This is the same story-filing mechanic from P560, triggered from within the letter reading flow. Filing a story triggers a self-understanding rating for that story.

8. **Per-story and per-point comparisons.** After the receiver rates a story, the sender's prediction and receiver's self-rating are shown as dual numbers side by side. After the receiver engages with a point, the receiver's position is shown alongside the author's position (revealed after engagement). This is the V1 visualization — simple, per-item comparisons. See P624 for the full understanding x agreement grid visualization planned as a future layer.

9. **Letter completion summary.** After the receiver finishes all stories, a summary view shows per-story gaps (sender prediction vs receiver rating) and per-point positions (receiver alongside author). Points sorted by gap size (largest first). "Ready for /live?" CTA on the highest-gap story. This serves as triage for the next /live session. See P624 for the future grid-based gap map visualization.

10. **Works for both contexts equally.** Letter mechanics must serve (a) facilitator → workshop participants (1-to-many, curated false-belief content) and (b) partner A → partner B (1-to-1, personal stories between recurring sessions). Same instrument, different content.

11. **Letter is triage, not verification.** Both parties guessing high does NOT confirm understanding — it means /live might not be needed. A large gap means it probably is. Frame as screening, never as proof. Verification happens in /live through paraphrase.

**Success conditions:**
- A facilitator can send a letter to a workshop participant and receive understanding data back without being present
- A co-founder can send stories to their partner and see where the gaps are before their next /live session

**Constraints:**
- Must not break existing story/point/position functionality
- Must work on mobile (workshop participants on phones)
- Anonymous access (no account required) applies only to 1-to-many letters from public docs — reading, rating, positioning all work in local state. Registration gate at EXIT to persist results. 1-to-1 letters always require authentication (D47).
- Assessment is mandatory within the letter context, but receiving a letter is not mandatory (no one is forced to open a letter)
- Author prediction is sealed until receiver rates (prevents anchoring)

**Letter sharing methods (revised D25/D29/D30/D45):**
- **1-to-many letter — link (with optional QR code):** Anonymous access. Guest reads → completes → letter completion summary → "Save your results?" → email input → registration → data persisted. Registration gate at EXIT, not entrance. Reuses Pledge sessionStorage + magic link pattern. Available only from public docs.
- **1-to-1 letter — email (multiple emails separated by comma):** Sender enters receiver's email(s) at composition. Receiver gets email with token-gated link. Existing user: magic link (no re-auth, P488 pattern). New user: one-click registration (P527 `create-and-sign` pattern adapted). Receiver can also access from within app (Clarity Docs page shows received letters) — email is not the only entry point. Authentication required (D47).
- **1-to-1 letter — URL without token:** Returns 404. No existence confirmation to unauthorized viewers (D25).

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
- **As a letter receiver,** I want the author's position shown only after I set my position or file a story, to avoid bias

### Letter Completion Summary (Both Parties)
- **As a letter sender,** I want to see per-story gaps and per-point positions for each receiver, so I know where the biggest understanding gaps are
- **As a letter receiver,** I want to see my ratings alongside the author's predictions, so I can see where I may be miscalibrated
- **As a facilitator,** I want the completion summary to sort points by gap size, so I know which story to start /live on

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
- I want to see my ratings alongside the author's predictions and my positions alongside the author's positions, so I can see where the biggest gaps are (motivation: seeing the gap makes the invisible visible — I might think I understood, but the numbers say otherwise)

---

## Outcomes (Success Metrics)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Letters sent by facilitator after workshop | ≥1 letter to ≥3 participants per workshop | Count: letters created within 48h of a workshop event |
| Letter completion rate | ≥60% of receivers finish all stories | Count: receivers who rate all stories / total receivers |
| Gap prediction accuracy | Author predictions average ≥2 gap from receiver self-rating | Mean |prediction - self_rating| across all assessments |
| Workshop → personal cost connection | ≥1 participant names a personal cost after letter gap reveal | Qualitative: facilitator observation / follow-up |
| Pairs use letters between sessions | ≥1 letter exchanged between /live sessions for active pairs | Count: letters sent by non-facilitator users |
| Letter summary → /live topic selection | Facilitator or pair uses letter completion summary to select /live focus | Qualitative: "we started /live on the biggest gap from the letter" |
| Time-to-depth in /live | /live sessions after letter reach depth faster than cold starts | Compare: rounds-to-gap-reveal with vs without letter pre-work |

---

## Acceptance Criteria

### Letter Composition (Doc-Sourced)
- [ ] "Prepare a Letter" button on doc page header opens composition wizard
- [ ] Wizard Step 1: add receivers — mode selector ("Specific people" vs "Anyone with a link"), then email input or link generation
- [ ] Wizard Step 2: set per-story predictions (0-10) using dot picker — "How well will [Receiver] understand this?"
- [ ] Hidden points in docs do not appear in letter (only visible points are included in the snapshot)
- [ ] Sender's predictions are sealed — not visible to receiver until receiver rates
- [ ] Preview step: sender previews the full reading flow with "This is a preview" banner before committing (D42)
- [ ] "Seal & Send" commits the letter — snapshots story content via `story_versions`, creates `clarity_letters` + `letter_deliveries` rows
- [ ] Letter accessible via unique link (access_token) — anonymous access for 1-to-many only; 1-to-1 requires authentication (D47)
- [ ] Sender can send to multiple receivers (same content, individual predictions per receiver)
- [ ] If sender needs to add a story mid-composition: close wizard → add to doc → reopen wizard (accepted friction)
- [ ] Reuses P422 `clarity_agreements` email delivery pattern (enter email → check if user exists → show name or send invitation)

### Letter Visibility in Docs
- [ ] Doc detail page shows "Letters" section listing letters sent from this doc
- [ ] Each letter entry shows: date, receiver(s), status (sent/opened/in-progress/completed)
- [ ] Sender can click through to full form view of any sent letter
- [ ] Docs list page shows received letters under a "Letters received" section
- [ ] Receiver sees full form for completed stories, locked view for incomplete ones (D32)

### 1-to-1 Letter Flow (D25, D29, D47)
- [ ] 1-to-1 letter URL without valid token returns 404 (no existence leak)
- [ ] 1-to-1 letter sent via email to existing user: reuse Agreement magic link pattern (P488)
- [ ] 1-to-1 letter sent via email to new user: "Open the Letter" on cover = account creation + terms acceptance in one click (D48, Agreement P527 pattern). Receiver is registered before reading starts.
- [ ] Cover screen shows "By opening, you accept the Terms of Service" below "Open the Letter" button (D48)
- [ ] Registered receiver can access 1-to-1 letter from within app (Docs page) without needing email link
- [ ] 1-to-1 letters always require authentication (D47)

### 1-to-Many Letter Flow (D30, D47)
- [ ] 1-to-many letter accessible via shareable link — no auth required (anonymous access)
- [ ] Guest can read, rate, position, and file stories without account
- [ ] Registration gate appears after completion summary ("Save your results?")
- [ ] sessionStorage holds all data until persisted (Pledge pattern)

### Unregistered Receiver Flow (1-to-many from public docs only — D47)
- [ ] Receiver can open 1-to-many letter link without an account (anonymous access)
- [ ] All letter interactions (reading, rating, positioning, story filing) work in local state without registration
- [ ] After completing letter, completion summary displays before any registration prompt
- [ ] "Save your results?" gate appears after completion summary — email input → redirects to existing signup flow (terms acceptance included, D48)
- [ ] If letter was sent via email, receiver's email is pre-filled at the save gate (one click to persist)
- [ ] If receiver's email matches existing account, results auto-attach on login
- [ ] If receiver closes browser before saving, local state persists (sessionStorage) for return within same session

### Letter Reading
- [ ] Receiver sees a dedicated letter view (not a feed — a focused, sequential experience)
- [ ] Progress tracking bar at top shows position in letter (story N of M)
- [ ] Ordering conditional on point count (D36):
  - **1 point:** Story → rate understanding → Point → position/story
  - **2+ points:** Point 1 (anti-point, highest prio from doc) → position/story → Story → rate understanding → Point 2, 3... → position/story
- [ ] Sender controls point priority via doc ordering (arrows in Clarity Docs)
- [ ] Sender can add optional vocabulary glosses on abstract points (define terms, not arguments)
- [ ] Receiver gets "I need context" button per point (tracked as content quality metric, not primary UX)
- [ ] Stories appear one at a time — receiver progresses through the sequence
- [ ] For each story, receiver must rate understanding (0-10) via `RatingButtons` before proceeding
- [ ] Rating prompt: "How well do you believe you understand this story in the way [Author] means it?"
- [ ] After receiver rates, the author's prediction is revealed as dual numbers side by side
- [ ] Gap framed honestly: "A gap of N — both guessing, neither knows yet" (not claiming knowledge we don't have)
- [ ] After rating a story, extracted points from that story appear sequentially
- [ ] Three-button position pattern: reuse existing `PositionButtons` component (`src/app/components/shared/PositionButton.tsx`) — ✕/✓/? with intensity dropdown, blue active states. Do NOT rebuild.
- [ ] Engagement model B (D37): receiver must position OR file story on each point. Can't skip silently.
- [ ] Author's position on each point is LOCKED until receiver engages (position OR story)
- [ ] Engaging unlocks author position reveal (fade-in animation)
- [ ] Receiver can file a story on any point: trigger existing P560 `CreateStoryPage` with `?pointId=X`. Do NOT rebuild filing flow.
- [ ] "Can't position because don't understand" handled by existing story filing (D39) — no extra UI
- [ ] Filing a story triggers self-understanding rating for that story
- [ ] Receiver can proceed to next story (or finish if last)

### Letter Completion Summary (replaces Grid + Gap Map — see P624 for future grid)
- [ ] After completing all stories, receiver sees a completion summary showing per-story gaps and per-point positions
- [ ] Per-story: sender prediction and receiver self-rating shown as dual numbers side by side, with gap
- [ ] Per-point: receiver's position shown alongside author's position (revealed after engagement)
- [ ] Points sorted by gap size (largest first)
- [ ] "Ready for /live?" CTA on the highest-gap story
- [ ] Sender sees same completion summary with all receivers' data
- [ ] Linked stories visible per point (receiver and author stories)
- [ ] No grid visualization in V1 — see P624 (D43)

### Data & Integration
- [ ] Assessment data persists in `story_verifications` with `source='letter'`, `verified=false`
- [ ] `clarity_sessions` gets nullable `source_letter_id UUID REFERENCES clarity_letters(id)` + index (D26 — future "start /live from letter" hook)
- [ ] Letter snapshots preserve per-story `visibility` from `stories.visibility` (D23)
- [ ] Letter status visible to sender: sent, opened, in-progress (N of M stories rated), completed
- [ ] Works on mobile (touch-friendly dot picker, full-screen reading)
- [ ] Completion summary component reusable for future use in /live and clarity docs (P551)
- [ ] After completing letter, receiver sees "Add a story" CTA on each point (optional, D19)
- [ ] Receiver-filed stories + predictions visible on sender's completion summary
- [ ] Multiple deliveries + public doc: subscribe to Supabase Realtime on `story_verifications` (workshop mode, D20)
- [ ] Single delivery or private doc: static query, no subscription needed

### Integrity
- [ ] Receiver cannot see author's prediction before submitting their own rating (sealed-bid)
- [ ] Receiver cannot change their understanding rating after seeing the prediction (committed)
- [ ] Author position on points locked until receiver engages (prevents anchoring)
- [ ] Sender's predictions are committed at send time (cannot edit after receiver starts)

---

## UI Contract

**Two letter views (D31/D32):**
- **View form:** Receiver's sequential reading experience — one story at a time, rating gate, sealed-bid. Like taking an exam.
- **Full form:** Doc snapshot + all revealed data (predictions, ratings, completion summary, positions, filed stories). Like reviewing a graded exam. Sender always sees full form. Receiver unlocks progressively — completed stories show full data, incomplete stories are locked/greyed.

| Element | Value | Context |
|---------|-------|---------|
| Letter composition CTA | "Prepare a Letter" | Doc page header, primary action row (not overflow menu, D22) |
| Prediction prompt | "How well will [Receiver] understand this?" | Composition, per story, `RatingButtons` 0-10 (reuse existing component) |
| Understanding prompt | "How well do you believe you understand this story in the way [Author] means it?" | Letter reading, per story, `RatingButtons` 0-10 (reuse existing component) |
| Gap display | Dual numbers (receiver rating / author prediction) + "A gap of N — worth noting" | After receiver commits, per story |
| Position buttons | ✕ (disagree) / ? (maybe) / ✓ (agree, dropdown: somewhat/agree/strongly) | Per point, after story rating |
| Author position locked | "🔒 Author's position hidden — engage to reveal" | Until receiver takes position or files story |
| Story filing CTA | "+ Add a story — optional" (dashed border button) | Per point, within letter reading |
| Progress bar | Segmented bar showing story N of M | Top of letter reading view |
| Point sorting | Points sorted by gap size (largest first) | Letter completion summary |
| Ready for live CTA | "Ready for /live? Start with [highest-gap story]" | Bottom of letter completion summary |
| Letter status (sender view) | "Sent · Not started · In progress (N/M) · Completed" | Sender's letter list (D46) |
| Completion summary header | "Letter Summary — N stories, M points" | Post-letter completion view |
| Preview banner | "This is a preview — the receiver will see this" | Preview mode (D42), shown at top of letter reading flow |

---

## Resolved Decisions (from conversation research 2026-03-22/23 + prototype iteration)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Slider on story cards in feed or only inside letter? | Only inside letter. The letter is the container. Orphaned slider on feed cards lacks context and addressability. |
| D2 | Questions as part of the flow? | Dropped. Gradual reveal (story first, then points sequentially, commit before seeing next) does the anti-anchoring work that questions were trying to do. |
| D3 | Understanding mandatory or optional? | Mandatory within letter. You can choose not to open a letter, but once you start reading, understanding rating per story is required. |
| D5 | Author "counter-assesses" or "predicts"? | Predicts. The author predicts BEFORE the receiver reads, not after. This is sealed-bid, not reactive. The prediction reveals the author's calibration, not their judgment of the receiver's answer. |
| D6 | UX feel? | Ritual, not feed. Deliberate slowness. Full-screen, one story at a time. Gamification explicitly rejected. Particle effects on commitment moments (from prototype) are acceptable — they mark the weight of the moment, not gamify it. |
| D7 | Receiver can revise rating after gap reveal? | No. Rating is committed. Revising after seeing the prediction defeats the purpose. |
| D8 | Multiple receivers per letter? | Yes for 1-to-1 (separate letter per receiver, each with unique predictions). 1-to-many letters have one "typical reader" prediction shared across all receivers. See D40. |
| D9 | Dot picker or continuous slider? | Discrete 0-10 buttons. Reuse existing `RatingButtons` component (`src/app/components/partners/shared.tsx`). Slider = live continuous signal (/live free mode). Buttons = async deliberate assessment (letters). Not a new component. |
| D10 | Author position visible or locked? | Locked until receiver engages (takes position OR files story). Incentivizes engagement. Unlocking is animated (fade-in). |
| D11 | Three-button or 7-point Likert? | Three-button (✕/?/✓) with agree-degree dropdown on ✓. Lower cognitive load. From prototype. |
| D12 | Gap map = list or grid? | V1: simple per-story/per-point comparisons (dual numbers, positions side by side). Full understanding x agreement grid deferred to P624 (D43). |
| D13 | Relationship to P551 clarity docs? | Unified in V1. Letter = immutable snapshot of a doc, delivered as a reading experience with assessment. Doc = mutable compose/edit surface where stories accumulate. "Prepare a Letter" on doc page triggers composition wizard. Separate specs, shared grid component, unified data model (5 new tables + 4 column additions). |
| D14 | Can receiver file stories? | Yes. On any point — to explain position, explain false premise, or explain non-position. Uses P560 story-filing mechanic inline. |
| D15 | Account required to read a letter? | For 1-to-many letters from public docs: no — anonymous access, registration gate at EXIT (after completion summary). For 1-to-1 letters: yes — authentication required (D47). Local state (sessionStorage) holds all data until persisted. |
| D16 | How does facilitator share the letter? | Two paths: (a) Link with optional QR code — anonymous access (1-to-many, public docs only), email entered at save gate. (b) Email (multiple emails separated by comma) — facilitator enters receiver's email(s) at composition (1-to-1). Email pre-filled at save gate, one click to persist. |
| D17 | What is the feature called? | "Clarity Letter." Not "letter," not "doc in reading mode." Clarity Letter is a first-class entity — related to clarity docs (P551) but distinct. |
| D19 | Bidirectional letter — receiver adds stories? | V1 optional: after completing a letter, receiver sees "Add a story" CTA on each point. Receiver files own stories + sets predictions. Sender views on completion summary. V1.5: sender formally reads + rates receiver's stories (sealed-bid Phase 4). |
| D20 | Workshop shared view? | Facilitator projects their screen (sender's completion summary = group view). Real-time: facilitator's screen updates as participants submit (Supabase Realtime). No privacy feature needed V1. |
| D21 | Unified calibration data? | One `story_verifications` table serves both /live and letters. Add `source TEXT DEFAULT 'live'`, `verified BOOLEAN DEFAULT true`, `sort_order INTEGER`. Letters write with `source='letter'`, `verified=false`. When pair does /live on same story: new row with `source='live'`, `verified=true`. Grid shows both: dashed dot (letter) → solid dot (live) → arrow = movement. |

| D22 | "Send as Letter" button placement vs Share button? | Complementary, not competing. Share = copy URL/embed (utility, icon button). CTA is primary in action row (the whole point of docs). No overflow menu. **Renamed:** "Send as Letter" is now "Prepare a Letter" — the old name implied immediate dispatch; the new name reflects the preview-before-send flow (D42). |
| D23 | Story visibility in letter snapshots? | Per-story. Stories have individual `visibility` (immutable, P586). A private doc can contain both public and private stories. Snapshot preserves each story's visibility. No doc-level override. |
| D24 | New content created from letter inherits parent visibility? | Yes. Points created from stories inherit `story.visibility`. Stories created from points inherit `point.visibility`. Pre-req P607 implements this. |
| D25 | 1-to-1 letter URL without valid token? | Returns 404. No existence leak — don't distinguish "doesn't exist" from "you can't access." Same security pattern as token-gated resources. |
| D26 | `source_letter_id` on `clarity_sessions`? | Include in P581 migration. Nullable FK to `clarity_letters`. Enables future "start /live from letter" feature without schema changes. One column + one index. |
| D27 | Letter results visible to sender? | In-scope for P581. Sender must see sent letters + completion status + results. Without this, sending has no purpose. |
| D28 | Where do sent/received letters live in the app? | Within Clarity Docs page — "Letters" section showing sent + received. Letters are always sourced from docs, so doc page is the natural home. No separate `/letters` nav item V1. |
| D29 | 1-to-1 letter auth flow? | Reuse Agreement invitation pattern (P422/P488/P527): token-based access + email lookup + one-click registration. Existing user: magic link (no re-auth). New user: `create-and-sign` edge function pattern adapted to `create-and-open-letter`. Receiver can also access from within app (doc page shows received letters) — email is not the only entry. Authentication always required (D47). |
| D30 | 1-to-many letter auth flow? | Reuse Pledge flow pattern: guest reads → completes → registration gate at end. sessionStorage holds intent. Email input → magic link → results persist on verification. Available only from public docs. |
| D31 | Letter has two views? | Yes. **View form** (receiver's sequential reading experience — one story at a time, rating gate per story, sealed-bid). **Full form** (doc snapshot + all data from both parties — predictions, ratings, completion summary, positions, filed stories). Sender always sees full form. Receiver sees full form only after completing view form. |
| D32 | Partial completion → partial full form access? | Yes. Receiver who completes 3 of 5 stories can see full form for stories 1-3 (revealed data). Stories 4-5 remain locked/greyed in full form. Progressive unlock. |
| D33 | P590 design system applies to all P581 UI? | Yes. All buttons use shadcn `<Button>` with proper variants. Lock/globe icons for visibility. Touch targets ≥ 44px. Amber for private, blue for public banners. |
| D34 | Rating input for letters? | Discrete 0-10 buttons — reuse existing `RatingButtons` component. Slider is for /live continuous signal only. See D9. |
| D35 | Grid quadrant labels? | Deferred to P624 (D43). Pre-verification (letter): bottom quadrants "Potential false agreement/disagreement ⚠️". Post-verification (/live): upper quadrants "Verified agreement/disagreement ✓". Understanding (Y-axis) drives the transition from bottom to top. |
| D36 | Point-before-story ordering? | Conditional on point count: **1 point** → story first, then point (story provides context for the claim it supports). **2+ points** → first point (anti-point, highest priority as set by sender in doc) appears before story for commit-before-context (Clarity Flip mechanic), then story, then remaining points. Sender controls implicitly through doc structure (point ordering via arrows). Vocabulary glosses optional for abstract terms. "I need context" escape valve tracked as content quality metric. |
| D37 | Point engagement model? | B: must position OR file story explaining why not. Can't skip silently. Existing "add a story" handles the explanation — no extra UI prompts needed. |
| D38 | Verification outcome states? | Three outcomes: flip, fork, verified agreement/disagreement. Grid triages (WHERE), stories diagnose (WHAT kind). No mechanical classification of flip types — behavior (paraphrase/story content) encodes the distinction. See definitions.md > Verification Outcome States. |
| D39 | "Can't position because don't understand"? | Handled by existing story filing. User taps "?" → "add a story" → explains in natural language. No dual-track prompt, no extra buttons. Story content reveals comprehension gap vs opinion uncertainty. |
| D40 | 1-to-1 vs 1-to-many letter mode differences? | See table below. |
| D42 | Preview letter before sending? | Yes. Sender can preview the full reading flow with "This is a preview" banner before committing. Preview shows exactly what the receiver will see (stories, points, ordering). Sender clicks "Seal & Send" to commit, or goes back to edit. |
| D43 | Grid visualization in P581? | No. Full understanding x agreement grid carved out to P624. P581 uses simpler per-story/per-point comparisons (dual numbers, positions side by side). Grid is a future visualization layer. |
| D44 | Where do insights live? | Insights live on points (position data) and stories (understanding data). Grid is a future visualization layer (P624) that renders this data spatially. The data model is the same — only the display differs between P581 and P624. |
| D45 | "Private/public letter" language? | Dropped. Use "1-to-1 letter" (specific person, email delivery) and "1-to-many letter" (shareable link, public docs only). Private doc → 1-to-1 only. Public doc → both 1-to-1 and 1-to-many. |
| D46 | Sender letter state tracking? | Sender sees all letter states: Sent (not started), In progress (N/M stories rated), Completed. For 1-to-many: also Views count. |
| D47 | Anonymous access scope? | Anonymous access (no account required) applies only to 1-to-many letters from public docs. 1-to-1 letters always require authentication. |
| D48 | Registration + terms acceptance timing? | **1-to-1:** "Open the Letter" on cover screen = account creation + terms acceptance in one click (Agreement pattern). Receiver is registered before reading. Terms text below button: "By opening, you accept the Terms of Service." **1-to-many:** registration gate at end. "Save your results?" with email → redirects to existing signup flow (terms already included). No custom terms UI needed. |
| D49 | Understanding rating prompt wording? | "How well do you believe you understand this story in the way [Author] means it?" — names the author's intent, not just self-assessment. Measures calibration against someone else's meaning. |
| D50 | Can receiver revise anti-point position after reading story? | No. Forward-only. Initial position is locked — it IS the data. Receiver can file a story to explain how their view changed after reading, but the original position stays on record. The delta between "I agreed blind" and "after reading I would disagree" is captured in the story, not by overwriting the position. |
| D51 | Unregistered 1-to-1 submissions? | Not possible — D47 + D48 guarantee 1-to-1 receivers are always registered before reading. For 1-to-many: sender sees anonymous completion count ("14 completed, 8 saved") but no individual data for unregistered users. |

### D40: 1-to-1 vs 1-to-Many Letter Differences

| Mechanic | 1-to-1 letter | 1-to-many letter |
|---|---|---|
| **Delivery** | Sent to ONE specific person via email (token-gated link). Same content can be sent as separate 1-to-1 letters to different people. | Shareable link — anyone can open. Available only from public docs. |
| **Prediction** | Per-receiver: "How well will [Alex] understand this?" | Single "typical reader": "How well will readers understand this?" |
| **Sealed-bid reveal** | Identical mechanic. Gap = \|prediction - self_rating\|. | Identical mechanic. Same gap formula. |
| **Gap reveal copy** | "Author predicted: N / You rated: M" | Same — neutral framing works for both. |
| **Per-completion summary** | One completion summary per receiver, personalized prediction comparison. | One completion summary per receiver, compared against the single typical-reader prediction. |
| **Sender results view** | Per-receiver: "Alex rated 8, you predicted 6. Gap: 2." Named, identifiable. | Per-completion: "Reader 1 rated 3, you predicted 6. Gap: 3." Anonymous until registered. Count: "Views: N / Completions: N / Saved: N." |
| **Realtime** | Supabase Realtime subscription (bounded receiver set). | Polling every 30s (unbounded receivers). |
| **Status tracking** | Per-receiver: Sent / Opened / In progress / Completed. | Aggregate: Views: N / Completions: N / Saved: N. |
| **Registration** | Receiver authenticates via token + magic link / one-click registration (Agreement pattern). Always required (D47). | Registration gate at EXIT after completion summary (Pledge pattern). Anonymous access only for 1-to-many (D47). |
| **Letters received (in docs)** | Shows only after receiver authenticates + completes. | Shows only after receiver registers + saves. |
| **Per-story accumulation** | Not in V1. Data model supports it — surfaced in P619 when N>=5 completions. | Same — deferred to P619. |

**Composition wizard adaptation (2-step + preview model):**
- Step 1: add receivers — mode selector: "Specific people" (1-to-1) vs "Anyone with a link" (1-to-many, public docs only)
- Step 2: set predictions — per-receiver predictions (1-to-1) vs single prediction (1-to-many)
- Preview: sender previews full reading flow with "This is a preview" banner (D42) before committing
- Letter visibility follows doc visibility: private doc = 1-to-1 only; public doc = both 1-to-1 and 1-to-many available (D45)

---

## Prototype Reference

Working prototypes built in claude.ai (2026-03-23) inform this spec:

1. **Letter prototype (full flow):** Cover → story reading → dot picker rating → gap reveal → sequential points with three-button row → author position lock/unlock → story filing → letter completion summary with linked stories + "Ready for /live?" CTA. (Prototype included quadrant plot — deferred to P624 D43.)

2. **Grid prototype (dark, interactive):** Understanding × agreement grid with radial gradient background, particle burst on placement, ghost dot on hover, toggleable X-axis, monospace readout. Y-axis 0-10 (no negatives), X-axis -5 to +5.

3. **Screenshot variations (4):** Progress tracking bar, dual progress bars for gap reveal, "commit → reveal speaker's score" sealed-bid flow, feed-style story cards with gap callouts.

Key patterns from prototypes: dot picker (not slider), three-button (not Likert), author lock until engagement, progress bar, dual-number gap reveal.

---

## Reuse Analysis (from P590/P581 coordination session)

**Agreement invitation flow (P422/P488/P527):** See Technical Analysis → Key patterns already established for file paths and reuse details.

**Pledge flow:** See Technical Analysis → Key patterns already established for sessionStorage + magic link reuse.

**P590 design system:** Applies per D33 — shadcn Button variants, amber/blue banners, ≥44px touch targets.

---

## Out of Scope

- Notifications for letters or assessments (P573)
- /live simplification or gap-map-to-/live integration (P562)
- AI-assisted point extraction (P572)
- Story reputation / bridging value scoring (future)
- Mirror agent prediction (future)
- Reply letters / ping-pong calibration (future)
- Understanding x agreement grid visualization (P624) — P581 uses simpler per-story/per-point comparisons
- Replacing JourneyToUnderstanding in /live with the grid (future migration, P624)
- Async /live mode (documenting external paraphrases) (future)
- Letter editing / versioning — edit the source doc, send new letter as new snapshot (future V1.5)
- "Create your own letter" CTA on completion summary — remix flow for Letter 2 (future post-V1)
- Three-letter workshop sequence automation — V1 is manual facilitation with individual letters
- Value assessment / PWIW screen after letter completion — Letter 3 (future)
- Distributor CTA on Letter 3 completion (future)

---

## ASCII Flow: "Sealed Slides" (v2 — updated from /ascii-flows)

### COMPOSITION (Sender — 3 steps: receivers, predictions, preview + seal)

```
DOC PAGE — sender clicks "Prepare a Letter" in header

╔══ Step 1 of 3 — Who receives this letter? ══════╗
║                                                   ║
║  ┌──────────────────┐  ┌──────────────────────┐  ║
║  │ ● Specific people│  │ ○ Anyone with a link │  ║
║  │  Email delivery  │  │  Shareable link + QR │  ║
║  └──────────────────┘  └──────────────────────┘  ║
║                                                   ║
║  To: colleague@example.com [×]  partner@example.com [×]  + Add   ║
║                                                   ║
║  [← Cancel]                    [→ Continue]       ║
╚═══════════════════════════════════════════════════╝

╔══ Step 2 of 3 — Set your predictions ════════════╗
║  Story 1 of 4  ▸░░░                               ║
║                                                    ║
║  "False consensus in decision framing"             ║
║                                                    ║
║  How well will Jan understand this?                ║
║  ①  ②  ③  ④  ⑤  ⑥  ⑦  ⑧  ⑨  ⑩                ║
║                 ↑ 6                                ║
║                                                    ║
║  [← Back]                       [Story 2 →]       ║
╚════════════════════════════════════════════════════╝

┌─ ⚑ PREVIEW — the receiver will see exactly this ─┐
│                                                    │
│  (full reading flow shown as receiver would see)   │
│                                                    │
│  [← Edit Predictions]        [Seal & Send →]      │
└────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════╗
║                                                      ║
║         ✦  Seal Your Clarity Letter  ✦               ║
║                                                      ║
║  ┌──────────────────────────────────────────────┐   ║
║  │  To: Jan Kovač, Nejc Čuk                     │   ║
║  │  4 stories · 6 points · Predictions sealed   │   ║
║  └──────────────────────────────────────────────┘   ║
║                                                      ║
║  Once sealed, your predictions lock.                 ║
║  You cannot revise them after the receiver begins.   ║
║                                                      ║
║  [← Back to Preview]                                ║
║                                                      ║
║           [  ✦ Seal & Send Letter  ]                 ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

### READING — COVER

```
╔══════════════════════════════════╗
║         ✉                        ║
║   A CLARITY LETTER               ║
║   FOR JAN KOVAČ                  ║
║   From Slava Ladischenski        ║
║   4 stories · ~ 8 minutes        ║
║                                  ║
║   [  Open the Letter  ]          ║
║   By opening, you accept the ToS ║
╚══════════════════════════════════╝
```

### READING — PER STORY (2+ points: anti-point first)

**Step 1: Cold anti-point** (point 1 appears alone, no story context)

```
━━━━░░░░░░░░░░░░  Story 1 of 4

"Partners who avoid difficult conversations
 are choosing short-term comfort over trust."

Where do you stand?
[  ✕ Disagree  ]  [  ? Maybe  ]  [  ✓ Agree  ]

🔒 Slava's position hidden — engage to reveal
+ Add a story (optional)
```

**Step 2: Position revealed + story fades in**

```
━━━━░░░░░░░░░░░░  Story 1 of 4

Point 1: You ✕ Disagree  ·  Slava ✓ Agrees

── Story fades in below ──────────────────
"I've watched twelve co-founder pairs
 describe a moment they knew was a false
 agreement — and stayed quiet anyway..."

[  I've read it →  ]
```

**Step 3: Understanding rating**

```
How well do you believe you understand
this story in the way Slava means it?

①  ②  ③  ④  ⑤  ⑥  ⑦  ⑧  ⑨  ⑩

[  Submit Rating →  ]
```

**Step 4: Gap reveal**

```
Your rating          Slava's prediction

      8          /          3

"A gap of 5 — both guessing,
 neither knows yet."

[  → Continue to remaining points  ]
```

**Step 5: Remaining points** (2, 3... one at a time, same pattern as Step 1)

**Step 6: Story transition**

```
     ████░░░░░░░░  Story 1 complete

     ✦

     [  → Next story  ]
```

### READING — PER STORY (1 point: story first)

For stories with only 1 point: Story → Read → Rate understanding → Gap reveal → Point → Position. Same screens as above but story appears first, point after rating.

### READING — COMPLETION

**Celebration gate**

```
╔══════════════════════════════════════╗
║                                      ║
║    ✦  You've completed it.  ✦        ║
║                                      ║
║  4 stories read. 6 points engaged.   ║
║                                      ║
║    [  → See Your Letter Summary  ]   ║
║                                      ║
╚══════════════════════════════════════╝
```

**Completion summary** (cards sorted by gap size, largest first)

```
╔══ Letter Summary ════════════════════════╗
║                                          ║
║  ★ Story 1 · "False consensus"           ║
║  You: 8  ·  Slava: 3  ·  Gap: 5         ║
║  Pt1: You ✕ vs Slava ✓                  ║
║  Pt2: You ✓ vs Slava ✓                  ║
║                                          ║
║  Story 4 · "Partner dynamics"            ║
║  You: 4  ·  Slava: 8  ·  Gap: 4         ║
║                                          ║
║  Story 2 · "Briefing trap" · Gap: 1     ║
║  Story 3 · "Alignment" · Gap: 0 ✓      ║
║                                          ║
║  [Ready for /live? Start Story 1 →]     ║
║                                          ║
║  ── Save your results? ──────────────   ║
║  [your@email.com]  [Save & Sign Up]     ║
╚══════════════════════════════════════════╝
```

### SENDER RESULTS VIEW

**Letters section on doc page** (below stories, no tab)

```
── Sent Letters ──────────────────────────
Jan Kovač  · Mar 28 · ✓ Completed  [View]
Nejc Čuk   · Mar 28 · ◑ 2/4
Workshop   · Mar 27 · 👥 14 responses [View]
── Received Letters ──────────────────────
From Sarah · Mar 26 · 2 stories · Not started
```

**Per-letter results page** (FocusHeader, back to doc)

```
┌─ Results: Jan Kovač ─────────────────────┐
│  ← Back to Doc                            │
│                                           │
│  Story 1 · "False consensus"              │
│  Jan: 8  Your prediction: 3  Gap: 5 ★    │
│  Pt1: Jan ✕  You ✓  · Pt2: Jan ✓  You ✓ │
│  📖 Jan's story: "In my experience..."   │
│                                           │
│  Story 2 · "Briefing trap"               │
│  Jan: 7  Your prediction: 6  Gap: 1      │
│                                           │
│  [→ Start /live on Story 1]              │
└───────────────────────────────────────────┘
```

---

## UX Design

### Full Form View (D31/D32)

**Who sees it:**
- Sender: always (from docs page → tap sent letter)
- Receiver: after completing all stories, OR progressively for completed stories (D32)

**Layout:** Doc-snapshot style — all stories visible (like the doc detail page), but with assessment data overlaid. FocusHeader with "Back to Docs." Per-story: story content + understanding dual numbers + gap. Per-point: receiver position alongside author position. Incomplete stories greyed/locked: "Complete this story to see results." Tap locked story → returns to view form at that story.

**Route:** `/letter/:id` (or `/letter/:id?token=xxx` for 1-to-1). Focus page — add to `focusRoutes` in bottom-nav.tsx, use FocusHeader.

### Edge Cases (All Flows)

| Scenario | Behavior |
|---|---|
| 1-to-1 letter, no token in URL | 404 page (D25) |
| 1-to-1 letter, expired token | "This letter has expired. Contact [sender name] for a new one." |
| 1-to-1 letter, wrong user authenticated | "This letter wasn't sent to you." + Back to docs |
| Letter with 0 stories (sender deleted all after sending) | "This letter has no content." — shouldn't happen (sealed at send) but defensive |
| Receiver closes browser mid-reading | sessionStorage preserves all local state (ratings, positions). Return to same URL → resume from last completed story |
| Network error during rating submit | Toast: "Couldn't save. Retrying..." + auto-retry once. If fail: "Save failed. Your progress is stored locally." |
| Receiver completes 1-to-many letter, doesn't register | Letter completion summary shown. "Save your results?" gate. If dismissed: data is in sessionStorage. Return later → registration gate reappears |
| Sender views letter with 0 completions | Full form shows sent stories with "Waiting for [receiver] to respond" per story. No completion data. |
| Sender views letter with partial completion | Shows completed data for stories receiver finished. Remaining: "Not yet rated by [receiver]" |
| Workshop: 15 receivers, some complete, some don't | Sender completion summary shows data only for completed receivers. Count: "3 of 15 completed" |

### Accessibility

**Keyboard navigation:**
- Tab order: progress bar (informational, not focusable) → story content → "I've read it" → rating buttons (0-10, arrow keys to move between) → submit → position buttons (✕/?/✓, arrow keys) → "Add a story" → "Next"
- Escape from composition wizard → back to doc page
- Enter on any CTA button triggers it

**Screen reader:**
- Progress bar: `aria-label="Story 1 of 3"`
- Rating buttons: `aria-label="Rate your understanding, 0 to 10"`, each button `aria-label="Rate [N]"`
- Gap reveal: `aria-live="polite"` region announces "Your rating: [N]. [Sender]'s prediction: [M]. Gap: [G]"
- Position buttons: existing PositionButtons component already has ARIA (aria-pressed, group label)
- Author position lock: `aria-label="[Sender]'s position hidden until you engage"`
- Author position reveal: `aria-live="polite"` announces "[Sender] [position]"

**Color contrast:** All text meets WCAG AA (4.5:1).

### Responsive Design

**Mobile (320px-639px):**
- All flows: single column, full-width
- Composition wizard: stacked steps, full-screen (not modal)
- Reading flow: story text fills width, rating buttons wrap if needed
- Letters section in docs: stacked cards, full-width

**Tablet (640px-1023px):**
- Composition wizard: centered card (max-w-lg)
- Reading flow: centered content (max-w-2xl, matching doc detail page)
- Letters section: 2-column grid for sent/received

**Desktop (1024px+):**
- Same as tablet (content stays centered at max-w-2xl)
- Composition step 2 (predictions): stories and prediction controls side by side if space allows

### UI Contract Additions

| Element | Value | Context |
|---------|-------|---------|
| Expired token message | "This letter has expired. Contact [sender name] for a new one." | 1-to-1 letter, token expired |
| Wrong user message | "This letter wasn't sent to you." | 1-to-1 letter, authenticated as different user |
| Engagement nudge | "Take a position or explain why you can't" | Shown once per point if user tries to skip (D37) |
| Partial lock label | "Complete this story to see results" | Full form view, uncompleted story (D32) |
| Waiting label | "Waiting for [receiver] to respond" | Sender views letter, no completion yet |
| Network error toast | "Couldn't save. Your progress is stored locally." | After retry failure |
| Resume prompt | "Welcome back. You left off at Story [N]." | Returning to incomplete letter |
| Empty letters state | "No letters yet. Send one from any doc using 'Prepare a Letter'." | Docs page, letters section empty |
| Letter cover time estimate | "~ [N] minutes" | Cover screen, calculated as stories × 2 min |

---

## Technical Architecture

### Technical Analysis

#### Current Code State

**Dependency chain (all shipped):** P586 (visibility & privacy foundation) -> P551 (clarity docs) -> P607 (visibility inheritance) -> P581 (this feature).

**Database — existing tables touched by P581:**

| Table | Current State | P581 Change |
|-------|--------------|-------------|
| `story_verifications` | 7 columns; `story_id`/`version_id` nullable since P413; RLS: public read, auth insert; already in `supabase_realtime` publication | Add 3 columns: `source TEXT DEFAULT 'live'`, `verified BOOLEAN DEFAULT true`, `sort_order INTEGER` (D21 decision) |
| `clarity_sessions` | Has `creator_profile_id`, `joiner_profile_id`, `live_state` | Add `source_letter_id UUID REFERENCES clarity_letters(id)` + index (D26) |
| `clarity_docs` | P551: `id`, `owner_id`, `title`, `visibility`, timestamps; RLS: public-read/owner-write | No schema change. UI gains "Prepare a Letter" button + "Letters" section |
| `doc_stories` | P551: junction table `(doc_id, story_id)` + `position`, `point_config` | No schema change. Read-only from letters (snapshot copies `position` + `point_config` into `letter_story_snapshots`) |
| `story_versions` | Immutable snapshots, auto-created by trigger on `stories` INSERT/UPDATE | No schema change. Letters reference existing `version_id` at snapshot time |

**Existing services relevant to P581:**

| Service | File | Pattern |
|---------|------|---------|
| `docsService` | `src/app/data/docs-service.ts` (real only, no mock) | Direct Supabase queries; used by `doc-detail-page.tsx`, `docs-list-page.tsx` |
| `calibrationService` | `src/app/data/calibration-service-real.ts` | Interface-based pattern; writes to `story_verifications`; maps via `mapVerificationFromDb()` |
| `agreementsService` | `src/app/data/agreements-service-real.ts` | Token-based invitation, email lookup, batch profile fetch, SECURITY DEFINER RPC for token validation |
| `storiesService` | `src/app/data/stories-service-real.ts` | Story CRUD, `getStoryVersion()`, visibility-aware queries |
| `pointsService` | `src/app/data/points-service.ts` | Position CRUD, 7-point Likert, batch point loading |

**Key patterns already established:**

1. **Token-gated invitation** (P422/P488/P527): `clarity_agreements.invitation_token` + `invitation_expires_at` + SECURITY DEFINER RPC `get_agreement_by_token` for anon access. Reusable for 1-to-1 letter token validation.
2. **One-click registration** (P527): `create-and-sign` edge function creates auth user + profile + accepts agreement atomically. Adaptable to `create-and-open-letter`.
3. **Fire-and-forget email** (P422): `invokeAgreementEmails()` calls edge function via `supabase.functions.invoke()`. Pattern in `src/lib/agreement-emails.ts`.
4. **sessionStorage for anonymous intent** (Pledge flow): `sign-pledge-page.tsx` stores pending data in sessionStorage, persists on auth callback. Reusable for 1-to-many letter completions.
5. **Sealed-bid mechanic**: No existing implementation — new for P581. But the pattern is simple: prediction stored at composition time, withheld from receiver queries until they submit their rating.

#### Reuse Inventory (Mandatory)

**Components:**

| Component | File | Reuse in P581 |
|-----------|------|--------------|
| `RatingButtons` | `src/app/components/partners/shared.tsx` | Prediction input (composition), understanding rating (reading). Already 0-10, 44px touch targets, ARIA labels. |
| `PositionButtons` | `src/app/components/shared/PositionButton.tsx` | Three-button pattern (disagree/maybe/agree) + intensity dropdown. Already has ARIA, blue active states. |
| `FocusHeader` | `src/app/components/layout/focus-header.tsx` | Letter reading page, letter results page, composition wizard. All are focus pages. |
| `ShareDialog` | `src/app/components/shared/ShareDialog.tsx` | 1-to-many letter link sharing + optional QR code. Already has copy-URL + embed sections. |
| `StoryCardDetail` | `src/app/components/social/StoryCardDetail.tsx` | Story content rendering within letter reading flow and full form view. |
| `DocHeader` | `src/app/components/docs/doc-header.tsx` | "Prepare a Letter" button added to existing doc header action row. |
| `DocPrivacyBanner` | `src/app/components/docs/doc-privacy-banner.tsx` | Visibility context in composition wizard preview. |
| `DocBlockControls` | `src/app/components/docs/doc-block-controls.tsx` | Point visibility controls (hidden/shown) already used in doc detail. |
| `CertificatePageShell` | `src/app/components/layout/certificate-page-shell.tsx` | Parchment background pattern for letter cover screen. |
| `ClarityPageLoader` | `src/components/ui/clarity-loader.tsx` | Loading state for letter pages. |
| `PersonAvatar` / `GravatarAvatar` | `src/components/ui/person-avatar.tsx`, `src/components/ui/gravatar-avatar.tsx` | Sender/receiver avatars on cover, completion summary, sender results. |

**Pages (pattern reference, not direct reuse):**

| Page | File | Pattern to Reuse |
|------|------|-----------------|
| `AcceptAgreementPage` | `src/app/pages/accept-agreement-page.tsx` | Token validation flow, `PageState` enum (`loading`/`invalid`/`unauthenticated`/`partner`/`wrong-user`), auto-accept intent via localStorage, P488 hash cleanup |
| `CreateStoryPage` | `src/app/pages/create-story-page.tsx` | Triggered from letter reading via `?pointId=X` for inline story filing (D14) |
| `DocDetailPage` | `src/app/pages/doc-detail-page.tsx` | "Prepare a Letter" button added here; "Letters" section below stories |
| `DocsListPage` | `src/app/pages/docs-list-page.tsx` | "Received Letters" section added here |
| `SignPledgePage` | `src/app/pages/sign-pledge-page.tsx` | sessionStorage pattern for anonymous 1-to-many completions |

**Edge Functions:**

| Function | File | Reuse |
|----------|------|-------|
| `send-agreement-emails` | `supabase/functions/send-agreement-emails/index.ts` | HTML email template, Mailgun integration. Clone and adapt to `send-letter-emails`. |
| `create-and-sign` | `supabase/functions/create-and-sign/index.ts` | Atomic user creation pattern. Clone and adapt to `create-and-open-letter`. |

**Hooks:**

| Hook | File | Reuse |
|------|------|-------|
| `useAuth` | `src/auth/AuthContext.tsx` | Auth state for gating 1-to-1 access |
| `useVerificationGate` | `src/app/hooks/useVerificationGate.ts` | Ensuring sender is verified before composing |
| `useRemovePositionGuard` | `src/app/components/shared/remove-position-dialog.tsx` | Position cascade warnings when removing positions in letter context |

**Utilities:**

| Utility | File | Reuse |
|---------|------|-------|
| `invokeAgreementEmails` | `src/lib/agreement-emails.ts` | Pattern for `invokeLetterEmails` — fire-and-forget edge function call |
| `logDbError` | `src/app/data/db-error-logger.ts` | Standard error logging for all new service methods |
| `analytics` (Mixpanel) | `src/lib/mixpanel.ts` | Event tracking for letter composition, reading, completion |
| `triggerConfetti` | `src/lib/confetti.ts` | Celebration on letter completion |
| `resolveDocShortCode` | `src/app/data/short-links.ts` | Pattern for letter short codes if needed |

**Types:**

| Type | File | Reuse |
|------|------|-------|
| `StoryVerification`, `StoryVerificationWithProfiles` | `src/app/types/index.ts` | Extended with `source`, `verified`, `sortOrder` fields |
| `ClarityDoc`, `DocStory`, `DocPointConfig` | `src/app/types/index.ts` | Read-only reference for snapshot creation |
| `ContentVisibility` | `src/app/types/index.ts` | Visibility for letter-created stories |
| `PositionType` | `src/app/types/index.ts` | Positions in letter reading flow |

---

### Architecture Decisions

**AD1: Letters service pattern — real-only (like docs), not interface-based.**

Letters are a new feature with no legacy mock layer. Following the P551 `docsService` pattern: single real implementation file, no interface/mock split. Service file: `src/app/data/letters-service.ts`.

*Trade-off:* Unit tests must mock at the Supabase client level (same as docs). Acceptable because the feature is new and has no test baseline to maintain.

**AD2: Four new tables + three column additions — single migration file.**

All schema changes in one idempotent migration (`YYYYMMDDHHMMSS_p581_clarity_letters.sql`). The tables are:

```
clarity_letters
  id UUID PK
  source_doc_id UUID NOT NULL -> clarity_docs(id)
  sender_id UUID NOT NULL -> profiles(id)
  mode TEXT NOT NULL ('one-to-one' | 'one-to-many')
  status TEXT NOT NULL DEFAULT 'draft' ('draft' | 'sealed' | 'expired')
  sealed_at TIMESTAMPTZ
  created_at TIMESTAMPTZ DEFAULT now()

letter_deliveries
  id UUID PK
  letter_id UUID NOT NULL -> clarity_letters(id) ON DELETE CASCADE
  receiver_email TEXT  -- nullable for 1-to-many (anonymous)
  receiver_profile_id UUID -> profiles(id)  -- nullable until registered
  invitation_token UUID DEFAULT gen_random_uuid()  -- for 1-to-1
  invitation_expires_at TIMESTAMPTZ  -- for 1-to-1
  status TEXT NOT NULL DEFAULT 'sent' ('sent' | 'opened' | 'in_progress' | 'completed')
  stories_rated INTEGER DEFAULT 0  -- for progress tracking (N of M)
  opened_at TIMESTAMPTZ
  completed_at TIMESTAMPTZ
  created_at TIMESTAMPTZ DEFAULT now()

letter_story_snapshots
  letter_id UUID NOT NULL -> clarity_letters(id) ON DELETE CASCADE
  story_id UUID NOT NULL -> stories(id)
  version_id UUID NOT NULL -> story_versions(id)
  position INTEGER NOT NULL  -- copied from doc_stories.position at seal time
  point_config JSONB DEFAULT '{}'  -- copied from doc_stories.point_config at seal time
  visibility TEXT NOT NULL  -- copied from stories.visibility at seal time
  PRIMARY KEY (letter_id, story_id)

letter_predictions
  id UUID PK
  letter_id UUID NOT NULL -> clarity_letters(id) ON DELETE CASCADE
  delivery_id UUID -> letter_deliveries(id) ON DELETE CASCADE  -- NULL for 1-to-many (shared prediction)
  story_id UUID NOT NULL -> stories(id)
  prediction SMALLINT NOT NULL CHECK (0-10)
  created_at TIMESTAMPTZ DEFAULT now()
  UNIQUE (letter_id, delivery_id, story_id)

letter_point_responses  -- Security gap #5: forward-only positions, separate from point_positions
  id UUID PK
  delivery_id UUID NOT NULL -> letter_deliveries(id) ON DELETE CASCADE
  point_id UUID NOT NULL -> points(id)
  position TEXT NOT NULL  -- PositionType value
  created_at TIMESTAMPTZ DEFAULT now()
  UNIQUE (delivery_id, point_id)  -- one position per point per delivery, no UPDATE policy
```

Column additions:
- `story_verifications.source TEXT NOT NULL DEFAULT 'live'` — existing rows unaffected
- `story_verifications.verified BOOLEAN NOT NULL DEFAULT true` — existing rows unaffected
- `story_verifications.sort_order INTEGER` — nullable, letters use it for story sequence
- `clarity_sessions.source_letter_id UUID REFERENCES clarity_letters(id)` — nullable, future hook

*Trade-off:* Single migration vs. per-table files. Single file chosen because tables have FK dependencies on each other (`letter_predictions` -> `letter_deliveries` -> `clarity_letters`). Ordering within one file is simpler than managing cross-file dependencies. All DDL uses `IF NOT EXISTS` / `CREATE OR REPLACE` for idempotency.

**AD3: Sealed-bid enforcement via RLS + SECURITY DEFINER RPC.**

The core integrity requirement: receiver cannot see `letter_predictions.prediction` until they have submitted their own rating for that story. Two layers:

1. **RLS on `letter_predictions`:** SELECT policy returns rows only when: (a) viewer is the sender, OR (b) viewer is the delivery receiver AND a matching `story_verifications` row exists with `source='letter'` and `listener_id = auth.uid()` for that story+letter combination.
2. **SECURITY DEFINER RPC `get_letter_for_reading`:** Returns letter data with predictions omitted. After receiver submits rating, a separate `reveal_prediction` RPC returns the prediction for that specific story.

*Why not client-side only:* A determined user could query `letter_predictions` directly via PostgRES. RLS is the enforcement layer; client-side omission is UX, not security.

**AD4: Forward-only state machine for reading flow — sessionStorage + DB hybrid.**

Reading state tracked in two layers:
- **sessionStorage** (immediate, offline-capable): `{ letterId, currentStoryIndex, ratings: Map<storyId, number>, positions: Map<pointId, PositionType>, filedStories: string[] }`. Written on every interaction. Restored on page reload.
- **DB** (`letter_deliveries.status`, `stories_rated`)**: Updated after each story completion (not each micro-interaction). Prevents N writes per rating button click.

Forward-only contract: once a rating is submitted (written to `story_verifications`), it cannot be changed. sessionStorage tracks "pending" state; DB write is the commitment point. No DELETE or UPDATE RLS policies on letter-sourced `story_verifications`.

*Trade-off:* More complex than pure DB state, but sessionStorage is needed for anonymous 1-to-many flow anyway (no auth = no DB writes until registration).

**AD5: Realtime strategy — bounded vs. unbounded receivers.**

Per D40:
- **1-to-1:** Supabase Realtime subscription on `story_verifications` filtered by `listener_id` for that specific delivery. Bounded (1 receiver per delivery), efficient.
- **1-to-many:** Polling every 30s on `letter_deliveries` aggregate counts. Unbounded receiver set makes Realtime subscriptions impractical (one channel per anonymous reader = no identity to filter on).

Sender results page uses Realtime for 1-to-1 (live updates as receiver progresses), polling for 1-to-many (count refreshes).

**AD6: Edge function pattern — clone and adapt, not abstract.**

Two new edge functions:
- `send-letter-emails/index.ts` — cloned from `send-agreement-emails/index.ts`. Same Mailgun integration, similar HTML template, different content (letter cover CTA instead of agreement accept CTA).
- `create-and-open-letter/index.ts` — cloned from `create-and-sign/index.ts`. Same atomic user-creation pattern, adapted to open a letter delivery instead of accepting an agreement.

*Why clone, not abstract:* Per P538 decision and architecture.md precedent — "copy pattern, don't abstract." Agreement emails and letter emails have different templates, different CTAs, different token semantics.

**AD7: Letter route structure — focus pages with FocusHeader.**

| Route | Page | Type |
|-------|------|------|
| `/letter/:id` | Letter reading (view form) | Focus |
| `/letter/:id?token=xxx` | 1-to-1 letter with token | Focus |
| `/letter/:id/results` | Sender results / full form | Focus |
| `/letter/:id/compose` | Composition wizard | Focus |

All letter routes added to `focusRoutes` in `bottom-nav.tsx`. FocusHeader with back target:
- Reading: back to letter cover (or docs if entering from docs list)
- Results: back to doc detail page
- Compose: back to doc detail page

*Trade-off:* Composition wizard as separate route vs. modal/drawer. Separate route chosen for mobile-first design — full-screen wizard on 320px is necessary. Also enables URL-based resume if user navigates away mid-composition.

**AD8: `accuracy_achieved` generated column — must remain backward-compatible.**

`story_verifications.accuracy_achieved` is `GENERATED ALWAYS AS (speaker_rating = 10) STORED` (P272 changed threshold from >=8 to =10). For letters, `speaker_rating` maps to the sender's prediction and `listener_rating` maps to the receiver's self-rating. The generated column will compute `accuracy_achieved = (prediction = 10)`, which has a different semantic meaning for letters vs. /live. This is acceptable because:
- The column is only used in `update_story_understood_count` trigger (counts distinct listeners with `accuracy_achieved = true`)
- For letters, `verified = false` means letter-sourced verifications are *not* authoritative. The trigger fires but the semantic distinction is preserved in the `verified` column.
- A future P619 can add a `WHERE verified = true` filter to the trigger if letter-sourced verifications should not inflate `understood_count`.

---

### Security Review

**RLS Policies (per new table):**

- `clarity_letters` — SELECT: sender OR authenticated receiver via delivery row. INSERT: verified auth user, sender = self. UPDATE: sender only + status = 'draft' (immutable after seal). DELETE: sender only + status = 'draft'.
- `letter_deliveries` — SELECT: sender (via letter FK) OR receiver = self. INSERT: `WITH CHECK (false)` — created only by SECURITY DEFINER "Seal & Send" RPC. UPDATE: receiver can set status transitions (opened → in_progress → completed).
- `letter_story_snapshots` — SELECT: sender OR authenticated receiver (via letter → delivery chain). INSERT/UPDATE/DELETE: `WITH CHECK (false)` — written only by SECURITY DEFINER functions.
- `letter_predictions` — **Sealed-bid critical:** SELECT: sender always. Receiver sees prediction for a specific story ONLY after they have rated that story (matching `story_verifications` row with `source='letter'` and `listener_id = auth.uid()` exists for that story+letter). Per-story reveal, not all-or-nothing — matches the reading flow's gap reveal mechanic (AD3). INSERT/UPDATE/DELETE: `WITH CHECK (false)` — immutable after seal.
- `story_verifications` (extended) — Existing INSERT policy requires auth.uid(). Anonymous 1-to-many data persisted via SECURITY DEFINER at registration gate only. ⚠️ P586 story-visibility-scoped SELECT makes `source='letter'` ratings world-readable for public stories — needs `source`-aware policy to scope letter ratings to sender + receiver only.

**Authentication:**

- ✅ Token validation for 1-to-1: reuse P422/P443 SECURITY DEFINER pattern.
- ⚠️ Token expiry: add `access_token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')` to `letter_deliveries`.
- ✅ One-click registration (D48): idempotent edge function — check existing user before creating, guard: `WHERE access_token = ... AND receiver_id IS NULL`.
- ⚠️ Anonymous session binding: nonce issued at letter-open time binds session to letter, validated at registration.
- ⚠️ sessionStorage expiry: magic link callback handles empty sessionStorage gracefully.

**Authorization:**

- ⚠️ Sealed-bid: reading flow RPC must never include prediction fields until delivery `completed`.
- ⚠️ Forward-only positions (D50): use separate `letter_point_responses` table (no UPDATE policy) — cleaner than source-tagged trigger on existing `point_positions`.
- ✅ Visibility cascade (D23): snapshot stores visibility at seal time. Public story filter enforced server-side in composition RPC.
- ✅ 404 for unauthorized (D25): RLS zero rows → API returns 404.

**Input Validation:**

- Email: server-side format validation, max 20 per composition, deduplication.
- Predictions + ratings: `CHECK (value >= 0 AND value <= 10 AND value = FLOOR(value))`.
- Point ID in story filing: server validates point exists in letter snapshot.
- Vocabulary glosses: max 500 chars, plain text only.

**Data Protection:**

- Receiver email visible only to sender + receiver via RLS.
- Anonymous counts: aggregate only, no IP/device/timing data.
- Anonymous data persisted via SECURITY DEFINER at save gate under new auth.uid(), validated by session nonce.

**7 Critical Gaps (addressed in build sequence):**

1. `letter_predictions` RLS sealed-bid guarantee
2. Token expiry column on `letter_deliveries`
3. Anonymous session nonce binding
4. `story_verifications` source-aware SELECT policy for letter ratings
5. `letter_point_responses` separate table for forward-only positions
6. Write-lock on snapshot + prediction tables (`WITH CHECK (false)`)
7. Public story filter in 1-to-many composition RPC

---

### Implementation Approach

#### Build Sequence

**Phase 1: Database Schema (migration)**
1. Create migration file with all 5 new tables (`clarity_letters`, `letter_deliveries`, `letter_story_snapshots`, `letter_predictions`, `letter_point_responses`) + 4 column additions
2. Include `access_token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')` on `letter_deliveries` (Security gap #2)
3. RLS policies for all new tables — including `WITH CHECK (false)` on snapshots + predictions (Security gap #6), sealed-bid policy on `letter_predictions` (Security gap #1), source-aware policy update on `story_verifications` for `source='letter'` rows (Security gap #4)
4. SECURITY DEFINER RPC: `get_letter_by_token` (mirrors `get_agreement_by_token`) — validates token + expiry
5. SECURITY DEFINER RPC: `seal_and_send_letter` — creates snapshots + predictions + deliveries atomically, enforces public story filter for 1-to-many (Security gap #7)
6. SECURITY DEFINER RPC: `reveal_prediction` (returns prediction only after receiver rated)
7. SECURITY DEFINER RPC: `persist_anonymous_completion` — validates session nonce, persists sessionStorage data under new auth.uid() (Security gap #3)
8. Add `clarity_letters` and `letter_deliveries` to `supabase_realtime` publication
9. Run `./scripts/migrate.sh`

**Phase 2: Types + Service Layer**
7. Add TypeScript types: `ClarityLetter`, `LetterDelivery`, `LetterStorySnapshot`, `LetterPrediction`, `LetterStatus`, `DeliveryStatus`, `LetterMode`
8. Extend `StoryVerification` type with `source`, `verified`, `sortOrder` fields
9. Create `letters-service.ts` with: `createLetter()`, `sealLetter()`, `getLetterForReading()`, `getLetterForSender()`, `submitRating()`, `revealPrediction()`, `getCompletionSummary()`, `getDeliveriesForLetter()`, `updateDeliveryStatus()`
10. Create `src/lib/letter-emails.ts` (fire-and-forget invoker, mirrors `agreement-emails.ts`)

**Phase 3: Edge Functions**
11. `send-letter-emails/index.ts` — clone from `send-agreement-emails`, adapt templates
12. `create-and-open-letter/index.ts` — clone from `create-and-sign`, adapt for letter delivery

**Phase 4: Composition Flow (Sender)**
13. Add "Prepare a Letter" button to `DocHeader` / `doc-detail-page.tsx`
14. Create `/letter/:docId/compose` page — 3-step wizard (receivers, predictions, preview+seal)
15. Step 1: mode selector + email input (reuse agreement pattern for user lookup)
16. Step 2: per-story prediction input using `RatingButtons`
17. Step 3: preview with banner + "Seal & Send" button
18. Seal action: snapshot `story_versions` + `doc_stories` positions into `letter_story_snapshots`, create `letter_predictions`, fire email

**Phase 5: Letter Reading Flow (Receiver)**
19. Create `/letter/:id` page — cover screen (CertificatePageShell for feel)
20. Token validation for 1-to-1 (PageState machine from AcceptAgreementPage pattern)
21. Sequential story reading with forward-only state machine
22. Conditional ordering logic per D36 (1 point vs 2+ points)
23. `RatingButtons` for understanding rating, with sealed-bid reveal after submit
24. `PositionButtons` for point engagement (D37 — must engage before proceeding)
25. Author position lock/unlock with fade-in animation
26. Story filing integration — navigate to `CreateStoryPage` with `?pointId=X&returnTo=/letter/:id`
27. sessionStorage layer for anonymous 1-to-many completions

**Phase 6: Completion + Results**
28. Letter completion summary component (sorted by gap size)
29. "Ready for /live?" CTA linking to highest-gap story
30. Registration gate for 1-to-many ("Save your results?" with email input)
31. Sender results page (`/letter/:id/results`) with per-receiver data
32. "Letters" section on doc-detail-page (sent letters)
33. "Received Letters" section on docs-list-page

**Phase 7: Integration + Polish**
34. Add `/letter` to `focusRoutes` in `bottom-nav.tsx`
35. Realtime subscription for 1-to-1 sender results
36. Polling for 1-to-many sender results (30s interval)
37. Mixpanel events: `letter_created`, `letter_sealed`, `letter_opened`, `letter_story_rated`, `letter_completed`, `letter_results_viewed`
38. SEO component on letter pages
39. Edge case handling (expired token, wrong user, network errors, resume from sessionStorage)

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_p581_clarity_letters.sql` | 5 tables + 4 column additions + RLS + RPCs |
| `supabase/functions/send-letter-emails/index.ts` | Letter invitation + notification emails |
| `supabase/functions/create-and-open-letter/index.ts` | One-click registration for 1-to-1 letter receivers |
| `src/app/data/letters-service.ts` | Letters CRUD + reading flow + sealed-bid logic |
| `src/lib/letter-emails.ts` | Fire-and-forget edge function invoker |
| `src/app/pages/letter-compose-page.tsx` | 3-step composition wizard |
| `src/app/pages/letter-reading-page.tsx` | Sequential reading experience (view form) |
| `src/app/pages/letter-results-page.tsx` | Sender results / full form view |
| `src/app/components/letters/letter-cover.tsx` | Cover screen (envelope icon, sender name, time estimate) |
| `src/app/components/letters/letter-story-reader.tsx` | Per-story reading flow (rating, gap reveal, points) |
| `src/app/components/letters/letter-progress-bar.tsx` | Segmented progress bar (story N of M) |
| `src/app/components/letters/letter-completion-summary.tsx` | Gap-sorted summary with per-story/per-point comparisons |
| `src/app/components/letters/letter-gap-reveal.tsx` | Dual-number gap display (receiver rating vs sender prediction) |
| `src/app/components/letters/letter-point-engagement.tsx` | Point with locked author position + engagement gate |
| `src/app/components/letters/letters-section.tsx` | Sent/received letters list for doc pages |
| `src/app/hooks/useLetterReadingState.ts` | Forward-only state machine + sessionStorage persistence |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/types/index.ts` | Add letter types + extend `StoryVerification` with `source`, `verified`, `sortOrder` |
| `src/App.tsx` | Add routes: `/letter/:id`, `/letter/:id/results`, `/letter/:docId/compose` |
| `src/app/components/layout/bottom-nav.tsx` | Add `/letter` to `focusRoutes` array |
| `src/app/pages/doc-detail-page.tsx` | Add "Prepare a Letter" button to header + "Letters" section below stories |
| `src/app/pages/docs-list-page.tsx` | Add "Received Letters" section |
| `src/app/data/calibration-service-real.ts` | Update `mapVerificationFromDb` to include `source`, `verified`, `sortOrder`; add `WHERE source = 'live'` filter to calibration RPCs if needed |
| `src/auth/AuthCallbackPage.tsx` | Handle letter registration callback (persist sessionStorage data for 1-to-many) |
| `supabase/deploy-manifest.json` | Add `send-letter-emails` and `create-and-open-letter` to manifest |
| `public/sitemap.xml` | Not needed — letter pages are dynamic, token-gated, not indexable |

---

## Pre-deploy Checklist

### Secrets to provision
- [ ] No new secrets required — letter emails reuse existing Mailgun credentials (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`) already provisioned for `send-agreement-emails`
- [ ] `APP_URL` already set in edge function environment

### Deploy commands
- [ ] `./scripts/migrate.sh` — apply P581 migration
- [ ] `supabase functions deploy send-letter-emails --project-ref <ref> --no-verify-jwt`
- [ ] `supabase functions deploy create-and-open-letter --project-ref <ref> --no-verify-jwt`
- [ ] Verify edge functions deployed: `supabase functions list --project-ref <ref>`

### Post-deploy verification
- [ ] Create a test letter from a doc, verify snapshot integrity
- [ ] Complete letter as receiver, verify sealed-bid (prediction hidden until rating)
- [ ] Check Sentry for new errors in first 10 minutes
- [ ] Verify Realtime subscription works for 1-to-1 sender results

---

## Test Coverage Strategy

### Test Pyramid

| Layer | Files | Tests | Focus |
|-------|-------|-------|-------|
| **Integration (DB)** | `p581-letters-migration.spec.ts` | 17 | Schema existence (5 tables + 4 column additions), CHECK constraints (0-10 range), default values, RLS write-locks, delivery status transitions, token validation RPC |
| **Integration (Security)** | `p581-letters-sealed-bid.spec.ts` | 10 | Sealed-bid guarantee (sender sees, receiver blocked until completed, anon blocked, wrong user blocked), forward-only ratings (no UPDATE/DELETE on letter-sourced verifications), forward-only positions (`letter_point_responses` no UPDATE) |
| **E2E (Composition)** | `p581-letter-composition.spec.ts` | 6 | Composition wizard entry from doc, mode selector, email input, prediction input, preview banner (D42), private doc restricts 1-to-many |
| **E2E (Reading)** | `p581-letter-reading.spec.ts` | 9 | Cover screen, opening transition, progress bar, understanding rating, point engagement (D37), author position lock (D10), story filing CTA, 1-to-many anonymous access, 1-to-many cover has no ToS (D48) |
| **E2E (1-to-1)** | `p581-letter-1to1-flow.spec.ts` | 6 | Token validation (valid, invalid, expired), wrong user rejection, no-token 404 (D25), unauthenticated redirect (D47) |
| **E2E (Completion)** | `p581-letter-completion.spec.ts` | 8 | Sender results page, gap data display, /live CTA, status transitions (DB roundtrip), doc page letters section, 1-to-many sessionStorage, registration gate |
| **Smoke** | `p581-smoke.spec.ts` | 5 | Route loading (reading, composition, results), doc page CTA, non-existent letter graceful handling |
| **UAT** | `features/uat/p581.md` | 42 | Manual scenarios covering full wizard, sealed-bid, D36 ordering, D37 engagement, D48 registration, completion summary, sender results, edge cases |
| **Helpers** | `e2e/helpers/test-letter.ts` | — | Factory functions: `createTestLetter()`, `createTestDelivery()`, `createTestStorySnapshot()`, `createTestPrediction()`, `sealTestLetter()`, `completeTestDelivery()`, `createFullTestLetter()`, `deleteTestLetter()` |

### What Is Tested (Automated)

**Security-critical (integration layer -- DB enforcement, not client-side):**
- Sealed-bid: receiver cannot SELECT predictions before delivery status = 'completed'
- Sender can always SELECT their own predictions
- Anonymous and wrong-user access returns zero rows (not errors)
- `letter_story_snapshots` and `letter_predictions` have `WITH CHECK (false)` INSERT policies
- Forward-only: `story_verifications` with `source='letter'` cannot be UPDATEd or DELETEd by receiver
- Forward-only: `letter_point_responses` have no UPDATE policy
- Token validation RPC: valid token returns data, invalid/expired returns null
- CHECK constraint: predictions must be 0-10

**Schema correctness (migration validation):**
- All 5 new tables exist with expected columns
- 4 column additions on existing tables (`story_verifications.source`, `.verified`, `.sort_order`, `clarity_sessions.source_letter_id`)
- Default values: `source='live'`, `verified=true`, `status='sent'`, `stories_rated=0`
- Delivery status transitions: sent -> opened -> in_progress -> completed

**User flows (E2E layer):**
- Composition entry from doc page ("Prepare a Letter" button)
- Mode selector (1-to-1 vs 1-to-many)
- Token-gated 1-to-1 access (valid, invalid, expired, wrong user, unauthenticated)
- Cover screen rendering (sender info, story count, ToS for 1-to-1 only)
- Sequential reading flow (opening, progress bar, rating, engagement)
- Sender results page (per-receiver data, gap display)
- 1-to-many anonymous access (no auth required for public doc letters)

### What Is NOT Tested (and Why)

| Area | Reason |
|------|--------|
| **Seal & Send DB side-effects** | Requires full wizard completion UI + `seal_and_send_letter` RPC. Test the RPC directly once implemented. |
| **Email delivery** | Requires edge function (`send-letter-emails`) + Mailgun. Test via integration test against edge function, not E2E. |
| **One-click registration (`create-and-open-letter`)** | Requires edge function. Test via integration test against edge function directly. |
| **Realtime subscription (sender results)** | Supabase Realtime requires WebSocket + time-based assertions. Test manually (UAT-32 partial coverage). |
| **D36 ordering (anti-point vs story-first)** | Logic is in `useLetterReadingState` hook. Best tested as unit test once hook is implemented. E2E partially covers via reading flow tests. |
| **Gap reveal animation (500ms delay)** | CSS/animation timing. Visual QA only (UAT-10, UAT-12). |
| **Author position unlock animation** | CSS transition. Visual QA only (UAT-19). |
| **sessionStorage expiry handling** | Browser-specific behavior. Manual test (UAT-38). |
| **Workshop 15-receiver scaling** | Requires load testing infrastructure. Manual test with facilitator. |
| **Confetti on completion** | `triggerConfetti()` is fire-and-forget. Not testable in headless Playwright. |
| **Mixpanel events** | Analytics is prod-only. Verify via Mixpanel dashboard post-deploy. |
| **SEO component on letter pages** | Letter pages are dynamic/token-gated -- not indexable. Low risk. |

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| **Sealed-bid leak** (highest risk) | 10 dedicated integration tests against RLS + 3 status-progression tests. DB-level enforcement, not client-side. |
| **Forward-only bypass** | Dedicated tests for UPDATE/DELETE rejection on `story_verifications` and `letter_point_responses` |
| **Token validation bypass** | RPC tested with valid, invalid, and expired tokens. 404 pattern verified. |
| **Schema drift** | 17 column-existence tests catch any migration regression immediately. |
| **Anonymous data loss** | sessionStorage pattern tested via E2E (1-to-many anonymous flow). Registration gate UAT scenarios cover the full save path. |

---

## Implementation Tasks

**Summary:** 14 tasks. Sequential chain: T1 → T2 → T3 → T4/T5 (parallel) → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14. Parallelizable groups: {T4, T5} after T3; {T11, T12} after T10 if no shared state.

---

### Task 1: DB Migration

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_p581_clarity_letters.sql` (create)

**Spec refs:**
- Build Sequence Phase 1, steps 1-9 (lines 1021-1031)
- Architecture Decisions AD2-AD3 (lines 847-914)
- Security Review: all 7 critical gaps (lines 1005-1013)

**What:**
- 5 new tables: `clarity_letters`, `letter_deliveries`, `letter_story_snapshots`, `letter_predictions`, `letter_point_responses`
- 4 column additions: `story_verifications.source`, `.verified`, `.sort_order`; `clarity_sessions.source_letter_id`
- RLS policies per Security Review (sealed-bid on `letter_predictions`, `WITH CHECK (false)` on snapshots/predictions, source-aware policy on `story_verifications`)
- 4 SECURITY DEFINER RPCs: `get_letter_by_token`, `seal_and_send_letter`, `reveal_prediction`, `persist_anonymous_completion`
- Add tables to `supabase_realtime` publication
- Run `./scripts/migrate.sh`

**Tests:** `e2e/integration/p581-letters-migration.spec.ts` (17 tests), `e2e/integration/p581-letters-sealed-bid.spec.ts` (10 tests)
**Depends on:** None (first task)
**Verify:** All 27 integration tests pass; `list_tables` shows 5 new tables

---

### Task 2: TypeScript Types

**Files:**
- `src/app/types/index.ts` (modify)

**Spec refs:**
- Build Sequence Phase 2, steps 7-8 (lines 1033-1034)
- Files to Modify (line 1102)

**What:**
- Add types: `ClarityLetter`, `LetterDelivery`, `LetterStorySnapshot`, `LetterPrediction`, `LetterStatus`, `DeliveryStatus`, `LetterMode`
- Extend `StoryVerification` with `source`, `verified`, `sortOrder`

**Tests:** Type-checked by `npm run build`
**Depends on:** T1 (types must match schema)
**Verify:** `npm run build` passes with no type errors

---

### Task 3: Letters Service

**Files:**
- `src/app/data/letters-service.ts` (create)

**Spec refs:**
- Build Sequence Phase 2, step 9 (lines 1035)
- AD1: real-only pattern like docsService (lines 839-842)

**What:**
- `createLetter()`, `sealLetter()`, `getLetterForReading()`, `getLetterForSender()`
- `submitRating()`, `revealPrediction()`, `getCompletionSummary()`
- `getDeliveriesForLetter()`, `updateDeliveryStatus()`
- Direct Supabase queries (no interface/mock split)

**Tests:** Covered indirectly by E2E tests in T6-T12
**Depends on:** T1, T2
**Verify:** Service file imports cleanly; `npm run build` passes

---

### Task 4: Letter Email Invoker

**Files:**
- `src/lib/letter-emails.ts` (create)

**Spec refs:**
- Build Sequence Phase 2, step 10 (line 1036)
- Reuse Inventory: `invokeAgreementEmails` pattern (line 820)

**What:**
- `invokeLetterEmails()` — fire-and-forget edge function call mirroring `agreement-emails.ts`

**Tests:** Not directly tested (edge function integration; see "What Is NOT Tested")
**Depends on:** T2 (types)
**Verify:** `npm run build` passes

---

### Task 5: Edge Functions

**Files:**
- `supabase/functions/send-letter-emails/index.ts` (create)
- `supabase/functions/create-and-open-letter/index.ts` (create)

**Spec refs:**
- Build Sequence Phase 3, steps 11-12 (lines 1039-1040)
- AD6: clone and adapt pattern (lines 935-941)

**What:**
- `send-letter-emails`: clone from `send-agreement-emails`, adapt HTML template for letter cover CTA
- `create-and-open-letter`: clone from `create-and-sign`, adapt for letter delivery (D48 one-click registration)

**Tests:** Not E2E tested (see "What Is NOT Tested"). Manual verification via UAT.
**Depends on:** T1 (schema for delivery rows)
**Verify:** Edge functions deploy without errors

---

### Task 6: Composition Page

**Files:**
- `src/app/pages/letter-compose-page.tsx` (create)

**Spec refs:**
- Build Sequence Phase 4, steps 13-18 (lines 1043-1049)
- ASCII Flow: Composition (lines 446-498)
- AC: Letter Composition (lines 202-213)

**What:**
- "Prepare a Letter" button wiring (button itself added in T12 on doc-detail-page)
- 3-step wizard: Step 1 mode selector + email input, Step 2 per-story predictions via `RatingButtons`, Step 3 preview with banner (D42) + "Seal & Send"
- Seal action: call `sealLetter()` from letters-service, fire email via `invokeLetterEmails()`

**Tests:** `e2e/p581-letter-composition.spec.ts` (6 tests)
**Depends on:** T3, T4
**Verify:** Composition E2E tests pass

---

### Task 7: Letter Cover + Token Validation

**Files:**
- `src/app/pages/letter-reading-page.tsx` (create)
- `src/app/components/letters/letter-cover.tsx` (create)

**Spec refs:**
- Build Sequence Phase 5, steps 19-20 (lines 1051-1052)
- ASCII Flow: Cover (lines 501-513)
- AC: 1-to-1 Letter Flow (lines 222-228), 1-to-Many Letter Flow (lines 230-234)

**What:**
- Letter reading page shell with PageState machine (loading/invalid/unauthenticated/ready)
- Token validation for 1-to-1 via `get_letter_by_token` RPC
- Cover screen: envelope icon, sender name, story count, time estimate, "Open the Letter" + ToS (D48)
- 1-to-1 vs 1-to-many cover differences (ToS only for 1-to-1)

**Tests:** `e2e/p581-letter-1to1-flow.spec.ts` (6 tests), `e2e/p581-letter-reading.spec.ts` (cover tests)
**Depends on:** T3
**Verify:** 1-to-1 flow E2E tests pass; cover renders correctly

---

### Task 8: Reading State Machine + Story Reader + Point Engagement

**Files:**
- `src/app/hooks/useLetterReadingState.ts` (create)
- `src/app/components/letters/letter-story-reader.tsx` (create)
- `src/app/components/letters/letter-point-engagement.tsx` (create)

**Spec refs:**
- Build Sequence Phase 5, steps 21-27 (lines 1053-1059)
- AD4: forward-only state machine (lines 917-924)
- AC: Letter Reading (lines 245-267)
- D36 conditional ordering, D37 engagement requirement

**What:**
- `useLetterReadingState`: forward-only state machine with sessionStorage persistence + DB hybrid
- Sequential story reading with D36 ordering (1 point: story first; 2+ points: anti-point first)
- `RatingButtons` for understanding rating + sealed-bid reveal via `revealPrediction()`
- `PositionButtons` for point engagement (D37 must-engage gate)
- Author position lock/unlock with fade-in animation (D10)
- Story filing: navigate to `CreateStoryPage` with `?pointId=X&returnTo=/letter/:id`
- sessionStorage layer for anonymous 1-to-many

**Tests:** `e2e/p581-letter-reading.spec.ts` (9 tests)
**Depends on:** T7
**Verify:** Reading flow E2E tests pass

---

### Task 9: Gap Reveal + Progress Bar

**Files:**
- `src/app/components/letters/letter-gap-reveal.tsx` (create)
- `src/app/components/letters/letter-progress-bar.tsx` (create)

**Spec refs:**
- Build Sequence Phase 5 (within steps 21-23)
- ASCII Flow: gap reveal (lines 559-569), progress bar (lines 521, 536)
- AC: gap framed honestly (line 258), progress bar (line 247)

**What:**
- `letter-gap-reveal`: dual-number display (receiver rating / sender prediction) + gap framing text + `aria-live="polite"`
- `letter-progress-bar`: segmented bar showing story N of M with `aria-label`

**Tests:** Covered by `e2e/p581-letter-reading.spec.ts` (progress bar, rating tests)
**Depends on:** T8 (used within story reader)
**Verify:** Components render in reading flow

---

### Task 10: Completion Flow

**Files:**
- `src/app/components/letters/letter-completion-summary.tsx` (create)

**Spec refs:**
- Build Sequence Phase 6, steps 28-30 (lines 1062-1064)
- ASCII Flow: completion (lines 589-625)
- AC: Letter Completion Summary (lines 269-277), Unregistered Receiver Flow (lines 236-243)

**What:**
- Celebration gate ("You've completed it")
- Gap-sorted summary with per-story/per-point comparisons (largest gap first)
- "Ready for /live?" CTA linking to highest-gap story
- Registration gate for 1-to-many ("Save your results?" with email input)
- Receiver-filed stories visible
- `triggerConfetti()` on celebration

**Tests:** `e2e/p581-letter-completion.spec.ts` (8 tests)
**Depends on:** T8, T9
**Verify:** Completion E2E tests pass

---

### Task 11: Sender Results Page

**Files:**
- `src/app/pages/letter-results-page.tsx` (create)

**Spec refs:**
- Build Sequence Phase 6, step 31 (line 1065)
- ASCII Flow: sender results (lines 640-655)
- AC: sender sees completion summary (line 275)

**What:**
- `/letter/:id/results` route — FocusHeader with "Back to Doc"
- Per-receiver data: story gaps, point positions, filed stories
- 1-to-1: named receiver, Realtime subscription (AD5)
- 1-to-many: anonymous counts, 30s polling (AD5)

**Tests:** `e2e/p581-letter-completion.spec.ts` (sender results tests)
**Depends on:** T3, T10
**Verify:** Sender results page renders with test data

---

### Task 12: Letters Section on Doc Pages

**Files:**
- `src/app/components/letters/letters-section.tsx` (create)
- `src/app/pages/doc-detail-page.tsx` (modify)
- `src/app/pages/docs-list-page.tsx` (modify)

**Spec refs:**
- Build Sequence Phase 6, steps 32-33 (lines 1066-1067)
- ASCII Flow: sender results view (lines 629-638)
- AC: Letter Visibility in Docs (lines 215-220)

**What:**
- `letters-section.tsx`: sent/received letters list with date, receiver(s), status badge
- `doc-detail-page.tsx`: add "Prepare a Letter" button to header + "Letters" section below stories
- `docs-list-page.tsx`: add "Received Letters" section

**Tests:** `e2e/p581-letter-completion.spec.ts` (doc page letters section), `e2e/p581-smoke.spec.ts` (doc page CTA)
**Depends on:** T3, T6
**Verify:** Letters section visible on doc pages; "Prepare a Letter" button navigates to compose

---

### Task 13: Route Wiring + Integration

**Files:**
- `src/App.tsx` (modify)
- `src/app/components/layout/bottom-nav.tsx` (modify)
- `src/app/data/calibration-service-real.ts` (modify)
- `src/auth/AuthCallbackPage.tsx` (modify)

**Spec refs:**
- Build Sequence Phase 7, steps 34-37 (lines 1070-1073)
- AD7: route structure (lines 943-956)
- Files to Modify (lines 1098-1109)

**What:**
- `App.tsx`: add routes `/letter/:id`, `/letter/:id/results`, `/letter/:docId/compose`
- `bottom-nav.tsx`: add `/letter` to `focusRoutes` array
- `calibration-service-real.ts`: update `mapVerificationFromDb` for `source`, `verified`, `sortOrder`
- `AuthCallbackPage.tsx`: handle letter registration callback (persist sessionStorage for 1-to-many)
- Mixpanel events: `letter_created`, `letter_sealed`, `letter_opened`, `letter_story_rated`, `letter_completed`, `letter_results_viewed`

**Tests:** `e2e/p581-smoke.spec.ts` (5 tests — route loading, graceful handling)
**Depends on:** T6, T7, T10, T11
**Verify:** All smoke tests pass; routes load without errors

---

### Task 14: Edge Case Handling + Polish

**Files:**
- Files from T7, T8, T10 (modify — adding edge case handling)

**Spec refs:**
- Build Sequence Phase 7, steps 38-39 (lines 1074-1075)
- UX Design: Edge Cases table (lines 674-685)
- UI Contract Additions (lines 722-733)

**What:**
- Expired token: "This letter has expired. Contact [sender name] for a new one."
- Wrong user: "This letter wasn't sent to you." + Back to docs
- Resume from sessionStorage: "Welcome back. You left off at Story [N]."
- Network error: toast with auto-retry + local fallback message
- Empty letters state: "No letters yet" message
- SEO component on letter pages (low priority — token-gated, not indexable)

**Tests:** Covered by `e2e/p581-letter-1to1-flow.spec.ts` (expired, wrong user, 404), `e2e/p581-smoke.spec.ts` (non-existent letter)
**Depends on:** T7, T8, T10, T13
**Verify:** Edge case E2E tests pass; manual verification of network error handling
