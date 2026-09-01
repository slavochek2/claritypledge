---
status: week
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [legal, gdpr, privacy, tos]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: fable
driver: anomaly
---

# P1219: Terms of Service and Privacy Policy refresh

**Nothing here is legal advice.** Both texts are drafts for the founder and, if they choose, a lawyer.

## Problem

**Situation:** `LEGAL_LAST_UPDATED` is `May 12, 2026` (`src/app/content/copy.ts:7`). The ToS lives in
`src/app/content/tos.md`; the Privacy Policy is inlined JSX in `src/app/pages/privacy-policy-page.tsx`
(P474 migrated only the ToS). ~165 specs shipped since that date (`features/done/2026-06-10/` onward).

**Complication:** The published policy is wrong in ways the code contradicts. Primary storage is stated as
"Supabase EU regions"; prod is `aws-0-us-east-1` (`.env.example:10`). Mixpanel is described as analytics
only; `index.html:95` runs `record_sessions_percent: 100`. Audio "retained for 90 days then automatically
deleted" — P43's auto-delete AC is unchecked and no lifecycle rule exists in the repo. `user_voice_profiles`
stores 512-dim speaker embeddings (`supabase/migrations/20260313120000_p495_transcription_tables.sql:49-59`)
and neither document mentions them. Brevo (auth email), Stripe, Tally, YouTube embeds, Google Calendar,
Ghost, Google sign-in, our own Cloud Run transcription service, letters/explain-backs, events, groups,
`/transcribe`, and machine accounts are all absent. LogRocket is listed as current while P1216 removes it.

**Question:** What do both documents have to say to describe what the product actually does today?

## Appetite

Blast radius: low technically (two markdown files, one page refactor, one constant), high legally —
these are the public representations users accept. Reversibility: git revert. Decision density: high —
effective date, retention periods, voice-profile lawful basis, cookie consent, donation terms, event liability.

## Solution

Run `/tos-review` stages 1-5 on both documents. Migrate the Privacy Policy to `src/app/content/privacy.md`
on the P474 pattern (no legal text in TSX). Every statement must be backed by a `file:line`; where the
code cannot keep a promise, the draft says what the code does. Adversarial review by one hostile
privacy-lawyer reviewer; findings verified against code before acceptance.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Draft overclaims a safeguard (DPF certification, deletion period) | MITIGATE | Unverifiable claims are hedged or marked `[FOUNDER DECISION]` |
| P520 self-serve deletion slips; policy promises it | MITIGATE | Marked `[PENDING P520]`; founder ships together or edits |
| Version bump forces re-acceptance for all users | ACCEPT | That is the point of `CURRENT_TERMS_VERSION` (skill stage 7b) |

Do NOT push, ship, or merge. Do NOT touch `/meet` copy. Do NOT fabricate entity or imprint details.

## Done-When

- [ ] `src/app/content/privacy.md` exists and `privacy-policy-page.tsx` renders it (no legal prose in TSX)
- [ ] `tos.md` and `privacy.md` updated; every processor in the inventory below appears in the policy
- [ ] `## Changes` table below lists section / old / new / reason / confidence for every edit
- [ ] Adversarial review run; each finding accepted (applied) or rejected (reason recorded) here
- [ ] Screenshots at 375 and 1440 for both routes; `pre-commit-checks.sh`, tsc, eslint, vitest pass
- [ ] Founder decisions listed below are answered before `/ship`

## Processor inventory (Stage 1 — `[Service] → [data] → [introduced by]`, all cited)

| Service | Role / location | Data it receives | Evidence |
|---|---|---|---|
| Supabase (AWS `us-east-1`) | Database, Auth, Realtime, Edge Functions | All account, profile, content, consent and session data | `.env.example:10`; `supabase/functions/*` |
| Brevo (SMTP) | Auth email delivery (magic links) | Recipient email, magic-link token | `docs/technical/authentication.md:5,294` |
| Google (OAuth) | Sign-in provider | Google account email, name, avatar (`*.googleusercontent.com`) | `src/app/components/auth/google-auth-button.tsx:2`; `vercel.json` img-src |
| Google Gemini API | `/chat` story guide (text); event/story banners (image gen) | Typed chat text; event title/description | `supabase/functions/story-guide-chat/index.ts:13-17`; `generate-event-banner/index.ts:13-14`; `generate-banner/index.ts:7` |
| Google Cloud Storage | Audio chunks (`claritypledge-ml-training`, `-audio-chunks`), explain-backs (`-explain-backs`, private), story images (`-story-images`, public URLs) | Voice recordings, explain-back audio, uploaded images | `src/app/data/api.ts:3315-3331`; `explain-back-signed-url/index.ts:19`; `generate-story-image-url/index.ts:333` |
| Google Cloud Run `transcribe-session` (`us-east4`, own code, Whisper + pyannote) | Transcription + speaker separation | Session audio → `session_transcripts`; speaker embeddings → `user_voice_profiles` | `docs/technical/infrastructure.md:54-70`; `services/transcribe/diarizer.py:172-220`; `storage.py:66-76` |
| Google Cloud Functions `gcs-signed-url` (`us-central1`) | Signs upload URLs | Object path only | `gcs-signed-url/index.ts:8` |
| Mailgun (EU) | Letters, agreements, events, sign-in emails; Ghost newsletter | Recipient email, sender name, links | `_shared/email-helpers.ts`; `send-*-emails/index.ts`; `ghost-blog.md:48-52` |
| Ghost (self-hosted, GCP `us-central1-a`) | Blog + newsletter | Name + email of verified users synced as subscribers | `docs/technical/ghost-blog.md:32`; `sync-ghost-members` skill |
| Mixpanel (EU endpoint) | Product analytics **and session recording at 100%** | User ID, email, name, profile flags, events, session replays (form contents excluded) | `index.html:93-96`; `src/auth/AuthCallbackPage.tsx:537-548` |
| Sentry | Error tracking, masked replay on error, CSP reports | Stack traces, user ID in `extra`, browser metadata; **no `setUser`/email** (`sendDefaultPii:false`) | `src/main.tsx:26-59`; `stories-service-real.ts:657`; `api/csp-report.ts` |
| LogRocket | Session replay — **being removed** | — | `src/main.tsx:17`; P1216 |
| Vercel | Hosting, `api/og.ts` share cards, CSP proxy | Request metadata | `vercel.json`; `api/` |
| Stripe (Payment Links) | Donations, membership, partnership | Payment data goes to Stripe directly | `src/lib/donate-links.ts`; `VITE_STRIPE_*` |
| Web3Forms | `/co-create` contact form | What you submit | `src/app/pages/collaborate-page.tsx:96` |
| Tally | Event feedback forms (linked from emails) | What you submit + event id | `_shared/email-helpers.ts:22,155` |
| Unsplash | Event banner photo search | Keywords from event title | `src/app/prototypes/events/banner-utils.ts:74` |
| YouTube (`youtube-nocookie.com`) | Embedded story videos | Standard embed requests | `src/lib/video.ts:49` |
| Google Calendar | Intro booking embed; add-to-calendar links | What you enter on Google's page | `src/app/pages/intro-page.tsx:7`; `add-to-calendar-button.tsx:26` |
| Gravatar | Avatar lookup | Email hash only | `src/lib/utils.ts:68` |
| WhatsApp (external) | Event group chats; link shown only to RSVPed attendees | Whatever you share there | P1194 |

**Consent/ID records:** `terms_acceptances`, `session_consents` (hashed IP + user agent),
letter open/confirm (hashed IP) — `supabase/migrations/20250101_initial_schema.sql:82-116`;
`create-and-open-letter/index.ts:64`. **Fonts:** self-hosted (`src/index.css:2-18`) — Google Fonts entry
is stale. **Region facts:** primary DB US; Mixpanel and Mailgun EU; GCS/Cloud Run/Ghost US.

## Changes

Confidence: H = code-verified this session; M = code-verified, wording is a legal judgement; L = external
fact not verifiable from the repo.

### Privacy Policy (`src/app/content/privacy.md` — new file; old text was JSX in `privacy-policy-page.tsx`)

| Section | Old | New | Reason | Conf |
|---|---|---|---|---|
| Source of record | JSX prose in TSX | `privacy.md` rendered via `renderMarkdownTrusted` | P474 pattern; skill rule "no legal text in TSX" | H |
| Data Controller | same details | unchanged; "monitored" address claim added | P520 founder-confirmed privacy@ routing (2026-08-14) | H |
| Account | name/email/role/LinkedIn/reason | + Google sign-in data, bio/avatar, terms record with **consent identifier** (keyed hash server-side, random id client-side), Art. 13(2)(e) sentence, Gravatar viewer-side lookup | `api.ts:3696-3716` ipify blocked by CSP → `browser_<uuid>`; `create-and-open-letter:106-108` keyed; `utils.ts:68` | H |
| Stories/points | absent | new: content, visibility levels inline, public image URLs | `generate-story-image-url:333` publicUrl | H |
| Live sessions | "separate consent dialog"; "Start Recording" | describes the real flow: creator switch on by default, joiner sees nothing when recording is on, banner in-session; transcription service; **voice profiles (Art. 9)**; behavioural events carry email/name; pseudonymised not anonymous | `clarity-live-page.tsx:442,3970,4279`; `live-mode-view.tsx:91`; `p495_transcription_tables.sql:49-59`; `session-events-collector.ts:36-40` | H |
| Transcribe rooms | absent | new section | P1149; `transcribe-room-page.tsx:291` | H |
| Letters/explain-backs | absent | new: recipient email, auto-created account, keyed IP hash, private explain-back bucket, text alternative | `create-and-open-letter:323`; `explain-back-signed-url:19`; P904 | H |
| Agreements | (ToS only) | partner email, 7-day expiry, deletion **on request** (auto-delete never built) | `agreements-service-real.ts:255-264` | H |
| Events/groups | absent | new: RSVP visibility, event emails, gated WhatsApp link, groups | P1194, P1114, P1193 | H |
| AI features | absent | /chat → Gemini not stored; banners → Gemini + Unsplash; Developer-API tier caveat | `story-guide-chat:17,80`; `generate-event-banner:123`; `banner-utils.ts:74` | H/M |
| Donations/forms/booking/blog | Web3Forms only | + Stripe, Tally, Google Calendar, Ghost newsletter under LI with opt-out | `donate-links.ts`; `email-helpers.ts:155`; `intro-page.tsx:7`; `sync-ghost-members` | H |
| Videos | absent | YouTube nocookie embed; contacts Google on load | `video.ts:49` | H |
| Analytics | Mixpanel "analytics"; LogRocket listed; Sentry "no personal data" | Mixpanel events + email/name + **session recording 100%**; Sentry user ID/tracing/CSP reports, masked replay; LogRocket removed; email opt-out route | `index.html:93-96`; `AuthCallbackPage.tsx:537`; `main.tsx:26-59`; P1216 | H |
| Legal bases | 3 bullets | table per purpose; recipient email → LI; consent records → LI (not 6(1)(c)); machine accounts → LI (not Art. 85) | reviewer #6, #8, #9 | M |
| Machine accounts | absent | new: what they are, source, categories, retention, editorial responsibility, quotes not audio-certified, Art. 21 + correction route | decisions.md 2026-08-19; P1104; P1142; `agent-story-footer.tsx:45` | H/M |
| Processors | 9 items incl. Google Fonts | 18-row table with location; Google Fonts removed (self-hosted); Hugging Face added; DPA claim softened; "who else sees your data" | inventory above; `index.css:2-18`; `diarizer.py:36-46` | H |
| Transfers | "Supabase EU regions" | **primary DB and storage in the US**; own Cloud Run in US; SCC + DPF where certified (verify) | `.env.example:10`; `infrastructure.md:58` | H |
| Cookies | 3 bullets | accurate key list; Mixpanel/Sentry identifiers; no banner exists (flagged) | `grep localStorage` inventory | H |
| Rights | 7 bullets, email only | self-serve deletion `[PENDING P520]` with honest scope split; export on request; withdrawal → deletion; no in-app analytics opt-out | P520 spec table | H |
| Retention | 90-day audio, 12-month logs, 30-day replays | honest: no schedule exists; per-item list; consent records survive deletion `[FOUNDER DECISION]` | P43 ACs unchecked; no lifecycle rule in repo | H |
| Children | absent | 16+, no exception, no age gate (flagged) | reviewer #40 | M |
| Automated decisions / complaint / changes / contact | kept | wording aligned to re-acceptance gate | `App.tsx:309` | H |

### Terms of Service (`src/app/content/tos.md`)

| Section | Old | New | Reason | Conf |
|---|---|---|---|---|
| Welcome / What is | pledge + live | all surfaces; PP incorporated | product scope since May | H |
| Accounts | absent | magic link, Google, letter-created accounts | `google-auth-button.tsx`; `create-and-open-letter:323` | H |
| Live Sessions | separate dialog, "Start Recording", "consent before each session" | real flow; joiner gap flagged; transcription + speaker separation | as PP | H |
| Transcribe Rooms | absent | new | P1149 | H |
| AI & ML | licence "by using the platform", "anonymized" | licence tied to recorded participation, identifiers removed, never "anonymous"; bundled-consent flag; generated banners | reviewer #4, #16 | M |
| Machine Accounts | absent | new section incl. impersonation ban, editorial responsibility, correction route, name-handle flag | P1104/P1142; reviewer #55, #56, #58 | M |
| Age | 16 with parental-consent exception | 16+, no exception | reviewer #40 (Estonian IKS threshold ≠ Art. 8 as cited) | M |
| Public Visibility | 4 bullets | + feed and link previews | `api/og.ts` | H |
| Communications | Brevo absent; consent-by-signup | Brevo or Mailgun for sign-in; newsletter on LI with opt-out; checkbox recommended | `authentication.md:5`; `send-letter-response-signin:27`; reviewer #5, #18 | H/M |
| Story Visibility | 3 levels | + public image URLs | as PP | H |
| Agreements | auto-delete at expiry | expiry; deletion on request; flag | reviewer #24 | H |
| Letters | letters only | + account creation scope, explain-backs excluded from ML, consent basis | P904 | H |
| Events and Groups | absent | new; injury exclusion removed after review, assumption-of-risk kept | reviewer #60 | M |
| Meeting Terms on /meet | absent | states /meet is non-binding and outside these terms | P1016/P1022 | H |
| Donations and Paid Offers | absent | Stripe; refund policy `[FOUNDER DECISION]` | P1123/P951 | H |
| Account Termination | "contact us" | self-serve `[PENDING P520]`; **Reporting Content** section added | reviewer #59 | M |
| Intellectual Property | profile content | + stories/points/letters; machine-account quotes under quotation right | reviewer #57 | M |
| Disclaimer / Liability | as before | + AI/transcript errors; carve-out for injury/intent | reviewer #60 | M |
| Governing Law | Estonian jurisdiction; ODR link | consumer-forum carve-out; ODR link removed (platform discontinued 2025) | reviewer #60 | L |
| Changes | "continued use = acceptance" | deleted; re-acceptance on sign-in | reviewer #41; `App.tsx:309` gate | H |
| Analytics & Error Monitoring | Sentry "may include your email" | Mixpanel + session recording added; Sentry: user ID not email, masked replay; opt-out by email | `main.tsx:31` no `setUser` | H |

**Constants:** `LEGAL_LAST_UPDATED` → "September 1, 2026" `[FOUNDER DECISION: effective date]`; `CURRENT_TERMS_VERSION` v1.3 → v1.4; client `ACCEPTED_TERMS_VERSIONS` → `['v1.4']`; three edge-function allowlists → `['v1.3','v1.4']` (rollout-safe); P839 canary copies + 5 e2e fixtures updated.

## Adversarial review — `1 of 1 reports received` (hostile privacy lawyer + AKI inspector; 60 findings)

**Verified by command before acceptance (gate 9):** #11-13 ipify/CSP/`browser_<uuid>` (`api.ts:3696-3716`, `vercel.json` has no ipify) ✔ · #16 ML payload carries email/name (`session-events-collector.ts:36-40`) ✔ · #24 no partner-email deletion (`agreements-service-real.ts:255-264`; `p422:16` NOT NULL) ✔ · #35 joiner sees badge only when recording is off (`clarity-live-page.tsx:3970`) ✔ · #17 HF token (`diarizer.py:36-46`) ✔ · #29 `ai_rate_limits` cascades on delete ✔ (wording only).

**Accepted and applied (text):** #5 #6 #8 #9 #12 #13 #16 #18 #19 #20 #23 #24 #25 #26 #31 #33 #34 #36 #39 #40 #41 #44 #47 #48 #51 #52 #56 (disclosure half) #57 #58 #59 #60.

**Accepted as founder decisions (text flags them; code/product change out of this spec's scope):** #1 Mixpanel replay/identify without consent (BLOCK) · #2 joiner recording consent (BLOCK) · #3 Art. 9 voice profiles (BLOCK) · #4 bundled ML licence (BLOCK) · #7 explain-back point-of-capture copy · #10 Sentry replay ePrivacy · #11 remove ipify call · #14 publish only after P1216 lands · #15 Gemini API tier/DPA · #21 Ghost open tracking · #22/#46 DPA register · #27 lifecycle rule · #28 provider retention numbers · #30 P520 ordering · #32 export runbook · #38 letter account creation · #49 Sentry scrubbing · #53 LIA on file · #55 machine-account naming (P1104 design).

**Rejected:** #37 "re-acceptance gate not app-wide" — `TermsAcceptanceGate` wraps the whole router (`src/App.tsx:309-1006`); PP/ToS wording "next time you sign in" stands. #45 duplicate of #16. #50 no change needed (Mixpanel DPA bars secondary use — reviewer's own note). #54 partially: `ai_rate_limits` cascades (added "deleted with your account"); CSP-report and og.ts retention left to #28.

**Reviewer's external-law claims not verifiable from the repo (marked `verify` by the reviewer too):** Estonian ESS §103¹ soft-opt-in scope; IKS §4 journalistic exemption; IKS child-consent age; VÕS §42(3); DSA micro-enterprise scope; AI Act Art. 50(4) applicability; ODR platform discontinuation. Counsel.

## Founder decisions (all marked inline in the drafts)

1. Effective date (`copy.ts:7`) and whether to publish before P1216 (LogRocket) and P520 (deletion) land.
2. Live joiner recording consent step (BLOCK) — add control, or accept published wording.
3. Voice profiles — explicit-consent step, or stop `user_voice_profiles` writes (`storage.py:66`).
4. Mixpanel: `record_sessions_percent` 100 → 0 and drop `people.set(email,name)`, or add a consent banner.
5. AI-training opt-in separate from the ToS licence.
6. Newsletter: opt-in checkbox at sign-up vs legitimate-interest wording; Ghost open/click tracking.
7. Gemini Developer API billing tier (DPA applicability).
8. Retention: audio lifecycle period; consent-record survival period; Sentry/Mixpanel configured numbers; Sentry data region.
9. DPF/DPA register for Supabase, Google, Vercel, Sentry, Stripe, Unsplash, Web3Forms, Tally, Brevo.
10. Machine accounts: bare-name handles (P1104), correction-response window (P1142).
11. In-person events assumption-of-risk wording; donation/paid-offer refund policy.
12. Age attestation at sign-up; explain-back point-of-capture sentence; partner-email cleanup job.

## Pre-deploy Checklist

- [ ] P1216 (LogRocket removal) merged before or with this — otherwise the policy is false on day one
- [ ] P520 merged, or swap the `[PENDING P520]` sentences to the email-based wording
- [ ] Redeploy the three edge functions whose allowlists changed (`create-and-sign`, `create-and-open-letter`, `request-letter-response-signin`) to prod so v1.4 is accepted
- [ ] Redeploy the web app (version constant is baked into the bundle); all users will be asked to re-accept
- [ ] Every `[FOUNDER DECISION ...]` bracket resolved and removed from `privacy.md` / `tos.md`
