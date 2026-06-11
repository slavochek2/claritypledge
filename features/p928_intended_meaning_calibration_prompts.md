---
status: in-progress
type: story
rank: 1000928.0
created_date: '2026-06-11'
tags: [copy, calibration, letters, live, oath]
delivery_stage: upgrade-oath
pipeline_ran: [create-spec, dev, upgrade-oath]
---

# P928: Rewrite calibration prompts from "intention" to "intended meaning"

## Problem

**Situation:** The /letters calibration loop and /live rating prompts ask the user to rate understanding using inconsistent nouns. Today the /letters loop is a calibration *triplet* — author prediction (`letter-prediction-walk.tsx`), reader self-rating (`letter-flow-content.tsx`), and reveal verdict (`calibration-verdict.tsx`) — and the three disagree on the rated object: "your story" / "intention" / "their story". The product compares these numbers to compute the calibration gap.

**Complication:** When the three prompts describe different things, the gap compares apples to oranges — the number the author predicted ("understands your story") is not rating the same dimension the reader self-rated ("intention behind their story"). Separately, "intention" reads as *motive/agenda*, when the dimension actually being measured is *the message the speaker meant to convey*.

**Question:** Align every calibration prompt (in /letters and /live) on one rated object — "intended meaning" — so the compared numbers are meaningful and the wording names comprehension, not motive.

## Appetite

Low blast radius — copy only, no logic change, 7 user-facing strings + 1 code comment. Fully reversible (git revert). Low decision density — wording decided ("intended meaning"; keep the "believe you understand" epistemic hedge). The one non-trivial choice (active vs noun phrasing on the reveal verdict) is decided: active, to preserve the number anchor.

## Solution

Replace the rated-object noun in all seven prompts with "intended meaning", keeping sentence structure and the "believe you understand" hedge intact. See UI Contract for exact before/after. Tests asserting the old wording update in the same commit: `p915` (unit, verdict line), `p713`/`p581` (e2e, letters prediction walk), `p562` (e2e, /live free mode), plus a `p825` comment. Note: `p461` tests the **oath** string ("the intention behind what you say") which is deliberately unchanged — it stays as-is.

## Risks / Non-Goals

### Risks
- Text/e2e tests (`p915`, `p713`, `p581`, `p562`) assert the old strings and will fail until updated. Mitigation: update assertions in the same commit; this is expected, not a regression. `p461` (oath text) is NOT touched.
- /live strings live in the two-party state machine (`free-mode-view.tsx`, `live-mode-view.tsx`). Mitigation: copy-only, no state/handler change — no two-party E2E needed (no behavior changes), but verify the displayed string in both speaker and listener roles.

### Non-Goals
- ~~Do NOT change the canonical Oath~~ **REVERSED (founder, this session):** the Oath IS bumped v4→v5 via `/upgrade-oath`, in this same worktree, so it ships with the prompts (one vocabulary everywhere). v4 stays intact in the registry — grandfathered signers render their stored version. See "Oath v5 Bump" below.
- Do NOT drop the "believe you understand" hedge anywhere — it encodes the product's believed-vs-verified frame.
- Do NOT touch prototype routes (`new-live-prototype.tsx`) or marketing/landing copy.
- Do NOT change the verdict line to noun phrasing ("your understanding of…") — keep active so the rating number stays anchored at the end of the sentence.

## Done-When

- [x] All 7 strings swapped to "intended meaning"; reveal verdict rendered-verified via `p915` unit test. Prediction-walk + /live rendered strings pending `/verify` (live UAT) — see Verification Status.
- [x] The "believe you understand" hedge is preserved in every prompt that had it (grep-confirmed)
- [x] `letter-reveal-numeric.tsx:36` comment updated for consistency
- [~] `p915` passes. `p713`/`p581`/`p562` fail at PRE-EXISTING preconditions unrelated to this change (see Verification Status). `p461` (oath) untouched.
- [x] No logic, state, or handler changes — diff is strings + test assertions only (22 ins / 22 del; code review: 0 HIGH, 0 MEDIUM)
- [x] Oath (`verified-understanding-oath.ts`) is unchanged (still "intention")

## Verification Status

**Passed:** TypeScript, ESLint, Build, full unit suite, `p915` (renders CalibrationVerdict and asserts "intended meaning"), UI-Contract fidelity subagent (all 7 strings present), code review (0 HIGH/MEDIUM).

**Pre-existing e2e failures (NOT caused by this change — copy swap cannot affect them):**
- `p581` / `p713` (letters): 16 tests fail at the `"Prepare a Letter"` button precondition. That entry point was removed by `a73bcc87 feat(p661): replace letter composition wizard with prediction walk` — `grep` finds zero "Prepare a Letter" in current source. These tests are **stale** vs current UI. The prompt-string assertions are downstream of this broken precondition, so they never execute.
- `p562` (/live free mode): 2 tests fail at `waitForDBStateKey` timeout on `ratingPhase='explain-back'` — a two-party realtime state-sync timeout (known-flaky surface, `.claude/rules/live.md`). Never reached the string assertion.

**Recommendation:** verify the prediction-walk + /live rendered prompts via `/verify p928` (live UAT). Separately, `p581`/`p713` warrant a test-maintenance ticket (re-point at the current Letters-tab entry flow).

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

## Oath v5 Bump (`/upgrade-oath`)

Reverses the parked decision: the shared `VERIFIED_UNDERSTANDING_OATH` goes v4→v5 ("intention" → "intended meaning" in YOUR RIGHT + MY PROMISE). Pledge and Agreement both reference the shared constant, so both move at once.

**Surfaces (Step 1 classification):**
- DEFAULT-PATH (render current = v5 after bump): pledge card, sign-pledge form, export certificate, profile certificate (unsigned default), `full-article.md` prose, new-agreement certificate preview.
- DISPATCHED (grandfathered, stay version-driven): signed profile certificates (`profiles.pledge_version`), existing agreements (`clarity_agreements.agreement_version`). v4/legacy signers render their stored version unchanged.

**Code:** `VERIFIED_UNDERSTANDING_OATH[5]` (v4 kept intact) · `PLEDGE_VERSIONS[5]` + `CURRENT_PLEDGE_VERSION=5` · `AGREEMENT_VERSIONS[5]` + `CURRENT_AGREEMENT_VERSION=5` · pledge renderers made version-driven (`version === 4 || version === 5` → `VERIFIED_UNDERSTANDING_OATH[version]`; previously hardcoded `[4]`, would have fallen through to v3 text on a v5 default) · `toAgreementVersion` maps `'5'`.

**DB migration (required — not pure code):** `20260611095343_p928_agreement_version_v5.sql` expands the `agreement_version` CHECK to `('legacy','4','5')`. Without it, new v5 agreement inserts are DB-rejected. `profiles.pledge_version` is an unconstrained integer — no pledge migration. **Apply: test (done in this run) + prod (at `/ship`, founder-approved).**

**Rollback:** flip `CURRENT_*_VERSION` back to 4 (code only — the pointer is the sole lever). The widened CHECK is a harmless backstop, never needs reverting.

**Gates:** pledge v4 render guard (`p857-oath-emphasis`) + agreement v4/legacy (`p461`) prove grandfathering intact; `p857-agreement-versions` updated for the v5 pointer + a v5 block.
