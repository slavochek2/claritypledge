---
status: qa
type: task
rank: 0.014
workstream: infrastructure
created_date: '2026-05-11'
tags:
  - legal
  - gdpr
  - tos
  - compliance
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
predecessor: 4b0ea484
---

# P832: ToS v1.3 minimal disclosure update

## Problem

**Situation:** ToS is at v1.2 (March 2026). Since then, two new data processors entered production that v1.2 does not name: Sentry receives authenticated user errors with email + user ID; Mailgun receives Letter recipient emails on every letter delivery.

**Complication:** Art. 13 GDPR requires processors to be disclosed at the time of collection. Every authenticated user whose error is captured today has an Art. 13 transparency claim, and every Letter recipient receives an email from a US-parented vendor never named in the ToS they accepted. A prior attempt (commit `4b0ea484`, reverted as `74da82ad`) tried to disclose six processors plus rewrite legal bases plus introduce new retention promises; adversarial review found 8 HIGHs across the broader rewrite.

**Question:** What is the smallest ToS update that closes the real Art. 13 gaps without inheriting the HIGHs of the broader rewrite?

## Appetite

Low blast radius — copy edits to one Markdown file + two version-constant bumps + one global gate addition. Fully reversible by `git revert`. One new code path (the global enforcement gate); placement is in an existing top-level authed wrapper so no new component. Zero new processors disclosed beyond what is strictly necessary. Decision density: zero (content is constrained by Art. 13 minimums; founder decisions on retention/banner/audio are deferred to a future spec when product roadmap requires them).

**Why the global gate is part of v1.3 and not a follow-up:** The current `needsTermsAcceptance()` call exists only in `clarity-live-page.tsx:3164`, originally placed there as an audio-recording consent gate. Both new v1.3 disclosures (Sentry capture on any authed page error; Mailgun on Letter send) fire outside `/live`. Shipping disclosure copy without broadening the enforcement point would put v1.3 ToS into effect while the system continues to process v1.2 users under undisclosed processors — i.e., the Art. 13 gap P832 exists to close would remain open. Disclosure and enforcement are the same compliance unit.

## Solution

Four changes:

### 1. Add Sentry section

Append a new `## Error Monitoring (Sentry)` section to `src/app/content/tos.md`. Content:

- Sentry (Functional Software, Inc.) captures application errors and performance issues
- Data sent on error: user ID, email (if logged in), browser/device metadata, URL or action triggering the error, stack trace
- Legal basis: Art. 6(1)(f) legitimate interest in maintaining a functioning service
- Processor under Sentry's published Data Processing Agreement at https://sentry.io/legal/dpa/
- Sentry (US) — data transfers to the United States under Standard Contractual Clauses
- Link to https://sentry.io/privacy/
- Objection path: contact privacy@ — we will suppress identifiers from error payloads on next session
- No in-app opt-out toggle promised. Do not assert one.

### 2. Add Letters section

Append a new `## Letters` section to `src/app/content/tos.md` after "Clarity Partner Agreements." Content:

- Describe Letters feature briefly (compose written message to session partner)
- Letter content stored in our database, associated with sender's account and the session
- Partner notification: Mailgun (EU region) delivers a notification email containing only the sender's name and a secure link
- Partner views letter content on-platform only, after authenticating
- Sender content basis: Art. 6(1)(b) — necessary to deliver the feature you requested
- Partner-email-to-Mailgun basis: Art. 6(1)(f) — legitimate interest in delivering the notification you authorized
- Partner deletion route: contact privacy@; primary-system deletion within 30 days
- Mailgun is processor under Mailgun's published DPA at https://www.mailgun.com/dpa/

### 3. Version bumps + force re-acceptance

- `src/lib/constants.ts`: `CURRENT_TERMS_VERSION = 'v1.3'`, `ACCEPTED_TERMS_VERSIONS = ['v1.3']` (drop `'v1.2'`)
- `src/app/content/copy.ts`: `LEGAL_LAST_UPDATED = "<ship date>"`
- Existing strict-equality check in `src/app/data/api.ts:3300` triggers re-acceptance on next signin **for authed users who land on `/live`**. Other authed pages do not currently enforce — change #4 closes this.

### 4. Broaden the enforcement point — global authed gate (modal)

Add a wrapper component `TermsAcceptanceGate` that renders the existing `TermsUpdateDialog` as a global blocking modal whenever the authed user's `accepted_terms_version` lags `CURRENT_TERMS_VERSION`.

- **Placement:** `src/App.tsx` — wrap `<Routes>` with `<TermsAcceptanceGate>` inside `<AuthProvider>`. No new route, no redirect.
- **Behavior:** uses `useAuth()` for the current user; on user change and on mount, calls `needsTermsAcceptance(user.id)`. If `true`, renders `<TermsUpdateDialog open>` over the current route. `onAccept` → `recordTermsAcceptance(user.id)` then close. `onCancel` → sign user out.
- **Reuses:** `TermsUpdateDialog` (`src/app/components/live-meeting/terms-update-dialog.tsx`), `needsTermsAcceptance` and `recordTermsAcceptance` (`src/app/data/api.ts`).
- **Keep the existing `/live` call** as a defense-in-depth backstop — idempotent; both checks read the same `profiles.accepted_terms_version`.
- **Letter recipient flow** (`letter-stale-terms-modal`, `letter-reading-page.tsx`) is unchanged — it reads the same `profiles.accepted_terms_version` and has its own page-local modal that fires on letter load.
- **Note on the prior `/accept-agreement` reference:** an earlier version of this spec referenced `/accept-agreement` as if it were a ToS page. It is not — `/agreements/:id/accept` is the Partner Agreement signing flow. Corrected here to the modal-based approach that mirrors the existing v1.2→v1.3 UX pattern.

## Risks / Non-Goals

### Risks

- **Forcing every existing user to re-accept on next signin.** Intended behavior — this is the only mechanism that surfaces the new disclosures to users who accepted v1.2. The existing acceptance modal is reused; no new component needed.
- **Re-review may surface wording issues on the two new sections.** Mitigation: spawn adversarial agent on the diff before commit; iterate on copy. Scope is narrow enough that re-review surface area is small.
- **The Letter recipient receives an email from a sender they may not have authorized — Art. 14 notice gap.** Existing behavior since Letters shipped; the ToS disclosure here documents the basis but does not implement an Art. 14 notice in the Mailgun email body. **Accepted residual risk** — a separate spec is required to add the recipient-facing notice line in the email template.
- **Sentry retention period not stated.** v1.2 made no Sentry claim; minimal v1.3 names Sentry as processor but does not state retention to avoid a plan-coupled disclosure that silently drifts when the Sentry billing tier changes. Acceptable under Art. 13 since basis and recipient are stated.

### Non-Goals

- Do NOT add audio playback feature (separate spec — P-number to be filed when product roadmap calls for it)
- Do NOT add Sentry `beforeSend` hook or `/me/settings` opt-out toggle (out of scope; objection path is email-only)
- Do NOT add LIA document for banner generation (banner stays on v1.2's existing AI/ML license clause; no new claim to support)
- Do NOT switch the existing /chat Gemini basis (v1.2 stands)
- Do NOT add account-lifetime audio retention disclosure (v1.2's AI/ML license clause already covers retention broadly; no new specific promise)
- Do NOT add backup-cycle clauses to existing deletion promises (only address new Letters deletion, where promise is "within 30 days" — defensible)
- Do NOT reword the existing EEA audio claim (not introducing a new EEA claim)
- Do NOT disclose Mixpanel (requires in-app consent toggle which is a separate spec)
- Do NOT change Mixpanel `setUserProperties()` call at `src/auth/AuthCallbackPage.tsx:416-426` (separate spec)
- Do NOT add per-event banner-generation checkbox (banner disclosure is not in v1.3 at all)
- Do NOT migrate or alter any existing audio recordings, sessions, or DB rows
- Do NOT add a separate Art. 14 notice page for Letter recipients (deferred to a follow-up spec; disclosed as residual risk above)

### Alternatives Considered

- **Full P832 hardening (rejected for now):** Original spec proposed audio playback feature + Sentry opt-out toggle + LIA doc + 8-HIGH closure. Realistic 5-7 day timeline with implementation risk on audio playback (GCS CORS, iOS Safari quirks, signed URL TTL). Replaced by minimal disclosure to close the active Art. 13 gap fast; deferred feature work to when product roadmap calls for it.
- **Do nothing (rejected):** v1.2 actively misrepresents what the system does today; non-zero reputational and enforcement risk, particularly for the Letters/Mailgun flow which sends PII to an undisclosed processor on every send.
- **Two-stage ship (rejected):** Splitting Sentry and Letters disclosures across two version bumps doubles the user friction (two re-acceptance prompts) for no compliance gain.

### Rollback Strategy

`git revert` the v1.3 commit. `ACCEPTED_TERMS_VERSIONS` returns to `['v1.2']`, `CURRENT_TERMS_VERSION` returns to `'v1.2'`, ToS reverts to v1.2 copy. Existing v1.3 acceptances become orphaned in the audit table but the new strict-equality check would treat them as stale on next signin. Acceptable trade-off. Rollback also requires redeploying the three edge functions with `ACCEPTED_TERMS_VERSIONS = ['v1.2']` so the server allowlists match.

## Pre-deploy Checklist

### Deploy commands
- [x] `supabase functions deploy create-and-sign --project-ref <prod-ref>` (deployed 2026-05-15)
- [x] `supabase functions deploy create-and-open-letter --project-ref <prod-ref>` (deployed 2026-05-15)
- [x] `supabase functions deploy request-letter-response-signin --project-ref <prod-ref>` (deployed 2026-05-15)
- [ ] Vercel auto-deploys on `git push origin main`
- [ ] Stamp deploy manifest from main repo root after cherry-pick: `./scripts/stamp-deploy-manifest.sh --env prod --functions-only`

### Post-deploy verification
- [ ] Sign in as a user whose `accepted_terms_version` is `'v1.2'` → re-acceptance modal appears on any authed route
- [ ] Accept → submission succeeds, `profiles.accepted_terms_version` becomes `'v1.3'`
- [ ] Trigger a Sentry error after acceptance → confirms gate didn't break error reporting
- [ ] Sentry shows zero new error spikes in first 10 minutes after deploy

## Done-When

- [x] `## Error Monitoring (Sentry)` section present in `src/app/content/tos.md` with all Art. 13 elements (processor name, data categories, basis, transfer mechanism, DPA URL, privacy policy link, objection path)
- [x] `## Letters` section present in `src/app/content/tos.md` naming Mailgun, EU region, split bases for sender content vs partner email, DPA URL
- [x] `CURRENT_TERMS_VERSION` is `'v1.3'`
- [x] `ACCEPTED_TERMS_VERSIONS` is `['v1.3']` (no grace for v1.2)
- [x] `LEGAL_LAST_UPDATED` is set to the actual ship date
- [x] `npm test -- consent-api.test.ts` passes (regex-based version assertion already version-agnostic)
- [x] Self-check against the 8 HIGH categories from the prior P832 review (`a06f6eea3eaa12cdc`) passes for the new Sentry and Letters sections; if any category yields uncertainty, spawn a targeted Opus adversarial agent on the diff before commit
- [x] On local test, a user whose `accepted_terms_version` is `'v1.2'` is prompted to re-accept v1.3 on next authenticated action; user with `'v1.3'` is not prompted
- [x] Global gate: a v1.2 user landing on any authed route (not just `/live`) sees the `TermsUpdateDialog` modal before they can interact with the route content
- [x] `/live` defense-in-depth: with the global gate active, the existing `/live` check is still present and does not produce a double-modal for a v1.2 user entering /live

## Acceptance Criteria

- [x] A user reading `/terms-of-service` sees both Sentry and Letters/Mailgun disclosures
- [x] A user who previously accepted v1.2 is prompted to re-accept v1.3 before completing any consent-gated action
- [x] A v1.2 user who logs in and navigates to any authed route (home, `/me`, profile, letter list, etc.) sees the `TermsUpdateDialog` modal before they can interact with that route — not only when they enter `/live`
- [x] Letter recipients receive the same Mailgun email as before — no delivery-flow change
- [x] No code path changes for Sentry — error capture continues unchanged
- [x] Re-acceptance modal renders existing copy and writes the new version to `profiles.accepted_terms_version`

## References

- Reverted commit: `4b0ea484` (full v1.3 attempt — superseded scope)
- Revert commit: `74da82ad`
- Adversarial review findings (8 HIGHs against the broader rewrite): preserved in agent task `a06f6eea3eaa12cdc`
- Related code: `src/app/data/api.ts:3290-3370` (consent gating), `src/app/components/letters/letter-stale-terms-modal.tsx` (re-acceptance modal), `src/app/pages/letter-reading-page.tsx:518-580` (Letter-specific consent check)
- Deferred work (file separately when roadmap calls): audio playback + Sentry opt-out toggle + LIA doc + Art. 14 Letter-recipient notice + Mixpanel consent UI
