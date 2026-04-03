---
status: today
type: story
rank: 0.032
tags:
  - epic-story-first
  - letters
  - comprehension
  - async
  - screening
  - workshop
  - briefing
created_date: 2026-03-23T00:00:00.000Z
delivery_stage: 2-ux-review
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-26T14:27:27.466Z'
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

**Architectural context — Clarity Doc → Clarity Letter relationship (2026-03-24):**
A Clarity Letter is an immutable snapshot of content from a Clarity Doc (P551). The Doc is the mutable compose/edit surface — stories accumulate there between sessions. The Letter is the delivery mechanism — "send this collection as a reading experience with assessment." Editing a letter = editing the doc, then sending a new letter (new snapshot from current doc state). V1 builds both together: P551 provides doc CRUD, P581 provides the letter composition wizard triggered from the doc page ("Prepare a Letter" button). The `source_doc_id` FK on `clarity_letters` is NOT NULL — every letter comes from a doc.

**Three-letter acquisition sequence (2026-03-24):**
Letters serve a larger acquisition flywheel: Letter 1 (educate — recipient reads, rates, gaps revealed) → /live verification → Letter 2 (reproduce — recipient creates their own letter using same points, own stories) → Letter 3 (value assessment + PWIW + distributor CTA). In a compressed workshop, all three happen in one 90-120 min session. V1 builds Letter 1 only. Letter 2 uses the same composition flow (recipient is now a registered user). Letter 3 is a future post-completion screen. See [facilitator-guide.md](../../docs/facilitator-guide.md#workshop-format-three-letter-compressed-session).

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
| D13 | Relationship to P551 clarity docs? | Unified in V1. Letter = immutable snapshot of a doc, delivered as a reading experience with assessment. Doc = mutable compose/edit surface where stories accumulate. "Prepare a Letter" on doc page triggers composition wizard. Separate specs, shared grid component, unified data model (4 new tables + story_verifications extension). |
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
| D28 | Where do sent/received letters live in the app? | Within Clarity Docs page — "Letters" section showing sent + received. Letters are always sourced from docs, so doc page is the natural home. No separate `/letters` nav item V1. Supersedes D18. |
| D29 | 1-to-1 letter auth flow? | Reuse Agreement invitation pattern (P422/P488/P527): token-based access + email lookup + one-click registration. Existing user: magic link (no re-auth). New user: `create-and-sign` edge function pattern adapted to `create-and-open-letter`. Receiver can also access from within app (doc page shows received letters) — email is not the only entry. Authentication always required (D47). |
| D30 | 1-to-many letter auth flow? | Reuse Pledge flow pattern: guest reads → completes → registration gate at end. sessionStorage holds intent. Email input → magic link → results persist on verification. Available only from public docs. |
| D31 | Letter has two views? | Yes. **View form** (receiver's sequential reading experience — one story at a time, rating gate per story, sealed-bid). **Full form** (doc snapshot + all data from both parties — predictions, ratings, completion summary, positions, filed stories). Sender always sees full form. Receiver sees full form only after completing view form. |
| D32 | Partial completion → partial full form access? | Yes. Receiver who completes 3 of 5 stories can see full form for stories 1-3 (revealed data). Stories 4-5 remain locked/greyed in full form. Progressive unlock. |
| D33 | P590 design system applies to all P581 UI? | Yes. All buttons use shadcn `<Button>` with proper variants. Lock/globe icons for visibility. Touch targets ≥ 44px. Amber for private, blue for public banners. |
| D34 | Rating input for letters? | Discrete 0-10 buttons — reuse existing `RatingButtons` component. Slider is for /live continuous signal only. See D9. |
| D35 | Grid quadrant labels? | Deferred to P624 (D43). Pre-verification (letter): bottom quadrants "Potential false agreement/disagreement ⚠️". Post-verification (/live): upper quadrants "Verified agreement/disagreement ✓". Understanding (Y-axis) drives the transition from bottom to top. |
| D36 | Point-before-story ordering? | Conditional on point count: **1 point** → story first, then point (story provides context for the claim it supports). **2+ points** → first point (anti-point, highest priority as set by sender in doc) appears before story for commit-before-context (Clarity Flip mechanic), then story, then remaining points. Sender controls implicitly through doc structure (point ordering via arrows). Vocabulary glosses optional for abstract terms. "I need context" escape valve tracked as content quality metric. |
| D37 | Point engagement model? | B: must position OR file story explaining why not. Can't skip silently. Existing "add a story" handles the explanation — no extra UI prompts needed. Supersedes D4. |
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

## Open Questions

1. **Can receiver reply with their own letter (ping-pong)?** Likely future feature, not V1. V1 is one-directional: sender → receiver.
2. **Does gap map feed into /live session setup?** Ideally yes — "start /live on story with biggest gap." V1 letter completion summary has "Ready for /live?" CTA but no deep integration.
4. **Can sender include stories by other authors?** V1: sender can only include their own stories. Curating others' stories is a future capability.
6. **Can a letter document external paraphrase?** (e.g., "we already discussed this in person, I just want to record it") — async /live alternative. Likely future, not V1.
9. **Remix flow for Letter 2:** After completing a letter, can the receiver create their own letter reusing the same *points* but with their own *stories*? V1: receiver uses standard flow — create own doc, add stories on same points, send as letter. Future: "Create your own letter from these points" CTA on completion summary that auto-creates a doc pre-populated with the sender's points.

---

## Prototype Reference

Working prototypes built in claude.ai (2026-03-23) inform this spec:

1. **Letter prototype (full flow):** Cover → story reading → dot picker rating → gap reveal → sequential points with three-button row → author position lock/unlock → story filing → letter completion summary with linked stories + "Ready for /live?" CTA. (Prototype included quadrant plot — deferred to P624 D43.)

2. **Grid prototype (dark, interactive):** Understanding × agreement grid with radial gradient background, particle burst on placement, ghost dot on hover, toggleable X-axis, monospace readout. Y-axis 0-10 (no negatives), X-axis -5 to +5.

3. **Screenshot variations (4):** Progress tracking bar, dual progress bars for gap reveal, "commit → reveal speaker's score" sealed-bid flow, feed-style story cards with gap callouts.

Key patterns from prototypes: dot picker (not slider), three-button (not Likert), author lock until engagement, progress bar, dual-number gap reveal. Grid scatter plot deferred to P624 (D43).

---

## Reuse Analysis (from P590/P581 coordination session)

**Agreement invitation flow (P422/P488/P527)** — reusable for 1-to-1 letter delivery:
- Token-based invitation with expiry (`invitation_token` + `invitation_expires_at`)
- Email lookup for existing vs new user (`lookupUserByEmail()`)
- One-click registration via `create-and-sign` edge function (atomic user creation + action)
- Magic link for existing users (skip re-auth, P488)
- SECURITY DEFINER RPC for token validation
- Key files: `accept-agreement-page.tsx`, `agreements-service-real.ts`, `send-agreement-emails/index.ts`

**Pledge flow** — reusable for 1-to-many letter completion:
- Guest access → full experience → registration gate at end
- sessionStorage for pending intent (`pendingVerificationEmail` pattern)
- Magic link verification → data persistence on callback
- Key files: `sign-pledge-page.tsx`, `use-pledge-form.ts`, `AuthCallbackPage.tsx`

**P590 design system** — all P581 UI must follow:
- shadcn `<Button>` with proper variants (never raw Tailwind)
- Lock/globe icons for visibility context
- Amber (private) / blue (public) banner pattern
- Touch targets ≥ 44px (`min-h-[44px]`)

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

## ASCII Flow: "Sealed Slides" (from /ascii-flows, corrected)


### COMPOSITION (Sender — 2 steps + preview, triggered from doc page)

```
DOC PAGE (P551) — sender clicks "Prepare a Letter" in header

┌──────────────────────┐
│ ╔════════════════════╗│
│ ║ PREPARE A LETTER  ║│
│ ╚════════════════════╝│
│                       │
│  Step 1 of 2  ●○     │
│  Add receivers        │
│                       │
│  Who is this for?     │
│  ○ Specific people    │
│  ○ Anyone with a link │
│                       │
│  Send to:             │
│  ┌───────────────────┐│
│  │ alex@co.com,      ││
│  │ ben@startup.io    ││
│  └───────────────────┘│
│  (separate by comma)  │
│                       │
│       [ Next → ]      │
└───────────────────────┘

┌──────────────────────┐
│  Step 2 of 2  ○●     │
│  Set predictions      │
│                       │
│  For: Alex            │
│  ┌───────────────────┐│
│  │ Hiring stance     ││
│  │   ●●●●●●○○○○ 6   ││
│  │   "How well will  ││
│  │    Alex get it?"  ││
│  ├───────────────────┤│
│  │ Funding views     ││
│  │   ●●●●○○○○○○ 4   ││
│  └───────────────────┘│
│                       │
│  ╔════════════════════╗
│  ║  2 stories        ║
│  ║  To: Alex         ║
│  ║  Predictions: 6, 4║
│  ╚════════════════════╝
│                       │
│  [ Preview Letter → ] │
└───────────────────────┘

┌──────────────────────┐
│ ┌────────────────────┐│
│ │ THIS IS A PREVIEW  ││
│ │ The receiver will  ││
│ │ see this (D42)     ││
│ └────────────────────┘│
│                       │
│  (full reading flow   │
│   shown as receiver   │
│   would experience)   │
│                       │
│  ╔══════════════════╗ │
│  ║  ✦ Seal & Send  ║ │
│  ╚══════════════════╝ │
│  [ ← Back to Edit ]  │
└───────────────────────┘
```

### READING — ACT 1: COVER

```
┌──────────────────────┐
│                      │
│ ╔════════════════════╗
│ ║                    ║
│ ║       ✉            ║
│ ║                    ║
│ ║  A CLARITY LETTER  ║
│ ║  FROM SARAH        ║
│ ║                    ║
│ ║  2 stories         ║
│ ║  ~ 5 minutes       ║
│ ║                    ║
│ ╚════════════════════╝
│                      │
│  [ Open the Letter ] │
│                      │
└──────────────────────┘
```

### READING — ACT 2: PER STORY (5 slides, forward-only)

**Slide 1: READ** (scroll within slide for long stories)

```
┌──────────────────────┐
│ ■□  Story 1 of 2     │
│──────────────────────│
│                      │
│  "My co-founder's    │
│   position on        │
│   hiring is that     │
│   we should only     │
│   hire senior        │
│   engineers.         │
│                      │
│   The reasoning is   │
│   that seniors       │
│   reduce onboarding  │
│   cost and ship      │
│   faster..."         │
│                      │
│  [ I've read it → ]  │
│                      │
└──────────────────────┘
```

**Slide 2: RATE** (dot picker — same as prototype)

```
┌──────────────────────┐
│ ■□  Story 1 of 2     │
│──────────────────────│
│                      │
│  How well do you     │
│  believe you         │
│  understood this?    │
│                      │
│  ● ● ● ● ● ● ● ● ○ ○│
│                    8 │
│                      │
│  [ Submit → ]        │
│                      │
└──────────────────────┘
```

**Slide 3: REVEAL** (reuses calibration history pattern)

```
┌──────────────────────┐
│ ■□  Story 1 of 2     │
│──────────────────────│
│                      │
│  ┌──────────────────┐│
│  │ Your rating:   8 ││
│  │ Sarah predicted:6││
│  │                  ││
│  │ Gap: 2           ││
│  └──────────────────┘│
│                      │
│  A gap of 2 —        │
│  both guessing,      │
│  neither knows yet.  │
│                      │
│  [ See the points → ]│
│                      │
└──────────────────────┘
```

**Slide 4: POINTS** (one at a time, locked author)

```
┌──────────────────────┐
│ ■□  Story 1 of 2     │
│ Point 1 of 3         │
│──────────────────────│
│                      │
│  "Seniors reduce     │
│   onboarding cost"   │
│                      │
│  ┌────┐ ┌────┐ ┌────┐│
│  │ ✕  │ │ ?  │ │ ✓  ││
│  └────┘ └────┘ └────┘│
│                      │
│  🔒 Sarah's position │
│  (engage to reveal)  │
│                      │
│  [+ Add a story —    │
│     explain your     │
│     view]            │
│                      │
│  [ Skip · Next → ]   │
│                      │
└──────────────────────┘
```

D37: must engage (position or story) before proceeding.

After engagement:

```
┌──────────────────────┐
│ ■□  Story 1 of 2     │
│ Point 1 of 3         │
│──────────────────────│
│                      │
│  "Seniors reduce     │
│   onboarding cost"   │
│                      │
│  You:   ✓ Agree      │
│  Sarah: ✓ Agree      │
│                      │
│  [ Next point → ]    │
│                      │
└──────────────────────┘
```

**Slide 5: TRANSITION** (between stories — simple, not meditation)

```
┌──────────────────────┐
│                      │
│  ■■ □□               │
│  Story 1 complete    │
│                      │
│  [ Next story → ]    │
│                      │
└──────────────────────┘
```


→ Story 2 begins at Slide 1.

### READING — ACT 3: LETTER COMPLETION SUMMARY (after all stories)

```
┌──────────────────────┐
│                      │
│ ╔════════════════════╗
│ ║  ✦ YOUR LETTER    ║
│ ║  SUMMARY           ║
│ ╚════════════════════╝
│                      │
│  Per story:          │
│                      │
│  ┌──────────────────┐│
│  │ "Hiring stance"  ││
│  │  You: 8  Sarah: 6││
│  │  Gap: 2          ││
│  ├──────────────────┤│
│  │ Points:          ││
│  │ "Seniors reduce  ││
│  │  onboarding"     ││
│  │  You: ✓ Agree    ││
│  │  Sarah: ✓ Agree  ││
│  └──────────────────┘│
│                      │
│  ┌──────────────────┐│
│  │ "Funding views"  ││
│  │  You: 5  Sarah: 3││
│  │  Gap: 2          ││
│  └──────────────────┘│
│                      │
│  2 stories read      │
│  5 positions taken   │
│                      │
│ ╔════════════════════╗│
│ ║  Ready for /live? ║│
│ ║ [ Schedule Live ] ║│
│ ╚════════════════════╝│
│                      │
│──────────────────────│
│                      │
│  Save your results?  │
│  ┌──────────────────┐│
│  │ your@email.com   ││
│  └──────────────────┘│
│  [ Save & Sign Up ]  │
│                      │
└──────────────────────┘
```

### AUTHOR COMPLETION SUMMARY VIEW

```
┌──────────────────────┐
│  LETTER RESULTS      │
│  To: Alex            │
│  Status: Completed   │
│──────────────────────│
│                      │
│  Per story:          │
│                      │
│  1. "Funding runway" │
│     Gap: 3           │
│     You predicted: 4 │
│     Alex rated: 7    │
│                      │
│  2. "Hiring seniors" │
│     Gap: 2           │
│                      │
│  3. "Speed vs cost"  │
│     Gap: 0 — aligned │
│──────────────────────│
│                      │
│  Linked stories:     │
│  ┌──────────────────┐│
│  │ 📖 Alex: "I      ││
│  │  actually think  ││
│  │  mentorship..."  ││
│  └──────────────────┘│
│                      │
│ ╔════════════════════╗│
│ ║ Ready for /live?  ║│
│ ║ [ Schedule Live ] ║│
│ ╚════════════════════╝│
└──────────────────────┘
```

---

## UX Design

### Flow 1: Letters Section in Docs Page (D28)

**Entry point:** Existing docs list page (`/docs`). Letters appear as a section, not a separate route.

```
/docs page (existing)
┌──────────────────────────────────┐
│  My Docs                         │
│  ┌──────────┐ ┌──────────┐      │
│  │ Doc A    │ │ Doc B    │      │
│  └──────────┘ └──────────┘      │
│                                  │
│  ─── Letters ───────────────── │
│                                  │
│  Sent                            │
│  ┌──────────────────────────────┐│
│  │ 📨 "Therapy Notes" → Alex   ││
│  │    Sent Mar 28 · Completed  ││
│  ├──────────────────────────────┤│
│  │ 📨 "Workshop" → 5 receivers ││
│  │    Sent Mar 25 · 3/5 done   ││
│  └──────────────────────────────┘│
│                                  │
│  Received                        │
│  ┌──────────────────────────────┐│
│  │ 📩 From Sarah · Mar 26      ││
│  │    2 stories · Not started   ││
│  └──────────────────────────────┘│
└──────────────────────────────────┘
```

**States:**
- Sent letter: Sent / Opened / In progress (N/M) / Completed
- Received letter: Not started / In progress (N/M) / Completed
- Tap sent letter → full form view (sender always sees results)
- Tap received letter (not started/in progress) → view form (reading flow)
- Tap received letter (completed) → full form view

**Empty state:** "No letters yet. Send one from any doc using 'Prepare a Letter'."

### Flow 2: Composition Wizard (2-step + preview, ASCII already covers this — additions below)

**Entry:** "Prepare a Letter" button in doc detail page header action row.

**Wizard opens as a full-screen overlay** (not a modal dialog — composition needs space for predictions). Uses FocusHeader with "Back to doc" for exit.

**Step 1 — mode selector + receivers (D40):**
- "Who is this for?" with two options:
  - **Specific people** → email input with lookup: type email → check if user exists → show name + avatar if found, "will be invited" if not. Creates 1-to-1 letter(s), one per receiver. Multiple emails separated by comma.
  - **Anyone with a link** → generates shareable URL + optional QR code. Creates 1-to-many letter. Available only from public docs.
- Letter visibility follows doc visibility: private doc = 1-to-1 only; public doc = both 1-to-1 and 1-to-many available (D45)

**Step 2 — predictions (adapts to mode, D40):**
- **1-to-1 (specific people):** If multiple receivers: tab/pill selector at top ("For: Alex | For: Ben | For: Carol"). Each receiver gets independent predictions per story. Prompt: "How well will [Alex] understand this?"
- **1-to-many (anyone with link):** Single prediction set. Prompt: "How well will readers understand this?" One prediction per story, shared across all receivers.
- `RatingButtons` 0-10 for each story
- Summary card at bottom shows: N stories, To: [name(s) or "anyone"], Predictions: [values]

**Edge cases:**
- 0 receivers in Step 1 → Next disabled, "Add at least one receiver or generate a link"
- Prediction not set → defaults to 5 (middle), shown as dimmed until actively chosen
- Network error on Seal & Send → toast: "Couldn't send letter. Try again." Button re-enabled.
- Close wizard mid-composition → unsent state preserved in component state (not persisted). Re-opening restores.

### Flow 3: Letter Reading — View Form (D31)

**Route:** `/letter/:id` (or `/letter/:id?token=xxx` for 1-to-1)
**Page type:** Focus page — add to `focusRoutes` in bottom-nav.tsx, use FocusHeader

**Cover screen:**
- Full-viewport centered card
- Sender name + avatar, story count, estimated time
- "Open the Letter" CTA (blue, full-width, min-h-[44px])
- If 1-to-1 + no token: 404 page (D25)
- If 1-to-1 + expired token: "This letter has expired" message with sender contact info

**Reading flow state machine:**

```
COVER → [open]
  ↓
PER STORY BLOCK (repeats for each story):
  ↓
  ├─ (2+ points?) → ANTI-POINT → position/story → READ → RATE → REVEAL → POINTS 2..N → position/story
  └─ (1 point?)   → READ → RATE → REVEAL → POINT → position/story
  ↓
  TRANSITION → next story block
  ↓
COMPLETION SUMMARY → registration gate (if unauthenticated, 1-to-many only)
```

**Forward-only:** No back button within the reading flow. Progress bar at top shows story N of M. Receiver commits at each step — can't revise ratings or positions.

**Point engagement (D37):** Each point shows three-button row (✕/?/✓) + "Add a story" link. Receiver must do ONE of: take position, or file story. If they try to proceed without either → gentle prompt: "Take a position or explain why you can't." Not a hard block — shows once, then allows proceed (tracks as "skipped" signal).

**Author position lock:** Shows "🔒 [Sender]'s position — engage to reveal" in muted text below point. After receiver positions or files story → fade-in animation reveals sender's position (0.5s ease). Both positions shown side by side.

**Loading states:**
- Letter data loading: skeleton screen matching cover layout
- Story content loading: skeleton matching story card shape
- Rating submission: button shows spinner, disables re-tap

**Mobile-specific:**
- All screens stack vertically, full-width
- RatingButtons row: flex-wrap on narrow screens (<360px), each button still min 32px
- Position buttons: existing PositionButtons component handles responsive (icon-only below 270px)
- Story text: standard prose layout, no side panels
- Progress bar: thin (4px) at very top, fixed position

### Flow 4: Full Form View (D31/D32)

**Who sees it:**
- Sender: always (from docs page → tap sent letter)
- Receiver: after completing all stories, OR progressively for completed stories (D32)

**Layout:** Doc-snapshot style — all stories visible (like the doc detail page), but with assessment data overlaid.

```
┌──────────────────────────────────┐
│  FocusHeader: ← Back to Docs     │
│                                  │
│  Clarity Letter from [Sender]    │
│  Sent Mar 28 · To: [Receiver]   │
│  Status: Completed               │
│                                  │
│  ─── Story 1: "Hiring stance" ──│
│  [story content]                 │
│  Understanding: You 8 / Sender 6│
│  Gap: 2                          │
│                                  │
│  Points:                         │
│  ┌─ "Seniors reduce cost"      ─┐│
│  │ You: ✓ Agree  Sender: ✕ Dis  ││
│  │ 📖 Your story: "I think..."  ││
│  └───────────────────────────────┘│
│                                  │
│  ─── Story 2: "Funding views" ──│
│  [story content]                 │
│  Understanding: You 5 / Sender 4│
│  Gap: 1                          │
│                                  │
│  🔒 Story 3 (not yet completed) │
│  [greyed out, locked]            │
│                                  │
│  ─── Completion Summary ──────── │
│  [Per-story gaps + per-point     │
│   positions side by side]        │
│                                  │
│  [ Start Live Session → ]        │
└──────────────────────────────────┘
```

**Partial unlock (D32):** Stories 1-2 completed → shown with full data. Story 3 not completed → greyed card: "Complete this story to see results." Tap → returns to view form at that story.

### Flow 5: Letter Completion Summary (replaces Grid — see P624 for future grid, D43)

**Layout:** After completing all stories, receiver sees a summary card list:
- Per-story card: story title, sender prediction vs receiver self-rating as dual numbers, gap value
- Per-point card (within story): receiver's position alongside author's position (revealed)
- Points sorted by gap size (largest first)
- "Ready for /live?" CTA linking to the highest-gap story

**Sender view:** Same layout but showing all receivers' data. For 1-to-many: anonymous until registered.

**Mobile:** Cards stack vertically, full-width. Touch targets ≥ 44px on CTA.

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
