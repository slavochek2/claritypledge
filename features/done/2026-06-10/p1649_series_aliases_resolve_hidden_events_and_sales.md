---
status: all-done
type: task
rank: 113
workstream: events
created_date: '2026-11-06'
tags: [events, short-links, hidden-events, series-redirect, sales-mastermind, migration]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: sonnet
exec_model: opus
exec_effort: high
spec_review_hash: b75b737ac2e9244d5a440b0147a8ec994456af3ca9a98c88089a5ea3526921ed
spec_review_vendors: [gemini]
completed_at: 2026-11-06
---

# P1649: Series short links resolve hidden events too, and `/sales` joins them

## Problem

**Situation:** `claritypledge.com/hike`, `/night`, `/ai-run`, `/aisafety`, `/spiritual-revolution` and `/next` each redirect to the nearest upcoming event of their series (`api/series-redirect.ts`). That function reads events with the public key and an explicit `is_hidden=eq.false` filter. A hidden event (P1603) is invisible to the public key by design, so no alias can ever land on one.

**Complication:** Two hidden events already exist on prod (the sales mastermind test, Thu 12 Nov, and the full-moon drum circle, Tue 24 Nov). Today `/sales` does not exist, and `/drum` exists only as an unpushed commit (`ac5921dcd`, branch `fix/drum-series-gallery`); even when pushed, both would fall through to the plain `/events` list for these two events.

**Question:** How does an alias reach a hidden event without handing the public key a way to read, search or enumerate hidden rows, and which event wins when a public and a hidden one both match?

> Founder, 2026-11-06 (chat): "yes /sales and /drum get 'resolve hidden too'; Hike and night also hidden resolution .. i think most of our series can be resolved.. if i publish privately nobody really wants to guess anyway"

So the decision is made: for every series alias, hidden means "not listed", not "secret from anyone who knows the series word".

## Appetite

Blast radius: high. It touches the hidden-event boundary that P1603 built, and every series alias. Reversibility: medium (drop one function and one table, revert one file; nothing is rewritten in existing event rows). Decision density: one open founder call (precedence, below).

## Invariants

- **The public key can ask only "where does alias X point?" for an alias on a fixed list, and gets one slug back.** The function takes an alias **key** and nothing else: no title pattern, no series value, no filter, no time cutoff. The rule behind each key lives inside the database (an alias table the public key cannot read or write, seeded by the migration), so a caller cannot widen it. An unknown key returns null. Why this is the load-bearing line: any function the public key may execute is callable over the web by anyone holding that key, with any argument, without going through `api/series-redirect.ts`. A function that took a title pattern would let a stranger pass a wildcard and walk every hidden event on the platform, with or without a series (review finding, 2026-11-06; bound parameters stop injection, not wildcards).
- **The "still upcoming" cutoff is computed inside the function** (now minus the same 5-hour grace the redirect uses today), never passed in, so a caller cannot reach past events by passing an old cutoff.
- Only the **slug** of an event ever leaves the function. No title, description, location, attendee or id; the event page itself still opens only through P1603's exact-slug read.
- Nothing is granted on `events` itself: the public key still cannot select a hidden row, and a title or slug search by a stranger still returns nothing for a hidden event (verified on prod 2026-11-06: stranger list and title search both `[]`, exact-slug read returns the row).
- A cancelled or past event is never returned: `status = upcoming` and the grace cutoff apply to hidden events exactly as to public ones.
- Private rulings: none found. Public ruling carried: decisions.md 2026-11-03 [technical] ("A hidden event is enforced by the database") named as its falsifier *a stranger reaching a hidden event's title, link or attendees without the link*. This spec **deliberately relaxes that for the words on the alias list only**, on the founder's 2026-11-06 call, and the log entry for it is written at ship (`/kdd`), not left implicit.

## Solution

1. **One additive migration** with two things. (a) An alias table: one row per alias key. Columns carry how it matches: either a title prefix or a stored series value (one of the two, never both), a boolean for "no topic set yet", and **at most one** fallback alias key, which must not be the row's own key. Resolution follows **one** fallback hop and no more, so a bad row cannot loop. **The table is closed to the public key**: row-level security on with no policy, and all privileges revoked from PUBLIC, anon and authenticated, because Supabase grants new `public` tables to anon and authenticated by default and a writable alias table would re-open the wildcard (a stranger inserting a row with a pattern of `%`). (b) A read function `key in, slug out` over that table, mirroring P1603's `get_event_by_slug` exactly: **security definer with an empty `search_path`** (without definer it runs as the public key, where P1603's row rule hides every hidden event and the function returns nothing), revoke all from PUBLIC, anon and authenticated, then grant execute to anon, authenticated and service_role, and an assertion block inside the migration that fails it if the function's or the table's grants are wrong. It returns a scalar slug, or null when nothing matches.
   - **Seed rows** carry today's rules unchanged: `hike`, `night`, `ai-run`, `aisafety`, `spiritual-revolution`, `next` (stored series `clarity-night`, no topic set, falling back to `night`), plus the new `sales` (title prefix "Sales Mastermind%", the same prefix style `ai-run` uses) and `drum` (stored series `drum-circle`, no title fallback, taken from `ac5921dcd`).
   - **Adding an alias later is a prod data change plus a redirect line.** That friction is deliberate: only reviewed series words are enumerable.
2. **Precedence is applied across a whole alias's resolution chain, not per step.** `/next` is a chain (placeholder first, then the nearest Clarity Night). Today it is two requests in the redirect; the function owns the chain so the precedence rule holds across it. The chain's own meaning is unchanged: `/next` is by design "the nearest night whose topic is not chosen yet" (P1414), falling back to the nearest night only when no placeholder exists. Resolution order is every step over public events first, then every step over hidden events. Example the review found: a public Clarity Night tomorrow with its topic chosen, and a hidden placeholder next week: `/next` must send strangers to tomorrow's public night, not to the hidden placeholder. Ties on time break deterministically (public before hidden, then time, then id).
3. **`api/series-redirect.ts`** passes only the alias key to the function and redirects to `/events/<slug>`, or to `/events` when the function returns null, keeping today's behaviour for every alias. A failed call to the function (non-OK response, error body) is an error the redirect reports (logged), distinguishable from "no match": today any exception silently becomes `/events`, which would hide a broken migration.
4. **`/sales` and `/events/sales`** are added the way `/hike` is (`vercel.json` pair plus the alias row). Session 2 (online) of the same series is picked up the same way, as the next upcoming.
5. **`/drum` and `/events/drum`** come from the existing drum branch (`ac5921dcd`: a `drum` entry keyed on stored series `drum-circle`, its redirect and its test). This spec builds on that commit or after it, never re-creates it. Its raw-filter shape in the redirect is replaced by the key, so expect a real (small) conflict in `api/series-redirect.ts` and `vercel.json`.
6. Docs that name the old rule are updated: the series short-link text in `.claude/commands/slava/events/promote-all.md` and the series docs that quote it.

**Precedence between a public and a hidden match: agent default, not a founder ruling.** `[FOUNDER DECISION: defaulted 2026-11-06]` The founder was asked (which wins when a private and a public session of one series are both upcoming?) and answered that he did not follow the question: his actual flow is one event, tested privately to confirm the venue and then made public before promotion, so there is only ever one match and nothing to rank. The default is therefore the safe one and is reversible with a one-line ordering change: **a public match wins; a hidden event is returned only when no public event of that series is upcoming.** Two examples, one each way, kept for whoever revisits it:
- *Public wins (default):* a hidden 12 Nov sales test is nearer than a public December session. A public post of `/sales` sends strangers to December, not to a private test.
- *Nearest wins (not chosen):* once the December session is published, `/sales` stops pointing at a hidden session happening that night, for the people holding the link to it.

## Alternatives Considered

- **A function that takes a title pattern or series value from the caller.** Rejected: a wildcard turns it into a search over every hidden event (Invariants).
- **Let the public key read hidden rows.** Rejected: that is the P1603 boundary itself; every table and function that takes an event id would need re-auditing.
- **Use the service key inside the redirect function.** Rejected: puts the all-access key into a request-time function that any alias hit runs; the narrow function reveals strictly less.
- **Opt-in per alias** (the agent's earlier recommendation). Superseded by the founder: all series resolve hidden events.
- **A hard-coded list inside the function instead of a table.** Rejected: equivalent for security, but adding an alias would become a function rewrite; the table (closed to the public key) makes it a reviewed data change. Not an implementer's option.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The function becomes a search over hidden events (wildcard or arbitrary series value) | MITIGATE | Key-only argument, rules inside the database (Invariants); a test that an arbitrary key and a bare wildcard return null. |
| Anyone who guesses an alias word reaches a hidden event's slug and then its page | ACCEPT | Founder's call, 2026-11-06. The page itself still shows no attendee names until RSVP (P1603). |
| A private test shadows a public event on the alias, or the reverse | MITIGATE | Precedence rule across the whole chain (founder decision above); each case is a test. |
| A hidden event's title and banner show in a link preview when its alias is pasted into a chat | ACCEPT | Verified 2026-11-06: `api/og.ts` serves hidden events a share card through the exact-slug read, marked noindex. |
| The redirect ships before the migration reaches prod, so every alias falls back to `/events` | MITIGATE | Migration first (Migration Plan); and the redirect reports a failed function call instead of silently going to `/events`. |
| Adding a new alias needs a prod data change | ACCEPT | Deliberate: only reviewed series words are enumerable. |
| The slug of a hidden event is reachable from the alias word | ACCEPT | It is the intended outcome. |

**Non-Goals**
- Do NOT change any RLS policy or any grant on `events`.
- Do NOT return anything but the slug, and do NOT accept anything but an alias key.
- Do NOT touch the event page, RSVP, `get_event_by_slug` or `api/og.ts`.
- Do NOT re-create the drum alias; take it from `ac5921dcd`.
- Do NOT rename existing alias words.

## Migration Plan

1. Write the migration (alias table plus function; additive). Apply to **test** with main's `./scripts/migrate.sh`, run the Done-When checks there.
2. Apply the same migration to **prod before** the redirect change ships. This is a prod migration and needs the founder's explicit go.
3. Ship the redirect change and `vercel.json` entries; a push needs the founder's explicit "push".

## Rollback Plan

Revert the redirect commit: that restores the exact pre-P1649 state (existing aliases public-only; `/sales` and `/drum` absent again, since their `vercel.json` entries revert with it). The function and table grant nothing on `events` and can stay, or be dropped by a follow-up migration. To keep `/sales` serving public events only, revert just the function call in the redirect and keep the alias entries.

## Done-When

- [x] On test, with the public key: calling the function with a known alias key returns the slug of a hidden upcoming event and **only** that slug (scalar text, null when none), and the redirect's parsing is written against exactly that shape.
- [x] On test, with the public key, **control pair:** the known key returns a slug; an unknown key, an empty key and a bare wildcard each return null. The function has no cutoff, pattern or series parameter.
- [x] On test, with the public key: a direct select of that hidden event from `events` still returns nothing (the P1603 boundary is unchanged).
- [x] On test, with the public key: select, insert, update and delete on the alias table are all refused, and the migration's own assertion block fails when the table's or the function's grants are wrong (exercised by breaking each once).
- [x] **Real wire format, not only mocks:** the redirect's parsing is checked against the actual response of the function on test (scalar text: a JSON string for a match, `null` for none), and the redirect's unit tests mock that same shape. The drum branch's existing test mocks the old row-array shape and must be rewritten.
- [x] Boundary cases, each a test: an event inside the 5-hour grace window resolves and one just outside does not; two events at the same time resolve to the same one every run (tie broken by public first, then id); a bad fallback row (pointing at itself) is refused by the table and cannot loop.
- [x] Precedence follows the founder's decision, as tests that fail when the rule is flipped: one public and one hidden upcoming event of a series; only a hidden one; only a past or cancelled one (goes to `/events`); and the `/next` chain case (public night tomorrow, hidden placeholder next week).
- [x] **A failure is distinguishable from "no match":** a test where the function call fails (error response) asserts the redirect reports it, and a separate test where it returns null asserts `/events`. Neither passes by falling into the same catch.
- [x] **Every** alias has a test, not only the ones the repo covers today (currently only `/next` and `/night`, P1414): `/hike`, `/ai-run`, `/aisafety`, `/spiritual-revolution`, `/sales`, `/drum`, with the existing P1414 cases kept.
- [x] `/sales` and `/events/sales` resolve per the chosen rule once the migration and redirect are live on prod. `[post-deploy]` re-verify with `curl -sI https://claritypledge.com/sales` on prod after the push; note which event is expected at that moment, since a public Sales Mastermind published before the check changes the answer under public-wins. Verified on **test** 2026-11-07: `resolve_series_alias('sales')` with the anon key returned `"sales-mastermind-test"`; prod re-check still owed after the push.
- [x] A decisions.md entry records the deliberate relaxation of the 2026-11-03 hidden-event rule for alias words, with its falsifier.

## Open Questions

1. Precedence between a public and a hidden match is defaulted to public-wins (see Solution). Revisit only if the founder ever runs a private and a public session of one series at the same time.
