---
name: ascii-flows
description: Pre-UX exploration tool for layout and navigation structure of complex multi-flow features. Generates 30 ASCII wireframe flow variants, scores them against weighted criteria, identifies the top 5, then iterates to produce one recommended hybrid flow for user approval. Run before /ux when a feature has multiple distinct user flows, bilateral interactions, or unclear navigation structure. NOT for interaction design (how a component behaves, what feedback it gives) — that's /ux territory. Usage: /ascii-flows features/p422_foo.md
when_to_use: Optional step before /ux for complex multi-flow features with unclear layout/navigation. Skip for simple single-flow features and for interaction design questions (use /ux instead).
version: 1.0.0
---

# ASCII Flows — Pre-UX Exploration

**Generate 30 flow variants, score them, pick a winner. Run before /ux.**

**Announce at start:** "I'm using the ascii-flows skill to explore UX flows."

---

## Quick Start

```
/ascii-flows features/p422_clarity_partner_agreement.md
```

---

## When to Use

✅ **Use for:**
- Features with multiple distinct user flows (creation, acceptance, compliance, etc.)
- Bilateral or multi-party interactions
- Features where the right navigation structure is unclear
- Any feature where you want to explore the design space before committing to /ux

❌ **Skip for:**
- Simple single-flow features (go straight to /ux)
- Features with obvious, well-understood UX patterns

**Next step after ascii-flows:** Run `/ux features/pN_name.md` with the winning flow as input context.

---

## Workflow

```
1. READ SPEC → understand the feature, flows, decisions
       ↓
2. READ PLEDGE UX → load design language reference
       ↓
3. GENERATE 30 FLOWS → ASCII wireframes, varied across dimensions
       ↓
4. DEFINE + APPLY SCORING → weighted criteria, score all 30
       ↓
5. TOP 5 CALLOUTS → identify strengths of each finalist
       ↓
6. DESIGN HYBRID → one final recommended flow combining top strengths
       ↓
7. PRESENT TO USER → show winner, ask for approval or selection
```

---

## Dispatch

Spawn Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: the Agent Directive below + spec path from $ARGUMENTS. Working dir: `<cp-root>`.
Report subagent output verbatim.

## Agent Directive

When invoked, spawn a general-purpose agent (model: "sonnet") with this directive:

**Step 1 — Read the spec**
Read the feature spec at `{spec_file}`. Understand: what flows exist, what decisions have been made, what's bilateral vs. unilateral, what the key UX challenges are.

**Step 2 — Read Clarity Pledge UX reference**
Read these files for design language consistency (the new feature should feel like a sibling):
- `src/app/pages/clarity-pledge-landing.tsx`
- `src/app/pages/sign-pledge-page.tsx`
- `src/app/pages/pledge-confirmation-page.tsx`
- `src/app/components/pledge/sign-pledge-form.tsx`
- `src/app/content/pledge-text.tsx`

Extract: step count, form patterns, certificate frame, tone, celebration moment, visual language.

**Step 3 — Generate 30 ASCII flows**
Vary across dimensions:
- Step count (1-step, 3-step, 5-step, wizard, single-page scroll)
- Input approach (inline prose template, structured fields, checklist, freeform)
- Key component placement (observers upfront vs. post-signing; visibility early vs. late)
- Invitation method (email, username, share link)
- Celebration / ceremony moment (dialog, page, animation hint, certificate reveal)
- Compliance view layout (timeline, table, scorecard, badge)
- Mobile vs. desktop-first assumptions

Keep each flow concise — structure and key decision points, not pixel detail.

**Step 4 — Define scoring criteria**
Define 6–8 criteria with 1-line descriptions. Assign weights summing to 10.
Criteria must include: ceremonial weight, bilateral clarity, pledge sibling coherence, onboarding friction, compliance visibility, observer integration, mobile usability.

**Step 5 — Score all 30 flows**
For each flow: raw score 0–10 per criterion × weight. Show compact scoring table. Identify top 5.

**Step 6 — Iterate: design one hybrid**
Analyse top 5. Extract best elements from each. Design ONE final hybrid combining their strengths. This is the recommended design.

**Step 7 — Present final flow**
Show the final hybrid as a detailed ASCII wireframe covering all major flows. Annotate key decisions. State clearly why this is the winner.

---

## Output Format

Return in this order:
1. 30 flows (numbered, labelled)
2. Scoring criteria + weights table
3. Scoring table (flows × criteria)
4. Top 5 callouts with strengths
5. **FINAL RECOMMENDED FLOW** — detailed ASCII with annotations

Be decisive. Pick a winner. No hedging.

---

## Design Language Constraints

Always carry forward from the Clarity Pledge:
- Double-border certificate frame (`╔══╗` outer, `┌──┐` inner)
- Playfair serif for commitment text, sans-serif for UI chrome
- Underline-only inputs inside certificate frames
- `✦` symbol for celebration moments (matches pledge pattern)
- Ceremonial language: "commit," "seal," "signed in good faith"
- Profile strength progression where optional fields exist
- Social proof / witness layer (observers = witnesses)
- Green check + dialog for celebration moment
- `[← Back]` / `[→ Continue]` step navigation pattern
