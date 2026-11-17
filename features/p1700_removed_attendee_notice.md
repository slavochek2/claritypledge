---
status: qa
type: story
rank: 347
workstream: events
created_date: '2026-11-17'
tags: [events, host, registration, email]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 664eb4d1fae5bc4b3d81b357d160d36d173f8fddecec1de6488a94fd05000ee1
spec_review_vendors: [codex, gemini, openrouter]
---

# P1700: A person the host removes from an event is told, by email and on the event page

## Problem

**Situation:** Since P1515 (founder, 2026-10-19) a host can remove a person from an event. `remove_event_attendee` records the removal in `event_removals` and deletes the registration. A trigger then refuses any new registration with the raw error `registration is closed for you on this event` (42501). Admitting someone from the waiting list (P1529) already sends the normal confirmation email (`hostAddFromWaitlist` → `invokeEventEmails('rsvp', …)`).

**Complication:** Removal sends nothing and shows nothing. The removed person finds out only by opening the event, seeing they aren't registered, tapping Register, and getting an error. To them that looks like a broken app, not a host decision.

> Founder, 2026-11-17: "when for example I admit somebody from waiting list or remove a participant as a host, do they get notification or what is the flow? How will the event look up for them? … If not, should we do it?" Then: "yes lets fix".

**Question:** Tell the removed person once by email, and show them a calm, stable state on the event page instead of a Register button that fails.

## Appetite

Blast radius: one flow (host removal). It touches an existing edge function, so it needs a prod function deploy. Reversibility: git revert plus redeploying the function; the migration only adds two nullable columns and one read function, which old code ignores. An email that has gone out cannot be recalled. Decision density: two founder calls on copy.

## Solution

1. **Record what the removal did.** Before deleting the registration, `remove_event_attendee` copies its scheduled-email ids (`event_rsvps.mailgun_message_ids`) onto the `event_removals` row (`scheduled_message_ids`). After the delete, it UPDATEs that row's `had_registration` to whether a registration was actually deleted. It is an UPDATE because the removal insert is `ON CONFLICT DO NOTHING` (`20261021100000_p1515_artifact_sharing.sql:801`). `notified_at` stays empty. A removal of someone who was not registered (only waitlisted, or already cancelled) sends no email. The trigger that clears the waiting list stays as it is.
2. **Email on removal, at most once.** Add an action `removed` to `send-event-emails`. It requires `userId` (400 without it) and is authorised like `cancel` (caller is the event's host, else 403). It sends only after atomically claiming the row (`UPDATE event_removals SET notified_at = now() WHERE event_id = … AND user_id = … AND had_registration AND notified_at IS NULL RETURNING …`). No claimed row means no email and a 200. Repeat or concurrent calls therefore send nothing more. If the send fails, the claim is released (`notified_at` back to NULL), so a retry can still send. The action also cancels the person's already-scheduled reminder, starting-soon and feedback emails, using the ids copied in step 1 and the existing `cancelScheduledEmail` helper. Without this, the person gets "removed", then "your event is tomorrow", then "how was it?". The host's client invokes it after `remove_event_attendee` succeeds, in the same way `hostAddFromWaitlist` sends `rsvp`. A failed email never fails the removal.
3. **Event page for a removed person.** A new server read returns only the signed-in caller's own removal status for an event (true/false, nothing else; anonymous gets false). While it is true, the page shows a notice in place of the Register / waiting-list action. A cancelled event keeps its cancelled state, which outranks the notice.
4. **Stale tab.** A registration refused by the removal trigger (`registration is closed for you on this event`), or a waiting-list join refused for a removed person (`not authorized for this event`, `20261106150000_p1529_review_fixes_waitlist.sql:48-51`), re-reads the removal status and shows the notice if it is true. The client never maps every 42501 to the notice.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Removal email reads as hostile | MITIGATE | Neutral copy, founder approves (below) |
| Email endpoint abused to mail arbitrary users or repeatedly | MITIGATE | Host check, `had_registration` (a removal of someone never registered sends nothing), and the one-time `notified_at` claim |
| Host closes the tab between removal and email call | ACCEPT | Same client dispatch as the waiting-list admit email; at most once, not guaranteed. A durable outbox is out of scope |
| Removing then re-adding is not possible from the UI | ACCEPT | Not asked for; unchanged since P1515 |

**Non-Goals**
- Do NOT change who can remove, or what removal deletes (P1515 rules stand).
- Do NOT add a reason field or let the host write a message.
- Do NOT change the waiting-list admit email.
- Do NOT reveal to anyone else that a person was removed.

## Invariants

- From P1515 (2026-10-19): the removal record is authoritative, and registering is refused once it exists. This spec only changes what the person is told.
- A viewer can learn only their own removal status.

## UI Contract

Copy approved by the founder 2026-11-17 ("cancelled" wording):
- Event page notice: `The host cancelled your registration for this event.`
- Email subject: `Your registration for {event title} was cancelled`
- Email body: `Hi {first name}, the host of {event title} ({date, in the event's existing email date format}) has cancelled your registration, so you are no longer on the guest list. — Clarity Pledge`. The greeting is the shared one every event email uses (`Hi,` when there is no name). No "reply to the host": the events mailbox sets no Reply-To.

## Acceptance Criteria

- [x] When the host removes a registered person, that person receives exactly one email with the UI Contract copy (verified on TEST with the outgoing send captured); calling the action again sends nothing. Evidence 2026-11-17: `e2e/integration/p1700-removal-email-db.spec.ts` 5/5 on TEST against the deployed function (`FUNCTIONS: trusted (start match, end match)`): one `removal` row in `email_send_log` with status `sent`, none added by a second call. Copy is the drafted UI Contract text, pending the founder's approval.
- [x] Removing a person who was not registered (waitlisted only) sends no email. Evidence: same integration spec (never-registered profile: `had_registration` false, no log row); unit `p1700-removal-notice.test.ts`.
- [x] A removed person's already-scheduled reminder and feedback emails are cancelled (the cancel call is made for each stored id, verified in the function's test with the mail service stubbed). Evidence: unit `p1700-removal-notice.test.ts` (reminder, feedback, starting_soon cancelled; the sent confirmation id is not). Control: removing the `had_registration` filter fails the waitlisted-only test.
- [x] A failed send leaves `notified_at` empty, so a second call sends. Evidence: unit `p1700-removal-notice.test.ts` (failed send releases the claim, the retry sends).
- [x] A removed person opening the event sees the notice and no Register or waiting-list button. Evidence: unit `p1700-removed-notice.test.tsx`.
- [x] The `removed` action returns 403 for a non-host and 400 without `userId`. Evidence: integration spec (403 non-host, 400 without userId).
- [x] The removal-status read returns only the caller's own status: another user's id cannot be passed, and anonymous gets false. Evidence: rolled-back probe and integration spec (anon false, other user false, removed person true; the function takes no user argument; direct table read denied).
- [x] A stale-tab registration or waiting-list join by a removed person shows the notice text, never a raw database error. Evidence: unit `p1700-removed-notice.test.tsx` and `p1700-removal-refusal-and-email.test.ts` (both refusal messages map to the notice; another error does not).
- [x] Other attendees' event page still lists the remaining attendees and shows no notice. Evidence: unit `p1700-removed-notice.test.tsx` (a viewer who was not removed sees Register, no notice).

## Pre-deploy Checklist

### Deploy commands
- [x] Deploy the updated `send-event-emails` function to prod (no new secrets; it uses the existing mail-sending key). Done 2026-11-17 with the founder's approval, edge-function smoke 1/1 healthy. `[post-deploy]` stamp the manifest from the main checkout after the merge: `./scripts/stamp-deploy-manifest.sh --env prod --functions-only --function send-event-emails`.
- [x] Apply the 4 migrations to prod: done by `/push` step 2.5, which applies exactly the migrations the pushed SHA carries before the client deploys (P1211). Until then only the new `removed` action can fail, and nothing calls it before the client ships.

### Post-deploy verification
- [x] Verified on TEST against the deployed function (integration 5/5, `FUNCTIONS: trusted`). `[post-deploy]` remove a test account from a test event on prod; the email arrives and the page shows the notice.
- [x] Sentry check scheduled. `[post-deploy]` check Sentry for new errors in the first 10 minutes after the push.

## Known limitations (from the /finish review, 2026-11-17)

- The email is sent by one fire-and-forget call from the host's browser. If that call never lands (tab closed, network drop), nothing retries it, and the person's already-scheduled reminder, starting-soon and feedback emails (queued up to 72 hours ahead) are not cancelled. The claim is released on any failure, so a later call can still send. A durable retry (the email cron picking up removals not yet notified) is the fix if this is ever seen. ACCEPT, same delivery as the waiting-list admit email.
- A cancel that fails twice is logged and the id is still cleared (the repo's P1425 policy for `cancelScheduledEmail`), so that one scheduled email can still go out.
- The removal email also goes for a past or cancelled event. ACCEPT: a host removing someone from a past event is rare, and the email stays true.
- If the removal-status read itself fails, the page treats the viewer as not removed and shows Register; submitting then takes the stale-tab path, which re-reads the status. ACCEPT: an error state with retry was judged not worth a new UI state for a rare double failure.
- Removals recorded before this migration get `had_registration = false` by default, so they are never emailed by this action. ACCEPT: it applies only to people removed before the feature existed.
- The edge function runs the cancels and the send while holding the claim. A release that fails twice is logged and leaves the claim set, so that removal is never emailed; recovering it would need the durable retry named above.
- A reminder the dispatcher is sending at the very moment of the removal (its id still `PENDING` on the registration) is not cancelled: the removal copies `PENDING`, which is not a real id, and the dispatcher's later id write-back finds no registration. DEFER: if seen, the dispatcher can cancel a message whose write-back finds no registration.
- A send that throws after Mailgun already accepted the email (a dropped response) releases the claim, so a retry could send a second removal email. ACCEPT: the same choice as P1425 (a duplicate is preferable to none); the call is made once, from the host's page.
- For a signed-in viewer who is not registered, the Register action is hidden until the removal-status read returns (one small RPC), so a removed person never sees a Register button flash. ACCEPT: the read is one request; a disabled placeholder can be added if the gap is ever noticeable.
- `email_send_log`'s widened CHECK is added without `NOT VALID`, as the P1380 precedent did; the table is small.
- Opening the event with `?action=rsvp` still opens the registration form for a removed person; submitting it shows the notice (the stale-tab path).

## Cost Budget

Applies because the action calls a paid vendor (Mailgun; registry row added to `docs/technical/metered-services.md` in this change) and the tests create and delete test users. Added after the /finish review, 2026-11-17.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | Per removal: 1 `remove_event_attendee` RPC + 1 edge function call; inside it 1 events read + 1 claim update + 1 ids update + 1 profile read + 1 log insert = 5 database requests, up to 3 Mailgun cancels x 2 attempts = 6, and 1 Mailgun send. Per viewer who is signed in and not registered: 1 `my_event_removed` RPC per event page view | 0 standing traffic: no poll, timer or retry added | Integration spec: 4 users created + 4 deleted + 11 password sign-ins = 19 auth calls; 1 event; 7 edge function invocations (403 + 400 + first send + 1 sequential repeat + 2 concurrent repeats + never-registered); 5 RPCs; about 10 setup and assertion reads; 1 Mailgun send (only the registered, removed person is emailed) |
| Egress (bytes) | One small JSON reply per call; the email itself goes out through Mailgun, not Supabase | 0 added | (19 auth + 7 invocations + 5 RPCs + about 10 reads) = about 41 responses x under 2 KB each = under 82 KB |
| Log lines | 1 per failed send or refused call (403, 400) | 0 | 2 provoked refusals (403, 400) |
| Service unit | 1 Mailgun email per removal of a registered person | 0 | 1 Mailgun email |

1. **Fits the plan limit today?** Fits. Supabase Free plan row (TEST since P1538; prod on its own organisation): edge function invocations = 7 x runs per month on TEST and 1 x removals per month on prod, against 500,000. Mailgun row: emails per month = removals per month (prod) + runs per month (TEST), against the plan's included emails (Free: 100 per day; Basic: 10,000 per month). Which Mailgun plan is in use is read from the vendor dashboard, never written here.
2. **Fits at 10x?** Yes: removals are a manual host action, so ten times today's count stays far under either limit.
3. If the Mailgun plan in use is Free and a day's sends ever pass 100, the upgrade is Basic, from $15 per month (registry).

## Related

- P1515 (host removal, `event_removals`), P1529 (waiting list, admit email), P1699 (sibling: reset rounds).
