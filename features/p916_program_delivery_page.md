---
status: in-progress
type: story
rank: 977.33
created_date: '2026-06-10'
tags:
  - program-page
  - conversion
  - value-prop
  - accelerator-distribution
delivery_stage: ship
pipeline_ran:
  - create-spec
  - challenge-prd
  - dev
  - ship
pipeline_skipped:
  - 'ux -- assembling proven copy into proven components (section map in spec)'
  - 'architect -- static page; apply-post chosen at build (Open Q #1)'
---

# P916: Program / delivery page (founder-facing, accelerator-distributed)

## Problem

**Situation:** The 2026-06-02 coach-distribution pivot produces a co-delivered **paid program** (a coach co-runs it; sold via accelerators/angels as distributors — goals.md "Core Loop" + step 6). The coach landing page (`coach-partnership-page.tsx`, P856, reframed by P915) recruits *coaches*. The 2026-06-09 conversation produced the most complete value articulation to date (now in lean-canvas §UVP "Value map — gains × pains") and a strong, easy CTA — the Clarity Letter **risk score** ("cool for cta on landing! easy to implement"; now its own spec, **P918**).

**Complication:** There is **no founder-facing surface** an accelerator/angel can forward to sell the program to founder pairs. The value map lives in a strategy doc, not on a page. Without this page, goals.md step 6 ("program/delivery page + joint positioning + accelerator/angel outreach") has nothing to point at. *But* the page must not get ahead of what's proven (see Risks) — so the interactive machinery is deferred.

**Question:** What founder-facing surface — the full static value story, but **short of building interactive conversion machinery** — tests whether a warm-forwarded founder pair recognizes the split-pain and converts?

**Distinct from P915/P856 (read first, do not merge):** P915/P856 = the **coach** landing (`/`, audience: coaches recruiting as collaborators). P916 = the **founder/buyer** program page (audience: founder pairs arriving via an accelerator/angel). Different audience, different hook, different CTA. Cross-link; do not duplicate.

## Appetite

**Blast radius — Phase 1 small/medium, Phase 2 medium.** Phase 1 = a static page (hook + value map + apply form), no P918, no schema, no payment. Phase 2 = the P918 interactive instrument + the committed coach's real credential. No existing flow changes either way.
**Reversibility — high.** New page, git-revertable; no schema, no data migration (Phase 1 apply capture can be form/email).
**Decision density — HIGH.** FOUNDER DECISIONs unresolved: program name, pricing, tagline/CTA copy. Do not invent any — mark and ask. (Brand/domain, buyer model, and staging resolved 2026-06-10 — see Resolved Decisions.)

## Solution

**Buyer model — `warm-forward-to-pair` (a distinct segment).** The founder pair self-buys after a warm forward. This is a *deliberate, named* segment — **NOT** the lean-canvas "Pair-Builder Programs" segment (where the buyer is the program director and one sale onboards a cohort). Both can exist; this page serves the self-buying pair. The pair self-qualifies by **applying** (see CTA), not by booking a call into a calendar that does not yet exist.

**Staged build (resolved 2026-06-10 after /challenge-prd RETHINK).** The split is **static copy vs. interactive build**, not "page now vs. value map later." Static copy (hook + the full value map) is cheap, reversible, and IS the test of the value articulation — so it ships in Phase 1. The one genuinely separate *build* is the **P918 interactive self-diagnostic** (a new instrument with its own honest-scope design problem); that, plus a *real* committed-coach credential, is the gated Phase 2.

### Phase 1 — the static `/program` page (build now)

The full *static* value story — everything except the P918 interactive instrument and a real coach claim. Putting the whole articulation on the page tests the thing we most need to learn (does *this naming of the pain* make a warm-forwarded founder apply?), not just a stripped hook. Build:

1. **Hook = the split** above the fold — the frozen 2026-06-04 founder-facing cut ("verify before you commit"). Pain, not category. One wedge leads; the map supports (not a feature wall).
2. **Value map (gains × pains)** — lean-canvas §UVP: 8 gains sorted affective → cognitive → validity; 7 avoided-cost pains labeled **illustrative, not measured**. Ships as a *labeled hypothesis* — the vocabulary is the author's until a buyer's words replace it; revise the copy from Phase-1 apply-field answers.
3. **Program structure** — ≤2 sentences, noting it is co-delivered with a credentialed coach (generic placeholder until a coach commits — do not name a fake coach).
4. **Price placeholder** (FOUNDER DECISION — see UI Contract).
5. **Primary CTA = Apply** — a founding-cohort application, **not** a Calendly booking. The application IS the self-qualification *and* the test instrument: it captures who, on a warm forward, recognizes the pain enough to apply, and includes an open **"what is the misunderstanding costing you / your co-founder right now?"** field that doubles as the H-WTP-Pain / illegibility instrument (can they name a concrete cost in their own words?).

Static — **no P918, no schema, no payment flow.** Apply capture can be a form or email.

### Phase 2 — interactive + committed-coach layer (GATED — do not build until BOTH fire)

**Gate:** (a) H-WTP-Pain returns signal — **≥3 of ~10** warm applicants name a concrete cost in their own words (the illegibility test, decisions.md 2026-03-25); **AND** (b) a co-delivery coach commits (goals.md step 6). Then add to the static page:

1. **The P918 interactive self-diagnostic** as a top-of-funnel CTA (take the risk score → route into Apply) — self-rated, uncalibrated; honest-scope (never a measured gap). This is the one genuinely separate *build*, which is why it is deferred — the static value map is not.
2. **The committed coach's real credential** replaces the generic placeholder — the *co-deliverer credibility transfer*, distinct from the accelerator's *distributor endorsement*: the accelerator delivers the audience, the coach delivers the trust.
3. **Final tagline** — to-test field, FOUNDER DECISION (verb must be **verify/check**, never "listen"). Candidates in UI Contract.

## Phase 1 Build Plan

> Assembly guide. Most copy is **reused** — cp coach landing (`coach-partnership-page.tsx`) for *components*; **ladischenski.com** for *copy* (already founder/co-founder-audience). Only the value map (#4) and the Apply form (#9) are new. (Derived from a 2026-06-10 study of both landings + the coach page's revision history.)

### Section map (order = problem → why → promise → mechanism → proof → offer)

| # | Section | Source | New? |
|---|---------|--------|------|
| 1 | Eyebrow badge | ladischenski "Protecting high-stakes partnerships" | reuse |
| 2 | **Hero — the split (cost first)** | ladischenski: "A co-founder split costs €100k–€1M+ and years" + "They don't split over conflict — both believe they understand each other, and neither checks"; wedge subhead = frozen "verify before you commit"; CTA = **Apply** | reuse copy / new CTA |
| 3 | Why it persists (quantified) | ladischenski 49%→26% gap (Gilovich 1998) + cp "why almost nobody verifies" 3 cards (illusion of transparency / curse of knowledge / social norm) | reuse |
| 4 | **Value map (gains × pains)** | lean-canvas §UVP; labeled "illustrative, not measured" | **NEW** |
| 5 | The split made visual | cp `MisunderstandingVenn` (v2) **or** ladischenski False-Belief Grid — pick one | reuse component |
| 6 | Program structure | ladischenski bullets ("agreement as calibration — prove you understood before signing"); coach = generic placeholder | reuse + placeholder |
| 7 | Founder credibility | ladischenski "14 co-founder partnerships" + timeline (6yr, €398k, closed it, studied why, published paper) | reuse |
| 8 | Price + risk-free | placeholder per-pair + ladischenski risk-free guarantee | placeholder + reuse |
| 9 | **Apply CTA (the test)** | form; key field: "what is the misunderstanding costing you / your co-founder right now?" | **NEW** |
| 10 | FAQ | ladischenski co-founder FAQs (conflict-first / only-one-wants / vs-therapy / can't-fix → "now, vs two years and a cap table") | reuse |
| 11 | References | Wasserman 65%, Gilovich 49→26, Axios/Radical Candor — re-verify wording matches source | reuse + verify |

**Copy sources:** cp components in `src/app/pages/coach-partnership-page.tsx` + `src/app/components/landing/`; ladischenski copy in `~/Projects/public/ladischenski-com/app/page.tsx` and `app/tree/landing-v5|v6|homepage-v2/page.tsx` (co-founder variants — richest source).

### 7 lessons carried from the coach page's revisions (do once, skip the redo)
1. **CTA matches buyer stage** — Apply, not "explore a partnership" / "book a call".
2. **Source-accuracy pass on every stat** — citation resolves to a real source AND page wording matches the source verbatim (the coach page shipped a fabricated cite + stat drift). Value map stays labeled "illustrative".
3. **Hero = visceral cost, not the mechanism** — lead with the €-split; the which-gap line lives in the body.
4. **Epistemically-coherent visual** — if reusing the Venn, keep v2 (fog vs verified); no crisp pre-verification overlap.
5. **Comprehension order** — promise before atoms; don't show the product's mechanics before the value is established.
6. **Trust line consistent with price** — NO "free & open source" on a priced page.
7. **Founder credibility, not sparse social proof** — no SignatureWall; use the 14-co-founders bio.

### Privacy
Founder-credibility copy (bankruptcy, €398k, 14 co-founders) is already public in lean-canvas "Unfair Advantage" — sanctioned for this public repo. Frame as the *method creator's* credential, not a personal-coaching pitch.

## Risks / Non-Goals

### Risks
- **Premature conversion infra (the challenge's core finding).** Building the interactive instrument + a real coach claim before WTP is validated and a coach commits is machinery for an unproven offer. *Mitigation (MITIGATE):* the static page (Phase 1) tests the assumptions cheaply via the Apply form; the interactive instrument (P918) and real-coach credential are gated (Phase 2).
- **Positioning re-cut risk.** The page must present the *already-settled* hook, not reopen it. *Mitigation (MITIGATE):* lift the founder-facing cut verbatim from lean-canvas 2026-06-04 "Positioning — frozen until tested"; the next positioning rewrite is earned by the first real co-delivery, not this page.
- **Pricing/value congruence.** €500 (floated 2026-06-09) is "almost too cheap" for "prevents company death" — too-cheap signals low value. *Mitigation (FOUNDER DECISION):* price is a founder decision — frame the program modestly or as an explicit founding-cohort rate; the page must match claim to provable scope. Buyer = self-buying pair → price is **per-pair**, not cohort procurement.
- **Value-map vocabulary is the author's, not the buyer's.** *Mitigation (MITIGATE):* it ships as a labeled hypothesis; the Phase-1 apply-field answers re-source it before the copy is treated as settled.

### Non-Goals
- Do NOT build Phase 2 (the **P918 interactive instrument**, the real-coach credential, the final tagline) before BOTH gates fire (WTP ≥3/10 cost-namers AND a coach commits). The static value map IS Phase 1.
- Do NOT build the risk-score instrument here — it is **P918** (Phase-2 CTA); do not build a two-party letter engine (P918 is solo).
- Do NOT lead with "let's partner" — the page sells the *program* (participant), not co-delivery (the end-state upsell). (decisions.md 2026-06-10.)
- Do NOT invent the program name, pricing, or final tagline/CTA copy — FOUNDER DECISIONs. (Brand/domain resolved: claritypledge.com/program.)
- Do NOT re-cut the positioning hook in copy — present the frozen 2026-06-04 cut.
- Do NOT merge into or restyle the coach landing (P915/P856) — separate audience, separate page.
- Do NOT add a server endpoint, schema, or table for Phase 1 (apply capture is form/email); no payment flow in Phase 1.
- Do NOT broadly launch/promote to accelerators before a coach commits — **but** a controlled Phase-1 test-forward to a handful of warm founders IS the point and is allowed.

## Done-When

### Phase 1 (build now)
- [x] Static `/program` page live: split-pain hero above the fold + the gains × pains value map (labeled illustrative) + ≤2 sentences of program structure (coach as generic placeholder) + price placeholder + Apply CTA.
- [x] The value map renders on desktop and 320/375px (gains affective/cognitive/validity; pains labeled illustrative).
- [x] The Apply CTA submits (form/email capture works) and includes the open "what is the misunderstanding costing you?" field.
- [x] No P918, no schema, no payment flow added in Phase 1 (verified by diff).
- [x] Page is distinct from `/` (coach landing); cross-link present, no duplicated hero.

### Phase 2 (GATED — both gates fired)
- [ ] [GATED] The P918 interactive self-diagnostic is added as a CTA, wired in (not built here); score presented as self-rated, never a measured gap; P918 live end-to-end.
- [ ] [GATED] The committed coach's real credential replaces the placeholder; both credibility transfers visible.
- [ ] [GATED] Tagline rendered from a single to-test field; no tagline hard-coded as final.

## UX Notes

- **Audience is warm, not cold:** arrival is via a trusted distributor (accelerator/angel) or a coach's network — copy assumes a forwarded, pre-warmed reader, unlike the coach landing's cold hero.
- **Buyer = the founder pair (self-buy), via Apply:** the CTA is an application (qualification + test), not a booking into a non-existent calendar.
- **Phase 1 carries the full static story, but is still the experiment:** its purpose is signal (do warm founders apply; can they name the cost). It ships the hook + value map so the test is of the *real* value articulation — but resist adding the P918 instrument or a payment flow "while we're here."
- **One wedge, not seven:** the hero is the single split-pain; the value map appears below as supporting depth, not a feature wall.
- **States to cover (Phase 1):** apply form empty / submitting / submitted / error; value map at desktop + 320/375px. **(Phase 2):** P918 CTA before/after completion; tagline placeholder until FOUNDER DECISION resolves.

## Acceptance Criteria

- [x] **Phase 1 ships** as a static page at `/program`: the split-pain hero (matches the frozen cut) above the fold and the gains × pains value map (labeled illustrative) below it (observable: page exists, both sections present).
- [x] **The Apply CTA captures applications** including a free-text cost-naming field (observable: a submission persists or sends an email).
- [x] **The gate metric is measurable:** of warm-forwarded applicants, the count who name a concrete cost in their own words is recorded (the H-WTP-Pain / illegibility proxy; ≥3/10 helps unlock Phase 2).
- [x] **Buyer model is named** as a distinct `warm-forward-to-pair` segment, not silently contradicting the Pair-Builder "program-director-buys" segment.
- [x] **The P918 instrument is not built/wired** until both gates fire (the static value map is Phase 1; only the interactive instrument + real coach are gated).
- [x] Every remaining FOUNDER DECISION (name, price, tagline/CTA copy) is surfaced as an explicit placeholder, not silently filled.
- [x] The page does not re-cut positioning — the founder-facing hook matches the frozen 2026-06-04 lean-canvas cut.

## UI Contract

| Element | Value | Context |
|---|---|---|
| Program name | `[FOUNDER DECISION: program name]` | hero / title |
| Hero pain (wedge) | the catastrophic split — "verify before you commit" (frozen founder-facing cut) | above the fold (Phase 1) |
| Value map — gains/pains | 8 gains affective→cognitive→validity; 7 pains labeled "illustrative, not measured" (lean-canvas §UVP) — **Phase 1**, ships as a labeled hypothesis; revise copy from apply-field answers | below hero |
| Primary CTA — Phase 1 | **Apply** (founding-cohort application) — `[FOUNDER DECISION: exact CTA copy]` | hero + repeat |
| Apply form — key field | open text: `What is the misunderstanding costing you / your co-founder right now?` (the WTP/legibility instrument) | apply form |
| Price | `[FOUNDER DECISION: pricing]` (€500 founding-cohort floated 2026-06-09) — per-pair | offer block |
| Brand / domain | **claritypledge.com/program** (resolved 2026-06-10; coach landing stays at `/`, cross-linked) | route |
| Added CTA — Phase 2 | **[Phase 2, GATED]** **P918** self-diagnostic — `[FOUNDER DECISION: exact CTA copy]` (self-rated score → routes into Apply) | hero, above Apply |
| Tagline (to test, do not hard-pick) | **[Phase 2]** Candidate A: `We all crave being understood. Let's commit to verify we are.` · Candidate B: `We all crave being understood. Let's make it safe to find out we didn't.` · Candidate C: `The safety to be honest when it matters — a mutual promise to surface what we haven't yet understood.` — verb MUST be verify/check, never "listen" | hero subhead |

## Build-Time Resolutions (Open Questions, resolved by /dev — /architect was skipped)

1. **Apply-capture (Q1):** **mailto to ops@claritypledge.com** — the Apply form (no backend/schema per Non-Goals) builds a pre-filled email; applications land in the ops@ inbox where the founder reads the cost-naming answers. Founder chose "Apply only" (not "try Clarity Letter"); a hosted-form URL can replace the mailto later (one-line change) for a dashboard.
2. **P918 surfacing (Q2):** deferred — Phase 2, GATED. Not built.
3. **Shell (Q3):** **fresh page** (`src/app/pages/program-page.tsx`). `partner-template-page.tsx` is a small certificate-display page (`CertificatePageShell`), not a marketing shell — not reusable here. Modeled structurally on the coach landing; `MisunderstandingVenn` + `SectionHeader` extracted to shared `components/landing/` modules and reused by both pages.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Strategic Fit — conversion surface built before WTP validated + coach committed | **Staged along the static-vs-interactive line:** Phase 1 = the full static page (hook + value map + Apply CTA) ships now; Phase 2 = only the P918 interactive instrument + real-coach credential + final tagline, gated on WTP signal + coach commit | Static copy is cheap and IS the test of the value articulation; only a new interactive *build* (P918) warrants deferral. Matches the illegibility-is-root-blocker doctrine (decisions.md 2026-03-25) |
| 2 | /challenge-prd | [BLOCK] Assumption Validity — "self-buy" contradicts Pair-Builder "buyer = program director" | Keep self-buy; **name it a distinct `warm-forward-to-pair` segment** (not Pair-Builder) | Founder chose self-buy deliberately; Pair-Builder is a separate segment — name the divergence, don't silently contradict |
| 3 | /challenge-prd | [BLOCK] Testability — "self-qualify"/"self-purchase" ACs untestable; price placeholder vs "sales+booking" | Replaced with observable proxies; CTA = **Apply** (form submit); gate metric = applicants who name a cost in own words (≥3/10) | An apply submission + free-text cost field are mechanically verifiable; the cost-naming count is the Phase-2 gate metric |
| 4 | /challenge-prd | [WARN] CTA = booking with no calendar/coach | CTA = **Apply** (founding-cohort application), not Calendly | No coach/calendar exists yet; the application IS the qualification + WTP test (founder call 2026-06-10) |
| 5 | /challenge-prd | [WARN] value-map vocabulary is the author's, not a tested buyer's | Value map ships in Phase 1 as a **labeled hypothesis**; apply-field answers re-source it before it's treated as settled | Putting it on the page IS how we test the articulation; the apply field captures the buyer's own words in parallel |
| 6 | /challenge-prd | [WARN]/[NOTE] participant-vs-partner relationship unclear on page | Page leads with the *program* (participant), never "let's partner"; relationship detail deferred to /ux | Matches decisions.md 2026-06-10 "partner is the end-state, not the door" |
| 7 | founder (2026-06-10, post-writeback) | The value map was wrongly placed in Phase 2 | Moved value map to Phase 1 — it is static copy, not an interactive build; P918 is the only genuinely separate (deferred) build | A stripped hook tests too little; the full static articulation is the better, still-cheap experiment |

## Dependency

- **P918 (misunderstanding-risk self-diagnostic)** — the **Phase-2** interactive CTA (NOT Phase 1; Phase 1 uses the Apply form + the static value map). P918 owns the scoring model, copy, and honest-scope framing. Cross-linked; shares Phase 2's gate.
- **Launch gate:** Phase 1 may be test-forwarded to a handful of warm founders now. Broad accelerator promotion + Phase 2 (P918 + real coach) wait on a committed co-delivery coach (goals.md step 6; 2026-06-10 — two candidates assessed, neither fit) AND ≥3/10 cost-namer signal.
