---
status: rejected
type: story
rank: 47
created_date: '2026-04-05'
tags: [workshop, facilitation, clarity-flip, pre-event]
closed_at: '2026-08-14'
---

# P653: Minimal Clarity Flip — 10-Minute Pre-Event Format

> **Closed 2026-08-14 — backlog triage.** The measurement move is live facilitation, not a feature. The facilitator asks *"0-10, how much do you understand?"* as a challenge to anyone who opts out of the CMP; `/live` triggers the same question programmatically. Recorded in [facilitator-guide.md](../../../docs/facilitator-guide.md). **Note:** P1055 does not replace this — it measures a preference gap, not a comprehension gap, and says so itself (`p1055:102`).
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

**Related:** P606 (full 90-min Clarity Flip workshop), P567 (false belief curriculum), P620 (workshop outreach), H-WorkshopFormat

## Problem

**Situation:** Conjecture events on 17 thinker topics need participants to experience verified comprehension — not just agree to a social norm. The full Clarity Flip (P606) is 90 minutes. Events need a compressed version that can run as a warm-up before any gathering.

**Complication:** A "just accept paraphrasing" social norm alone replicates the Pledge failure — 11 pledgers, zero practice habits. Nobody self-initiates verification; the protocol must create the measurement moment. Without the gap reveal, events become polite debate clubs where everyone assumes they understood.

**Evidence — barber encounter (2026-04-04):** Recursive knowledge framing ("she knows I know she knows") resonated cross-linguistically with a Thai barber in under 10 minutes, while the three-category taxonomy (cognitive/emotional/agreement) did not land. Implication: the minimal format must start concrete and experiential, not categorical. Story-based entry, not framework-based.

**Question:** What is the shortest format that includes the measurement step (ratings + gap reveal) and produces the felt experience of a comprehension gap — so that the subsequent event runs on a calibrated channel?

## Appetite

Low blast radius (new facilitation format, no code changes to existing features). Fully reversible (don't run it again). Medium decision density — format design requires founder choices on which content/story to use and how to frame the rating step for cold audiences.

## Solution

Design a 10-minute Clarity Flip format that can precede any event (conjecture events, meetups, workshops). Must include:

1. **Concrete entry** — a single story or claim, not a taxonomy. Follow the barber test principle: start with something the audience can paraphrase, not a framework to learn.
2. **Measurement step** — each participant rates their own comprehension confidence (0-10), then the speaker/facilitator counter-rates. The gap becomes visible.
3. **Gap reveal** — the moment where the delta is shown. This IS the product. Even in 10 minutes, this must land.
4. **Bridge to event** — frame the event activity as "now that you've seen the gap exists, let's use this channel." Participants enter the event having felt the comprehension illusion firsthand.

The format must work with:
- Zero product/app dependency (physical cards, whiteboard, or show-of-hands)
- Cold audiences who have never heard of ClarityPledge
- Cross-language settings (barber test standard)

[FOUNDER DECISION: Which story/claim to use as the 10-min entry content? Options: (a) one of the P567 false beliefs, (b) a purpose-built "barber test" story about recursive knowledge, (c) a claim from the specific conjecture event that follows. Choice (c) ties each mini-Flip to its event topic but requires per-event prep.]

## Risks / Non-Goals

### Risks
- 10 minutes may be too short for the gap reveal to land emotionally. Mitigation: test with 10, 15, and 20-minute versions — find the minimum viable duration.
- Cold audiences may resist the rating step ("why are you testing me?"). Mitigation: frame as self-assessment, not evaluation. "Rate your own confidence" is lower-threat than "let me check if you understood."
- Facilitator skill is the bottleneck — Slava can run this, but can a trained partner? Mitigation: script the format tightly enough that the facilitator follows steps, not instinct.

### Non-Goals
- Do NOT build any product/app features for this — facilitation-only format
- Do NOT attempt to replace P606 (full Clarity Flip) — this is the aperitif, not the meal
- Do NOT use this as a standalone monetizable event — it's a pre-event warm-up that makes the main event work better

## UX Notes

**Participant experience flow:**
1. Facilitator shares one concrete claim/story (~2 min)
2. Each participant writes/rates: "How well do I understand what was just said?" (0-10) (~1 min)
3. Facilitator reveals their counter-assessment OR asks one participant to paraphrase, then rates accuracy (~3 min)
4. Gap shown to room. Brief reflection: "Notice the delta." (~2 min)
5. Bridge: "For the next [event], when someone says something you think you understood — remember this gap exists." (~2 min)

**Key design constraint from barber encounter:** The entry must be a concrete scenario people can relate to immediately, not an abstract concept. "She thinks she understood what 'a little shorter' means. You think she understood. Neither of you checked." — that's the entry. The taxonomy comes after, if at all.

**Measurement target — leadership accountability norm (2026-04-11):** Even in the 10-minute format, capture the before/after leadership-accountability question alongside the personal-comfort question. *"How comfortable are you with a leader refusing a paraphrasing request without giving a reason?"* (0-10, reverse-scored). The 10-min flip succeeds when the group's norm around unexplained refusal shifts, not just when individual comfort with asking shifts. See `docs/facilitator-guide.md` §Workshop Metrics for full rationale. If the 10-min format cannot produce a measurable norm-shift delta, it's failing at what the full P606 is supposed to do — scope back to personal-comfort only or extend duration.

## Done-When

- [ ] Written run sheet for 10-minute format with exact timing per step
- [ ] Content selected for entry story/claim (founder decision resolved)
- [ ] Tested in at least one pre-event setting with cold audience
- [ ] Participants can describe the gap they experienced without prompting
- [ ] Format documented in facilitator-guide.md as a variant
