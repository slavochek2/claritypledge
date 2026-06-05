---
status: all-done
type: story
rank: 250196.25
created_date: '2026-05-27'
tags:
  - coordination
  - cofounder
  - offer
  - application
  - funnel
  - coach
pipeline_ran: [create-spec, dev, ship]
completed_at: 2026-06-05
---

# P856: Coach partnership page + synergy application (coach-facing selection-tool model)

> Naming history: "Clarity Org Foundry offer page" → "Cofounder coordination offer page" → **coach-facing partnership page** (2026-06-02). **Strategy pivot ([docs/decisions.md](../docs/decisions.md) 2026-06-02 [product], line 46):** the instrument is a **selection/verification tool sold THROUGH coaches**, not a direct-to-cofounder offer. **Founders are the end-user/proof, NOT the acquisition surface.** This spec's prior direct-to-pair model (cohort ≈€500/pair as flagship) is **superseded** — the cofounder/pair experience survives only as *proof of what a coach's clients go through.* Brand = **Clarity Pledge**; the founder's practice (ladischenski.com) is the R&D lab + proof.

## Problem

**Situation:** Clarity Pledge needs a front door for its real distribution channel — **coaches** (cofounder coaches, therapy-informed founder coaches, practitioners) — starting with a **coach-of-coaches** as the first warm target. The instrument is a *selection/verification tool* ("verify before you commit") that gives coaches the **comprehension-accuracy measurement they currently lack** (lean-canvas:91; facilitator-guide Position C). Prod evidence killed the prior front doors: the viral-letter front door has **R₀ ≈ 0** (18 letters, 16 by the founder, 0 async completions), and **direct-to-founder acquisition is a complex, one-client-at-a-time sale** — the very reason to route through coaches, who already hold the audience.

**Complication:** Resolved model, post strategy pivot (`decisions.md:46`):

- **Audience flip — coaches, not pairs.** The page sells to the coach. Founders/pairs are the **end-user and the proof**, never the acquisition surface — the founder can't transmit a complex instrument cold; trusted coaches carry it.
- **Lead with retention + proof-of-value, NOT "more customers."** The coach already brings the audience; "we'll get you clients" is backwards and was explicitly rejected (`decisions.md:52`). The two honest promises: **(1) measurable proof-of-progress that lifts client retention**, and **(2) a conversion funnel the coach runs on their OWN audience** — the free gap-reveal / Clarity Letter as a lead magnet that converts *their* prospects. Never "we send you clients."
- **One product, partner-existence is a parameter.** "pairs vs solo" dissolves — the coach decides who they run it with.
- **Nothing is validated.** No paying coach yet. The **synergy applications + the first paid loop ARE the demand test.** Falsifier: the first warm-coach co-delivered workshop produces **0 paid conversions** AND no coach will market it after ~3 co-deliveries → the coach-distribution thesis is dead (`decisions.md:54`).

**Question:** Build a lean **coach-facing page** (value-to-coach hero → the coach's measurement gap → what the instrument is (tease) → what the coach gets → the partnership model → proof → FAQ → **synergy application**) + keep a **founder/proof surface** (the end-user experience + a secondary direct path), ported + restyled from ladischenski.com `app/page.tsx` and CP `/about` into the CP design system.

## Appetite

Medium blast radius (new dev-gated `/tree/*` prototype; existing landing untouched until a later `/change-request` swaps prod). Reversible. High decision density — all copy, the value-prop order, the application questions, the platform/practitioner split, and pricing are `[FOUNDER DECISION]`; positioning (coach-facing selection tool) + the offer spine (synergy form → co-creation call) are **settled**.

## Solution

**Positioning (resolved):**
- **Audience:** coaches (cofounder coaches, therapy-informed founder coaches, practitioners); first warm target = a coach-of-coaches.
- **What it is:** a **selection/verification tool** — "verify before you commit" — the comprehension-accuracy measurement layer coaches lack (a pre-engagement diagnostic + mid-engagement metric + post-engagement validation; facilitator-guide Position C).
- **USP vs other coach tools:** *we tell the client **which** gap is blocking them — a misunderstanding vs a real disagreement — and install a shared method, measured* (lean-canvas:204-211). Tease, don't teach.
- **What the coach gets (value hierarchy — `[FOUNDER: order/emphasis]`):**
  1. **Retention** — measurable proof-of-progress keeps clients engaged longer (coaches today rely on a subjective sense of progress).
  2. **A conversion funnel on their own audience** — the free gap-reveal / Clarity Letter is a lead magnet the coach deploys to *their* prospects. NOT "we bring you clients."
  3. **Measurability / proof-of-value** — a number that proves the coaching worked.
  4. **Practitioner revenue split (Gottman shape)** — the coach keeps retention/relationship revenue; the founder keeps the license/method/club/data (`decisions.md:50`).

**The offer spine (settled — synergy form → co-creation call):**
- **Primary CTA = a short synergy application** ("tell me about your practice + your audience + where you see synergy") → a **co-creation conversation.** Low commitment, honest at the nothing-validated stage.
- **Likely first concrete collaboration = a co-delivered workshop** (the decision's falsifier target) — an *output* of the call, not the page's headline ask.
- **Pricing / split mechanics = `[FOUNDER DECISION]`.** Cash-first as the proof gate; time/labor as a fallback price (`decisions.md:50`).
- **Free Clarity Letter / gap-reveal** = the proof artifact + the coach's lead magnet, shown as *what your clients experience* — not the primary ask.

**The founder/proof surface (founders = end-user/proof — demoted from the prior flagship):**
- The cofounder/pair experience (letter → /live → agreement) appears as **proof of what a coach's clients go through** — never as a primary direct-to-pair offer.
- A secondary **"work with me directly"** path (ladischenski.com practice) survives for founders who self-select, but it is NOT the page's job.

**Already implemented (port + restyle — don't re-mock):** ladischenski.com `app/page.tsx` (the founder's practice / credibility / testimonial) + CP `/about` (scar line, identity). Port + **restyle into the CP design system** (blue/Inter/shadcn). The coach-facing framing is new.

**Coach page (`/tree/coach`) — section order (copy `[FOUNDER DECISION]`):**
1. **Hero** — value to the coach (retention + own-audience funnel + the measurement they lack). Primary CTA **Explore a partnership** (synergy form); secondary "see how it works." `[FOUNDER: headline]`
2. **The coach's gap** — coaches have alignment vocabulary but no comprehension-accuracy instrument; progress is subjective → retention + proof-of-value suffer (lean-canvas:91, Position C).
3. **What the instrument is** — selection/verification tool; which-gap + installs-a-method, measured. Tease, don't teach.
4. **What you get** — retention · own-audience conversion funnel · measurability · practitioner revenue split. `[FOUNDER review]`
5. **The partnership model** — co-creation → likely first co-delivered workshop → paid loop; the platform/practitioner split. `[FOUNDER: split, pricing]`
6. **Proof** — the end-user experience (what your clients go through: letter → /live → agreement) + founder credibility (applied epistemologist + first practitioner; full version on the practice surface).
7. **FAQ** — coach-oriented (reuse CP `faq-section` shell).
8. **Final CTA** — the synergy application.

**Synergy application** captures coach-qualifying fields `[FOUNDER: exact questions]`: practice/role, audience (who they coach), where they see synergy, readiness to co-deliver. NOT cofounder-pair qualifying questions.

**Founder/proof surface (`/tree/coach-proof`, or merged into the practice page):** CP `/about` + ladischenski `#about` (full story / credentials / FCO / testimonial) + the end-user walkthrough + a secondary "work with me directly" contact. Prices revealed only here, framed as the founder's own practice (the R&D lab), not the coach offer.

**Backup (`/tree/landing-original`):** current `ClarityPledgeLanding` intact (incl. its old FAQ).

**Nav (logged-out):** `[FOUNDER]` — primary CTA shifts to **Explore a partnership** (coach); retire "Take the Pledge" as primary.

## Risks / Non-Goals

### Risks
- "Conversion funnel" reads as the rejected "we send you customers." MITIGATE: frame strictly as *a funnel the coach runs on their own audience* — proof-of-value, never lead supply (`decisions.md:52`).
- Page leaks the paid mechanic. MITIGATE: tease, don't teach (USP states the *promise*, not the method).
- Coach-distribution is unvalidated. ACCEPT: synergy applications + the first paid loop ARE the demand test; falsifier defined (`decisions.md:54`).
- Founders feel ignored. ACCEPT: founders = end-user/proof by design; the secondary direct path exists but isn't the page's job.

### Non-Goals
- **Do NOT pitch "more customers / we bring you clients"** — backwards; the coach holds the audience (`decisions.md:52`).
- **Do NOT make the page direct-to-cofounder-pair** — that prior model is superseded; pairs appear only as proof.
- **Do NOT lead with the cohort/1:1 founder offer** — demoted to the proof/practice surface.
- **Do NOT claim "enables downstream sales/growth"** — own retention + measurability, the near-term checkable things.
- **Do NOT make the hero a video** (no videographer dependency); any recording → a proof slot.
- **Do NOT finalize copy, the value-prop order, application questions, the split, or pricing** without founder sign-off (`[FOUNDER DECISION]`).
- Do NOT build a general CMS.

## UX Notes

- **Design direction:** static hero (no video), coach-value headline, the partnership model + proof as the body, the **synergy application** as the dominant action. Port to `/tree/*` on the CP design system; the production `/` swap is a separate `/change-request`.
- **Build sequence:** `/tree/landing-original` (backup) → `/tree/coach` (the new primary) → founder/proof surface → nav. Reuse `ClarityLandingLayout`, `SEO`, shadcn `Button`, `faq-section` shell, the Letter flow as the proof / lead-magnet demo.
- A coach with no audience yet, or a self-selecting founder → routed to the founder/proof surface, not the synergy application.

## UI Contract

> **DRAFT copy — founder to approve.** Produced by a copywriter pass + an adversarial review pass, both grounded in the latest lean-canvas + `decisions.md:46`. The adversarial pass fixed five constraint violations (reductive "number not feeling" hero; lead-supply framing named-to-negate; unprovable retention *promise*; mechanic leak past tease/teach; "not yet at scale" under-candor). `[FOUNDER: …]` marks genuine founder-only choices. No em/en-dashes.

**Hero**
- Eyebrow: "A measurement layer that sits underneath coaching and alignment work"
- H1 `[FOUNDER: headline]`: **"You can feel when a pair is aligned. Now you can show it."** · alternates: "You bring the skill. I built the instrument that proves the work landed." / "The comprehension instrument that sits underneath your alignment work."
- Subhead: "You already help people align. Clarity Pledge gives you the one thing most coaching lacks: a verifiable signal that understanding actually happened, visible to your client and to you. It works inside the practice you already run, with the people you already reach."
- Primary CTA: **Explore a partnership** · Secondary: "See what your clients experience"

**The coach's gap** — heading: "You have the vocabulary for alignment. You don't have the instrument."
> "You can tell when two people are talking past each other. You name it, you facilitate around it, you watch the room shift. But when a client asks 'are we actually making progress?', the honest answer rests on your sense, theirs, and a feeling that things are better. There is nothing to point to. Personality and 360 tools measure attributes. None of them measure whether the understanding you worked so hard to build actually landed. That is the one reading your toolkit doesn't have."

**What the instrument is** — heading: "A verification layer. Verify before you commit."
> "Clarity Pledge is a comprehension instrument, not another assessment. Its highest value sits at the commitment decision: before a pair forms, raises, or makes a hire they can't undo. Here is the part most tools can't do. It tells your client which gap is blocking them right now, whether they have a misunderstanding they can still close or a real disagreement they need to face, and then it installs a shared method for both. That is the whole promise on this page. How the method works is what we build together."

**What you get** — heading: "Four things you can check in the near term." `[FOUNDER: order/emphasis]`
1. *Progress your client can see* — "A visible reading of where the understanding stands, so 'are we making progress?' has an answer you can both point to instead of a feeling that fades between sessions."
2. *A gap-reveal you can run with your own clients* — "The free Clarity Letter lets a person feel their own comprehension gap firsthand. You run it inside your practice, with the people you already work with, as the experience that opens the conversation. It is the in-room moment, made portable."
3. *Proof of value* — "A signal that shows the work landed, for your client to feel and for you to point to when the relationship comes up for renewal or referral."
4. *A practitioner revenue split* — "Partnership economics on a precedent set by the Gottman Institute: you keep the relationship revenue with your own clients, the platform keeps the license, method, community, and data layer. `[FOUNDER: exact split percentages]`"

**The partnership model** — heading: "How we'd actually start."
> "It begins with a short application and a co-creation conversation, not a contract. We look at your practice and your audience and find the one place where this instrument adds something you don't already have. The likely first step out of that call is a workshop we co-deliver: you bring the room and the facilitation, I bring the instrument, and we both see it work on real clients. If it earns its place, it becomes a repeating loop in your practice. The economics follow the practitioner split: you own the client relationship, the platform owns the license, the method, the community, and the data. `[FOUNDER: split and pricing — cash-first as the proof gate]`"

**Proof** — heading: "What your clients go through, and who built it."
> Client experience: "The clearest way to understand the instrument is to walk the path your clients would. It runs in three moves. A Clarity Letter reveals the gap: each person says what they think they agreed on, and the difference becomes visible. A live session, /live, turns that gap into a measured exchange, where understanding is checked rather than assumed. And a Clarity Agreement captures the shared method they leave with, so the next disagreement gets paraphrased instead of relitigated. You can run the letter yourself before you decide anything."
> Founder line: "Built by Vyacheslav Ladischenski (Slava), the instrument's first practitioner. The method came out of fourteen co-founder relationships and the failures that taught the same lesson each time: people don't split over disagreement, they split over the conversations they were sure they'd already had. ladischenski.com is the practice where the instrument is tested in the field. (Background: applied epistemology.)" `[FOUNDER: credibility framing]`

**FAQ** — heading: "Questions coaches ask." (reuse `faq-section` accordion shell)
- *Do I need clients who are cofounder pairs?* — "No. The instrument runs wherever two people need to verify they understand each other: cofounders, a leadership pair, a team, any high-stakes relationship in your practice. Whether a partner is in the room is just a setting you choose per client."
- *How is this different from the alignment tools I already use?* — "DISC, MBTI, Hogan, and 360s measure attributes: personality, type, perceived behavior. None of them measure whether understanding actually happened in a given conversation. Clarity Pledge sits underneath your existing toolkit and adds the one reading they can't give you: whether the understanding actually landed."
- *Will this compete with my coaching?* — "The opposite. It has no facilitation skill of its own; it's an instrument that needs a practitioner. You bring the relationship, the judgment, and the room. It gives you a reading to work from while you facilitate, and proof to show afterward. The client relationship stays yours."
- *What does the partnership cost?* — "That's part of the co-creation conversation, and it depends on how we collaborate. The model is a practitioner revenue split: you keep the retention and relationship revenue, the platform keeps the license, method, community, and data layer. `[FOUNDER: pricing and split]`"
- *What's the time commitment to start?* — "A short application, then one conversation. If we both see a fit, the likely next step is a single workshop we co-deliver, so you can watch the instrument work on your own clients before committing to anything ongoing."
- *Are you going to send me clients?* — "No, and that is the point. You hold the relationships and the audience. Clarity Pledge gives you a gap-reveal to run with them and a signal of progress to show them. The work runs inside your practice, on your terms."
- *Is this validated yet?* — "Not yet. The instrument is proven in my own practice, but no coach partnership has run end to end. You would be among the first, which means you help shape how it works rather than inherit a finished playbook. I would rather tell you that now than after you have committed." `[FOUNDER: confirm candor level]`

**Final CTA** — heading: "Let's find where this fits your practice."
> "Tell me about your practice and the people you coach, and where you think this instrument might add something. If there's a fit, we'll find it on one call." · Button: **Explore a partnership**

**Synergy application form** — heading "Explore a partnership"; helper: "A short note about your practice, then a conversation. No pitch deck, no commitment, just a look at where this fits what you already do."
1. "Your name and the name of your practice" — *So I know who I'm talking to and can look you up beforehand.*
2. "How would you describe what you do?" — *Cofounder coach, founder coach, OD practitioner, therapist-informed coach, facilitator, something else. A sentence is plenty.*
3. "Who do you work with, and roughly how many people do you reach?" — *The clients you serve and the audience you already have (newsletter, community, waitlist, cohort).*
4. "Where do you think Clarity Pledge fits your practice?" — *The moment in your work where a measured reading of understanding would change something.*
5. "Would you be open to co-delivering a workshop to test it on your own clients?" — single select: "Yes, I have a group in mind" / "Maybe, I'd want to understand it first" / "Not yet, just exploring"
6. "Best email to reach you" — *I'll reply personally to set up a call.*
- Submit: **Send and start the conversation**

## Acceptance Criteria

- [x] Coach-facing page leads with value to the coach (retention + own-audience funnel + the measurement gap); static hero, no video; **zero "we send you clients" framing** — `/tree/coach` mock
- [x] "What it is" states selection/verification tool + which-gap + installs-a-method, measured (teases, doesn't teach)
- [x] The **synergy application** is the primary CTA; the co-delivered workshop is framed as the likely *output* of the co-creation call, not the headline ask
- [x] Founders/pairs appear only as **proof** (the end-user experience); no primary direct-to-pair offer on the coach page
- [x] Practitioner revenue split stated (coach keeps retention/relationship; founder keeps license/method/club/data); pricing marked `[FOUNDER DECISION]`
- [x] Founder-approved coach-facing copy, value-prop order, application questions, split + pricing — approved via live founder UAT iteration (session of 2026-06-05: headings, journey, FAQ, stats, CTAs all founder-directed); split/pricing stays 'set on the call' per FAQ

**Remaining (post-mock, not in this run):** the founder/proof surface (`/tree/coach-proof`), the backup route (`/tree/landing-original`), the nav primary-CTA swap, and wiring the synergy form's submission destination (`[FOUNDER DECISION]` — email / DB / form service).

## Related

- **2026-06-02 strategy pivot** ([docs/decisions.md](../docs/decisions.md) line 46 — selection tool sold through coaches; coach-of-coaches first; objective = leverage-weighted paraphrasing; cash-first). **Supersedes this spec's prior direct-to-pair model.**
- lean-canvas:91 (coaching/L&D market + the measurement gap) · facilitator-guide Position C (measurement-layer integration pitch) · lean-canvas:204-211 (USP) · lean-canvas:221 (founder identity / R&D lab).
- ladischenski.com `app/page.tsx` (port source) · CP `/about` (merge) · facilitator-guide.md (Position C, workshop formats, pricing).
- P851 (Letter = lead magnet / proof, not primary CTA) · current landing → `/change-request` (prod swap, later).
- **Reconcile in lean-canvas / `/kdd` (follow-up):** the four strategy docs still need the coach-distribution layer + objective function synced (`decisions.md:56` notes the doc edits follow this entry).
