---
status: week
type: story
rank: 12
workstream: events
created_date: '2026-09-28'
tags: [chiang-mai, events, calendar, retention]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1363: /cm becomes a native, filterable Chiang Mai event list, and we measure who comes back

## Problem

**Situation:** claritypledge.com/cm is a full-screen Google Calendar iframe (P909, P1019) over the
public "CM Events (by ClarityPledge)" calendar. The founder's events pipeline refreshes that calendar
from WhatsApp/Telegram groups, Luma and ClarityPledge's own events. The /groups/cm Events tab embeds
the same calendar (`src/lib/chiang-mai-calendar.ts`).

**Complication:** An iframe can't be filtered by what people care about ("sport this weekend"), can't
link to one event, and gives us no signal on whether anyone returns: there is no /cm event in
Mixpanel (`docs/technical/analytics.md`, grepped 2026-09-28). The ThaiCNX hackathon demo showed that a
native list with categories reads far better, but ThaiCNX is a project to hand to a Thai team. The
audience should accrue to ClarityPledge, which already does the work of maintaining the calendar.

**Question:** Can a native list at /cm, built on the calendar we already maintain, earn weekly
returning visitors? If not, we stop investing in it.

> Founder framing, verbatim: "I don't know if I should put time into the calendar. Maybe I should not."
> and "how it helps me?"

## Appetite

Blast radius: one public page (/cm), plus optionally the /groups/cm Events tab. Reversibility: high.
The iframe page can be restored by revert, and the calendar itself is untouched. Decision density: a
few founder calls, marked below.

## Invariants

- **The public surface shows only what the public calendar already shows.** The events pipeline's
  privacy gate (pp `docs/infra/beeper-digest.md`, 2026-06-04) keeps source groups and non-allowlisted
  links out of the visible calendar. Reading the calendar's **public** feed inherits that gate. Never
  read the private extended properties or the pipeline's own store.
- `/cm` stays in `PROD_HEALTH_ROUTES` (P906 test `p906-csp-frame-src-calendar.test.ts`).
- Viewport-dependent assets mount once, chosen by `matchMedia` and not CSS-hidden siblings
  (decisions.md, BannerDisplay entry citing `chiang-mai-page.tsx`).

## Solution

1. **Data:** a small server-side reader for the calendar's public iCal feed. Verified 2026-09-28: it
   returns HTTP 200 and 1.4 MB, holds 2,715 events, and carries no categories or colours. The browser
   can't fetch it directly (CORS). The reader keeps only upcoming events (today to +14 days), expands
   recurring ones, returns compact JSON with a shared cache, and assigns a category with a whole-word
   keyword classifier. Port it from ThaiCNX `src/categorize.js`, which has already been reviewed for
   the "Chiang **Mai**" ≠ "AI" trap. Where it runs (Supabase edge function or Vercel function) is an
   `/architect` call.
2. **Page:** /cm renders a day-grouped list, with a category filter row, a day filter (today, weekend,
   this week) and text search. Each row shows time, title, venue and category. "Add this calendar to
   yours" stays.
3. **One event, one link:** `/cm/e/<id>` opens an event with its public link and venue map, and has
   share tags so a link pasted into LINE or WhatsApp previews properly.
4. **ClarityPledge's own events** are marked in the list. [FOUNDER DECISION: mark only, or also pin
   them to the top of their day?]
5. **Measure:** Mixpanel `cm_page_viewed`, `cm_filter_used`, `cm_event_opened` and
   `cm_calendar_subscribed`, plus a retention report (visitors who return in a later week). Add them
   to `docs/technical/analytics.md`.
6. **Fallback:** if the reader fails, the page shows the old iframe, never an empty page.

Images: category tiles only. **No generated images.** A made-up picture of a real event misrepresents
it. Organiser posters are out of scope until permission exists.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Keyword categories mislabel some events | ACCEPT | "other" beats a wrong guess; the classifier never guesses. Fix rules as seen |
| iCal feed size or Google rate limits | MITIGATE | Server-side cache; the page never hits Google per visitor |
| Recurring events (RRULE) expanded wrongly | MITIGATE | Test against real recurring entries in the feed |
| Calendar goes stale if the pipeline stops | ACCEPT | Same as today; the reach test fails honestly and we stop |
| A posted event carries attacker-chosen text (pp beeper-digest.md, cross-source merge) | ACCEPT | Pre-existing on the embed; render as text, never HTML |
| Nobody returns | ACCEPT | That is the answer this spec is built to get |

**Non-Goals**
- Do NOT change the events pipeline or the Google Calendar itself.
- Do NOT add accounts, RSVPs, bookings, hosting or voting. ThaiCNX holds those ideas.
- Do NOT generate event images.
- Do NOT change ThaiCNX here. Whether it reads the same JSON is a separate call.

## Acceptance Criteria

- [ ] On a phone, /cm lists this week's events by day, without the Google iframe.
- [ ] Tapping "Sport" leaves only sport events, and "Weekend" leaves only Saturday and Sunday.
- [ ] An event's link opens the same event for someone else and previews with its title in a chat app.
- [ ] ClarityPledge's own events are visibly marked.
- [ ] With the reader down, /cm shows the Google calendar instead of an error or an empty page.

## Done-When

- [ ] No field reaches the page that the public calendar embed does not show. Verified by diffing the
      JSON against the public iCal feed for one week.
- [ ] Classifier tests include "Chiang Mai walking street" → not tech, and "Circuit training" → sport.
- [ ] The four Mixpanel events fire on test (prod-only sending is respected), and are documented in
      `analytics.md`. `[post-deploy]` confirm they arrive in the EU project.
- [ ] `/cm` stays in `PROD_HEALTH_ROUTES`, and the route-coverage gate passes.

## Decision Criteria (pre-registered, the reach test)

[FOUNDER DECISION: the numbers. Suggested shape:] after /cm has been shared once in the groups the
events come from, count **visitors who return in a later week**, excluding the founder. If that stays
below **N** across **K** consecutive weeks, stop investing: keep the page, build nothing more. If it
stays at or above **N**, the next spec may consider organiser submissions or a weekly digest.

## Alternatives Considered

- **Move the calendar to ThaiCNX.** Rejected 2026-09-28: the audience would accrue to a project the
  founder cannot earn from and intends to hand over.
- **Keep the iframe and add analytics only.** It measures visits, but a bare iframe is the weak
  product; returning visitors would test the embed, not the idea.
- **Google Calendar API (v3) with an API key** instead of iCal. It carries `colorId`, but needs a key
  in a public client or a server anyway. Leave it open for `/architect`.

## Open Questions

1. Should /groups/cm's Events tab switch to the same list? It shares `chiang-mai-calendar.ts`.
2. Should ThaiCNX later read this JSON instead of its own import, with credit to ClarityPledge?
