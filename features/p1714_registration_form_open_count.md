---
status: week
type: story
rank: 353
workstream: events
created_date: '2026-11-19'
tags: [events, registration, measurement, hikes]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
spec_review_hash: a9e7b863519c93cad805507f3dd0d0e52fc02c24e2098164f20881e7c51d5ea0
spec_review_vendors: [codex, gemini, openrouter]
---

# P1714: Count who opens an event's registration form and who leaves without registering

## Problem

**Situation:** Since P1529 (mastermind) and P1675 (hikes), "Reserve a seat" opens a short form before the seat, and on a hike that asks, the short introduction is required. The closest existing signal is the client-side Mixpanel event `event_rsvp_initiated` (`src/app/prototypes/events/components/EventDetail.tsx`, in `handleRsvp`). It measures intent, not a form open: it fires before the handler branches to the form, to sign-up or to a direct seat, and before the signed-in write check. Mixpanel records production only. The registration itself (`event_rsvps`, plus `event_hike_answers` or the mastermind answers) is on the server.
**Complication:** In P1675's UAT the founder asked how people react to a required introduction, and in round 4 (2026-11-19) agreed to count form opens on the server. Without a server count of form opens, a falling registration number cannot be told apart from fewer visitors.
**Question:** Record each registration-form open on the server, so the founder can see per event how many opened the form and how many of them registered.

> Founder framing, verbatim (P1675 UAT, 2026-11-18): *"And how do we deal with people who come without preparation? Because I already expect 90% of them not doing it."*
>
> Founder, 2026-11-19, on counting form opens on the server: *"decision 3: ok add then"*

## Appetite

Blast radius: medium. It adds one table, one write function that signed-out visitors can call, and one read function, and touches the registration step where the form opens. Registration itself must not change. Reversibility: high (additive migration; a client call that fails quietly). Decision density: two founder calls (below), one of them with a recommended default.

## Solution

**Recommended design: no identifier for signed-out visitors.** The repo's closest precedent is P1347's topic voting, which started with a per-device token and was moved to signed-in only by founder decision (`supabase/migrations/20261001220000_p1347_signed_in_votes.sql`: *"we don't count anonymous votes"*). A per-browser id would also need a privacy-policy change (below), and it breaks when the sign-in link opens in another browser, which the app supports on purpose (`src/auth/AuthVerifyPage.tsx`).

- **What counts as an open:** the registration form (hike or mastermind) becoming visible to a person who is not yet registered for the event. One place records it: where the registration step shows the form (`registration.ask` in `use-registration-step.ts`). That one place covers both the Reserve tap and the sign-in return that reopens the form. A person who is already registered and reopens the form to change answers records nothing. One-tap events (Clarity Night, a hike with `hike_registration = 'optional'`) never show the form, so they record nothing.
- **Signed in:** one row per event and profile. The identity comes from `auth.uid()` inside the function, never from a parameter. A repeat open changes nothing (`ON CONFLICT DO NOTHING`).
- **Signed out:** one row per open, with no identifier of any kind: no profile, no browser id, no IP. It feeds only the signed-out open count.
- **Signed-out visitors who come back:** when the sign-in return finds the saved answers and submits them without showing the form, the client records a "returned" mark for the now signed-in profile and event. This links a signed-out form to its registration without any browser id. If the sign-in link opens in another browser, the saved answers are not there. The form then opens signed in and counts as a signed-in open, and the earlier signed-out open stays in the signed-out count with no attributed registration. This is an undercount of signed-out conversion, labelled as such in the read.
- **Write function:** `SECURITY DEFINER`, `SET search_path`. EXECUTE is revoked from PUBLIC, then granted to `anon` and `authenticated`. It is listed in `scripts/anon-execute-allowlist.txt` with its reason and call site, and added to P1045's inventory of unauthenticated write surfaces. It refuses quietly (returns false, never raises, so nothing reaches Sentry) when:
  - the event does not exist or is cancelled;
  - its start has passed;
  - it does not ask before the seat. The function decides this server-side from the event row (the mastermind, or a hike whose `hike_registration` is not `'optional'`), never from the client.
  - Hidden events still count, because their page is reachable by link (Wat Pha Lat runs hidden).
- **Rate limit (P1278 ruling: every anonymous write path carries an explicit one):**
  - at most 30 signed-out rows per event per hour;
  - at most 100 signed-out rows per hour across all events.
  - Past either limit the function returns false and writes nothing.
  - The read reports `capped = true` for an event that hit its limit in the counted period, so a flood shows up as a flag rather than silently blinding the count.
  - Signed-in rows are not limited: one per profile per event by the unique key.
- **The client call is fire-and-forget.** The form never waits on it, and a failed or refused write is swallowed. It is skipped for traffic that P1669 tags as a bot (the `navigator.webdriver` and headless signals in `index.html`). P1714's own e2e test sets an explicit override.
- **Reading the number:** no client role has SELECT on the table. A read function returns aggregates only, never rows or profile ids:
  - signed-out opens;
  - signed-in opens;
  - registered after a signed-in open: an `event_rsvps` row for the same event and profile, existing at read time, created at or after the open;
  - waiting list after a signed-in open: an `event_waitlist` row on the same terms;
  - returned from a signed-out form, and how many of those are registered;
  - `capped`.
  - It is a snapshot: a cancelled or removed registration no longer counts, and "not registered" means "not registered as of now", labelled that way.
  - People already registered before their open never produce a row, so registered can never exceed opened.
  - [FOUNDER DECISION: who may call the read: the founder only (admin check, the P1381 `assert_admin()` pattern, run from a query or the admin area), or also the event's host as a line on the event page ("12 opened the form, 7 registered"). Recommended: founder only first; widen once the numbers have been checked.]
- **Alternative, not recommended: a random per-browser id for signed-out visitors.** It would count a signed-out person who opens three times as one, and join their open to their registration in the same browser. It needs:
  - a new line in the privacy policy. `src/app/content/privacy.md` says our local storage keys exist *"so that a refresh does not lose your place"*; a counting id is measurement, and the policy has no retention or erasure entry for one.
  - a server-issued id scoped to one event, with a short life, so it cannot link one visitor across events.
  - a claim step after sign-in that binds it to the profile.
  - It still breaks across browsers.
  - [FOUNDER DECISION: keep the recommended design (no signed-out identifier), or take this alternative and the policy change it needs.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A script floods the signed-out count, or fills another event's limit to blind it | MITIGATE | Per-event and global hourly limits; the read shows `capped`; the function refuses one-tap, past and cancelled events server-side. |
| Signed-out conversion is undercounted when the sign-in link opens in another browser | ACCEPT | No identifier is the privacy choice; the read labels the signed-out conversion as a lower bound. |
| The open is recorded but the form never rendered (a crash right after) | ACCEPT | The call sits where the form is shown, after the decision to show it; rare, and the count is for a trend, not billing. |
| Bot and smoke traffic inflates opens | MITIGATE | The client skips P1669-tagged traffic; the e2e test opts in explicitly. Anything left is bounded by the rate limit. |
| Signed-in rows record that a person considered an event they did not join | ACCEPT | Visible only as aggregates to the reader chosen above; rows go with the profile and the event (`ON DELETE CASCADE`), so account erasure removes them. |

**Non-Goals**
- Do NOT change how registration works, what the form asks, or the seat trigger. The only client change is the fire-and-forget call where the form is shown and on the sign-in return.
- Do NOT remove or change the Mixpanel `event_rsvp_initiated` event.
- Do NOT count page views; only form opens.
- Do NOT record which answers a person picked before leaving (no partial answers stored).
- Do NOT store any identifier for a signed-out visitor (unless the founder picks the alternative above).

## Invariants

- A failed, slow or refused open write never blocks or delays the form or the registration (the count fails open; the seat never depends on it).
- Nothing but the write function inserts into the table; no client role has INSERT, UPDATE, DELETE or SELECT on it.
- A signed-in opener's identity is `auth.uid()`; no parameter can record an open for another person.
- A signed-out row carries no identifier.
- Every anonymous-callable function carries an explicit rate limit and an allowlist entry (P1278, P1064).

## Acceptance Criteria

Counts are asserted as deltas on an event seeded for the test, never as absolute numbers.

- [ ] Signed in, tapping Reserve on a hike that asks, then closing the form: the read shows signed-in opens +1, registered +0.
- [ ] The same person opening the form twice: signed-in opens +1 in total.
- [ ] A person already registered who reopens the form to change answers: no change.
- [ ] Signed out, opening the form: signed-out opens +1, and the new row has no profile and no other identifying column.
- [ ] Signed out, filling the form, signing in in the same browser so the saved answers submit: returned +1, returned-and-registered +1.
- [ ] A one-tap event (Clarity Night, an optional hike): the client makes no call, and a direct call to the function returns false with no row.
- [ ] A direct call for an unknown, cancelled or past event returns false, writes no row, and raises no error.
- [ ] The 31st signed-out open on one event within an hour writes no row, the read shows `capped = true`, and a signed-in open on that event still records.
- [ ] With the write held pending (never settling) and with it rejecting, the form is interactive at once and registration completes.
- [ ] Against a row seeded through a privileged control: direct REST insert, update, delete and select as `anon` and as an ordinary signed-in user all fail or return nothing, and the table is unchanged; the legitimate function call succeeds as a positive control.
- [ ] The read function refuses a caller outside the role chosen in the founder decision (an ordinary user, and, if hosts may read, another event's host).
- [ ] A browser with `navigator.webdriver` set (and no test override) makes no call.
- [ ] The write function is in `scripts/anon-execute-allowlist.txt` and the grant drift check passes.

## Cost Budget

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 1 write per form open + 1 per sign-in return = at most 2 per person per event | worst case at the limit: 100 signed-out + signed-in writes (at most 1 per person per event) | about 15 calls (13 criteria, a few calls each, mostly direct function calls) |
| Egress (bytes) | 2 calls x about 0.5 KB response = about 1 KB | 100 x 0.5 KB = 50 KB at the limit | 15 x 0.5 KB = about 8 KB |
| Log lines | 0 on success; refusals return false and log nothing | 0 | 0 |
| Service unit | none (no edge function, no Gemini) | none | none |

1. **Fits the plan limit today?** Fits. Registry row: Supabase Free plan, egress 5 GB, database 500 MB, no request cap. Monthly worst case for a sustained flood is the global limit x 730 = 100 x 730 = 73,000 signed-out rows: about 7 MB of table (about 100 bytes a row) and 73,000 x 0.5 KB = about 37 MB egress. Normal use is 2 x (people who open a form a month), far below that.
2. **Rule 1 (bulk on the server):** each call is one person's own action; the read is one aggregate query per event. Nothing loops on the client.
3. **Severity:** low. The hourly limits bound the worst case.

## Related

- P1675 (hike registration asks before the seat; UAT round 4 asked for this count). This builds after P1675 ships, since the hike form arrives with it.
- P1529 (the mastermind registration form and the saved answers across sign-in).
- P1347 (topic voting: the anonymous device token that was retired by founder decision).
- P1278 (anonymous write paths carry an explicit rate limit), P1064 / P1065 (anon-execute allowlist and grant drift check), P1045 (inventory of unauthenticated write surfaces).
- P1542 (`group_chat_opens`: a signed-in-only, server-written open table; the table permissions carry over, its write path does not).
- P1669 (bot tagging in `index.html`).
