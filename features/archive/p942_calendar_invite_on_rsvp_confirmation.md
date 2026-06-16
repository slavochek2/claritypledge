---
status: rejected
type: story
rank: 1000936.0
workstream: events
created_date: '2026-06-16'
tags: [events, calendar, email, rsvp]
delivery_stage: create-spec
pipeline_ran: [create-spec, adversarial-review]
---

# P942: Attach a real calendar invite to the RSVP confirmation email

## Rejection (2026-06-16)

Rejected after `/adversarial-review`. Three reasons:

1. **Premise was false.** The plan set the invite `ORGANIZER` to `events@mg.claritypledge.com`
   on the belief it was a send-only subdomain whose iTIP replies vanish harmlessly. Verified false:
   `mg.claritypledge.com` has live MX (`mxa/mxb.eu.mailgun.org`, `docs/technical/ghost-blog.md:87-88`)
   and is **shared with the Ghost newsletter** (`.env.local:23`). Attendee Yes/No replies are accepted,
   unrouted → NDR/suppression on the same domain that sends both event confirmations and newsletters →
   reputation contagion into an unrelated production system.
2. **`METHOD:REQUEST` carried most of the risk for the least-needed feature.** ~6 of 8 high-severity
   findings (no `text/calendar` MIME part in `sendEmail`, no `SEQUENCE` store, no `CANCEL` handler,
   UID collision against P939's identical series titles/shared link, forwardable-invite link leak that
   defeats P941) all attach to the REQUEST machinery. Its only unique benefit — push-update-on-change —
   was not worth that surface on current infra.
3. **Marginal value over today is small.** Today already ships "Add to calendar" links + a 24h reminder
   email (`buildReminder`). The `PUBLISH`-attachment fallback would only add in-email one-tap add +
   a redundant `VALARM` — not worth a build absent observed "people fail to add the event" signal.

Revisit `REQUEST` only if the webinar funnel proves no-shows are the bottleneck AND it gets a dedicated,
newsletter-isolated subdomain. Two bugs the review surfaced are real **independent of this spec** and
were spun out: the DST seeding bug (already feeds wrong winter times to today's calendar links) → P943;
the unescaped `.ics` text would only have mattered if an attachment shipped (moot under rejection).

---

## Original spec (rejected — kept for audit)

## Problem

**Situation:** When a user RSVPs to an event, `send-event-emails` (`handleRsvp`) immediately sends a confirmation email whose calendar offering is only *clickable links* — Google / Outlook / Office 365 — built by `calendarLinks()` (`supabase/functions/send-event-emails/index.ts:139-156`). The on-page `RsvpConfirm.tsx` shows the same links plus an `.ics` download. Nothing lands on the attendee's calendar; they must click and manually save.

**Complication:** Our audience is busy co-founder pairs — the classic "I meant to add it and forgot" demographic. A link they don't click is a no-show. And because today's links are static (`METHOD:PUBLISH`-equivalent), if a webinar time or location moves, every attendee's saved copy is silently stale — we have no way to correct it.

**Question:** How do we get the event onto the attendee's calendar with one tap (ideally automatically) and retain the ability to push corrections when an event changes — without adding friction or a second email?

## Appetite

Low-to-medium blast radius — one edge function's email payload changes (`send-event-emails`); no DB schema change, no new tables, no UI screen change. Reversible (revert the function; on-page buttons untouched). Low decision density — one founder decision (organizer address), already recommended below.

## Solution

Attach a `METHOD:REQUEST` `.ics` calendar invite to the **existing** RSVP confirmation email — the same email `handleRsvp` already sends. Gmail/Outlook then render inline **Yes / No / Maybe** and the event lands on the attendee's calendar (often automatically). Because `REQUEST` makes us the organizer, a later time/location change can push an update/`CANCEL` that silently corrects every attendee's calendar.

Key parameters:

- **One email only.** The invite rides on the confirmation email as an attachment. Do NOT send a separate invite email.
- **Sender unchanged:** `Clarity Pledge Events <events@mg.claritypledge.com>` via Mailgun (verified subdomain, SPF/DKIM set).
- **`ORGANIZER` = `events@mg.claritypledge.com`** — the same address as `From`. NOT the human host (`host_id` / `slava@inguro.com`): organizer must match From or providers flag it, and organizer-update pushes must flow through the Mailgun pipeline. Applies to all events regardless of human host.
- **Reminders inside the invite:** `VALARM` at 1 day and 1 hour before. (This is where the no-show reduction actually comes from.)
- **Consistency across the lifecycle:** the reminder and un-cancel emails should remain consistent with the invite. When an event is updated/cancelled, push the corresponding `REQUEST`-update / `CANCEL` so calendars stay correct. (Confirm the exact set of lifecycle emails to cover during `/architect`.)
- **No new verification.** Email is already verified upstream via the magic link before any RSVP exists, so the invite always lands in a verified inbox. Do NOT add an OTP or any second verification step.

## Risks / Non-Goals

### Risks
- **Dead RSVP-reply emails.** With `REQUEST`, attendee Yes/No/Maybe taps send an iTIP reply back to the organizer address. `mg.claritypledge.com` is a send-only subdomain, so those replies land unread or bounce. Harmless — our RSVP source of truth is our own DB via the magic-link flow, not the calendar reply — but document it. Mitigation: accept (Option A); or Option B below if we ever want calendar-side RSVPs.
- **Deliverability of organizer invites.** Some providers scrutinize automated `REQUEST` invites. Mitigation: organizer matches the verified `From` domain; monitor first sends. Fallback: attach plain `METHOD:PUBLISH` `.ics` to the same email — keeps one-tap add, loses auto-update-on-change.
- **Update/cancel must use a stable UID + incrementing SEQUENCE** or calendars won't recognize the update as the same event. Mitigation: derive a deterministic `UID` per event (e.g. from event id) and bump `SEQUENCE` on each push. Verify during `/architect`.

### Non-Goals
- Do NOT send a second, separate calendar email — invite is an attachment on the existing confirmation email.
- Do NOT add an OTP or any new verification step.
- Do NOT change the sender address or sending domain.
- Do NOT set the organizer to the human host / `host_id` / `slava@inguro.com`.
- Do NOT remove the on-page calendar buttons or `.ics` download in `RsvpConfirm.tsx` — they stay as fallback.
- Do NOT change the RSVP flow, magic-link auth, or the `events` schema.
- Do NOT build an inbound mailbox for calendar replies in this spec (that's Option B, deferred).

### Alternatives Considered
- **`METHOD:PUBLISH` attached `.ics`** (no organizer): no dead replies, no deliverability sensitivity, still one-tap add — but cannot push updates when an event moves. Kept as the fallback, not the primary, because auto-update-on-change is the main reason to do this.
- **Keep links-only (status quo):** rejected — no auto-land, no update capability; the whole point is reducing no-shows and fixing moved events.

## Done-When

- [ ] RSVP confirmation email arrives with an attached calendar invite that Gmail and Outlook render with inline Yes/No/Maybe
- [ ] Accepting the invite places the event on the attendee's calendar with the correct title, time, and location
- [ ] The invite contains reminders at 1 day and 1 hour before the event
- [ ] `ORGANIZER` on the invite is `events@mg.claritypledge.com` (verified by inspecting a received `.ics`)
- [ ] Only one email is sent on RSVP (no separate invite email)
- [ ] On-page calendar buttons + `.ics` download in `RsvpConfirm.tsx` still work (regression)
- [ ] Changing an event's time/location and re-running the update path pushes an invite update that moves the event on an already-accepted attendee's calendar (verified end-to-end)
- [ ] No OTP / extra verification step was added to the RSVP flow

## UX Notes

- **Happy path:** RSVP → one email "You're in: [Event]" with the invite attached → attendee taps Accept (or it auto-adds) → event on calendar with reminders.
- **Fallback path:** attendee skips the email → on-page confirmation still offers Google/Outlook/Office 365 + download `.ics`.
- **Update path:** host changes event → attendees who accepted see their calendar entry move automatically; no action required.
- **Reply path (known dead-end):** attendee taps Yes/No/Maybe → reply emails the organizer address → discarded. Attendance is not derived from this; the DB RSVP is the source of truth.

## Acceptance Criteria

- [ ] Attendees can add an event to their calendar in one tap (or automatically) from the confirmation email
- [ ] A moved or cancelled event corrects/removes itself on attendees' calendars without manual action
- [ ] The change is invisible to the rest of the RSVP journey (no new steps, no second email, no extra verification)

## Founder Decision

**[FOUNDER DECISION: organizer address]**

- **Option A (recommended):** `ORGANIZER = events@mg.claritypledge.com`. Clean, matches `From`, zero new setup. Attendee Yes/No/Maybe iTIP replies route there and are discarded — harmless, since the DB is the RSVP source of truth.
- **Option B:** create and monitor a real `events@claritypledge.com` inbox if we ever want to *see* calendar-side RSVPs. More setup, and redundant with the DB.

Recommended: **A**.
