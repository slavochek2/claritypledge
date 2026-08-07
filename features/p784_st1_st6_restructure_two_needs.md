---
status: backlog
type: story
rank: 0.002
tags:
  - content
  - stories
  - points
  - sequence
  - agreement-substitution
created_date: '2026-04-22'
locked_at: '2026-05-11T05:14:31.903Z'
---

# P784: Story/Point Content Updates Collection

## Problem

Collection spec for story/point content updates that emerge between point-sequence ships. Originally scoped to ST1/ST6 restructure (two-needs + agreement-substitution); broadened 2026-05-14 to absorb the recursive-understanding rename for ST2/ST3. Future story/point content updates accumulate here until shipped as a batched migration.

### Update 1 — ST1/ST6 restructure (two-needs + agreement-substitution)

The point sequence was approved 2026-04-13 (ST1→ST3→ST5→ST4→ST2→ST6→ST7→ST8→ST9). That approval was based on the narrative arc at the time. Since then, two structural developments emerged that neither ST1 nor ST6 currently reflect:

1. **Two-needs framework**: Cognitive understanding ("I know you know I know") and emotional recognition ("I feel heard") are distinct needs that collapse into one observable behavior — demanding agreement — when the cognitive channel has no verification signal. The distinction is now central to the product's mechanism.

2. **Agreement-substitution mechanism** (H-AgreementSubstitution, filed 2026-04-22): Agreement-seeking isn't an emotional problem — it's a symptom of a failed cognitive channel. Once you can verify cognitive understanding, agreement-seeking typically dissolves. This reframes what the product actually solves.

ST1 currently opens the sequence without this provocation. ST6 tells the co-founder-loss story without connecting it to agreement-substitution.

### Update 2 — ST2/ST3 recursive-understanding rename (2026-05-14)

Construct rename across the doc ecosystem: "illusion of common belief / common understanding" → "illusion of recursive understanding / recursive belief" (preserving "common knowledge" only when citing Pinker/Lewis/Aumann/Chwe as their formal term). Decision recorded in `docs/decisions.md` (supersedes the 2026-04-27 entry that locked "illusion of common belief").

Two live points carry the deprecated construct in DB rows that have positions taken on them:

- **ST3 title** — currently *"shared vs common belief"*. Rename to *"shared vs recursive belief"*. Highest user-visibility surface (slug stays stable via `system_tags`; only display text changes).
- **ST2 body** — narrative text references "illusion of common belief + Popper gap conclusion." Update body to "illusion of recursive understanding + Popper gap conclusion."

Per `decisions.md:3831`, slugs (`/point/st3`) are dynamically resolved via `system_tags` — no URL-redirect needed. Existing positions remain attached; only display text shifts. Worth auditing that no user's "agree" position on the old title becomes incoherent on the new title — title change is from "common" to "recursive," same conceptual axis.

## Appetite

Low blast radius — content changes only (story text, not schema or product behavior). Reversible. No new ACs that require product changes.

## Solution

**ST1 update:** Introduce the provocation: "agreement-seeking = failed cognitive verification, not emotional neediness." Position it as the inciting insight — the reader should feel recognized ("yes, this is what I've been doing") not accused ("you're emotionally needy"). Frame around the cognitive channel gap.

**ST6 update:** Re-tell the co-founder-loss story through the agreement-substitution lens. The loss wasn't about disagreement — it was about an unverified cognitive gap that only became visible when it was too late. Agreement-seeking was the symptom; absence of verification was the cause.

**ST3 title rename:** "shared vs common belief" → "shared vs recursive belief". Display text only; slug stable.

**ST2 body update:** Replace "illusion of common belief" with "illusion of recursive understanding" inside the point's narrative text. No structural change to the point's role in the sequence.

## Risks / Non-Goals

**Non-goal:** Change the approved sequence (ST1→ST3→ST5→ST4→ST2→ST6→ST7→ST8→ST9). The sequence is locked — this is a within-story content update, not a resequencing.

**Non-goal:** Re-open the scoring-onset decision (ST5 is where scoring begins; ST1/ST6 updates do not affect this).

**Non-goal:** Change story IDs.

**Risk:** ST1 provocation may read as accusatory if not handled carefully. Review tone — it should create recognition ("that's what I do!"), not shame.

## Done-When

- [ ] ST1 text updated to lead with cognitive-channel framing of agreement-seeking
- [ ] ST6 text connects the co-founder-loss narrative to the agreement-substitution mechanism
- [ ] ST3 title updated: "shared vs common belief" → "shared vs recursive belief"
- [ ] ST2 body updated: "illusion of common belief" → "illusion of recursive understanding"
- [ ] All updates maintain the narrative voice and quality standard of the current sequence
- [ ] No schema or product behavior changes (content-only)

## Acceptance Criteria

- [ ] ST1: Reader can identify their own agreement-seeking as a cognitive-channel symptom, not an emotional failing
- [ ] ST6: The co-founder-loss story illuminates why verification absence (not disagreement) was the root cause
- [ ] ST3: New title displays in /live, point cards, and overview lists; existing positions remain attached
- [ ] ST2: New body text reads coherently in /live; existing positions remain attached
- [ ] Sequence position and story IDs unchanged
- [ ] Updates reviewed and approved before shipping to prod (test env first, then prod)
