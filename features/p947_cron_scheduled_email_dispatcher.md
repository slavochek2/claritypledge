---
status: done
type: task
rank: 1000947.0
created_date: '2026-06-17'
tags: [email, mailgun, events, cron]
delivery_stage: ship
pipeline_ran: [create-spec, architect, dev, ship]
---

# P947: Cron Scheduler for Deferred Event Emails (Reminder + Feedback)

## Problem

**Situation:** When an attendee RSVPs to an event, `send-event-emails` tries to schedule a reminder (24h before) and a feedback email (2h after) via Mailgun's `o:deliverytime` parameter.

**Complication:** Mailgun EU rejects any scheduled send more than 72 hours in advance (`"scheduled delivery time must not be farther than 72h0m0s from now"`). All current events are 4+ weeks out. Every reminder and feedback email silently fails at RSVP time — logged as `status: failed` in `email_send_log`. Attendees receive only the confirmation email.

**Question:** How do we reliably send reminder and feedback emails when the target send time is more than 72h away?

## Appetite

Low blast radius — the RSVP flow and existing email templates are untouched. Only the scheduling mechanism changes. Reversible (disable the cron job; emails simply don't send, same as current state). Low decision density — the send times are already defined (24h before, 2h after event end).

## Solution

Replace Mailgun's `o:deliverytime` scheduling with a DB-backed queue + cron dispatcher:

1. **Schema** — add two columns to `event_rsvps` via migration:
   - `reminder_scheduled_at TIMESTAMPTZ` — target send time (24h before event)
   - `feedback_scheduled_at TIMESTAMPTZ` — target send time (2h after event ends)
   - Do NOT add new per-email message ID columns. The existing `mailgun_message_ids JSONB` column (keys `reminder`, `feedback`) stores message IDs after dispatch.

2. **At RSVP time** — compute and store `reminder_scheduled_at` / `feedback_scheduled_at` in `event_rsvps`. Do NOT call Mailgun for reminder/feedback at RSVP time.

3. **`handleUpdate` ownership** — when the host edits an event, `handleUpdate` must update `reminder_scheduled_at` / `feedback_scheduled_at` to the new times AND NULL the relevant `mailgun_message_ids` keys (so the cron re-dispatches with the new time). `handleUpdate` must NOT call Mailgun to reschedule directly — the cron is the sole dispatcher for reminder/feedback.

4. **Cron job (Supabase Edge Function, scheduled every 6h via `supabase.toml`)** — queries for rows to dispatch:
   ```sql
   SELECT r.* FROM event_rsvps r
   JOIN events e ON e.id = r.event_id
   WHERE e.status != 'cancelled'
     AND (
       (r.reminder_scheduled_at <= NOW() + INTERVAL '72 hours'
        AND (r.mailgun_message_ids->>'reminder') IS NULL
        AND r.reminder_scheduled_at > NOW())
       OR
       (r.feedback_scheduled_at <= NOW() + INTERVAL '72 hours'
        AND (r.mailgun_message_ids->>'feedback') IS NULL
        AND r.feedback_scheduled_at > NOW())
     )
   ```
   The JOIN on `events.status != 'cancelled'` is required — without it, a host cancellation leaves queue entries that fire anyway (since `handleCancel` has nothing to cancel in Mailgun before dispatch).

5. **Atomic claim before dispatch** — for each row, UPDATE `mailgun_message_ids` to set the relevant key to `"PENDING"` WHERE the key is currently NULL, using `UPDATE ... RETURNING`. Only rows whose UPDATE returns a result proceed to Mailgun. This closes the TOCTOU gap: two concurrent cron runs both attempt the claim; only one succeeds per row. After Mailgun returns the real message ID, replace `"PENDING"` with the actual ID. Add `reminder_attempted_at` / `feedback_attempted_at` columns to detect stuck PENDING rows (present for >1 cron interval with no real ID = retry eligible).

6. **Individual RSVP cancellation** — when an attendee cancels their RSVP, the row is deleted (existing RLS: `FOR DELETE USING auth.uid() = profile_id`). The cron query finds no row → no email sent. No status flag needed.

## Risks / Non-Goals

### Risks
- **Host cancels event between RSVP and cron dispatch** — MITIGATE: cron JOIN on `events.status != 'cancelled'` (step 4 above). Without this, cancelled-event reminders still fire.
- **Cron misses a window** — ACCEPT: run every 6h; 72h window gives 12 opportunities. A one-off miss is tolerable at current event volume.
- **Stuck PENDING rows** — MITIGATE: `reminder_attempted_at` / `feedback_attempted_at` columns; cron treats rows with PENDING older than one interval as retry-eligible.
- **`handleUpdate` still calls Mailgun directly** — MITIGATE: Non-Goal below. The implementing agent must strip Mailgun scheduling calls from `handleUpdate` for reminder/feedback; leave cancellation of already-dispatched IDs intact.

### Non-Goals
- Do NOT change the confirmation email (still sent immediately at RSVP — unchanged)
- Do NOT change email templates or content
- Do NOT build a general-purpose email queue (scope to reminder + feedback only)
- Do NOT add a UI for managing scheduled sends
- Do NOT add a status column to `event_rsvps` — cancellation = row deletion (existing pattern)

### Alternatives Considered
- **Keep `o:deliverytime` for near-future events only** — fragile; requires branching on event date proximity. Partial fix only.
- **Switch to Mailgun US endpoint** — domain is registered on EU; cross-region use unsupported.
- **Send reminder/feedback immediately at RSVP** — useless UX for events weeks out.

### Rollback Strategy
Disable the cron job in `supabase.toml`. Emails won't send — identical to current broken state. The new schema columns are additive and nullable; no data loss on rollback.

## Done-When

- [ ] Attendees RSVPing to events >72h out receive a reminder email ~24h before the event
- [ ] Attendees RSVPing to events >72h out receive a feedback email ~2h after the event ends
- [ ] `email_send_log` shows `status: sent` for reminder and feedback rows (not `failed`)
- [ ] Host cancelling an event stops pending reminder/feedback emails from being sent
- [ ] Sending the same RSVP twice does not trigger duplicate emails (idempotency via atomic claim)
- [ ] Host editing event date causes reminders/feedback to be rescheduled to the new time
- [ ] Confirmation email behaviour is unchanged

## Technical Architecture

### Technical Analysis

**Current broken flow (send-event-emails/index.ts):**

- `handleRsvp` (line 398): sends confirmation immediately, then calls `sendEmail({ deliverAt: reminderTime })` and `sendEmail({ deliverAt: feedbackTime })`. Returns `null` message ID when Mailgun rejects the 72h+ schedule; logged as `status: failed`.
- `handleUpdate` (line 564): cancels old IDs via `cancelScheduledEmail`, then calls `sendEmail({ deliverAt })` again for reschedule — same broken pattern.
- `handleCancel` (line 490): reads `mailgun_message_ids`, calls `cancelScheduledEmail` for reminder and feedback keys. Works correctly today (cancels nothing, since IDs were never stored from failed sends — but silent no-op rather than error).
- `sendEmail()` (line 305): appends `o:deliverytime` to FormData when `deliverAt` is provided. No error thrown on Mailgun rejection — just `return null`.
- `logEmailSend()` (line 375): accepts `SupabaseClient` + opts; never throws. Reusable as-is from cron context.
- `FEEDBACK_HOST_ID` (line 41): hardcoded UUID gates feedback emails. Cron must replicate this gate.

**event_rsvps current schema:**
```sql
id UUID PK, event_id UUID FK, profile_id UUID FK, rsvped_at TIMESTAMPTZ, mailgun_message_ids JSONB
UNIQUE(event_id, profile_id)
```

**No cron infrastructure exists.** `supabase/config.toml` has no `[functions]` section.

**supabase/functions/ structure:**
- `send-event-emails/index.ts` — the HTTP handler, 770 lines
- `_shared/cors.ts` — shared CORS helper

**Key constraint:** The cron function cannot use the anon key + JWT path (no caller JWT). It must use `SUPABASE_SERVICE_ROLE_KEY` directly — already available as env var in the existing function.

**`logEmailSend` is reusable from cron context** — it accepts any `SupabaseClient` including service-role clients. No changes needed.

---

### Architecture Decisions

**1. Separate Edge Function vs extending send-event-emails**

Chosen: **New Edge Function** (`supabase/functions/dispatch-event-emails/index.ts`)

Rationale: The cron dispatcher has a different invocation model (no HTTP caller, no JWT, service-role only, scheduled trigger) and a fundamentally different responsibility (pull-dispatch vs push-on-event). Merging them into one file would require a `Deno.env.get('CRON_SECRET')` guard or request-source branching inside a 770-line file that already has clear handler separation.

Trade-off: A second function means shared utilities (`logEmailSend`, `sendEmail`, `buildReminder`, `buildFeedback`, email templates) cannot be directly imported across functions without moving them to `_shared/`.

Alternative rejected: Extending `send-event-emails` with an internal cron action (`action: 'dispatch'`). Rejected because it would expose the dispatch endpoint to HTTP callers (even if guarded), increases surface area of the existing function, and mixes scheduling-source concerns.

Decision: Move shared email logic (`sendEmail`, `logEmailSend`, `buildReminder`, `buildFeedback`, `buildFeedback` supporting helpers, `FEEDBACK_HOST_ID`, `feedbackFrom`, `escapeHtml`, email template builders) into `supabase/functions/_shared/email-helpers.ts`. Both functions import from there.

**2. Supabase scheduled function setup**

Chosen: `supabase.toml` `[functions.dispatch-event-emails]` with `schedule = "0 */6 * * *"` (every 6 hours).

```toml
[functions.dispatch-event-emails]
schedule = "0 */6 * * *"
```

Rationale: This is the Supabase-native cron mechanism. It creates a pg_cron job internally and invokes the Edge Function on schedule. No external scheduler, no additional service.

Trade-off: Local `supabase start` does NOT run cron schedules — the cron only fires in the hosted environment. Local testing requires manual invocation via `supabase functions invoke dispatch-event-emails --no-verify-jwt`.

Alternative rejected: Using pg_cron directly via a Postgres function + `SELECT cron.schedule(...)`. Would work but bypasses Edge Function ecosystem (no TypeScript, no Mailgun SDK patterns, harder to iterate).

**3. Atomic claim pattern (TOCTOU prevention)**

Chosen: UPDATE-based optimistic claim using Supabase PostgREST.

For each row to dispatch, use two UPDATE calls with `RETURNING` (via PostgREST `.update().eq(...).select()`):

```typescript
// Claim step — set PENDING only if key is currently NULL
const { data: claimed } = await supabase
  .from('event_rsvps')
  .update({ mailgun_message_ids: rsvp.mailgun_message_ids /* with key = 'PENDING' */ })
  .eq('id', rsvp.id)
  .eq('mailgun_message_ids->>reminder', null)  // PostgREST: key must be NULL
  .select('id')
  .single();

if (!claimed) return; // Another cron run already claimed this row
```

PostgREST limitation: `.eq('mailgun_message_ids->>reminder', null)` uses `IS NULL` semantics for JSONB text extraction — this works when the key is absent from the JSONB object (returns SQL NULL). When the key is `"PENDING"` or an actual ID, it evaluates to a non-null string and the WHERE clause fails, blocking double-dispatch.

After Mailgun returns the real ID, run a second UPDATE to replace `"PENDING"` with the actual ID.

Also set `reminder_attempted_at = NOW()` in the claim step. Cron treats rows with `mailgun_message_ids->>'reminder' = 'PENDING'` AND `reminder_attempted_at < NOW() - INTERVAL '7 hours'` as retry-eligible (stuck PENDING detection).

Trade-off: PostgREST's `.eq('jsonb_col->>key', null)` is less explicit than raw SQL `WHERE (mailgun_message_ids->>'reminder') IS NULL`. The implementing agent must verify this PostgREST filter syntax works on JSONB extraction — if not, fall back to `mcp__supabase__execute_sql` for the claim step.

Alternative rejected: Using a Postgres advisory lock. More complex, requires a raw SQL path, and advisory locks don't compose cleanly with the row-level update pattern already in place.

**4. handleRsvp changes**

Current (broken): Calls `sendEmail({ deliverAt: reminderTime })` and `sendEmail({ deliverAt: feedbackTime })`.

New behavior:
- Compute `reminderScheduledAt = eventDatetime - 24h`
- Compute `feedbackScheduledAt = eventDatetime + duration_minutes + 2h`
- UPDATE `event_rsvps` to set these two columns (only when event is future and host gate passes)
- Do NOT call `sendEmail` for reminder or feedback at RSVP time
- Do NOT log reminder/feedback to `email_send_log` at RSVP time (cron logs on dispatch)
- Confirmation email: unchanged — still sent immediately

The UPDATE to `event_rsvps` must use `.eq('event_id', eventId).eq('profile_id', userId)` — the row was just created by the RSVP trigger before this function fires.

Feedback scheduling gate: only set `feedback_scheduled_at` when `event.host_id === FEEDBACK_HOST_ID` — identical gate as current code.

**5. handleUpdate changes**

Current (broken): Cancels old Mailgun IDs then calls `sendEmail({ deliverAt })` again.

New behavior:
- For each RSVP row: cancel any already-dispatched Mailgun IDs (non-PENDING, non-null). If `mailgun_message_ids->>'reminder'` is a real Mailgun ID (not PENDING, not null) → call `cancelScheduledEmail`. Same for feedback.
- Recompute `reminderScheduledAt` and `feedbackScheduledAt` from new event datetime
- UPDATE each `event_rsvps` row: set new `*_scheduled_at` AND null out `mailgun_message_ids` keys (`{ reminder: null, feedback: null }` — or omit keys entirely from JSONB)
- Also null `reminder_attempted_at` and `feedback_attempted_at` (reset stuck detection)
- Send the update notice email: unchanged
- Do NOT call Mailgun for reminder/feedback directly

PENDING guard: if `mailgun_message_ids->>'reminder' === 'PENDING'`, do NOT call `cancelScheduledEmail` (there is no real Mailgun ID to cancel). The null-out of the key will reset the claim and let cron re-dispatch with the new time.

**6. handleCancel changes**

Current: Reads `mailgun_message_ids`, calls `cancelScheduledEmail` for reminder/feedback keys.

New behavior: same logic, but add a guard — only call `cancelScheduledEmail` when the stored value is a real Mailgun ID (not `"PENDING"` and not null). `"PENDING"` rows have no Mailgun ID to cancel.

```typescript
if (ids?.reminder && ids.reminder !== 'PENDING') await cancelScheduledEmail(ids.reminder);
if (ids?.feedback && ids.feedback !== 'PENDING') await cancelScheduledEmail(ids.feedback);
```

The cron's `JOIN events ON e.status != 'cancelled'` ensures no new dispatches after cancel. The PENDING guard prevents a `cancelScheduledEmail` call with literal string `"PENDING"` as the message ID.

**7. Migration structure**

Single migration: `supabase/migrations/20260617120000_event_rsvps_cron_columns.sql`

```sql
ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS reminder_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_attempted_at TIMESTAMPTZ;

-- Index for cron query performance: rows eligible for dispatch
CREATE INDEX IF NOT EXISTS idx_event_rsvps_reminder_dispatch
  ON public.event_rsvps (reminder_scheduled_at)
  WHERE reminder_scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_rsvps_feedback_dispatch
  ON public.event_rsvps (feedback_scheduled_at)
  WHERE feedback_scheduled_at IS NOT NULL;
```

Backfill: NOT included in migration. Existing RSVPs have no `*_scheduled_at` values and will be skipped by the cron query. This is acceptable — events with future datetimes that were RSVPed before this migration will not receive reminders. A separate one-off backfill script is out of scope (see Non-Goals).

**8. logEmailSend in cron context**

`logEmailSend` (line 375) is reused without modification once moved to `_shared/email-helpers.ts`. The cron passes its service-role `SupabaseClient`. Email types `'reminder'` and `'feedback'` are already in the union type. No new email types needed.

---

### Security Review

**RLS Policies:**
- ✅ No UPDATE policy exists on `event_rsvps`. Regular authenticated users cannot UPDATE any column — `mailgun_message_ids`, `reminder_scheduled_at`, `feedback_scheduled_at`, or the new columns — because RLS blocks all UPDATE operations for non-service-role callers. The new columns require no additional RLS policies.
- ✅ The existing SELECT policy (`USING (true)`) makes the new scheduling timestamp columns publicly readable. The timestamps are not sensitive (they reveal only event timing, not PII). No change needed.
- ⚠️ The `mailgun_message_ids` column and new `*_scheduled_at` columns are publicly SELECTable, so an authenticated user can observe whether their RSVP has a `"PENDING"` claim or real Mailgun ID. Low risk (no action surface), acknowledged.

**Authentication:**
- ⚠️ **The cron function must NOT use JWT auth.** The current `send-event-emails` validates a Bearer token via `anonClient.auth.getUser(token)` — Supabase's cron scheduler provides no user JWT. **Resolution (already reflected in architecture):** The cron function uses `SUPABASE_SERVICE_ROLE_KEY` directly for DB operations and adds a `CRON_SECRET` check: `req.headers.get('Authorization') === 'Bearer ' + Deno.env.get('CRON_SECRET')`. Without this, the dispatch endpoint is publicly triggerable — limited blast radius (only dispatches legitimately queued rows within 72h window), but could cause timing manipulation or Mailgun call bursts. Add `CRON_SECRET` to the Pre-deploy Checklist.
- ✅ Service role key for DB operations is the correct pattern, consistent with the existing function.

**Authorization:**
- ✅ Atomic claim (UPDATE with `WHERE mailgun_message_ids->>'reminder' IS NULL RETURNING`) correctly prevents double-dispatch from concurrent cron runs. Only one run receives a row back; the other's UPDATE matches zero rows and skips.
- ✅ Regular users cannot interfere with the claim — service role bypasses RLS for both the claim UPDATE and post-dispatch write-back. A user can DELETE their own RSVP (existing RLS), which removes the row before cron reaches it — intentional and safe.
- ⚠️ **User can supply arbitrary `reminder_scheduled_at` at INSERT time.** The existing INSERT policy (`WITH CHECK (auth.uid() = profile_id)`) does not constrain the new timestamp columns. A user could craft an RSVP with `reminder_scheduled_at` set to 5 minutes from now for an event that is months away, triggering premature dispatch. **Mitigation (chosen):** The cron validates that stored timestamps match expected values (derived from `events.datetime`): `|stored - expected| ≤ 30 minutes`. Rows failing this check are skipped and logged. This is simpler than a DB trigger and avoids SECURITY DEFINER complexity.

**Input Validation:**
- ✅ Cron reads from its own DB (trusted). No user-controlled string reaches Mailgun that isn't already validated via the existing RSVP flow. Profile names and event titles pass through existing `escapeHtml()` / `feedbackFrom()` sanitization.
- ✅ Email addresses come from `profiles.email`, set at auth time — no new vector.
- ✅ No SQL injection: all queries use Supabase client parameterized calls.
- ✅ Mailgun message ID write-back uses the raw response value — consistent with `cancelScheduledEmail`'s angle-bracket strip.

**Data Protection:**
- ✅ No new PII exposure vs. current. The cron reads `profiles.email` and `profiles.name` via service role — identical pattern to `handleRsvp`.
- ✅ Email addresses and names sent to Mailgun over HTTPS with API key — unchanged.
- ⚠️ `reminder_scheduled_at` / `feedback_scheduled_at` are publicly readable, revealing RSVP timing relative to event date. Minor information disclosure, not a blocking concern.

**Operational Safety (PENDING rows + cancel interaction):**
- ⚠️ **Stuck PENDING retry window:** If cron crashes after claim but before write-back, the row stays PENDING. Retry eligibility: `reminder_attempted_at < NOW() - INTERVAL '7 hours'` (slightly longer than 6h interval to avoid overlap with a slow-but-succeeding dispatch). **Build Sequence step 6 must implement this threshold.** Worst case: one duplicate email per stuck row.
- ✅ **handleCancel + PENDING is safe.** When `handleCancel` tries to cancel a `"PENDING"` ID, Mailgun returns 404 (logged as warn, non-fatal). The cron's `IS NULL` query will NOT match the row (key = `"PENDING"` is non-null), so the email is never dispatched. The `events.status != 'cancelled'` JOIN is the primary defence; the IS NULL check provides a second layer.
- ⚠️ **handleUpdate race with in-flight PENDING:** If `handleUpdate` fires while a cron run is mid-dispatch (claimed PENDING but not yet written real ID back), `handleUpdate` nulls the key. The cron's write-back conditional `WHERE mailgun_message_ids->>'reminder' = 'PENDING'` prevents overwriting the null — so the re-queued send fires correctly on the next cron run. **Build Sequence step 4 must implement the conditional write-back** (not unconditional SET).

---

### Implementation Approach

**Worktree recommended:** This touches 1 migration, 1 existing Edge Function (non-trivial refactor), 1 new Edge Function, 1 new shared module, and `supabase.toml` — 5+ files with coordinated changes that should not land on main piecemeal.

#### Build Sequence

1. **Migration** — add 4 columns + 2 partial indexes to `event_rsvps`. Run `./scripts/migrate.sh`.
2. **Extract shared module** — create `supabase/functions/_shared/email-helpers.ts`. Move from `send-event-emails/index.ts`: `sendEmail`, `cancelScheduledEmail`, `logEmailSend`, `buildReminder`, `buildFeedback`, `buildConfirmation`, `buildCancellation`, `buildUpdate`, `buildUncancel`, all HTML/template helpers, `FEEDBACK_HOST_ID`, `feedbackFrom`, `escapeHtml`, `EventRow` type, `SupabaseClient` type alias. Update `send-event-emails/index.ts` to import from `../_shared/email-helpers.ts`.
3. **Modify handleRsvp** — replace `sendEmail({ deliverAt })` calls for reminder/feedback with `event_rsvps` UPDATE to set `*_scheduled_at`. Keep confirmation unchanged.
4. **Modify handleUpdate** — replace Mailgun reschedule with `*_scheduled_at` UPDATE + null-out IDs. Add PENDING guard before `cancelScheduledEmail`.
5. **Modify handleCancel** — add PENDING guard before `cancelScheduledEmail`.
6. **New cron function** — create `supabase/functions/dispatch-event-emails/index.ts`. No HTTP server (`serve`); Deno entry point runs the dispatch loop directly. Uses service-role client from `SUPABASE_SERVICE_ROLE_KEY`. Imports from `_shared/email-helpers.ts`.
7. **supabase.toml** — add `[functions.dispatch-event-emails]` with `schedule = "0 */6 * * *"`.

#### Files to Create

- `supabase/migrations/20260617120000_event_rsvps_cron_columns.sql` — 4 new columns + 2 partial indexes
- `supabase/functions/_shared/email-helpers.ts` — shared email utilities extracted from `send-event-emails`
- `supabase/functions/dispatch-event-emails/index.ts` — cron dispatcher

#### Files to Modify

- `supabase/functions/send-event-emails/index.ts` — import shared helpers; update `handleRsvp`, `handleUpdate`, `handleCancel`
- `supabase/config.toml` — add `[functions.dispatch-event-emails]` schedule block

## Pre-deploy Checklist

### Secrets to provision
- [ ] `CRON_SECRET` — new secret required for `dispatch-event-emails` endpoint authorization. Set via Supabase dashboard → Project Settings → Edge Functions → Secrets, or: `supabase secrets set CRON_SECRET=<random-string> --project-ref besjtuodziykmjidubzw`. Supply the same value as the `Authorization: Bearer <secret>` header in the Supabase cron schedule config.
- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `SUPABASE_SERVICE_ROLE_KEY` — already provisioned for `send-event-emails`. Supabase injects them automatically to all Edge Functions.

### Deploy commands
- [ ] `supabase functions deploy dispatch-event-emails --project-ref besjtuodziykmjidubzw`
- [ ] `supabase functions deploy send-event-emails --project-ref besjtuodziykmjidubzw` (modified)
- [ ] Run migration on prod: `./scripts/migrate.sh` (verify against prod ref)
- [ ] Verify cron schedule registered: `supabase functions list --project-ref besjtuodziykmjidubzw`

### Post-deploy verification
- [ ] Manually invoke cron function: `supabase functions invoke dispatch-event-emails --project-ref besjtuodziykmjidubzw --no-verify-jwt`
- [ ] Check `email_send_log` for any new `status: sent` rows for upcoming events within 72h
- [ ] Check Sentry for errors in first 10 minutes after deploy
