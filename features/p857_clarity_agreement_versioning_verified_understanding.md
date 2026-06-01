---
status: in-progress
type: story
feature_type: backend
rank: 0.006
created_date: '2026-05-31'
tags:
  - partner-agreement
  - versioning
  - verified-understanding
delivery_stage: dev
pipeline_ran: [create-spec, architect, generate-tests, spec-review, dev]
locked_at: '2026-05-31T05:25:35.542Z'
uat_file: features/uat/p857.md
test_files:
  - src/tests/p461-agreement-certificate-text.test.tsx
  - src/tests/p857-agreement-versions.test.ts
  - e2e/integration/p857-agreement-version-migration.spec.ts
  - e2e/p857-agreement-certificate.spec.ts
---

# P857: Clarity Agreement versioning + number-first (verified-understanding) v-next

## Problem

**Situation:** The Clarity Pledge is versioned (`pledge-text.tsx`, `PLEDGE_VERSIONS`, currently v3). The **Clarity Partner Agreement has NO version registry.** Its certificate (`agreement-certificate.tsx`, `export-agreement-certificate.tsx`) renders **two text parts**: (1) the dyad's custom **scope**, stored per-row as `clarity_agreements.terms_text`; and (2) a **hardcoded bilateral oath** (currently the v3-equivalent "we will explain back… we won't pretend"). There is no `agreement_version` column and no `AGREEMENT_VERSIONS` equivalent of `PLEDGE_VERSIONS`.

**Complication:** The verified-understanding model (decisions.md 2026-05-31 [product]) upgrades the agreement to a number-first commitment. The *number + min* mechanic is only coherent **bilaterally** — two people affirming the promise to each other — which is where the agreement lives, unlike the unilateral pledge. So the agreement is the natural first home for the new wording. But it can't ship there, because the oath is hardcoded (so changing it would silently change the existing agreement) and there's no versioning to roll back to.

**Question:** Add version-registry infrastructure to the agreement, point it at the shared `VERIFIED_UNDERSTANDING_OATH` constant (created in P855, which ships first), then upgrade the agreement + `/partner-template` to v4 — without breaking the one existing real agreement, behind a config flag that rolls back with a single change.

## Appetite

High blast radius — a new versioning layer on a previously-unversioned artifact, an **additive DB migration** (`agreement_version` column + one-row backfill), the certificate components, and `/partner-template`. **Medium-high reversibility:** rollback is a config flip (`CURRENT_AGREEMENT_VERSION`), not a DB reversal; the existing agreement is grandfathered by its stored data and never re-rendered as v4. High decision density — the v4 wording is a `[FOUNDER DECISION]` (shared with P855); the pronoun framing (we-intro + first-person body) is resolved (see Resolved Decisions).

## Solution

Two stages, sequenced. **Stage A must fully deploy before Stage B's text change** — the existing agreement's oath is currently in code, not pinned, so a text change without versioning would re-render it.

**Stage A — versioning infrastructure (reusing the shared oath constant from P855).**
1. **Reuse the shared oath.** `VERIFIED_UNDERSTANDING_OATH` is **created in P855, which ships first** (a versioned constant: `yourRight` / `myPromise` / `exception`; v4 ends "…verified understanding of your intention"). This spec does **not** create it — it points `AGREEMENT_VERSIONS` at the same constant so the two converge (edit once, both change). *(If P857 is ever built before P855 ships, create the constant as part of that work and reconcile on merge — but the default order is P855 first.)*
2. **Add `AGREEMENT_VERSIONS`** mirroring `PLEDGE_VERSIONS`: each entry = agreement **bilateral framing** (title "Clarity Partner Agreement", the existing "We, {A} and {B}, agree to:" intro, two-signature structure) composed with the **identical first-person** `VERIFIED_UNDERSTANDING_OATH` body. The mutuality lives in the intro + two signatures; the oath body stays first-person so the directional min ("the lower of our two numbers") stays unambiguous and the constant stays literally shared with the pledge. Own current-pointer, switchable.
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
- Do NOT change the **pledge** here — that is P855 (**ships first**; **creates** the shared constant this spec reuses).
- Do NOT migrate or re-render the existing agreement to v4 — grandfather it.
- **Do NOT touch `terms_text` / the dyad's custom scope — only the hardcoded oath section is versioned.**
- Do NOT finalize the shared v4 wording without founder sign-off + `/challenge-prd`.
- **Do NOT merge with P855.** Shared text via the constant ≠ shared deploy — two independently-reversible deploys.
- Do NOT wire the min to any commitment behavior in `/live` — P854 is display-only.
- Do NOT instrument / build measurement here — falsification apparatus dropped (decision 2026-05-31).
- Do NOT decide keep-vs-collapse of the ~1% full pledge (p605) here.

## Acceptance Criteria

- [ ] `AGREEMENT_VERSIONS` references the shared `VERIFIED_UNDERSTANDING_OATH` constant (created in P855)
- [ ] `AGREEMENT_VERSIONS` registry exists (bilateral framing + shared oath); current switchable; legacy retained
- [ ] `agreement_version` column added (additive migration); existing real agreement backfilled to `legacy`
- [ ] Certificate renders the oath from the row's pinned version; `terms_text` (scope) renders unchanged
- [ ] The existing real agreement renders unchanged (oath + scope) on its legacy version
- [ ] A newly created agreement renders the v4 oath
- [ ] `/partner-template` reflects v4 when current
- [ ] Shared v4 wording passed `/challenge-prd` (P855) + founder sign-off (pronoun framing resolved: we-intro + first-person body)
- [ ] Rollback to legacy is a single config change (`CURRENT_AGREEMENT_VERSION`)

## Resolved Decisions

1. **Bilateral pronoun framing (I vs we) — RESOLVED 2026-05-31 (founder): we-intro + first-person oath body.** The certificate carries a plural intro + two signatures (the mutuality), while the oath body stays the **identical first-person** `VERIFIED_UNDERSTANDING_OATH` (each partner signs it). Rejected full-"we" wording: the min line ("the lower of our two numbers") loses precision in plural because the min is directional. Keeps the literally-shared constant with the pledge. **Intro wording — RESOLVED (founder, /spec-review): keep the existing "We, {A} and {B}, agree to:" line as-is** (the certificate already renders it; v4 changes only the oath body, not the intro). The intro line stays hardcoded in the certificate JSX — it is NOT swapped to a registry field by this spec.
2. **Agreement version label — RESOLVED: `4`** (mirrors the pledge/oath version; intentional gap where agreement v2/v3 never existed).

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
- [ ] Shared v4 wording founder-signed-off before v4 is made current (pronoun framing resolved)

## Related

- **P855** (pledge v4) — **ships before** this; **creates** the shared `VERIFIED_UNDERSTANDING_OATH` constant this spec reuses. The same wording sign-off governs both.
- **P853** (falsify / measurement design) — **archived; falsification apparatus dropped (decision 2026-05-31), not absorbed here.**
- P854 (/live min-display — display-only, NOT the two-phase loop) · p605 (pledge as graduation, ~1%)
- `definitions.md` Clarity Partner Agreement (v-next decided, pending this spec) · `agreement-certificate.tsx`, `export-agreement-certificate.tsx`, `/partner-template`
- Rationale: decisions.md 2026-05-31 [product] + [content/strategy] · a9/a29 (verified-understanding model)

## Technical Architecture

### Technical Analysis

**Current code state (verified against source this session):**

**Shared oath constant — CONFIRMED:**
`src/app/content/verified-understanding-oath.ts` exports `VERIFIED_UNDERSTANDING_OATH` with a single `[4]` entry (shape: `yourRight.{heading,text}` / `myPromise.{heading,text}` / `exception.{heading,text}`). No legacy `[3]` or earlier keys. P855 ships this constant, and this spec reuses it. Confirmed: the oath body uses first-person voice throughout ("I'll give you an honest number…", "I'll accept the lower of our two numbers…").

**Pledge versioning pattern — CONFIRMED:**
`src/app/content/pledge-text.tsx` exports `PLEDGE_VERSIONS` (keys `1|2|3|4`), `CURRENT_PLEDGE_VERSION: PledgeVersion = 4`, and `PledgeVersion = keyof typeof PLEDGE_VERSIONS`. The `PLEDGE_TEXT` alias object mirrors the current version. `AGREEMENT_VERSIONS` must mirror this exact shape.

**agreement-certificate.tsx hardcoded oath — CONFIRMED (verified lines 247–283):**
Three hardcoded JSX sections with `"We"` framing:
- **YOUR RIGHT** (`h3` label, `p`): `"When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back."`
- **OUR PROMISE** (`h3` label, `p`): `"We will explain back what we think the other meant—withholding judgment or criticism—so they can confirm or correct us. We won’t pretend to understand if we don’t."`
- **THE EXCEPTION** (`h3` label, `p`): `"If either of us can’t keep this promise in the moment, we’ll explain why."`

The section headings (`YOUR RIGHT`, `OUR PROMISE`, `THE EXCEPTION`) are also hardcoded. These three blocks are the **entire legacy oath** — no prose outside them. `termsText` renders separately below in a bordered section.

**export-agreement-certificate.tsx hardcoded oath — CONFIRMED (verified lines 92–145):**
Same three sections with identical text, inline styles (no Tailwind). No `displayId` prop here; certificate takes only `creatorName`, `partnerName`, `termsText`. Sections headings: `YOUR RIGHT`, `OUR PROMISE`, `THE EXCEPTION`.

**Key divergence from spec assumption:** The spec says the existing bilateral wording is "We will explain back what we think the other meant…we won't pretend." The actual heading for the second block is **OUR PROMISE** (not **OUR COMMITMENT** or **MY PROMISE**). This matters for the legacy entry naming. Also note the existing bilateral certificate does NOT have a `Your Right` / `My Promise` split — it uses `YOUR RIGHT` / `OUR PROMISE` as section labels, where the "Our" framing encapsulates both directions. v4 (from `VERIFIED_UNDERSTANDING_OATH`) uses `YOUR RIGHT` / `MY PROMISE` / `THE EXCEPTION` — first-person. This bilateral-vs-first-person rendering difference is one of the key rendering choices in Stage B.

**agreement-certificate.tsx props — CONFIRMED:** No `agreementVersion` prop today. Props include `displayId`, `variant`, `termsText`, `creatorName`, `partnerName`, signatures, avatars, profile URLs, creation-mode callbacks. No version-related field.

**clarity_agreements table — CONFIRMED:** Schema from migration `20260224150000_p422_clarity_agreements.sql`. No `agreement_version` column. Columns: `id`, `creator_profile_id`, `partner_profile_id`, `partner_email`, `terms_text`, `status`, `visibility`, `invitation_token`, `invitation_expires_at`, `created_at`, `partner_signed_at`, `terminated_at`, `terminated_by`, `display_id`. Seven later migrations fix RLS/RPC; none add `agreement_version`.

**p461 test — CONFIRMED breaking risk:** `src/tests/p461-agreement-certificate-text.test.tsx` asserts verbatim text of all three hardcoded sections in their current bilateral ("We") wording. When `AgreementCertificate` gains an `agreementVersion` prop and version-aware rendering, the test's `render()` call will pass no version prop and must resolve to `"legacy"` → the test must still pass on the legacy path. If the default does not resolve to legacy, the test breaks on all three assertions. This is the primary test risk.

**partner-template-page.tsx — CONFIRMED:** Uses `MOCK_TERMS` (4-line multi-sentence string). Passes `variant="active"`, `creatorName="Alex Walker"`, `partnerName="Jordan Rivera"`. Does NOT pass any version prop; after Stage B, must pass `CURRENT_AGREEMENT_VERSION` explicitly to show v4 content.

**create-agreement-page.tsx — CONFIRMED:** Uses `DEFAULT_TERMS` (5-line structured string). Passes `variant="creation"` with creation callbacks. Agreement creation calls `agreementsService.createAgreement(...)` with `{partnerEmail, partnerDisplayName, termsText, visibility}` — no version field. After Stage A, this call must also pass the current version so new rows are stamped.

**Reuse Inventory:**

| Artifact | Path | Role in P857 |
|----------|------|-------------|
| `VERIFIED_UNDERSTANDING_OATH` | `src/app/content/verified-understanding-oath.ts` | Reused directly — oath body for `AGREEMENT_VERSIONS[4]` |
| `PLEDGE_VERSIONS` pattern | `src/app/content/pledge-text.tsx` | Structural template to mirror for `AGREEMENT_VERSIONS` |
| `CURRENT_PLEDGE_VERSION` pattern | `src/app/content/pledge-text.tsx` | Structural template to mirror for `CURRENT_AGREEMENT_VERSION` |
| `PledgeVersion` type | `src/app/content/pledge-text.tsx` | Template for `AgreementVersion` type |
| `AgreementCertificate` | `src/app/components/agreements/agreement-certificate.tsx` | Modify — add `agreementVersion` prop, replace 3 hardcoded oath blocks |
| `ExportAgreementCertificate` | `src/app/components/agreements/export-agreement-certificate.tsx` | Modify — same oath replacement |
| `PartnerTemplatePage` | `src/app/pages/partner-template-page.tsx` | Modify — pass version prop in Stage B |
| `CreateAgreementPage` | `src/app/pages/create-agreement-page.tsx` | Modify — stamp `agreement_version` on create |
| `agreementsService.createAgreement` | `src/app/data/agreements-service*.ts` | Modify — include `agreement_version` in INSERT |
| `p461-agreement-certificate-text.test.tsx` | `src/tests/p461-agreement-certificate-text.test.tsx` | Modify — make version-aware (keep legacy assertions + add v4 assertions) |
| `20260224150000_p422_clarity_agreements.sql` | `supabase/migrations/` | Reference — existing table DDL, no new column yet |

**Dependencies:**
- P855 must ship first (creates `VERIFIED_UNDERSTANDING_OATH` — already shipped as confirmed by reading the file).
- Shared oath constant already exists in code; P857 can proceed.
- Wording founder sign-off is a gate before Stage B (making v4 current), not before Stage A.

---

### Architecture Decisions

**Decision 1: Legacy oath captured as `"legacy"` string key (not `1` or `3`)**

- **Chosen:** `AGREEMENT_VERSIONS["legacy"]` — string key, not a numeric key.
- **Rationale:** There were no agreement versions `1`, `2`, or `3` — the pledge had those, but the agreement's initial hardcoded wording was never versioned. Numeric `1` would imply a sequence (v2 would follow v1) and falsely suggest a prior versioning regime existed. `"legacy"` is semantically accurate: it means "the wording that existed before versioning was introduced," and it is a permanent grandfathering label with no implied successor. The v4 key (`4`) is numeric and mirrors `PLEDGE_VERSIONS[4]` + `VERIFIED_UNDERSTANDING_OATH[4]` intentionally.
- **Trade-off:** `AgreementVersion` type is a union of string `"legacy"` and numeric `4` (and future numbers), which is less uniform than an all-numeric type. The `CURRENT_AGREEMENT_VERSION` type must accept both. TypeScript union handles this cleanly.
- **Alternative rejected:** `AGREEMENT_VERSIONS[1]` as the legacy entry — implies a v2/v3 exist or will, which is false. The version intentional gap (decisions.md 2026-05-31 [technical]) was specifically "no v1–v3 for the *shared oath constant*"; for the agreement registry, `"legacy"` is cleaner than a numeric gap.

**Decision 2: `AGREEMENT_VERSIONS` in a new dedicated file, not in `pledge-text.tsx`**

- **Chosen:** New file `src/app/content/agreement-versions.ts` exports `AGREEMENT_VERSIONS`, `CURRENT_AGREEMENT_VERSION`, `AgreementVersion`, and a plain-text alias `AGREEMENT_TEXT` (mirrors `PLEDGE_TEXT`).
- **Rationale:** `pledge-text.tsx` already has a high line count and exports many JSX-formatted functions. Colocating agreement versions there couples two independent artifacts in one file. Separate file keeps each registry independently modifiable, independently importable, and independently rollback-able. The files stay parallel: `pledge-text.tsx` for pledges, `agreement-versions.ts` for agreements.
- **Trade-off:** One extra file. Acceptable per the "new because inventory shows no existing agreement-versions file" reuse rule.
- **Alternative rejected:** Extending `pledge-text.tsx` — would create a semantic boundary violation (pledge file now owns agreement content) and complicates future divergence if pledge/agreement oath text ever differs.

**Decision 3: Bilateral framing in `AGREEMENT_VERSIONS` — `commitmentIntro` wraps both names; oath body stays verbatim from `VERIFIED_UNDERSTANDING_OATH`**

- **Chosen:** Each `AGREEMENT_VERSIONS` entry contains: `title` ("Clarity Partner Agreement"), `subtitle` ("A mutual commitment to clarity"), `commitmentIntro` as a two-name function `(creatorName, partnerName) => string`, and `yourRight`/`myPromise`/`exception` pointing directly at `VERIFIED_UNDERSTANDING_OATH[N].*` (for v4) or verbatim legacy strings (for legacy). The `commitmentIntro` is `(a, b) => \`We, ${a} and ${b}, agree to:\`` — separate from the oath body.
- **Rationale:** The mutuality of the agreement is encoded in the `commitmentIntro` (bilateral names, "We") and the two-signature structure (already in `AgreementCertificate`). The oath body (`yourRight`/`myPromise`/`exception`) can be the **literal** `VERIFIED_UNDERSTANDING_OATH[4]` struct for v4, so edits to the shared constant propagate automatically. Legacy body text is inlined verbatim (no shared constant exists for it — it was never extracted). This is the exact pattern P855 used: `PLEDGE_VERSIONS[4].yourRight = VERIFIED_UNDERSTANDING_OATH[4].yourRight`.
- **Trade-off:** The bilateral certificate renders first-person oath text ("I'll give you an honest number…") under a "We, A and B, agree to:" intro. This is the resolved pronoun framing (Resolved Decision 1): first-person body + bilateral intro is intentional — the first-person min line ("the lower of our two numbers") stays directionally unambiguous per each signer, while the intro establishes the mutual commitment.
- **Alternative rejected:** A "we"-reworded bilateral variant of each oath line — creates a separate constant, breaks literal sharing with the pledge, and introduces wording divergence risk. Rejected per decisions.md 2026-05-31 [technical] and Resolved Decision 1.

**Decision 4: `agreement_version` DB column — `TEXT` type, DEFAULT `'legacy'`, not nullable**

- **Chosen:** `ALTER TABLE clarity_agreements ADD COLUMN agreement_version TEXT NOT NULL DEFAULT 'legacy'`; backfill `UPDATE clarity_agreements SET agreement_version = 'legacy' WHERE agreement_version = 'legacy'` (idempotent no-op since default covers all existing rows). Add a CHECK constraint: `CHECK (agreement_version IN ('legacy', '4'))` — expandable for future versions.
- **Rationale:** `TEXT NOT NULL DEFAULT 'legacy'` means all existing rows immediately get `'legacy'` via the DEFAULT when the column is added (no explicit UPDATE needed for the existing row, though the backfill UPDATE is included for explicitness and to match the spec's stated intent). New rows default to `'legacy'` until the write-path stamps the current version. This makes Stage A safe: add column, render uses `row.agreement_version ?? 'legacy'`, existing row is already on legacy. Stage B adds the v4 write-path.
- **Trade-off:** TEXT is less type-safe than an enum, but enums are harder to extend in PostgreSQL (require migration to add values). TEXT + CHECK constraint gives extension safety without migration complexity for future versions.
- **Alternative rejected:** Nullable column with `NULL` meaning legacy — `NULL` is semantically ambiguous (missing vs legacy). `NOT NULL DEFAULT 'legacy'` is unambiguous and eliminates null-check branching in TypeScript.

**Decision 5: Version-aware certificate rendering — single `agreementVersion` prop, component-internal lookup**

- **Chosen:** `AgreementCertificate` gains an `agreementVersion?: AgreementVersion` prop (default: `'legacy'` when absent). The three hardcoded oath blocks are replaced with a single **result-level** lookup `AGREEMENT_VERSIONS[agreementVersion] ?? AGREEMENT_VERSIONS['legacy']` and rendered from the registry entry. (Result-level fallback — not key-level `[agreementVersion ?? 'legacy']` — so an unknown non-null version value falls back to legacy instead of returning `undefined` and crashing; mirrors `profile-certificate.tsx:53`. See Security Review.) Heading labels (`YOUR RIGHT`, `OUR PROMISE`/`MY PROMISE`, `THE EXCEPTION`) are also stored in the registry entry so legacy keeps its "OUR PROMISE" label while v4 uses "MY PROMISE". `ExportAgreementCertificate` gets the same prop.
- **Rationale:** The default-to-legacy ensures backward compatibility for all existing callsites including the p461 test (which passes no version prop). Single lookup replaces 3 hardcoded blocks, reducing the diff surface. Section headings stored in registry entries prevents label/content mismatch across versions.
- **Trade-off:** Callsites (partner-template-page, agreement-view pages) must start passing `agreementVersion={row.agreement_version}` to render correctly from stored version. Pages that already render from a row object have the column value available after migration.
- **Alternative rejected:** Wrapping the entire oath in a version-dispatched sub-component — adds an extra abstraction layer over a simple object lookup. The pledge uses direct destructuring from `PLEDGE_VERSIONS[version]`; agreement follows the same pattern.

**Decision 6: `p461` test updated to assert on version-aware behavior, not deleted or disabled**

- **Chosen:** Rename the test block to `"P461: AgreementCertificate — version-aware rendering"`. Keep the legacy-path assertions (render with no `agreementVersion` prop → defaults to `'legacy'` → same "We" wording as today). Add a second `describe` block that renders with `agreementVersion={4}` and asserts v4 first-person text. The "does NOT show unilateral pledge voice" guard stays but is moved to the v4 block (v4 IS first-person — the guard changes to verify no pledge-only framing leaks, not that first-person is absent).
- **Rationale:** Tests are specs (per `.claude/rules/tests.md`). The p461 test pins the bilateral text as a regression guard. It must still pass on the legacy path (byte-identical output). Adding a v4 block extends coverage without deleting the existing spec. The "I/you pledge voice" guard in the existing test must be updated: v4 certificate body IS first-person ("I'll give you…"), so the current guard `queryByText(/if you need to know I truly understand/)` still correctly rejects the OLD pledge v2/v3 text, but the guard intent must be documented clearly.
- **Alternative rejected:** Delete the test or replace assertions to match v4 — modifying tests to make them pass is prohibited per `.claude/rules/tests.md`.

---

### Security Review

**RLS Policies:**
- ✅ Existing SELECT policy (`visibility = 'public' OR creator_profile_id = auth.uid() OR partner_profile_id = auth.uid()`) covers the whole row including the new `agreement_version` column. No RLS changes required.
- ✅ INSERT policy enforces `creator_profile_id = auth.uid()`. `createAgreement` sets `agreement_version` server-side from `CURRENT_AGREEMENT_VERSION` (not from client input) — keep it that way.
- ⚠️ **Direct UPDATE path for `agreement_version`.** The UPDATE policy (final state, migration `20260225180000`) has WITH CHECK `creator_profile_id = auth.uid() OR partner_profile_id = auth.uid()` with **no column-level restriction**. A party can PATCH `agreement_version` to any value on a row they're party to via PostgREST. (Same latent risk `terms_text` has today, but `terms_text` has a length CHECK; `agreement_version` would have none.) **Mitigation (primary):** the `CHECK (agreement_version IN ('legacy', '4'))` constraint in the migration bounds the value at the DB layer — already in Build Sequence step A5. Extend the constraint when each new version ships. (Optional hardening, not required now: `REVOKE UPDATE (agreement_version) FROM authenticated`.)

**Authentication:**
- ✅ No change to the auth surface. `accept_agreement` / `decline_agreement` RPCs (`SECURITY DEFINER`, granted to `authenticated`) do not touch `agreement_version` — version stays pinned to creation time, never mutated on acceptance. Correct.
- ✅ `get_agreement_by_token` (granted `anon` + `authenticated`) is unchanged. The self-sign guard (`creator_profile_id != p_partner_id`) is intact — no regression.

**Input Validation:**
- ⚠️ **Unknown version key must render safely.** If a row carries a version not present in `AGREEMENT_VERSIONS`, a bare lookup returns `undefined` and the certificate crashes / renders no oath. **Two layers, both required:** (1) the migration CHECK constraint (DB gate); (2) a **result-level** render fallback `AGREEMENT_VERSIONS[row.agreement_version] ?? AGREEMENT_VERSIONS['legacy']` in both certificate components — mirrors the existing `profile-certificate.tsx:53` pattern (`PLEDGE_VERSIONS[v] ?? PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION]`). Note: result-level `?? AGREEMENT_VERSIONS['legacy']`, **not** key-level `agreementVersion ?? 'legacy'` — the latter only catches null/undefined, not an unknown non-null key.
- ✅ `agreement_version` is not a user-facing form field — set at INSERT via server constant. The only write vector is the direct-PATCH path covered under RLS above.
- ✅ `terms_text` renders as plain `{termsText}` JSX (no `dangerouslySetInnerHTML`); export uses `whiteSpace: 'pre-wrap'`. No XSS vector. Existing 1000-char CHECK is the correct guard. Unchanged by this feature.

**Data Protection:**
- ✅ `terms_text` (dyad's custom scope) is unchanged; its SELECT RLS is unchanged — no read-surface expansion.
- ✅ `get_agreement_by_token` returns `SELECT *`, which will now include `agreement_version` — acceptable: the token holder is the intended partner already receiving the full row; a version tag is not PII.
- ✅ No new external API, no LLM, no new stored personal data. `VERIFIED_UNDERSTANDING_OATH` is static text. No PII concerns introduced.

**Required before Stage A ships:** (1) migration CHECK constraint `IN ('legacy', '4')`; (2) result-level render fallback in both certificate components; (3) `createAgreement` assigns `agreement_version` server-side, never from client.

---

### Implementation Approach

**Worktree recommended:** touches a DB migration + shared content constant + multiple render surfaces.

#### Build Sequence

**Stage A — Versioning infrastructure (deploy fully before Stage B)**

All Stage A changes must land in a single deploy. `CURRENT_AGREEMENT_VERSION` stays on `'legacy'` throughout Stage A. New agreements and the existing agreement both render the same legacy wording. This stage is safe to deploy independently.

1. **Create `src/app/content/agreement-versions.ts`** — `AGREEMENT_VERSIONS` with `"legacy"` entry (verbatim bilateral text from current hardcoded certificate) and structure for v4 (pointing at `VERIFIED_UNDERSTANDING_OATH[4]`). Export `CURRENT_AGREEMENT_VERSION: AgreementVersion = 'legacy'`, `AgreementVersion` type, `AGREEMENT_TEXT` alias.
   - **Apostrophe/dash characters (test-critical):** the legacy text strings must use **typographic curly quotes U+2019** (`’`) for apostrophes and **em-dash U+2014** (`—`), NOT straight `'` / `&apos;` / `&mdash;`. The current certificate JSX uses HTML entities; the registry is a plain `.ts` file so it must store the literal Unicode glyphs. The unit + component tests assert U+2019/U+2014 verbatim — straight quotes will fail them.
   - The `"legacy"` entry stores its heading labels (`YOUR RIGHT` / `OUR PROMISE` / `THE EXCEPTION`); the `4` entry uses `VERIFIED_UNDERSTANDING_OATH[4]` headings (`YOUR RIGHT` / `MY PROMISE` / `THE EXCEPTION`).
   - **`commitmentIntro` / `title` / `subtitle` are stored for completeness but NOT wired to rendering by this spec** — the certificate's bilateral intro line ("We, {A} and {B}, agree to:") stays hardcoded in the JSX (Resolved Decision 1). Only the three oath blocks are read from the registry.

2. **Update `src/app/components/agreements/agreement-certificate.tsx`** — add `agreementVersion?: AgreementVersion` prop (default `'legacy'`). Replace the three hardcoded oath JSX blocks (YOUR RIGHT, OUR PROMISE, THE EXCEPTION) with a single **result-level** lookup `const oathVersion = AGREEMENT_VERSIONS[agreementVersion] ?? AGREEMENT_VERSIONS['legacy']` and render from registry. The result-level fallback (not key-level) ensures an unknown/non-null version value renders legacy rather than crashing (Security Review). Heading labels come from registry entry. No other behavior changes.

3. **Update `src/app/components/agreements/export-agreement-certificate.tsx`** — same `agreementVersion` prop and oath lookup replacement, using the identical result-level fallback `AGREEMENT_VERSIONS[agreementVersion] ?? AGREEMENT_VERSIONS['legacy']`. Inline-style rendering uses the same text from the registry.

4. **Update `src/tests/p461-agreement-certificate-text.test.tsx`** — rename describe block to `"version-aware rendering"`. Legacy assertions (no version prop → legacy defaults → existing bilateral text) must all still pass. Add v4 describe block asserting first-person v4 text when `agreementVersion={4}` is passed. Update the unilateral-voice guard comment to reflect v4 is first-person by design.

5. **DB migration** — `supabase/migrations/<TIMESTAMP>_p857_agreement_version.sql`:
   ```sql
   ALTER TABLE public.clarity_agreements
     ADD COLUMN IF NOT EXISTS agreement_version TEXT NOT NULL DEFAULT 'legacy'
     CHECK (agreement_version IN ('legacy', '4'));

   -- Explicit backfill (idempotent — all rows already have default 'legacy')
   UPDATE public.clarity_agreements
     SET agreement_version = 'legacy'
   WHERE agreement_version = 'legacy';
   ```
   Run `./scripts/migrate.sh` after creating the file.

6. **Update `src/app/data/agreements-service*.ts`** — (a) add `agreement_version: CURRENT_AGREEMENT_VERSION` (from import) to the INSERT payload in `createAgreement(...)`, server-side, never from client; (b) **map the DB column to the domain object in the read path** — wherever a `clarity_agreements` row is converted to `ClarityAgreement` (the row→object mapper / `select`), surface `agreement_version` as `agreementVersion` so view callsites can read it.

7. **Add `agreementVersion?: AgreementVersion` to the `ClarityAgreement` interface** in `src/app/data/agreements-service.interface.ts` (line 13). Without this field the read-path callsites in step 8 have no value to pass.

8. **Wire the read-path callsites (BLOCK — surfaced by /spec-review).** Every callsite that renders a real stored agreement must pass `agreementVersion={agreement.agreementVersion}` (else it silently defaults to legacy and Stage B's "renders v4" criterion fails on real view flows):
   - `src/app/pages/agreement-page.tsx` — **3** `<AgreementCertificate>` call sites (~lines 69, 182, 269)
   - `src/app/pages/accept-agreement-page.tsx` — 1 call site (~line 509)
   - `src/app/components/agreements/celebration-dialog.tsx` — 1 call site (~line 52)
   - `src/app/components/agreements/agreement-share-dropdown.tsx` — add `agreementVersion` to its props interface and forward it to `<ExportAgreementCertificate>` (~line 314)
   - *(Optional, not required:* `src/app/pages/design-audit-page.tsx` has 7 showcase call sites with hardcoded sample data — they default to legacy harmlessly; optionally add a v4 sample to showcase both.)*

9. **Update `src/app/types/supabase.ts`** — add `agreement_version: string` to the `clarity_agreements` Row type (and Insert/Update types).

10. **Verify Stage A** — run `npm test` (p461 legacy assertions pass + new registry tests). Render agreement-certificate with no version prop (legacy text), with `agreementVersion="legacy"` (same), and with `agreementVersion={4}` (v4 text in test). Confirm a row read through the service surfaces `agreementVersion` and the view callsites pass it. Smoke: load `/partner-template` (renders legacy wording). Existing agreement in prod renders unchanged.

**Stage B — Number-first v4 (requires Stage A fully deployed)**

Gate: wording founder sign-off must happen before Stage B.

1. **In `src/app/content/agreement-versions.ts`**: flip `CURRENT_AGREEMENT_VERSION` from `'legacy'` to `4`.

2. **Update `src/app/pages/partner-template-page.tsx`** — pass `agreementVersion={CURRENT_AGREEMENT_VERSION}` to `AgreementCertificate` so the template page shows v4 wording when current is v4.

3. **Update `src/app/pages/create-agreement-page.tsx`** — confirm `agreementsService.createAgreement` now stamps `CURRENT_AGREEMENT_VERSION` (done in Stage A step 6; this step confirms the import and verifies new rows get `'4'`).

4. **Verify Stage B** — run `npm test` (all assertions pass including v4 block). Smoke: `/partner-template` shows v4 wording. Create a new test agreement in staging → row has `agreement_version = '4'`. Existing agreement (legacy) renders legacy wording unchanged. Rollback test: flip `CURRENT_AGREEMENT_VERSION` back to `'legacy'` → `/partner-template` reverts; existing agreements unaffected.

#### Files to Create

| Path | Purpose |
|------|---------|
| `src/app/content/agreement-versions.ts` | `AGREEMENT_VERSIONS` registry, `CURRENT_AGREEMENT_VERSION`, `AgreementVersion` type, `AGREEMENT_TEXT` alias |
| `supabase/migrations/<TIMESTAMP>_p857_agreement_version.sql` | ADD COLUMN `agreement_version` + CHECK + backfill |

#### Files to Modify

| Path | Change |
|------|--------|
| `src/app/components/agreements/agreement-certificate.tsx` | Add `agreementVersion` prop; replace 3 hardcoded oath blocks with registry lookup |
| `src/app/components/agreements/export-agreement-certificate.tsx` | Same oath replacement with registry lookup |
| `src/app/data/agreements-service.interface.ts` | Add `agreementVersion?: AgreementVersion` to `ClarityAgreement` interface (~line 13) |
| `src/app/data/agreements-service*.ts` | Stamp `agreement_version` on `createAgreement` INSERT (server-side); map `agreement_version` → `agreementVersion` in the row→object read path |
| `src/app/pages/agreement-page.tsx` | Read-path (Stage A): pass `agreementVersion={agreement.agreementVersion}` to all 3 `<AgreementCertificate>` call sites (~69, 182, 269) |
| `src/app/pages/accept-agreement-page.tsx` | Read-path (Stage A): pass `agreementVersion` to `<AgreementCertificate>` (~509) |
| `src/app/components/agreements/celebration-dialog.tsx` | Read-path (Stage A): pass `agreementVersion` to `<AgreementCertificate>` (~52) |
| `src/app/components/agreements/agreement-share-dropdown.tsx` | Read-path (Stage A): add `agreementVersion` to props; forward to `<ExportAgreementCertificate>` (~314) |
| `src/app/pages/partner-template-page.tsx` | Pass `agreementVersion={CURRENT_AGREEMENT_VERSION}` (Stage B) |
| `src/app/pages/create-agreement-page.tsx` | Confirm `CURRENT_AGREEMENT_VERSION` stamp flows through to service call (Stage A/B boundary) |
| `src/app/types/supabase.ts` | Add `agreement_version: string` to `clarity_agreements` Row/Insert/Update types |
| `src/tests/p461-agreement-certificate-text.test.tsx` | Make version-aware: keep legacy assertions + add v4 assertions; update unilateral-voice guard comment |
| `src/app/pages/design-audit-page.tsx` | *(Optional)* 7 showcase call sites — default to legacy; optionally add a v4 sample |

---

## Test Coverage Strategy

Tests written before source (TDD) — red until `/dev` creates `agreement-versions.ts` and the `agreementVersion` prop.

**What's tested (and why):**

| Layer | File | Covers |
|-------|------|--------|
| Component (Vitest) | `src/tests/p461-agreement-certificate-text.test.tsx` (updated) | Legacy default path (original P461 assertions byte-for-byte), v4 first-person path, **unknown-version → legacy fallback** (proves the result-level `??` guard, Decision 5 + Security) |
| Registry (Vitest) | `src/tests/p857-agreement-versions.test.ts` | Legacy verbatim text + "OUR PROMISE" heading; **v4 oath body `toStrictEqual` `VERIFIED_UNDERSTANDING_OATH[4]`** (the shared-constant AC); `CURRENT_AGREEMENT_VERSION` is a valid key; fallback expression semantics |
| Migration (Playwright integration, **P270-mandatory**) | `e2e/integration/p857-agreement-version-migration.spec.ts` | Two-client pattern: column exists, default `'legacy'`, **CHECK rejects `'banana'`** (the security gate), `'4'` accepted, RLS user write+read |
| E2E render | `e2e/p857-agreement-certificate.spec.ts` | Embedded smoke (no console errors) + `/partner-template` renders current-version oath + heading label |
| UAT | `features/uat/p857.md` | 8 scenarios: existing-unchanged, Stage A/B stamps, rollback, CHECK rejection, shared-constant link |

**What's NOT tested (and why):**
- **`export-agreement-certificate.tsx`** — image/canvas export path has no E2E harness; logic mirrors `agreement-certificate.tsx` (same registry lookup). Manual verification.
- **`createAgreement` service stamping** — service-internal; the migration test's default-value + the UAT Scenario 2 SQL check are the observable gates.
- **Read-path mapper (`agreement_version` → `agreementVersion`)** — added in the BLOCK fix (Build step 6b). `/dev` should add a service unit test (or extend the integration test to read back through the service, not the raw client) asserting a stored row surfaces `agreementVersion` on the `ClarityAgreement` object — otherwise the view callsites pass `undefined` and silently render legacy.
- **A11y** — no new interactive elements / ARIA surface (static text swap inside an existing `role="region"` certificate). Dedicated a11y spec skipped, justified.

**Pyramid:** ~20 Vitest `it()` (component + registry) · 5 integration `test()` · 3 E2E `test()` (incl. smoke) · 8 UAT scenarios.

**Stage-B test edits (flagged inline in the files):** when `CURRENT_AGREEMENT_VERSION` flips to `4`, update the explicit current-version assertion in `p857-agreement-versions.test.ts` and the Stage-A oath/heading assertions in `p857-agreement-certificate.spec.ts` to their v4 equivalents (comments mark each spot).
