---
status: rejected
type: story
rank: 1000764.0
created_date: '2026-05-07'
tags: [marketing, engineering-as-marketing, sifter, ai, story-points]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P831: Auto-diagnose conflict patterns from public material

## Problem

**Situation:** ClarityPledge has 9 stories (st1-st9) with falsifiable points (root-cause patterns of communication failure). Today, mapping a real-world conflict to those points requires either a /live session or manual analysis by Slava.

**Complication:** Two motions both need cheap mapping:
1. **Marketing (P830):** producing founder-pair profiles at any scale requires analyzing public conflict material against st1-st9 without a session.
2. **Product / engineering-as-marketing:** a free public tool ("paste a co-founder fight, get a calibration map") would be the strongest top-of-funnel asset ClarityPledge could build. It's the HubSpot Marketing Grader pattern — a free tool whose only purpose is to serve as a high-quality, viral lead-gen surface.

**Question:** Can we build an analyzer that takes public conflict-shaped material (LinkedIn post, podcast transcript, interview excerpt) and outputs a structured calibration map mapped to st1-st9 points, with quality good enough to (a) feed P830 profile production and (b) stand as a public-facing free tool?

## Appetite

Medium-high blast radius (becomes a public surface, reflects on brand, touches Sifter / point system). High decision density (what's the input format? what's the output? what's the quality bar? does it gate behind sign-up or is it fully open?). Reversibility: medium — can sunset a public tool, but anything published as analysis carries reputational weight.

## Solution

**Conceptual shape (NOT prescribing implementation):**

- **Input:** text material describing a co-founder disagreement or recurring pattern (single LinkedIn post, multi-paragraph excerpt, transcript fragment).
- **Processing:** LLM-driven analysis grounded in st1-st9 stories and their points. Output should cite which point(s) the pattern matches and explain why.
- **Output:** structured calibration map — patterns observed, point references, what would shift the dynamic. Renderable as a shareable artifact (image / blog embed / standalone page).

**Two delivery modes (likely sequenced):**

1. **Internal tool (mode A):** CLI or admin-only page that Slava uses to feed P830 profile production. Lowest stakes, validates the analysis quality.
2. **Public free tool (mode B):** marketing surface at e.g. `claritypledge.com/diagnose` or `clarity-map.com`. Engineering-as-marketing in the HubSpot mold. Only build after Mode A confirms quality.

**Key product decisions [FOUNDER DECISION]:**
- Should output reveal the points (educational) or just the pattern (curiosity-driving CTA)?
- Free for anyone, or behind email capture?
- Public-tool branding: clarity-coded subdomain, separate marketing site, or main app?
- Does the public tool show *the user's* result publicly, or privately?

## Risks / Non-Goals

### Risks
- **Quality risk** — bad analysis published publicly damages brand credibility ("ClarityPledge couldn't even diagnose this correctly"). Mitigation: Mode A first; manual quality gate before any public output.
- **Cannibalization risk** — a free analyzer reduces motivation to take a paid /live session. Mitigation: position the analyzer as the *teaser* (identifies pattern), with /live as the *resolution* (works through it together).
- **Misuse risk** — users paste their actual co-founder's words to "win" an argument. Mitigation: framing copy explicitly invites self-reflection, not weaponization. Possibly require both founders' input.
- **Scope creep into Sifter** — easy to confuse this with the existing Sifter flow. Mitigation: explicit non-goal below.

### Non-Goals
- Do NOT replace or modify the existing Sifter / /live flow. This is a separate analyzer surface.
- Do NOT build Mode B (public tool) before Mode A (internal tool) validates analysis quality on ≥10 real cases.
- Do NOT auto-publish results. All public outputs must have a human approval step in v1.
- Do NOT create new st-points or hashtags as part of this work — analyzer maps to existing st1-st9 only. New points come from /live sessions, not algorithmic discovery.
- Do NOT productize this as a paid feature in v1. Either it's an internal tool or a free marketing surface.

### Alternatives Considered
- **Manual analysis only (forever):** matches brand integrity better but caps P830 throughput at Slava's hours.
- **Generic LLM "conflict analysis" tool:** drops the st1-st9 grounding. Loses the proprietary insight that makes ClarityPledge's analysis distinctive. Rejected.
- **Sifter-on-text:** extending the existing Sifter flow to accept arbitrary text input. Possible architectural shape, but folded into the broader question of "internal tool vs public surface." Worth revisiting at architect step.

## Done-When

**Mode A (internal):**
- [ ] Slava can paste public conflict material and receive a structured calibration map mapped to st1-st9
- [ ] Quality validated against ≥10 real cases (Slava's manual mapping vs analyzer mapping; agreement ≥ 70%)
- [ ] Decision recorded: build Mode B, or stay internal-only

**Mode B (public, gated on Mode A success):**
- [ ] Public surface live at chosen URL
- [ ] First 100 user inputs reviewed for quality before any public sharing or social proof claims
- [ ] At least one input → /live session conversion observed (validates the funnel hypothesis)

## Research Questions

1. What's the minimum input length where mapping to st1-st9 is reliable? (single sentence? paragraph? full transcript?)
2. Does the analyzer work on first-person material ("I'm in a fight with my co-founder...") as well as third-person observed material ("Brian and Joe disagreed about...")?
3. What's the right output format — narrative paragraph, bulleted findings, visual map, all three?
4. Does revealing the point (e.g. "this matches p3-2: the assumption gap") increase or decrease motivation to take /live?
5. Is engineering-as-marketing the right pattern for ClarityPledge's audience, or does the audience need person-to-person trust (in which case Mode B is wrong even if it works technically)?

## Predecessor

- **P830** — manual founder-pair profile pipeline (validates the artifact format that this spec automates)
- Validation gate: ≥3 manual profiles produced and shipped via P830 before this work starts

## Time Box (for v0 scoping prototype)

When work eventually begins: 2-day time-boxed prototype on Mode A before any architect step. If quality on 10 real cases isn't ≥ 70% match to Slava's manual mapping, escalate decision: better prompts, different approach, or sunset.
