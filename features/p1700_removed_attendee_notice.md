---
status: week
type: story
rank: 347
workstream: events
created_date: '2026-11-17'
tags: [events, host, registration, email]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

1. **Record what the removal did.** Before deleting the registration, `remove_event_attendee` copies its scheduled-email ids (`event_rsvps.mailgun_message_ids`) onto the `event_removals` row. After the delete, it UPDATEs that row's `had_registration` to whether a registration was actually deleted. It is an UPDATE because the removal insert is `ON CONFLICT DO NOTHING` (`20261021100000_p1515_artifact_sharing.sql:801`). `notified_at` stays empty. A removal of someone who was not registered (only waitlisted, or already cancelled) sends no email. The trigger that clears the waiting list stays as it is.
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

[FOUNDER DECISION: copy. Drafts, to approve or change:]
- Event page notice: `The host has closed your registration for this event.`
- Email subject: `Your registration for {event title}`
- Email body: `Hi {first name, or "there" when empty}, the host of {event title} ({date, in the event's existing email date format}) has removed your registration, so you are no longer on the guest list. — Clarity Pledge` (no "reply to the host": the events mailbox sets no Reply-To)

## Acceptance Criteria

- [ ] When the host removes a registered person, that person receives exactly one email with the UI Contract copy (verified on TEST with the outgoing send captured); calling the action again sends nothing.
- [ ] Removing a person who was not registered (waitlisted only) sends no email.
- [ ] A removed person's already-scheduled reminder and feedback emails are cancelled (the cancel call is made for each stored id, verified in the function's test with the mail service stubbed).
- [ ] A failed send leaves `notified_at` empty, so a second call sends.
- [ ] A removed person opening the event sees the notice and no Register or waiting-list button.
- [ ] The `removed` action returns 403 for a non-host and 400 without `userId`.
- [ ] The removal-status read returns only the caller's own status: another user's id cannot be passed, and anonymous gets false.
- [ ] A stale-tab registration or waiting-list join by a removed person shows the notice text, never a raw database error.
- [ ] Other attendees' event page still lists the remaining attendees and shows no notice.

## Pre-deploy Checklist

### Deploy commands
- [ ] Deploy the updated `send-event-emails` function to prod (no new secrets; it uses the existing mail-sending key)
- [ ] Apply the new migration (`event_removals` columns + own-status read) to prod through the normal push path

### Post-deploy verification
- [ ] Remove a test account from a test event on prod; the email arrives and the page shows the notice
- [ ] Check Sentry for new errors in first 10 minutes

## Related

- P1515 (host removal, `event_removals`), P1529 (waiting list, admit email), P1699 (sibling: reset rounds).
