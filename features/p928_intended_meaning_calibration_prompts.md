---
status: week
type: story
rank: 1000928.0
created_date: '2026-06-11'
tags: [copy, calibration, letters, live]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P928: Rewrite calibration prompts from "intention" to "intended meaning"

## Problem

**Situation:** The /letters calibration loop and /live rating prompts ask the user to rate understanding using inconsistent nouns. Today the /letters loop is a calibration *triplet* — author prediction (`letter-prediction-walk.tsx`), reader self-rating (`letter-flow-content.tsx`), and reveal verdict (`calibration-verdict.tsx`) — and the three disagree on the rated object: "your story" / "intention" / "their story". The product compares these numbers to compute the calibration gap.

**Complication:** When the three prompts describe different things, the gap compares apples to oranges — the number the author predicted ("understands your story") is not rating the same dimension the reader self-rated ("intention behind their story"). Separately, "intention" reads as *motive/agenda*, when the dimension actually being measured is *the message the speaker meant to convey*.

**Question:** Align every calibration prompt (in /letters and /live) on one rated object — "intended meaning" — so the compared numbers are meaningful and the wording names comprehension, not motive.

## Appetite

Low blast radius — copy only, no logic change, 7 user-facing strings + 1 code comment. Fully reversible (git revert). Low decision density — wording decided ("intended meaning"; keep the "believe you understand" epistemic hedge). The one non-trivial choice (active vs noun phrasing on the reveal verdict) is decided: active, to preserve the number anchor.

## Solution

Replace the rated-object noun in all seven prompts with "intended meaning", keeping sentence structure and the "believe you understand" hedge intact. See UI Contract for exact before/after. Text-snapshot tests `p825` and `p461` reference the old wording and update in the same commit.

## Risks / Non-Goals

### Risks
- Snapshot/text tests (`p825`, `p461`) assert the old strings and will fail until updated. Mitigation: update assertions in the same commit; this is expected, not a regression.
- /live strings live in the two-party state machine (`free-mode-view.tsx`, `live-mode-view.tsx`). Mitigation: copy-only, no state/handler change — no two-party E2E needed (no behavior changes), but verify the displayed string in both speaker and listener roles.

### Non-Goals
- Do NOT change the canonical Oath (`verified-understanding-oath.ts`) — it keeps "intention". Changing it is a permanent v4→v5 bump via `/upgrade-oath`, deliberately deferred so a version is not spent on a one-word change. **PARKED DECISION** — bundle "intended meaning" with the next substantive oath revision.
- Do NOT drop the "believe you understand" hedge anywhere — it encodes the product's believed-vs-verified frame.
- Do NOT touch prototype routes (`new-live-prototype.tsx`) or marketing/landing copy.
- Do NOT change the verdict line to noun phrasing ("your understanding of…") — keep active so the rating number stays anchored at the end of the sentence.

## Done-When

- [ ] All 7 user-facing strings render "intended meaning" (verified in /letters reader flow + reveal, and /live speaker + listener roles)
- [ ] The "believe you understand" hedge is preserved in every prompt that had it
- [ ] `letter-reveal-numeric.tsx:36` comment updated for consistency
- [ ] `p825` and `p461` text assertions pass against the new strings
- [ ] No logic, state, or handler changes — diff is strings + test assertions only
- [ ] Oath (`verified-understanding-oath.ts`) is unchanged (still "intention")

## UI Contract

All changes keep surrounding structure; only the **bold** segment changes.

| # | Flow | File:line | Before → After |
|---|------|-----------|----------------|
| 1 | /letters · author predicts | `letter-prediction-walk.tsx:105` | …{receiver} understands **your story** → **your intended meaning** |
| 2 | /letters · author predicts (readers) | `letter-prediction-walk.tsx:106` | …readers will understand **your story** → **your intended meaning** |
| 3 | /letters · reader self-rates | `letter-flow-content.tsx:647` | …understand {name}'s **intention** behind their story → **intended meaning** behind their story |
| 4 | /letters · reveal verdict | `calibration-verdict.tsx:33` | …estimated you understood **their story** at a {rating} → **their intended meaning** at a {rating} |
| 5 | /live · free, listener | `free-mode-view.tsx:135` | …you understand {partner}'s **intention** → **intended meaning** |
| 6 | /live · free, speaker | `free-mode-view.tsx:134` | …{partner} understands **your intention** → **your intended meaning** |
| 7 | /live · explain-back drawer | `live-mode-view.tsx:2755` | …{partner} understands **your intention** → **your intended meaning** |
| — | comment only | `letter-reveal-numeric.tsx:36` | "the author's **intention**" → "the author's **intended meaning**" |
