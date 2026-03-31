---
status: today
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
delivery_stage: 1-prd-review
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

All three are valuable. The grid shows WHERE gaps exist (triage). Stories show WHAT kind of gap (diagnosis). The arrow on the grid — from pre-verification to post-verification position — is the proof that something real happened, regardless of which outcome it was.

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
2. First Clarity Partner Agreement signed (Jan + Nejc, Mar 22). They need structured pre-work between sessions. Without it, the agreement is aspirational — no instrument to practice with.
3. Story filing (P560) just shipped. Stories exist. Points exist. The content is there. What's missing is the delivery container + measurement instrument.

**Impact if not solved:** ClarityPledge remains a facilitator-dependent service with zero standalone product value. Workshops produce intellectual surprise but no follow-up instrument. Partner agreements have no async practice tool. The product can't test H-StoryFirst (async gap revelations) because the measurement mechanism doesn't exist. H-WTP-Pain testing stalls because the workshop flow's step 4 has no implementation.

**Architectural context — Clarity Doc → Clarity Letter relationship (2026-03-24):**
A Clarity Letter is an immutable snapshot of content from a Clarity Doc (P551). The Doc is the mutable compose/edit surface — stories accumulate there between sessions. The Letter is the delivery mechanism — "send this collection as a reading experience with assessment." Editing a letter = editing the doc, then sending a new letter (new snapshot from current doc state). V1 builds both together: P551 provides doc CRUD, P581 provides the letter composition wizard triggered from the doc page ("Send as Letter" button). The `source_doc_id` FK on `clarity_letters` is NOT NULL — every letter comes from a doc.

**Three-letter acquisition sequence (2026-03-24):**
Letters serve a larger acquisition flywheel: Letter 1 (educate — recipient reads, rates, gaps revealed) → /live verification → Letter 2 (reproduce — recipient creates their own letter using same points, own stories) → Letter 3 (value assessment + PWIW + distributor CTA). In a compressed workshop, all three happen in one 90-120 min session. V1 builds Letter 1 only. Letter 2 uses the same composition flow (recipient is now a registered user). Letter 3 is a future post-completion screen. See [facilitator-guide.md](../../docs/facilitator-guide.md#workshop-format-three-letter-compressed-session).

---

## Business Requirements

**Must-haves:**

1. **Letter as snapshot of a doc.** A person (facilitator, partner A) opens or creates a Clarity Doc (P551), curates stories there, then clicks "Send as Letter" on the doc page. The composition wizard confirms stories, adds receivers, sets per-story predictions, and seals. The letter snapshots the doc's current stories via `story_versions` — the doc remains mutable, the letter is immutable. No standalone composition flow — the doc IS the editing surface.

2. **Author prediction per story.** When composing a letter, the sender predicts (0-10) how well the receiver will understand each included story. This prediction is hidden from the receiver until they rate themselves. The prediction is the speaker's half of the gap equation.

3. **Ritual reading experience.** The receiver opens a letter and progresses through a full-screen, deliberate-pacing experience. Points appear first (commit before context — Clarity Flip mechanic), then their parent story. Not a list to scroll through — a sequence to progress through. Each point requires engagement (position or story) before proceeding.

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
- Receiver can complete the entire letter experience WITHOUT an account — reading, rating, positioning all work in local state. Registration required only to persist results. The experience IS the conversion funnel.
- Assessment is mandatory within the letter context, but receiving a letter is not mandatory (no one is forced to open a letter)
- Author prediction is sealed until receiver rates (prevents anchoring)

**Letter sharing methods (revised D25/D29/D30):**
- **Public letter — link (QR code, WhatsApp, etc.):** Anonymous access. Guest reads → completes → gap map → "Save your results?" → email input → registration → data persisted. Registration gate at EXIT, not entrance. Reuses Pledge sessionStorage + magic link pattern.
- **Private letter — email:** Sender enters receiver's email at composition. Receiver gets email with token-gated link. Existing user: magic link (no re-auth, P488 pattern). New user: one-click registration (P527 `create-and-sign` pattern adapted). Receiver can also access from within app (Clarity Docs page shows received letters) — email is not the only entry point.
- **Private letter — URL without token:** Returns 404. No existence confirmation to unauthorized viewers (D25).

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

### Letter Composition (Doc-Sourced)
- [ ] "Send as Letter" button on doc page header opens composition wizard
- [ ] Wizard Step 1: confirm stories from the doc (all included by default, sender can deselect)
- [ ] Wizard Step 2: add receivers — by email, ClarityPledge username, or generate a shareable link
- [ ] Wizard Step 3: set per-story predictions (0-10) using dot picker — "How well will [Receiver] understand this?"
- [ ] Sender's predictions are sealed — not visible to receiver until receiver rates
- [ ] "Seal & Send" commits the letter — snapshots story content via `story_versions`, creates `clarity_letters` + `letter_deliveries` rows
- [ ] Letter accessible via unique link (access_token) — no account required to open and complete
- [ ] Sender can send to multiple receivers (same content, individual predictions per receiver)
- [ ] If sender needs to add a story mid-composition: close wizard → add to doc → reopen wizard (accepted friction)
- [ ] Reuses P422 `clarity_agreements` email delivery pattern (enter email → check if user exists → show name or send invitation)

### Letter Visibility in Docs
- [ ] Doc detail page shows "Letters" section listing letters sent from this doc
- [ ] Each letter entry shows: date, receiver(s), status (sent/opened/in-progress/completed)
- [ ] Sender can click through to full form view of any sent letter
- [ ] Docs list page shows received letters under a "Letters received" section
- [ ] Receiver sees full form for completed stories, locked view for incomplete ones (D32)

### Private Letter Flow (D25, D29)
- [ ] Private letter URL without valid token returns 404 (no existence leak)
- [ ] Private letter sent via email to existing user: reuse Agreement magic link pattern (P488)
- [ ] Private letter sent via email to new user: reuse Agreement one-click registration pattern (P527)
- [ ] Registered receiver can access private letter from within app (Docs page) without needing email link

### Public Letter Flow (D30)
- [ ] Public letter accessible via shareable link — no auth required
- [ ] Guest can read, rate, position, and file stories without account
- [ ] Registration gate appears after gap map ("Save your results?")
- [ ] sessionStorage holds all data until persisted (Pledge pattern)

### Unregistered Receiver Flow
- [ ] Receiver can open letter link without an account (anonymous access)
- [ ] All letter interactions (reading, rating, positioning, story filing) work in local state without registration
- [ ] After completing letter, gap map displays before any registration prompt
- [ ] "Save your results?" gate appears after gap map — email input + one-click signup
- [ ] If letter was sent via email, receiver's email is pre-filled at the save gate (one click to persist)
- [ ] If receiver's email matches existing account, results auto-attach on login
- [ ] If receiver closes browser before saving, local state persists (sessionStorage) for return within same session

### Letter Reading
- [ ] Receiver sees a dedicated letter view (not a feed — a focused, sequential experience)
- [ ] Progress tracking bar at top shows position in letter (story N of M)
- [ ] Default ordering: points first, then parent story (D36 — commit before context, Clarity Flip mechanic)
- [ ] Sender can add optional vocabulary glosses on abstract points (define terms, not arguments)
- [ ] Receiver gets "I need context" button per point (tracked as content quality metric, not primary UX)
- [ ] Stories appear one at a time — receiver progresses through the sequence
- [ ] For each story, receiver must rate understanding (0-10) via `RatingButtons` before proceeding
- [ ] Rating prompt: "How well do you believe you understood this?"
- [ ] After receiver rates, the author's prediction is revealed as dual progress bars
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

### Understanding × Agreement Grid
- [ ] Grid component: Y-axis = understanding (0-10), X-axis = agreement (-3 to +3)
- [ ] Upper quadrants: ✓ Verified agreement (top-right), ✓ Verified disagreement (top-left) — green labels
- [ ] Lower quadrants: ⚠️ Potential false agreement (bottom-right), ⚠️ Potential false disagreement (bottom-left) — amber labels with "might misunderstand each other" subtitle
- [ ] Grid triages WHERE gaps exist; stories diagnose WHAT kind (flip/fork/verified) — no mechanical classification on grid (D38)
- [ ] Each listener's position rendered as a dot on the grid per point
- [ ] Dot color uses blue for all active positions (matches existing `PositionButtons` component — no green/red value judgments)
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
- [ ] Assessment data persists in `story_verifications` with `source='letter'`, `verified=false`
- [ ] `clarity_sessions` gets nullable `source_letter_id UUID REFERENCES clarity_letters(id)` + index (D26 — future "start /live from letter" hook)
- [ ] Letter snapshots preserve per-story `visibility` from `stories.visibility` (D23)
- [ ] Letter status visible to sender: sent, opened, in-progress (N of M stories rated), completed
- [ ] Works on mobile (touch-friendly dot picker, full-screen reading)
- [ ] Grid component exportable for future use in /live and clarity docs (P551)
- [ ] After completing letter, receiver sees "Add a story" CTA on each point (optional, D19)
- [ ] Receiver-filed stories + predictions visible on sender's gap map
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
- **Full form:** Doc snapshot + all revealed data (predictions, ratings, gap map, positions, filed stories). Like reviewing a graded exam. Sender always sees full form. Receiver unlocks progressively — completed stories show full data, incomplete stories are locked/greyed.

| Element | Value | Context |
|---------|-------|---------|
| Letter composition CTA | "Send as Letter" | Doc page header, primary action row (not overflow menu, D22) |
| Prediction prompt | "How well will [Receiver] understand this?" | Composition, per story, `RatingButtons` 0-10 (reuse existing component) |
| Understanding prompt | "How well do you believe you understood this?" | Letter reading, per story, `RatingButtons` 0-10 (reuse existing component) |
| Gap display | Dual progress bars (blue=receiver, orange=author) + "A gap of N — worth noting" | After receiver commits, per story |
| Position buttons | ✕ (disagree) / ? (maybe) / ✓ (agree, dropdown: somewhat/agree/strongly) | Per point, after story rating |
| Author position locked | "🔒 Author's position hidden — engage to reveal" | Until receiver takes position or files story |
| Story filing CTA | "+ Add a story — optional" (dashed border button) | Per point, within letter reading |
| Progress bar | Segmented bar showing story N of M | Top of letter reading view |
| Grid quadrants (pre-verification) | ⚠️ Potential false agreement (bottom-right), ⚠️ Potential false disagreement (bottom-left) — "You agree/disagree but might misunderstand each other" | Lower half of grid. Data viz color exception: amber for ⚠️ states |
| Grid quadrants (post-verification) | ✓ Verified agreement (top-right), ✓ Verified disagreement (top-left) — "You understand each other" | Upper half of grid. Green for ✓ verified states |
| Grid Y-axis | "UNDERSTANDING ↑" (0-10) | Always visible, no negatives |
| Grid X-axis | "← DISAGREE ... AGREE →" (-3 to +3) | Toggleable in some contexts |
| Paraphrase toggle | "Show/Hide paraphrase movement (N/M)" | Author view, after /live verification (future) |
| Point sorting | Points sorted by gap size (largest first) | Author gap map |
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
| D4 | ~~Position on points mandatory or optional?~~ | ~~Always optional.~~ **Superseded by D37.** Must position OR file story explaining why not. Can't skip silently. Existing "add a story" handles the explanation. |
| D5 | Author "counter-assesses" or "predicts"? | Predicts. The author predicts BEFORE the receiver reads, not after. This is sealed-bid, not reactive. The prediction reveals the author's calibration, not their judgment of the receiver's answer. |
| D6 | UX feel? | Ritual, not feed. Deliberate slowness. Full-screen, one story at a time. Gamification explicitly rejected. Particle effects on commitment moments (from prototype) are acceptable — they mark the weight of the moment, not gamify it. |
| D7 | Receiver can revise rating after gap reveal? | No. Rating is committed. Revising after seeing the prediction defeats the purpose. |
| D8 | Multiple receivers per letter? | Yes. Same stories, but predictions are per-receiver (facilitator predicts differently for each workshop participant). |
| D9 | Dot picker or continuous slider? | Discrete 0-10 buttons. Reuse existing `RatingButtons` component (`src/app/components/partners/shared.tsx`). Slider = live continuous signal (/live free mode). Buttons = async deliberate assessment (letters). Not a new component. |
| D10 | Author position visible or locked? | Locked until receiver engages (takes position OR files story). Incentivizes engagement. Unlocking is animated (fade-in). |
| D11 | Three-button or 7-point Likert? | Three-button (✕/?/✓) with agree-degree dropdown on ✓. Lower cognitive load. From prototype. |
| D12 | Gap map = list or grid? | Understanding × agreement grid (four quadrants). Both parties as dots. Arrows show movement. Grid is the core visualization across letters and /live. |
| D13 | Relationship to P551 clarity docs? | Unified in V1. Letter = immutable snapshot of a doc, delivered as a reading experience with assessment. Doc = mutable compose/edit surface where stories accumulate. "Send as Letter" on doc page triggers composition wizard. Separate specs, shared grid component, unified data model (4 new tables + story_verifications extension). |
| D14 | Can receiver file stories? | Yes. On any point — to explain position, explain false premise, or explain non-position. Uses P560 story-filing mechanic inline. |
| D15 | Account required to read a letter? | No. The entire letter experience works without an account. Registration gate at EXIT (after gap map), not entrance. The experience is the conversion funnel. Local state (sessionStorage) holds all data until persisted. |
| D16 | How does facilitator share the letter? | Two paths: (a) Link — QR code, WhatsApp, etc. Anonymous access, email entered at save gate. (b) Email — facilitator enters receiver's email at composition. Email pre-filled at save gate, one click to persist. Email-sent letters have lower registration friction. |
| D17 | What is the feature called? | "Clarity Letter." Not "letter," not "doc in reading mode." Clarity Letter is a first-class entity — related to clarity docs (P551) but distinct. |
| D18 | ~~Where does the understanding map live?~~ | ~~Deferred.~~ **Superseded by D28.** Letters live within the Clarity Docs page, not a separate `/letters` route. |
| D19 | Bidirectional letter — receiver adds stories? | V1 optional: after completing a letter, receiver sees "Add a story" CTA on each point. Receiver files own stories + sets predictions. Sender views on gap map. V1.5: sender formally reads + rates receiver's stories (sealed-bid Phase 4). |
| D20 | Workshop shared view? | Facilitator projects their screen (sender's gap map = group view). Real-time: facilitator's screen updates as participants submit (Supabase Realtime). No privacy feature needed V1. |
| D21 | Unified calibration data? | One `story_verifications` table serves both /live and letters. Add `source TEXT DEFAULT 'live'`, `verified BOOLEAN DEFAULT true`, `sort_order INTEGER`. Letters write with `source='letter'`, `verified=false`. When pair does /live on same story: new row with `source='live'`, `verified=true`. Grid shows both: dashed dot (letter) → solid dot (live) → arrow = movement. |

| D22 | "Send as Letter" button placement vs Share button? | Complementary, not competing. Share = copy URL/embed (utility, icon button). "Send as Letter" = primary CTA in action row (the whole point of docs). No overflow menu. |
| D23 | Story visibility in letter snapshots? | Per-story. Stories have individual `visibility` (immutable, P586). A private doc can contain both public and private stories. Snapshot preserves each story's visibility. No doc-level override. |
| D24 | New content created from letter inherits parent visibility? | Yes. Points created from stories inherit `story.visibility`. Stories created from points inherit `point.visibility`. Pre-req P607 implements this. |
| D25 | Private letter URL without valid token? | Returns 404. No existence leak — don't distinguish "doesn't exist" from "you can't access." Same security pattern as token-gated resources. |
| D26 | `source_letter_id` on `clarity_sessions`? | Include in P581 migration. Nullable FK to `clarity_letters`. Enables future "start /live from letter" feature without schema changes. One column + one index. |
| D27 | Letter results visible to sender? | In-scope for P581. Sender must see sent letters + completion status + results. Without this, sending has no purpose. |
| D28 | Where do sent/received letters live in the app? | Within Clarity Docs page — "Letters" section showing sent + received. Letters are always sourced from docs, so doc page is the natural home. No separate `/letters` nav item V1. Supersedes D18. |
| D29 | Private letter auth flow? | Reuse Agreement invitation pattern (P422/P488/P527): token-based access + email lookup + one-click registration. Existing user: magic link (no re-auth). New user: `create-and-sign` edge function pattern adapted to `create-and-open-letter`. Receiver can also access from within app (doc page shows received letters) — email is not the only entry. |
| D30 | Public letter auth flow? | Reuse Pledge flow pattern: guest reads → completes → registration gate at end. sessionStorage holds intent. Email input → magic link → results persist on verification. |
| D31 | Letter has two views? | Yes. **View form** (receiver's sequential reading experience — one story at a time, rating gate per story, sealed-bid). **Full form** (doc snapshot + all data from both parties — predictions, ratings, gap map, positions, filed stories). Sender always sees full form. Receiver sees full form only after completing view form. |
| D32 | Partial completion → partial full form access? | Yes. Receiver who completes 3 of 5 stories can see full form for stories 1-3 (revealed data). Stories 4-5 remain locked/greyed in full form. Progressive unlock. |
| D33 | P590 design system applies to all P581 UI? | Yes. All buttons use shadcn `<Button>` with proper variants. Lock/globe icons for visibility. Touch targets ≥ 44px. Amber for private, blue for public banners. |
| D34 | Rating input for letters? | Discrete 0-10 buttons — reuse existing `RatingButtons` component. Slider is for /live continuous signal only. See D9. |
| D35 | Grid quadrant labels? | Pre-verification (letter): bottom quadrants labeled "Potential false agreement/disagreement ⚠️" with "You agree/disagree but might misunderstand each other." Post-verification (/live): upper quadrants labeled "Verified agreement/disagreement ✓" with "You understand each other." Understanding (Y-axis) drives the transition from bottom to top. |
| D36 | Point-before-story ordering? | Default: point-first always — preserves Clarity Flip commit-before-context mechanic. Sender can add vocabulary glosses for abstract terms. Receiver gets "I need context" escape valve (tracked as content quality metric — >30% requests = flag for sender). Story-first and sender-chooses-per-point are rejected. |
| D37 | Point engagement model? | B: must position OR file story explaining why not. Can't skip silently. Existing "add a story" handles the explanation — no extra UI prompts needed. Supersedes D4. |
| D38 | Verification outcome states? | Three outcomes: flip, fork, verified agreement/disagreement. Grid triages (WHERE), stories diagnose (WHAT kind). No mechanical classification of flip types — behavior (paraphrase/story content) encodes the distinction. See definitions.md > Verification Outcome States. |
| D39 | "Can't position because don't understand"? | Handled by existing story filing. User taps "?" → "add a story" → explains in natural language. No dual-track prompt, no extra buttons. Story content reveals comprehension gap vs opinion uncertainty. |

---

## Open Questions

1. **Can receiver reply with their own letter (ping-pong)?** Likely future feature, not V1. V1 is one-directional: sender → receiver.
2. **Does gap map feed into /live session setup?** Ideally yes — "start /live on story with biggest gap." V1 gap map has "Ready for live?" CTA but no deep integration.
3. **~~How does receiver discover they have a letter?~~** RESOLVED (D28/D29). Private letters: email invitation (Agreement pattern). Public letters: shareable link. Both: visible in Clarity Docs page under "Letters received" section. Email notifications are a separate spec (P573).
4. **Can sender include stories by other authors?** V1: sender can only include their own stories. Curating others' stories is a future capability.
5. **Does the grid replace JourneyToUnderstanding in /live?** The grid is a superset (shows both understanding AND agreement). Long-term yes. V1: grid lives in letters, JourneyToUnderstanding stays in /live. Migration is a future task.
6. **Can a letter document external paraphrase?** (e.g., "we already discussed this in person, I just want to record it") — async /live alternative. Likely future, not V1.
7. **Guess-line → collapse mechanic:** Both parties' guesses form a line segment on the grid (uncertainty band). After paraphrase, Y collapses to verified number. Visually compelling but may be too complex for V1. Explore in /ux.
8. **~~Should composition create an implicit Clarity Doc?~~ RESOLVED (2026-03-24).** Yes — docs are V1, not future. Every letter is sourced from a doc. `source_doc_id` is NOT NULL. The doc page IS the composition surface. "Send as Letter" button on doc header opens the wizard. No standalone composition flow.
9. **Remix flow for Letter 2:** After completing a letter, can the receiver create their own letter reusing the same *points* but with their own *stories*? V1: receiver uses standard flow — create own doc, add stories on same points, send as letter. Future: "Create your own letter from these points" CTA on gap map that auto-creates a doc pre-populated with the sender's points.

---

## Prototype Reference

Working prototypes built in claude.ai (2026-03-23) inform this spec:

1. **Letter prototype (full flow):** Cover → story reading → dot picker rating → CalibCard gap reveal → sequential points with three-button row → author position lock/unlock → story filing → author gap map with quadrant plot + paraphrase movement toggle + listener hover inspection + linked stories + "Ready for live?" CTA.

2. **Grid prototype (dark, interactive):** Understanding × agreement grid with radial gradient background, particle burst on placement, ghost dot on hover, toggleable X-axis, monospace readout. Y-axis 0-10 (no negatives), X-axis -5 to +5.

3. **Screenshot variations (4):** Progress tracking bar, dual progress bars for gap reveal, "commit → reveal speaker's score" sealed-bid flow, feed-style story cards with gap callouts.

Key patterns from prototypes: dot picker (not slider), three-button (not Likert), author lock until engagement, progress bar, dual-bar gap reveal with severity framing, quadrant scatter plot with hover inspection.

---

## Reuse Analysis (from P590/P581 coordination session)

**Agreement invitation flow (P422/P488/P527)** — reusable for private letter delivery:
- Token-based invitation with expiry (`invitation_token` + `invitation_expires_at`)
- Email lookup for existing vs new user (`lookupUserByEmail()`)
- One-click registration via `create-and-sign` edge function (atomic user creation + action)
- Magic link for existing users (skip re-auth, P488)
- SECURITY DEFINER RPC for token validation
- Key files: `accept-agreement-page.tsx`, `agreements-service-real.ts`, `send-agreement-emails/index.ts`

**Pledge flow** — reusable for public letter completion:
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
- Replacing JourneyToUnderstanding in /live with the grid (future migration)
- Async /live mode (documenting external paraphrases) (future)
- Letter editing / versioning — edit the source doc, send new letter as new snapshot (future V1.5)
- "Create your own letter" CTA on gap map — remix flow for Letter 2 (future post-V1)
- Three-letter workshop sequence automation — V1 is manual facilitation with individual letters
- Value assessment / PWIW screen after letter completion — Letter 3 (future)
- Distributor CTA on Letter 3 completion (future)

---

## ASCII Flow: "Sealed Slides" (from /ascii-flows, corrected)

Winner from 30 variants. Scored 84/100. Corrections applied from founder review.

### Naming (resolved)

"Clarity Letter" — a first-class entity, distinct from the Clarity Doc it snapshots. The doc is the editing surface; the letter is the sealed reading experience with assessment. D13 resolved: unified in V1, but separate concepts.

### COMPOSITION (Sender — 3 steps, triggered from doc page)

```
DOC PAGE (P551) — sender clicks "Send as Letter" in header

┌──────────────────────┐
│ ╔════════════════════╗│
│ ║  SEND AS LETTER   ║│
│ ╚════════════════════╝│
│                       │
│  Step 1 of 3  ●○○    │
│  Confirm stories      │
│                       │
│  From: "Therapy Notes"│
│  ┌───────────────────┐│
│  │ ☑ Hiring stance   ││
│  │ ☑ Funding views   ││
│  │ ☐ Budget concern  ││
│  └───────────────────┘│
│  (deselect to exclude)│
│                       │
│       [ Next → ]      │
└───────────────────────┘

┌──────────────────────┐
│  Step 2 of 3  ○●○    │
│  Add receivers        │
│                       │
│  Send to:             │
│  ┌───────────────────┐│
│  │ alex@co.com       ││
│  └───────────────────┘│
│  [ + Add person ]     │
│                       │
│       [ Next → ]      │
└───────────────────────┘

┌──────────────────────┐
│  Step 3 of 3  ○○●    │
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
│  ╔══════════════════╗ │
│  ║  ✦ Seal & Send  ║ │
│  ╚══════════════════╝ │
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

Note: Dot picker, not slider. Tapping a dot fills up to that point (like prototype). Submit commits — no going back.

Confidence slide REMOVED — the rating itself IS the confidence. Adding "how confident are you in your confidence?" is a loop.

**Slide 3: REVEAL** (reuses calibration history pattern)

```
┌──────────────────────┐
│ ■□  Story 1 of 2     │
│──────────────────────│
│                      │
│  ┌──────────────────┐│
│  │ Your guess       ││
│  │ ████████░░  8/10 ││
│  │                  ││
│  │ Sarah's guess    ││
│  │ ██████░░░░  6/10 ││
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

Note: Reuses dual-bar pattern from JourneyToUnderstanding / CalibCard. Language says "guesses" — we don't pretend to know what we don't know. No false-consensus labeling at this stage (that requires the grid, which comes in Act 3 after positions are taken).

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

Note: Engagement = taking position OR filing a story. Either unlocks author position. "Skip" is always available — skipping is itself a signal. Story filing explains position, non-position, or false premise ("I reject this framing because...").

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

Note: Clean break. Shows progress. No enforced breathing timer — just a natural pause before tapping. Not a meditation app.

→ Story 2 begins at Slide 1.

### READING — ACT 3: GAP MAP (after all stories)

```
┌──────────────────────┐
│                      │
│ ╔════════════════════╗
│ ║  ✦ YOUR           ║
│ ║  UNDERSTANDING     ║
│ ║  MAP               ║
│ ╚════════════════════╝
│                      │
│  Understanding (Y)   │
│  10│  ●         ●   │
│    │                │
│   5│         ●      │
│    │                │
│   0├────────────────│
│   -3   0   +3       │
│   Agreement (X)      │
│                      │
│──────────────────────│
│                      │
│  Per point:          │
│                      │
│  ┌──────────────────┐│
│  │ "Seniors reduce  ││
│  │  onboarding"     ││
│  │                  ││
│  │  You: ✓ Agree    ││
│  │  Sarah: ✓ Agree  ││
│  │  Understanding   ││
│  │  gap: 2          ││
│  │  Quadrant: ??    ││
│  │  (verify in /live││
│  │   to find out)   ││
│  └──────────────────┘│
│                      │
│  2 stories read      │
│  5 positions taken   │
│  3 gaps > 2          │
│                      │
│ ╔════════════════════╗│
│ ║  Worth checking   ║│
│ ║  in /live?        ║│
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

Note: No "position shifted" claims — nothing shifted yet. These are guesses from both sides. The grid shows where each party THINKS they are. Quadrant labels are tentative ("??") because verification hasn't happened. The arrows and shift proof come AFTER /live paraphrase cycles — that's a future update to this same grid, not shown in the letter flow itself. The letter is triage: "here's where to look." /live is verification: "here's what's real."

### AUTHOR GAP MAP VIEW

```
┌──────────────────────┐
│  LETTER RESULTS      │
│  To: Alex            │
│  Status: Completed   │
│──────────────────────│
│                      │
│  Understanding (Y)   │
│  10│  ●         ●   │
│   5│      ●         │
│   0├────────────────│
│   -3   0   +3       │
│                      │
│  (tap dot to inspect)│
│                      │
│──────────────────────│
│  Per point:          │
│                      │
│  1. "Funding runway" │
│     Gap: 3           │
│     You guessed: 4   │
│     Alex guessed: 7  │
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
│ ║ Worth checking    ║│
│ ║ in /live?         ║│
│ ║ [ Schedule Live ] ║│
│ ╚════════════════════╝│
└──────────────────────┘
```

Note: No risk ranking formula. Just points sorted by gap size (largest first). Simple. Author sees gaps + linked stories + "worth checking in /live?" CTA.

---

## Next Steps

1. ~~Run `/challenge-prd`~~ — done (verdict: RETHINK → addressed by scope decisions)
2. ~~Run `/ascii-flows`~~ — done (winner: Sealed Slides, corrected above)
3. **Run `/architect`** — unified data model with P551 (4 new tables + story_verifications extension). One `/architect` run on both specs.
4. **Run `/ux`** — doc page + send wizard + reading + grid (combined P551+P581 interaction design)
5. Run `/generate-tests` — acceptance criteria → test stubs
6. Run `/dev` — Phase 1: schema + migration, Phase 2: doc CRUD (P551), Phase 3: letter composition + delivery, Phase 4: letter reading WITH grid, Phase 5: gap map + sender view
