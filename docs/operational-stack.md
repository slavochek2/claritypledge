# ClarityPledge: Operational Stack

> **Purpose.** This is the operational architecture of the instrument — how ClarityPledge works mechanically, layer by layer. Not a business model (see [lean-canvas.md](lean-canvas.md) for that). A map for staying oriented when in optimization mode.

> **Source.** Generated 2026-04-26 in synthesis-mode conversation. Refined as Layer-3 work proceeds. Working architecture, not a final spec.

---

## The Six Layers

Each layer has a function, an output, and a dependency on the layer below.

### Layer 1 — Data Collection
**Function.** Cheap, asynchronous capture of what someone actually believes in their own words.
**Mechanism.** Clarity Letter (public + inverse private variants). Captures positions on points and anti-points, sealed-bid comprehension self-rating per story.
**Output.** Raw substrate — claims, positions, self-rated comprehension. Not yet diagnostic.
**Depends on.** Nothing (entry point).

### Layer 2 — Diagnostic
**Function.** Surface evidence of contradictory beliefs and unverified comprehension within the domain of "verification of understanding."
**Mechanism.** /live session opens with paraphrase or targeted questions on the letter data. Listener's own before/after position delta is the diagnostic instrument (NOT speaker-as-judge — that has a structural validity problem).
**Output.** Documented gap: participant's own position changed after verification. "You thought you agreed; after we verified, you realized you didn't — that took 90 minutes for one point. Imagine your last six months of conversations."
**Depends on.** Layer 1 (substrate).

### Layer 3 — Problem Positioning
**Function.** Make the diagnostic portable across domains. Argue that one underlying failure (unverified comprehension) drives many surface symptoms (co-founder blowups, sales loss, learning gaps, civic polarization, AI agent memory drift).
**Mechanism.** Deductive argument: asymmetry claim → two failure modes (hidden misunderstandings + unverified comprehension) → cross-domain consequences. Internal document; article (a9 rate-asymmetry) is one expression.
**Output.** Sales positioning that holds in any vertical. "Same instrument, many surfaces. Different buyers see different downstream consequence as their pain."
**Depends on.** Layer 2 (diagnostic produces real evidence).
**Status.** Underdeveloped — the synthesis-work that unlocks selling. Detailed treatment in [theory-of-change.md §Layer-3 Problem Positioning](theory-of-change.md#layer-3-problem-positioning-2026-04-26).

### Layer 4 — Intervention (Badging)
**Function.** Certify that a participant has demonstrated the move from agreeing-on-a-point to honestly-disagreeing-and-verifying-comprehension.
**Mechanism.** Per-story badge issued from /live verification. Tiered: 1-of-9 (Conjecture Event partial), 9-of-9 (full badge).
**Output.** Credential. Required for Clarity Partner Agreement / Clarity Organization membership.
**Depends on.** Layer 2 — you can't badge without first measuring the baseline. (The 90-min one-shot felt thin because it tried to do Layer 2 and Layer 4 simultaneously without Layer 3 in between.)
**Unit economics.** ~100-180 min/person for full 9-of-9. See lean-canvas §Badge + Pledge tier table.

### Layer 5 — Norm Infrastructure
**Function.** Turn individual badges into collective norms.
**Mechanism.** Clarity Partner Agreement (dyadic), Clarity Community Agreement (group), ClarityPledge (public commitment).
**Output.** Ratified expectations between specific people. The norm "requesting a paraphrase is normal, refusing is suspect" becomes common knowledge in a group when the group has witnessed it.
**Depends on.** Layer 4 — agreements need badged content to ratify. Without Layer 4, agreements are floating commitments without grounded measurement.

### Layer 6 — Cost Reduction
**Function.** Compress the cost of Layer 1 so data collection becomes cheap and frequent.
**Mechanism.** Agent / automation: auto-drafted letters from recorded conversations, MCP-exposed primitives (draft_story, draft_point, draft_anti_point, stitch_letter), reverse-letter calibration before MCP autonomy.
**Output.** Friction shifts from composition to review. Letters get sent more often, generating more Layer 1 data, which feeds Layer 2 more often.
**Depends on.** Layer 1 working manually first — agent rating needs human ground-truth data to calibrate against. See [process-learnings.md "Hand-drafted points are the letter's biggest friction blocker"](process-learnings.md).

---

## Reading the Stack

- **The instrument** is one of the layers (Layer 2 diagnostic).
- **The project** is the stack — six layers each enabling the next.
- **What looks like optimization-mode** (polishing letter copy) is usually Layer 1 work that forgets Layers 2-6 exist. This document is the corrective.
- **Layer 3 is the underdeveloped layer.** Most synthesis-work value is here. See [theory-of-change.md](theory-of-change.md).

## Related Documents

- [lean-canvas.md](lean-canvas.md) — business model (customer, value prop, channels)
- [theory-of-change.md](theory-of-change.md) — causal chain + Layer-3 problem positioning
- [hypotheses.md](hypotheses.md) — active bets per layer
