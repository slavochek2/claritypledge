---
status: in-progress
type: story
rank: 20
created_date: '2026-08-31'
tags: [events, privacy, rsvp, whatsapp]
delivery_stage: ship
pipeline_ran: [create-spec, inline, finish, ship]
driver: founder
flow: inline
---

# P1194: The event group chat is invisible to the people who need it and public to everyone else

## Problem

**Situation:** every in-person event has a group chat. It is where cancellations, weather calls, and — for a hike an hour up a mountain — rides are arranged. On the 2026-09-06 Doi Pui hike the link exists as one inline sentence in the middle of the description: `[WhatsApp group]` linking out, followed by "for questions and cancellations." The founder's report: *"people don't see the WhatsApp group."*

**Complication, two halves.**

1. **Invisible.** It is a text link with the same visual weight as `[Directions]` and `[View on AllTrails]`, sitting between "Bring:" and "Coffee or lunch after". Nothing about it says *this is where the event actually gets coordinated*. And the copy names only questions and cancellations — never the reason a person without a scooter would care.
2. **Public.** The link is inside `events.description`, and `events` is `SELECT USING (true)`. The invite is readable by anyone who fetches the row — no registration, no account. A WhatsApp community invite in a public JSON payload is a spam surface with no revocation story short of rotating the group.

The existing "hide it until registered" precedent — `locationGated` in `EventDetail`, for virtual events — is **cosmetic only**: the URL still ships to the browser and the gate is a render branch. Reusing it as-is would hide the link from the people who need it while leaving it exposed to the people it is being hidden from.

**Also:** the description's running order buries the payoff. It currently reads what-it-is → meet → walk → **bring** → whatsapp → coffee-after. The founder's ask is structure: what it is → where we meet → walk → coffee after → what to bring → the call to action last.

## Appetite

**Blast radius: medium** — one new table, one read accessor, one gated button on the event page, one field on the create/edit forms. No change to `events` columns and no change to any existing query. **Reversibility: high** — the table is additive; dropping it restores today's behaviour exactly. **Decision density: one open** — the description copy (founder-owned).

## Solution

**1 — a private side table, not a column on `events`.** `event_private_info (event_id PK → events, group_chat_url, updated_at)`. RLS: `SELECT` only for the host or a profile with an RSVP row for that event; `INSERT`/`UPDATE`/`DELETE` host only. A column on `events` cannot be protected without a column-level `REVOKE`, and a `REVOKE` breaks every `select('*')` the events service already runs. The side table also gives future private-by-registration details (exact meeting point, door code) a home.

**2 — a real gate, not a render branch.** The event page fetches the group chat URL in a separate call that returns `null` for anyone not registered. There is no "hidden" value in the page payload to reveal.

**3 — a button, not a sentence.** Below the RSVP affordance: a full-width-on-mobile secondary button, `Join WhatsApp group`, with a one-line reason under it. For non-registered visitors the same slot shows the locked state — the *reason to register*, never the link.
Only ONE full-width primary per view (P955) — RSVP keeps primary; this is secondary.

**4 — provider-derived label.** `chat.whatsapp.com` → "Join WhatsApp group"; `t.me` → Telegram; `signal.group` → Signal; `discord.gg` → Discord; anything else → "Join group chat". Same shape as `classifyLocation`, same `safeLinkHref` scheme guard.

**5 — host editing.** One optional field on create + edit: "Group chat link (registered attendees only)", with an inline hint stating who can see it.

**6 — the description rewrite** for the Doi Pui event, reordered per the founder's structure, with the WhatsApp sentence removed from the body (the button replaces it). `[FOUNDER DECISION: copy]` — drafted, not applied without approval.

## Risks / Non-Goals

- **Non-goal:** retro-gating links already published elsewhere (Facebook, Luma, WhatsApp blasts). This invite is already public; the gate protects it from *here on*, and rotating the group is the founder's call, not this spec's.
- **Non-goal:** touching `locationGated`. Its cosmetic weakness is real and stays out of scope.
- **Risk:** an event whose group chat is the only coordination channel now hides it from people who have not registered — that is the intent, but it raises the cost of a broken RSVP flow. Mitigated by the locked state naming the reason to register.

## Done-When

- [x] `event_private_info` exists with RLS proven by test: anon → 0 rows, authenticated non-RSVP → 0 rows, RSVP'd → 1 row, host → 1 row.
- [x] The event page shows a `Join WhatsApp group` button to a registered attendee and the host, and a locked reason-to-register line to everyone else.
- [x] The URL is absent from the network payload for a non-registered viewer.
- [x] Create and edit forms accept, persist, and round-trip the group chat link.
- [x] Label derives from the URL provider; a non-http scheme yields no href.

## Next Steps

These are **operator actions on production data**, deliberately not Done-When items: no
commit on this branch can close them, and a criterion the repo cannot verify does not
belong in a gate the repo enforces.

1. Migrate prod (`./scripts/migrate.sh --env prod`) — the table does not exist there yet.
2. On the Doi Pui event's edit form, paste the group chat invite into **Group chat link**.
3. Replace the description with the reordered copy **and delete the inline WhatsApp
   sentence** — until it is gone the invite is still public in the body, and the gate
   protects nothing.
4. Consider rotating the WhatsApp invite: the current one has been public since the event
   was published, so the gate gives it privacy only going forward.

## Invariants

- A group chat URL is never serialized to a client that is neither the host nor an RSVP'd attendee.
- The RSVP button stays the only full-width primary on the event page.
