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