---
status: today
type: story
rank: 0.006
created_date: '2026-05-31'
tags:
  - partner-agreement
  - versioning
  - verified-understanding
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-05-31T05:25:35.542Z'
---

# P857: Clarity Agreement versioning + number-first (verified-understanding) v-next

## Problem

**Situation:** The Clarity Pledge is versioned (`pledge-text.tsx`, `PLEDGE_VERSIONS`, currently v3). The **Clarity Partner Agreement has NO version registry.** Its certificate (`agreement-certificate.tsx`, `export-agreement-certificate.tsx`) renders **two text parts**: (1) the dyad's custom **scope**, stored per-row as `clarity_agreements.terms_text`; and (2) a **hardcoded bilateral oath** (currently the v3-equivalent "we will explain back… we won't pretend"). There is no `agreement_version` column and no `AGREEMENT_VERSIONS` equivalent of `PLEDGE_VERSIONS`.

**Complication:** The verified-understanding model (decisions.md 2026-05-31 [product]) upgrades the agreement to a number-first commitment. The *number + min* mechanic is only coherent **bilaterally** — two people affirming the promise to each other — which is where the agreement lives, unlike the unilateral pledge. So the agreement is the natural first home for the new wording. But it can't ship there, because the oath is hardcoded (so changing it would silently change the existing agreement) and there's no versioning to roll back to.

**Question:** Add version-registry infrastructure to the agreement, extract the shared oath into one constant both artifacts reference, then upgrade the agreement + `/partner-template` to v4 — without breaking the one existing real agreement, behind a config flag that rolls back with a single change.

## Appetite

High blast radius — a new versioning layer on a previously-unversioned artifact, an **additive DB migration** (`agreement_version` column + one-row backfill), the certificate components, and `/partner-template`. **Medium-high reversibility:** rollback is a config flip (`CURRENT_AGREEMENT_VERSION`), not a DB reversal; the existing agreement is grandfathered by its stored data and never re-rendered as v4. High decision density — the v4 wording is a `[FOUNDER DECISION]` (shared with P855), and the bilateral pronoun framing (I vs we) needs a call (see Open Questions).

## Solution

Two stages, sequenced. **Stage A must fully deploy before Stage B's text change** — the existing agreement's oath is currently in code, not pinned, so a text change without versioning would re-render it.

**Stage A — versioning infrastructure + shared oath constant.**
1. **Extract the shared oath.** Create `VERIFIED_UNDERSTANDING_OATH` (a versioned constant: `yourRight` / `myPromise` / `exception`; v4 ends "…verified understanding of your intention"). This is the single source that both `PLEDGE_VERSIONS` (P855) and `AGREEMENT_VERSIONS` reference — edit once, both change.
2. **Add `AGREEMENT_VERSIONS`** mirroring `PLEDGE_VERSIONS`: each entry = agreement **bilateral framing** (title "Clarity Partner Agreement", two-signature structure) composed with a `VERIFIED_UNDERSTANDING_OATH` body. Own current-pointer, switchable.
3. **Grandfather migration (additive).** Add an `agreement_version` column to `clarity_agreements` (default = legacy; new rows get current). Backfill the one existing real agreement → `legacy` (v1). **`terms_text` (the dyad's custom scope) is untouched — only the oath section is versioned.**
4. **Version-aware certificate.** Replace the hardcoded oath (`agreement-certificate.tsx` ~lines 268/281) with a lookup of `AGREEMENT_VERSIONS[row.agreement_version]`; the per-row `terms_text` keeps rendering as today. Result: the existing agreement renders its stored scope + its pinned legacy oath = **identical to today**. Single-source the agreement surfaces to the registry.

**Stage B — number-first v4.**
Add `AGREEMENT_VERSIONS[4]` = bilateral framing + `VERIFIED_UNDERSTANDING_OATH[4]`. New agreements render v4; the existing one stays `legacy`. Update `/partner-template` (the `MOCK_TERMS` / `DEFAULT_TERMS` template sources in `partner-template-page.tsx` / `create-agreement-page.tsx`) to reflect v4 when current.

(Wording shared with P855, gated by `/challenge-prd` + founder sign-off. One canonical oath, applied unilaterally as the pledge, bilaterally as the agreement.)

## Risks / Non-Goals

### Risks
- **MITIGATE — Wrong deploy order breaks the existing agreement.** If the v4 oath ships before the column + version-aware rendering, the existing agreement renders v4. Mitigation: Stage A fully before Stage B; the Done-When validates the existing agreement renders unchanged (oath + scope) while a new agreement renders v4.
- **ACCEPT — Wording is provisional, not field-validated.** Same as P855 — provisional v4 behind the flag, no instrumentation. Safety: keep current on legacy until ready; one-flip rollback.

### Non-Goals
- Do NOT change the **pledge** here — that is P855 (ships after; reuses the shared constant).
- Do NOT migrate or re-render the existing agreement to v4 — grandfather it.
- **Do NOT touch `terms_text` / the dyad's custom scope — only the hardcoded oath section is versioned.**
- Do NOT finalize the shared v4 wording without founder sign-off + `/challenge-prd`.
- **Do NOT merge with P855.** Shared text via the constant ≠ shared deploy — two independently-reversible deploys.
- Do NOT wire the min to any commitment behavior in `/live` — P854 is display-only.
- Do NOT instrument / build measurement here — falsification apparatus dropped (decision 2026-05-31).
- Do NOT decide keep-vs-collapse of the ~1% full pledge (p605) here.

## Acceptance Criteria

- [ ] `VERIFIED_UNDERSTANDING_OATH` shared constant exists; both registries reference it
- [ ] `AGREEMENT_VERSIONS` registry exists (bilateral framing + shared oath); current switchable; legacy retained
- [ ] `agreement_version` column added (additive migration); existing real agreement backfilled to `legacy`
- [ ] Certificate renders the oath from the row's pinned version; `terms_text` (scope) renders unchanged
- [ ] The existing real agreement renders unchanged (oath + scope) on its legacy version
- [ ] A newly created agreement renders the v4 oath
- [ ] `/partner-template` reflects v4 when current
- [ ] Shared v4 wording passed `/challenge-prd` (P855) + founder sign-off; pronoun framing resolved (Open Questions)
- [ ] Rollback to legacy is a single config change (`CURRENT_AGREEMENT_VERSION`)

## Open Questions

1. **Bilateral pronoun framing (I vs we).** The current agreement oath reads **"We will explain back… we won't pretend"** (reciprocal plural); the locked v4 text is **first-person "I"**. For v4 to *literally* share one constant with the pledge, the agreement uses the identical first-person oath (each partner signs the "I" promise to the other). Keeping "we" means a separate bilateral string and "edit once" becomes "edit two." **[FOUNDER DECISION]** — recommend: identical first-person text, each partner signs it (one shared constant).
2. Agreement version label for the new entry: **`4`** (mirror pledge/oath version; intentional gap where agreement v2/v3 never existed) vs its own count. Recommend `4`.

## UX Notes

- Certificate reads the agreement's **pinned** `agreement_version`, not the global current version.
- Existing agreements: grandfather (stay on legacy); new agreements get the current version. No forced re-affirm.
- `terms_text` editing/display is unaffected by versioning.

## Migration / Deploy Notes

- **Additive migration:** `ALTER TABLE clarity_agreements ADD COLUMN agreement_version … DEFAULT <legacy>`; backfill the existing row → legacy (single UPDATE). No existing data mutated beyond gaining a version tag.
- **Order:** migration + backfill + version-aware rendering deploy **before** the v4 oath text.
- **Rollback:** flip `CURRENT_AGREEMENT_VERSION` back (config/deploy). The column stays (harmless); the existing agreement is unaffected throughout. No DB reversal needed.

## Rollback Strategy

Flip the current-version pointer back to legacy (single config change). The existing agreement is grandfathered either way (pinned via `agreement_version`). No data migration to reverse.

## Done-When

- [ ] Shared constant + `AGREEMENT_VERSIONS` ship; `agreement_version` column added + existing row backfilled to legacy
- [ ] Existing agreement verified unchanged (oath + scope); new agreement renders v4 (evidence: side-by-side render)
- [ ] `/partner-template` reflects v4 when current
- [ ] Rollback to legacy verified as a single config change
- [ ] Pronoun framing (Open Q #1) + shared v4 wording founder-signed-off before v4 is made current

## Related

- **P855** (pledge v4) — ships *after* this; reuses the shared `VERIFIED_UNDERSTANDING_OATH` constant created here. The same wording sign-off governs both.
- **P853** (falsify / measurement design) — **archived; falsification apparatus dropped (decision 2026-05-31), not absorbed here.**
- P854 (/live min-display — display-only, NOT the two-phase loop) · p605 (pledge as graduation, ~1%)
- `definitions.md` Clarity Partner Agreement (v-next decided, pending this spec) · `agreement-certificate.tsx`, `export-agreement-certificate.tsx`, `/partner-template`
- Rationale: decisions.md 2026-05-31 [product] + [content/strategy] · a9/a29 (verified-understanding model)
