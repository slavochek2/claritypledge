---
name: promote-all
description: "Promote a ClarityPledge event to todo.today, Facebook (personal), Luma, Eventbrite, and Social Layer in one pass"
when_to_use: "After event is published on claritypledge.com. Fans out sequentially across platforms with user-controlled gates."
version: 1.7.0
---

# Promote Event to All Platforms

Wraps `promote-todo-today`, `promote-facebook-personal`, `promote-facebook` (groups), `promote-luma`, `promote-eventbrite`, and `promote-sola` into one sequential pass. Each platform stops for explicit user review before the user clicks Publish / Create event. The wrapper never publishes anything. Social Layer runs only when the series has a `sola_group`.

After all platforms are done, shows the series WhatsApp blurb (or generates a fallback) for the user to paste into chat groups. If the user edits it, the series doc is updated.

## Input

Event slug. If not provided, use the most recent upcoming event from prod.

---

## Steps

### 0. Load operator config

Read `.private/event-operator.json` (repo-relative, gitignored — each operator creates their own; see [docs/events/operator-guide.md](../../../../docs/events/operator-guide.md)). Schema:

```json
{
  "operator_name": "<name the platform browser sessions are logged in as>",
  "platforms": ["todo-today", "facebook-personal", "facebook-groups", "luma", "eventbrite", "sola"],
  "facebook_groups": ["<optional — known groups for promote-facebook, grows run over run>"]
}
```

- **File absent → founder defaults:** operator = Vyacheslav Ladischenski, all platforms. Behavior identical to pre-P901.
- `platforms` filters the step-4 fan-out: a platform not listed is marked `"skipped (not in operator config)"` without invoking its sub-skill.
- Pass `operator_name` to every platform sub-skill — each verifies its browser session is logged in as this operator before filling forms.

### 1. Resolve slug

If user passed a slug, use it. Otherwise query prod (anon key — events are public-read; RLS guards the data):

```bash
# Read the publishable key from .env.prod — never hardcode it here.
# The legacy anon key that used to be inlined in this file was DISABLED on 2026-08-28
# ("Legacy API keys are disabled"), which silently broke this step: the request returns a
# JSON error object rather than a row array, and any code path that assumed a list got a
# confusing type error instead of "your key is dead."
KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env.prod | cut -d= -f2- | tr -d '"'"'"'\'')
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY"
```

**If the response is a JSON object with a `message` field rather than an array, the key is
rejected — stop and report it.** Do not fall back to a hardcoded key.

Extract `slug`, `title`, `description`.

### 2. Load or initialize state cache

State path: `~/.private/event-state/<slug>.json`. Create the directory if missing.

Schema:

```json
{
  "slug": "ai-run-1",
  "series_doc": "docs/events/series/ai-running-club.md",
  "photo_public_url": "https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/ai-run-1.jpg",
  "photo_local_path": "~/Downloads/clarity-event-photo.jpg",
  "status": {
    "todo_today": "pending",
    "facebook_personal": "pending",
    "facebook_groups": "pending",
    "luma": "pending",
    "eventbrite": "pending",
    "sola": "pending"
  },
  "updated_at": "2026-05-12T08:00:00Z"
}
```

`series_doc` is optional. Auto-detect by matching event title against known series title prefixes:

| Title prefix | series_doc |
|---|---|
| `AI Running Club%` | `docs/events/series/ai-running-club.md` |
| `Social Hike%` / `Clarity Hike%` | `docs/events/series/social-hike.md` |

If no match, leave `series_doc` null — fall back to generated blurb in step 5.

If the file exists, read it and resume from the first `pending` platform. Otherwise initialize all three to `pending`.

### 2b. Auth/session preflight — all platforms, one pass

Before any copy review or form-filling, check every platform in this run's scope (per the operator config's `platforms` list from step 0) is logged in as the operator — **together, in one pass**, not discovered one at a time mid-run.

For each in-scope platform, open its base page (todo.today `/my-events/`, `facebook.com` (own profile), `luma.com`, `eventbrite.com`, `sola.day` — only if the series has a `sola_group`) via claude-in-chrome and read the logged-in identity from the page (avatar/name in nav, account menu, etc.). Do not fill any form yet — this is a read-only identity check.

Report one table before proceeding:

```
todo.today:        <logged in as <name> | NOT logged in>
Facebook personal: <logged in as <name> | NOT logged in>
Facebook groups:   <n eligible | NOT logged in>  (same session as Facebook personal)
Luma:              <logged in as <name> | NOT logged in>
Eventbrite:        <logged in as <name> | NOT logged in>
Social Layer:      <logged in as <name> | NOT logged in | n/a — no sola_group>
```

**If any in-scope platform is NOT logged in:** stop here and list exactly which platforms need attention before continuing — this is the fix for Aug 30, where three of five platforms hit auth/consent walls mid-run instead of being caught together at the start. Do not proceed to step 3 until the operator confirms all in-scope platforms are ready (re-run this preflight, or explicitly say which platforms to skip via the operator config's `platforms` list).

### 3. Prepare cover photo once

The banner normally already exists — claritypledge.com auto-generates it when the event is created. Download it (portable, no credentials needed):

```bash
SLUG="<event-slug>"
PUBLIC="https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/${SLUG}.jpg"
LOCAL="$HOME/Downloads/clarity-event-photo.jpg"
curl -s -o "$LOCAL" -w "HTTP:%{http_code} bytes:%{size_download}\n" "$PUBLIC"
```

`HTTP:200` with non-zero bytes → write `LOCAL` and `PUBLIC` to the cache and continue.

**If the banner is missing (404/400):**
- `PROD_SUPABASE_SERVICE_ROLE_KEY` set (founder machine): run `./scripts/event-photo-prep.sh <slug> "<query>"` (generates via Unsplash + uploads to storage; founder-only, macOS-only) and parse its `LOCAL`/`PUBLIC` output.
- No service key (operator machine): stop and tell the user — "The event banner is missing. Open the event on claritypledge.com — the banner auto-generates on creation (use the Regenerate control on the event page if needed) — then re-run." Never attempt the upload path without the service key.

### 3b. Resolve the promo blurb (single source of truth)

This is what makes every platform's description consistent — no per-platform drift.

**Verifying "invoked by the orchestrator" — never trust self-report alone.** The skip below is gated on a fact that must be checked against an artifact, not recalled from conversation memory (a resumed or post-compaction session can misremember whether an earlier orchestrator run happened). Before honoring the skip: the invocation must have passed **both** the resolved blurb text **and** the run-record path `~/.private/event-state/<slug>.run.json`. Read that file now — the skip is valid only if it exists, its `updated_at` is from earlier in *this same session* (not a stale prior run), and `"promote_platforms"` appears in its `stages_in_scope`. If the run-record path was not passed, or the file doesn't exist, or its `updated_at` predates this session's copy-resolution step (run.md step 5) — treat this as a standalone invocation and fall through to the full resolution below, even if the caller claims the text is "already approved."

**If invoked by the events orchestrator (`slava:events:run`) with a resolved blurb passed in, and the run-record check above passes:** use that text verbatim as the canonical promo blurb and **skip the rest of this step entirely, including its own approval stop below**. The orchestrator's step 5 already resolved this text and ran its freshness guard against it; re-resolving would duplicate that work, and stopping to ask about wording would reintroduce the chat copy review the founder removed on 2026-08-31 (*"no need to show me text, i can correct it on live event"*). He reviews this copy in the filled form at the Phase B sweep instead.

**The freshness guard is not skipped with it.** Even on the orchestrator path, assert the passed-in text contains this event's date and cafe name before using it. The guard is a fact check, not a wording approval, and a resolved-but-stale blurb is exactly the failure it exists to catch.

**Otherwise (standalone invocation — no orchestrator, no pre-approved blurb), resolve it here as before:**

**If `series_doc` is set and contains a `## Promo blurb` section:**

1. Read the fenced code block inside `## Promo blurb`.
2. Read `short_link` and `register_cta` from the series-doc frontmatter.
3. Resolve placeholders:
   - `{short_url}` → `claritypledge.com/events/<short_link>?d=<YYMMDD event date>` (the series short link auto-redirects to the latest event — never hardcode a per-event slug here). **The `?d=` suffix is not decoration and is never dropped** — see "Short-link cache-buster" below.
   - `{register_cta}` → the `register_cta` value
4. The result is the **canonical promo blurb**. Pass it verbatim to every platform sub-skill in step 4.

**If `series_doc` is null or has no `## Promo blurb`:** generate the canonical blurb here, so every platform gets the same link discipline:

```
[ONE-LINE HOOK — first non-empty line of the event description]
Full details & registration: claritypledge.com/events/<slug>

[BODY — 2-4 key lines from the event description: what happens, who it's for, what to bring]

Register: claritypledge.com/events/<slug>
```

Pass this as the canonical promo blurb to every platform sub-skill in step 4, same as the series case.

**Link discipline (both branches):** the claritypledge event page is the ONLY destination ever linked — and it appears **twice**: right after the hook AND as the closing Register CTA. "One link only" in the platform skills means one *destination*, not one occurrence.

**Short-link cache-buster (`?d=`) — canonical rule, referenced by every platform sub-skill.**

Every series short link posted anywhere carries `?d=<YYMMDD event date>`, e.g.
`claritypledge.com/events/hike?d=260913`.

**Which URL form.** Use the bare-domain short link `claritypledge.com/<short_link>` whenever
`vercel.json` defines that bare source (grep it: currently `/hike` and `/ai-run`); otherwise use
`claritypledge.com/events/<short_link>` (e.g. `experiment`, which has no bare-domain route).
Both forms route to `api/series-redirect` and resolve identically — the bare form is 7 characters
shorter and is what the group blurbs have always used, so switching them to the `/events/` form
would be an unrequested change to the founder's posted copy. Check `vercel.json`; do not guess.

**The date is the event's date in `Asia/Bangkok`**, the same timezone `{date}` uses — never the
raw UTC date off the `datetime` column. For an evening event the two differ by a day, which
produces a `?d=` that disagrees with the date written in the blurb body and trips the staleness
check for a reason that looks like nothing.

**The format is `YYMMDD` — six digits, and the year is not optional.** Founder chose the short
form over the ISO date (2026-09-07) to buy back characters against Eventbrite's 140-char
Summary cap. The `YY` stays because these preview caches outlive twelve months: a bare `MMDD`
recurs every year, so the 2027-09-13 hike would post `?d=0913` — a URL Telegram already has a
2026 preview cached for — and unfurl last year's card. That is the original bug on an annual
period. Do not shorten further. The direct-slug branch above needs no suffix — a
per-event slug is already unique.

**Why.** Some platforms cache the link preview (OG title, description and image) **per posted
URL, effectively forever**. A series short link is a *stable* URL whose OG content
changes every week, so the second and every later post of `/events/hike` unfurls the **first** hike
ever cached under it — right link, wrong photo, wrong trail name, wrong date, in a card the reader
trusts more than the message body. Nothing on our side can expire that cache; only a distinct URL
gets a fresh fetch. Observed 2026-09-07: a Telegram post announcing "Ban Mai Viewpoint Loop (Mon
Cham)" unfurled a card titled "Doi Pui – Ban Khun Chang Khian" with the previous week's group photo,
while the server was serving the correct new OG tags the whole time.

**Which platforms this actually affects is NOT uniform, and the difference is measurable.**
`api/og.ts` sets `og:url` to the resolved per-event slug — verified 2026-09-07:
`/hike?d=<anything>` returns `og:url = /events/social-hike-...-945871`, unchanged by the query.
A platform that canonicalizes a shared object by `og:url` (Facebook's documented behaviour)
therefore already keys on a URL that is unique per event and would never have shown a stale
card. A platform that keys on the URL as posted (Telegram, per the incident) is the one that
breaks. **We have observed exactly one platform failing and have tested none of the others** —
so `?d=` is applied everywhere as cheap insurance, not because each platform was measured. Do
not write that Facebook/WhatsApp/Sola had this bug; that is unverified and the `og:url` evidence
points the other way.

**No SEO cost.** `?d=` never reaches a content page — the short link 307s to the canonical slug,
and that page's `og:url` is the slug. There is no second indexable URL serving the same content,
so no duplicate-content split to worry about.

**The suffix is inert to routing.** `/events/<series>` and `/hike` both preserve the query string
through the Vercel redirect into `api/series-redirect`, which reads only `series` — verified live,
2026-09-07. So the link resolves to exactly the same event with or without it; the only thing `?d=`
changes is the cache key.

**One premise here is UNVERIFIED, and it is the load-bearing one.** `api/series-redirect.ts`
drops the query string on its final hop (`res.redirect(307, '/events/' + slug)`), so the OG tags
are fetched from a URL that no longer carries `?d=`. The fix therefore assumes each platform
keys its preview cache on the **posted** URL, not the final resolved one. That is the documented
behaviour of every major unfurler and is almost certainly right, but it has NOT been observed
failing or succeeding here — the crawler `curl` in `promote-groups` verifies OG *content*, never
the cache key. Cheapest real proof, still to run: post the same event twice into a scratch chat
under two different `?d=` values and confirm two distinct previews. Until then, treat a correct
unfurl as evidence and do not claim the mechanism is proven.

**Guard:** any resolved blurb containing `claritypledge.com/events/<series>` **without** a `?d=`
query is a hard stop — re-resolve `{short_url}` before posting. Copy a short link out of a previous
week's post and you have reintroduced the bug.

### 4. Fan out — fill every platform, publish none, then ONE review sweep

**The founder reviews the filled tabs, not text in chat.** *"i dont need to go toodo dotday,
then facebok, then luma. all three happen one after another and i just go and click post post
post"* (2026-08-31). The old shape stopped after each platform and waited — five separate
returns to the keyboard for one hike. This shape produces one.

**Phase A — fill, in this order, without stopping.** todo.today → Facebook (personal) →
**Facebook groups** → Luma → Eventbrite → Social Layer. Rationale unchanged: todo.today has the
highest UI friction (tag picker, character truncation), so fail-fast there; Facebook needs visual
cover-photo review; Facebook groups follows it because the personal-post tab is already open and
logged in; Luma is stable; Eventbrite is a multi-step wizard; Social Layer is last and skipped
entirely when the series has no `sola_group`.

**Facebook groups is a platform here, not a separate errand.** It was absent from this list until
2026-09-07, when the founder asked for it mid-run and it had to be added by hand — *"and facebook
gorups also please (and make sure they are there next time)"*. The gap was invisible because
`.private/event-operator.json` has carried a populated `facebook_groups` array since 2026-08-31,
with eligibility and block reasons already researched: the data was there, and nothing read it.
A config key nothing consumes looks exactly like a feature that works. Invoke
`slava:events:promote-facebook` with the slug for every entry where `eligible: true`, and report
each `eligible: false` entry with its reason rather than dropping it silently — an ineligible
group that vanishes from the report is indistinguishable from one nobody checked.

For each platform in turn:
1. Skip if not in the operator config's `platforms` list (step 0) — mark `"skipped (not in operator config)"`.
2. Skip if `status.<platform> === "done"` in cache.
3. Invoke the sub-skill via the Skill tool, passing the slug, the canonical promo blurb from step 3b, the `operator_name` from step 0, **and `batched: true`**.
4. **Leave the platform's tab open and the form filled.** Do not close it, do not navigate away, and do not stop for that platform's own review.

**`batched: true` is what each sub-skill reads to hold its own gate.** A sub-skill invoked
this way fills and verifies its form exactly as it always did — including its write→wait→re-read
confirmation of every field — and then **returns instead of asking**. It still never clicks
Publish or Create. If a sub-skill has a step that genuinely cannot be batched (Luma's date
picker does not accept programmatic input), it reports that in its return so Phase B can list
it as an action for the founder, rather than blocking the fan-out.

**A fill that fails does not stop the sweep.** Record it, move to the next platform, and list
it in Phase B as needing attention. Finding out at the sweep that platform four failed costs a
re-run of one platform; blocking the other three costs the whole batch.

**Phase B — one review sweep.** Once every in-scope platform is filled, come back to the
founder **once** with a numbered list of the open tabs:

```
Ready to publish — 3 tabs open, nothing posted yet:
  1. todo.today  (tab 2) — filled, verified
  2. Facebook    (tab 3) — filled, cover photo attached
  3. Luma        (tab 4) — filled, ⚠ set the date manually (picker is not programmable)

Click Publish / Create in each tab you approve. Reply `done` when finished,
or name any tab you want changed first.
```

State any warnings inline in that list — a truncated description, a missing cover, a manual
step. **This skill still publishes nothing.** *"Every Publish/Create click is the user's,
never the skill's."* (`docs/decisions.md` 2026-05-12 [process]) That rule is unchanged here;
what changed is that the click permission is collected once for all platforms instead of once
per platform. The founder is looking at the real filled forms when he decides, which is a
stronger review than a paragraph of chat text describing them.

After `done`, verify each platform actually posted (read the live listing back — a click that
produced no visible change is unproven, per `.claude/rules/browser.md`) and write the state
cache. Report anything that did not land.

<details>
<summary>Superseded: the old per-platform stop-and-wait (kept for context)</summary>

### 4-legacy. Fan out — sequential, in this order


Order: **todo.today → Facebook (personal) → Luma → Eventbrite → Social Layer**. Rationale: todo.today has the highest UI friction (tag picker, character truncation), so fail-fast there. Facebook needs visual cover-photo review. Luma is a stable UI. Eventbrite is a multi-step wizard (tickets + publish are separate steps the user drives). Social Layer (sola.day) is last — it has a group prerequisite and is skipped entirely when the series has no `sola_group`. The WhatsApp blurb (step 5) always runs after the full fan-out.

For each platform:

1. Skip if the platform is not in the operator config's `platforms` list (step 0) — mark `"skipped (not in operator config)"` and move on.
2. Skip if `status.<platform> === "done"` in cache.
3. Invoke the sub-skill via the Skill tool, passing the slug, **the canonical promo blurb from step 3b** (when resolved), **and the `operator_name` from step 0**:
   - `slava:events:promote-todo-today` with the slug
   - `slava:events:promote-facebook-personal` with the slug
   - `slava:events:promote-luma` with the slug
   - `slava:events:promote-eventbrite` with the slug
   - `slava:events:promote-sola` with the slug — **only if the series has a `sola_group` frontmatter value**; otherwise mark `sola = "skipped"` and move on
4. Wait for user reply:
   - `next` → set `status.<platform> = "done"`, update `updated_at`, write cache, proceed
   - `skip` → set `status.<platform> = "skipped"`, write cache, proceed
   - `abort` → exit cleanly, cache preserved for resume

</details>

### 5. WhatsApp blurb (always last — after the full platform fan-out)

**If invoked by the events orchestrator (`slava:events:run`) with `promote_groups` in scope for this run, verified the same way as step 3b above (read `~/.private/event-state/<slug>.run.json`, confirm `updated_at` is from this session and `"promote_groups"` is in `stages_in_scope`):** skip this step entirely. The orchestrator's step 5 already resolved the group copy, and its own Stage 7 posts it under one combined confirmation covering Facebook groups and chat groups — stopping here for a separate WhatsApp blurb would be an extra approval turn covering ground Stage 7 already covers. (If `promote_groups` was explicitly excluded from this run's scope at Gate 1, or the run-record check fails, run this step as normal — the orchestrator made no verified promise to handle groups for that run.)

**Otherwise (standalone invocation, or orchestrated with groups out of scope), once all platforms are `done` or `skipped`:**

**If `series_doc` is set:**
1. Read the `## WhatsApp blurb` section from the series doc (the fenced code block inside it).
2. Resolve placeholders against the event being promoted:
   - `{date}` → the event date as "MMM D" (e.g. "May 31") in `Asia/Bangkok`
   - `{n}` → the `#N` parsed from the event title (regex `/#(\d+)/`)
3. Show the resolved blurb:
   > Here's the blurb from the series doc — paste it or reply with an edited version:
   > ```
   > [resolved blurb content]
   > ```
   A good blurb states **what the discussion is about, how it helps, and for whom** — not just time/place. If the series blurb is logistics-only, flag that to the user.
4. Wait for user reply:
   - `use` or no reply → use the blurb as-is
   - User pastes edited text → use edited version; if it's a reusable improvement (not a one-off date tweak), update the fenced block in `## WhatsApp blurb` in the series doc **keeping the `{date}`/`{n}` placeholders unresolved** and commit: `git add <series_doc> && git commit -m "docs(events): update WhatsApp blurb for <series>"`

**If `series_doc` is null (no known series):**

Output a generated fallback:
```
🌱 [TITLE]
[ONE-LINE HOOK — first non-empty line of description, trimmed to ~80 chars]
Register: claritypledge.com/events/[SLUG]
```

The user pastes this into chat groups. No automatic sending.

To post this into configured group chats (WhatsApp/Telegram groups that auto-match by event type), run `/slava:events:promote-groups <slug>`.

### 6. Done

Print a 3-line summary:

```
todo.today:        <done | skipped>
Facebook personal: <done | skipped>
Facebook groups:   <done | skipped>  (list each group and its eligible/blocked reason)
Luma:              <done | skipped>
Eventbrite:        <done | skipped>
Social Layer:      <done | skipped>
```

Cache stays at `~/.private/event-state/<slug>.json`. The user can `rm` it to fully reset, or re-run this skill to retry skipped platforms.

---

## Conventions

- **Never publishes.** Every platform stop is the user's, not the skill's. No exceptions.
- **Resume-safe.** Cache lets the user `abort` mid-flow and resume later.
- **Skip-safe.** `skipped` is recorded distinctly from `done` so retries can target skipped platforms.
- **Photo prep runs once per slug.** Re-runs are cheap (HEAD check + redownload) but never re-search Unsplash for the same slug.
