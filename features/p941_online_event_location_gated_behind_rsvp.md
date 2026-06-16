---
status: qa
type: story
rank: 1000935.0
workstream: C2
created_date: '2026-06-16'
tags:
  - events
  - rsvp
  - online
  - webinar
delivery_stage: ship
pipeline_ran: [create-spec, challenge-prd, dev, ship]
---

# P941: Gate Meet link behind RSVP for online events

> Companion to [P939](p939_cofounder_webinar_events_copy_resolver.md) (co-founder webinar series).
> Prerequisite to running the webinar series reliably — without this, the host cannot safely skip a
> session when nobody has registered, because the link is already public.

## Problem

**Situation:** The `location` field on every event is rendered publicly on the event detail page.
For online events this means the Google Meet link is visible — and the "Add to Google Calendar"
button embeds it — before anyone RSVPs.

**Complication:** The host needs to know if anyone is actually coming before starting a session.
If the link is public, attendees join without registering, RSVP count stays at zero, and the host
has no reliable signal. For a recurring series with no minimum attendees, this means the host cannot
skip a low-attendance session with confidence: people may have the link but not have RSVPed.

**Question:** For online events (location is a virtual link), gate the Meet link behind RSVP:
show it only to users who have registered. Non-RSVPed visitors see the event details and a clear
CTA to register; the link appears only after they do.

## Appetite

- **Blast radius — medium.** Touches `EventDetail.tsx` (conditional location render) and the
  "Add to Google Calendar" link builder (must include/exclude location based on RSVP status). All
  other events (physical, already RSVPed) are unaffected. No schema change.
- **Reversibility — high.** A conditional render — revert is a one-line flag change.
- **Decision density — a few.** Online detection heuristic; what non-RSVPed visitors see in place
  of the link; whether "Add to Google Calendar" shows at all pre-RSVP.

## Solution

**(1) Detect online vs physical.** Already solved — `classifyLocation(event.location)` in
`location-utils.ts` returns `type: 'virtual'` for Meet/Zoom/virtual links and `type: 'maps'` or
`type: 'text'` for physical addresses. `RsvpConfirm.tsx` already uses this. No new heuristic, no
migration — reuse `classifyLocation(event.location).type === 'virtual'` in `EventDetail.tsx`.

**(2) Gate the location display.** On `EventDetail.tsx`:
- **Not RSVPed + online event:** hide the raw Meet link. Show: "Register to receive the meeting link"
  (or similar — `[FOUNDER DECISION: exact string]`). RSVP button stays prominent.
- **RSVPed + online event:** show the Meet link as before.
- **Physical event (any RSVP state):** show location as before — no change.

**(3) "Add to Google Calendar" — no change needed.** The calendar button with the Meet link lives
on `RsvpConfirm.tsx` (the confirmation page), which users only reach after RSVPing. The event detail
page's calendar button (if any) pre-RSVP does not embed the location for online events — this is
already handled or simply absent. No gating logic needed for the calendar button.

**(4) Host view — no change needed.** RSVP count is already surfaced to the host on the event
detail page. This spec makes that count reliable: once the link is gated, people who plan to attend
must RSVP rather than silently grabbing the link.

## Risks / Non-Goals

### Risks
- **Heuristic misclassifies a physical location that starts with a URL.** Mitigation: all current
  events use either a Meet link or a plain address — no edge case today. Migrate to `location_type`
  column if this appears. ACCEPT for now.
- **User RSVPs, gets link, cancels RSVP — link is still known.** Mitigation: the Meet link is
  not sensitive (anyone with it can join), the gate is about reliable RSVP signal, not secrecy.
  ACCEPT.
- **"Add to Google Calendar" without location confuses the user.** Mitigation: if hiding the button
  pre-RSVP, CTA copy makes clear they get the link after registering. MITIGATE via copy.

### Non-Goals
- Do NOT add per-event privacy settings or a `location_type` column at this stage (unless Option A
  is chosen in `/architect`).
- Do NOT build an email-the-link flow — the link is available on the event page post-RSVP.
- Do NOT change behaviour for physical events.
- Do NOT add a minimum-attendees threshold or auto-cancel logic — the host decides manually.

## Done-When

- [ ] Online events (URL location): Meet link hidden from non-RSVPed visitors; shown to RSVPed users.
- [ ] Non-RSVPed visitors see a clear prompt to register in place of the link.
- [ ] "Add to Google Calendar" either hidden or link-free for non-RSVPed visitors on online events.
- [ ] Physical events render location exactly as before (no regression).
- [ ] RSVPed users on online events see the Meet link on EventDetail.tsx — no regression.
- [ ] Calendar button (with location) lives on RsvpConfirm.tsx only — no regression there either.
- [ ] Before implementing: verify EventDetail.tsx already loads RSVP status without a new query; if not, widen appetite estimate and confirm with founder.
- [ ] `tsc`, lint, build, tests green (RSVP-gated location tested: online+no-rsvp, online+rsvp, physical).

## Resolved Decisions

*From `/challenge-prd`. Persists as audit trail.*

| # | Finding | Resolution |
|---|---------|------------|
| BLOCK-1 | Shared Meet link means returning attendees already have it from week 1 — gate only captures *new* registrant signal, not total attendance | **Accepted.** Problem statement narrowed: this gate creates a "new registrant signal", not a total-attendance count. Host uses "RSVPs this week > 0" as proxy for new interest; host attends any session with ≥1 RSVP. Returning attendee bypass is accepted. |
| BLOCK-2 | Problem conflated "attendance signal" with "registrant signal" — two different products | **Resolved via BLOCK-1 resolution.** Problem section narrowed to "new registrant signal." |
| WARN-1 | Calendar button: Solution says it lives on RsvpConfirm.tsx only; Done-When said EventDetail.tsx RSVPed users need "calendar button with location" — contradiction | **Resolved.** Done-When updated: calendar button stays on RsvpConfirm.tsx only; EventDetail.tsx shows only the link for RSVPed online users. |
| WARN-2 | RSVP status availability in EventDetail.tsx not specified | **Defer to /architect.** Done-When adds: verify EventDetail.tsx already exposes RSVP status before coding; if not, widen appetite and return to founder before proceeding. |

## UX Notes

- The RSVP button is the primary CTA for non-RSVPed visitors — the "register to get the link" prompt
  should reinforce, not replace, it.
- Post-RSVP: consider a confirmation moment ("You're registered — here's your link") rather than just
  showing it inline. Keeps the link feel rewarding rather than bureaucratic.
- Mobile: the link area should not collapse to nothing — fill with the register prompt at the same
  visual weight as the location would occupy.
