---
status: all-done
type: feature
rank: 125467
workstream: C1
created_date: 2026-02-23T00:00:00.000Z
tags: []
locked_at: '2026-02-26T04:17:56.337Z'
---

# P415: Event Email Notifications

## Problem

When users RSVP to an event, they receive no automated emails — no confirmation, no reminder, no post-event follow-up. This creates friction (people forget events) and misses a feedback/conversion opportunity.

## Solution

Send transactional emails via Mailgun at key lifecycle moments. All emails are scheduled at RSVP time using Mailgun's `o:deliverytime` — no cron jobs needed.

**On RSVP:**
1. Confirmation email → immediately
2. Reminder email → `event.datetime - 24h`
3. Post-event feedback → `event.datetime + 2h` (includes Tally form link)

**On event update:** cancel scheduled emails → reschedule with new datetime

**On event cancel:** cancel scheduled emails → send cancellation immediately

## Technical Notes

- **Email service:** Mailgun, EU region, domain `mg.claritypledge.com`
- **Env vars:** `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` (all in `.env.local`)
- **Feedback form:** `tally.so/r/wa7RRq?event_id=EVENT_ID` (hidden `event_id` field already added to form)
- **Scheduled sends:** Mailgun `o:deliverytime` header — no cron/pg_cron needed
- **Cancel scheduled:** Mailgun scheduled messages API — need to store `mailgun_message_id` per RSVP
- **New files:** `src/lib/email.ts` (Mailgun client), `src/lib/event-emails.ts` (orchestrator)
- **DB change needed:** store scheduled Mailgun message IDs on RSVP row (to enable cancellation)

## Acceptance Criteria

- [ ] RSVP triggers confirmation email immediately
- [ ] RSVP schedules reminder 24h before event datetime
- [ ] RSVP schedules post-event feedback email 2h after event datetime, with correct `?event_id=` param
- [ ] Event update cancels old scheduled emails and reschedules with new datetime
- [ ] Event cancellation cancels scheduled emails and sends cancellation notice immediately
- [ ] No emails sent for past events (guard: skip scheduling if datetime already passed)

## Testing

Manual: RSVP to a test event, verify emails arrive via Mailgun event logs (`app.mailgun.com` → Sending → Logs).

---

## Technical Analysis

**Current State:**
- App is client-side Vite/React — all Supabase calls use `import.meta.env.VITE_*` (browser-exposed). No Next.js API routes, no Express backend.
- `events-service-real.ts`: `rsvpToEvent()` (insert), `cancelRsvp()` (delete), `updateEvent()` (PATCH), `cancelEvent()` (status='cancelled') — all pure Supabase client calls.
- `event_rsvps` table: `id, event_id, profile_id, rsvped_at` — no Mailgun columns yet.
- `supabase/functions/` does not exist — no edge functions deployed yet.
- `src/lib/` has 7 files; no email utilities exist.

**Key Constraint:** `MAILGUN_API_KEY` must NEVER be exposed to the browser. Cannot call Mailgun directly from client code. Must use Supabase Edge Functions (server-side Deno runtime with secret env vars).

---

## Architecture Decisions

**Decision 1: Supabase Edge Function for Mailgun calls**
- **Chosen:** `supabase/functions/send-event-emails/index.ts` — server-side Deno function
- **Rationale:** Only secure option; MAILGUN_API_KEY stays server-side. Edge functions support `Deno.env.get()` for secrets. Called from client via `supabase.functions.invoke()`.
- **Alternative rejected:** Browser-side fetch to Mailgun — leaks API key (unacceptable)
- **Alternative rejected:** Supabase pg_net (database HTTP) — can't schedule Mailgun deliverytime headers; more complex

**Decision 2: Fire-and-forget email calls from client**
- **Chosen:** After RSVP/update/cancel succeeds, invoke edge function asynchronously (don't await for success UX)
- **Rationale:** Email failure should not block RSVP confirmation. If Mailgun is down, user still gets RSVP'd.
- **Trade-off:** User won't know if confirmation email failed. Acceptable for MVP.

**Decision 3: Store mailgun_message_ids as jsonb on event_rsvps**
- **Chosen:** `mailgun_message_ids jsonb` column — stores `{ reminder: "...", feedback: "..." }` message IDs
- **Rationale:** Need to cancel scheduled reminder + feedback emails if event changes. Confirmation is immediate (no ID needed to cancel).
- **Migration:** New column, nullable, safe to add.

**Decision 4: Organizer-agnostic email templates**
- **Chosen:** No Slava-specific coaching CTA, no WhatsApp redirect. Generic "Any questions? Reply to this email."
- **Rationale:** Other organizers will use the platform; templates must work for anyone.
- **Location handling:** Smart — detect if location looks like a URL → "Join online: [link]"; otherwise "Location: [address]"

---

## Security Review

**RLS Policies:**
- ✅ Edge function is invoked with Supabase JWT — can verify `auth.uid()` matches RSVP owner before sending emails
- ✅ `mailgun_message_ids` column: only accessible via service role in edge function; client RLS unchanged
- ✅ No new client-side access to Mailgun credentials

**Authentication:**
- ✅ Edge function receives Supabase auth token; validates user owns the RSVP before triggering emails
- ✅ Event update/cancel emails: validates user is host before scheduling cancellation

**Input Validation:**
- ✅ Edge function validates `action` param (rsvp | update | cancel)
- ✅ Event ID is UUID (validated by Supabase query, not raw string interpolation)
- ⚠️ Email address comes from `profiles.email` — must confirm this field exists and is populated

**Data Protection:**
- ✅ No PII logged beyond what Mailgun already handles (recipient email)
- ✅ Tally form only receives `event_id` (UUID, no PII)

---

## Implementation Approach

**Files to Create:**
1. `supabase/functions/send-event-emails/index.ts` — Edge Function: receives action + eventId + rsvpId, fetches event+attendee data from Supabase, calls Mailgun
2. `src/lib/event-emails.ts` — thin client wrapper: `invokeEmailFunction(action, eventId, rsvpId?)` calling `supabase.functions.invoke()`

**Files to Modify:**
1. `supabase/migrations/YYYYMMDDHHMMSS_add_mailgun_ids_to_rsvps.sql` — add `mailgun_message_ids jsonb` to `event_rsvps`
2. `src/app/data/events-service-real.ts` — wire `invokeEmailFunction()` calls after:
   - `rsvpToEvent()` success → `invokeEmailFunction('rsvp', eventId, rsvpId)`
   - `updateEvent()` success → `invokeEmailFunction('update', eventId)`
   - `cancelEvent()` success → `invokeEmailFunction('cancel', eventId)`

**Build Sequence:**
1. DB migration — add `mailgun_message_ids jsonb` to `event_rsvps`, run `./scripts/migrate.sh`
2. Edge function — `supabase/functions/send-event-emails/index.ts` with HTML email templates
3. Set Mailgun secret — `supabase secrets set MAILGUN_API_KEY=... MAILGUN_DOMAIN=... MAILGUN_REGION=eu`
4. Client wrapper — `src/lib/event-emails.ts`
5. Wire into events-service-real.ts
6. Deploy edge function — `supabase functions deploy send-event-emails`
7. Test: RSVP to a test event, verify in Mailgun logs + inbox
