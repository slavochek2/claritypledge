---
name: publish-run
description: "Publish a Clarity trail event (run, hike, trail walk) to claritypledge.com from an AllTrails link"
when_to_use: "When creating a new trail event — run, hike, walk — from an AllTrails link."
version: 3.0.0
---

# Publish Trail Event (Run / Hike / Walk)

Publishes a Clarity trail event to claritypledge.com from an AllTrails link.

## Steps

### 1. Get the AllTrails link

If the user hasn't provided one, ask: "Paste the AllTrails trail link."

**If the user has no link yet and wants help choosing, invoke `/slava:events:select-hike`
instead of improvising a shortlist in chat.** That skill owns candidate search, the
never-again exclusions, the meeting-cafe choice, and the banner-photo ask, and it opens
every candidate in a Chrome tab rather than describing it. It hands back a link, a cafe,
a date and a photo path — the exact inputs steps 2–5 need. Do not duplicate its logic here.

If it ran, it already supplied the meeting cafe (step 4) and the photo (step 8b); take
those values and skip re-asking for them.

### 2. Fetch trail data via Claude-in-Chrome

Use `mcp__claude-in-chrome__tabs_context_mcp` (createIfEmpty: true) to get a tab, then navigate to the AllTrails URL. Use `mcp__claude-in-chrome__get_page_text` to extract:

- **Trail name** (e.g. "Phaeng Noi Waterfall Loop")
- **Distance** (e.g. "3.1 km")
- **Elevation gain** (e.g. "291m")
- **Type** (Loop / Out & back / Point-to-point)
- **Difficulty** (Easy / Moderate / Hard)
- **Rating** (e.g. "4.6")
- **Park/location name**
- **Location/city** (e.g. "Chiang Mai, Thailand" — from the breadcrumb or address)
- **Estimated time** (e.g. "5.5–6 hr" — used to derive duration)
- **Coordinates** from the schema.org JSON: `"geo":{"latitude":"...","longitude":"..."}` — use `javascript_tool` to extract from `<script type="application/ld+json">`
- **Directions link** — look for `href` containing `google.com/maps/dir` in the interactive elements. If found, use it directly. If not found, construct: `https://www.google.com/maps/dir/Current+Location/LAT,LNG`
- **"Getting there" text** from the trail description (e.g. "Park at Doi Pui Visitor Center area") — used as meeting point fallback
- **Entrance fee** — scan description and reviewer tips for fee mentions (e.g. "100 THB", "200 THB foreigners")
- **Weather warnings** — any seasonal notes (smoky season, rainy season, etc.)
- **Alert / Caution banner** — if AllTrails shows a "Caution · N alert" banner near the title, extract its text (closures, hazards, route changes). Surface it to the user even if you can't fold it into the description.
- **Trail highlights** from description (waterfalls, views, forest, villages, etc.)
- **Activity tags** — check if the trail is tagged for "Trail Running" vs "Hiking" / "Walking" — used to pick activity type

### 3. Determine activity type

Auto-detect from AllTrails activity tags:
- Tags include "Trail Running" → **Run** → title prefix "Clarity Run:", pace note in description
- Tags include "Hiking" / no running tag → **Hike** → title prefix "Social Hike:", no pace note
- Tags include both → default to **Hike** unless user specified "run" in their request

If ambiguous, ask once: "Is this a run or a hike?"

**The title prefix is load-bearing — do not vary it.** Three things match events
by title prefix, and all three fail SILENTLY when it drifts:
1. `/hike` and `/events/hike` resolve the next upcoming hike by title match.
2. `.private/event-channels.json` maps a title prefix to the WhatsApp/Telegram
   groups `/promote-groups` posts to — a prefix miss posts to **nothing**, with
   no error, and looks like a successful run.
3. `api/series-redirect.ts` holds the same mapping for the short links.

Renaming the series from "Clarity Hike" to "Social Hike" on 2026-08-24 broke all
three at once and none of them reported it. If you change a prefix, update those
three in the same change.

### 4. Get the meeting point name from Google Maps

Navigate to `https://www.google.com/maps?q=LAT,LNG` (using extracted coordinates) via Claude-in-Chrome. Read the page text to extract the place name and address shown at those coordinates.

**If a named place is found:** use it as the meeting point.

**Verify the name Google actually uses, and copy it exactly.** Search the name
on Google Maps and read the `h1` / page title back. On 2026-08-24 the source
data said "Hmong doi family coffee" while Google's own name was "Hmong Doi Pui
Family Coffee" — three words different. Google was forgiving enough to resolve
it anyway, but a name it cannot resolve sends people to the wrong side of a
mountain, and this is the one field where being wrong costs someone their
morning. Use Google's spelling in both the title line and the link.

Build the link as an explicit **pin**: `https://www.google.com/maps/search/?api=1&query=PLACE+NAME` (URL-encoded).
Never `/maps/dir/Current+Location/...` — that is a route from wherever the
reader is sitting, not a place. (The site-side version of this bug was fixed in
`location-utils.ts` on 2026-08-24; do not reintroduce it here.)

**If no named place (raw coordinates only):** fall back to the "Getting there" text from AllTrails (e.g. "Doi Pui Visitor Center"). Use the directions link from step 2: `https://www.google.com/maps/dir/Current+Location/LAT,LNG`.

### 5. Ask the user 3 questions

Ask all in one message, and **skip any part `select-hike` already resolved** — re-asking a
question the founder answered ten minutes ago is the friction this pipeline exists to remove:
1. **Date & time?** (e.g. "Sunday 21 Jun, 9:00 AM") — skip if already provided
2. **WhatsApp group link?** (for coordination — paste invite link or skip; check prod DB for a recent event in the same city if the user says "same as last time")
3. **Post-activity idea?** (optional — breakfast topic, discussion theme, or skip)
4. **Banner photo?** — ask ONLY if `select-hike` did not run. A path uploads via step 8b; "skip" means the auto-generated banner stands and the photo is not raised again this run.

### 6. Compute duration

**First, branch on route type.** A **loop** brings you back to the start, so completing it is the plan. A **point-to-point** (and any **out & back** whose one-way estimate is > ~4 hr) does NOT — there's no shuttle, so completing it means doubling the distance to get back to the cars. For those, the group walks out to a self-imposed time cap, turns around wherever it is, and returns the same way — it does NOT reach the official endpoint.

**Loop (or short out & back):** derive from AllTrails estimated time:
- Parse the upper bound of the range (e.g. "5.5–6 hr" → 6 hrs)
- Add 60 min buffer for optional after-activity
- Round to nearest 30 min
- Example: 6 hr trail → 6 × 60 + 60 = 420 min

**Point-to-point / long out & back (time-capped turn-around):**
- Ask the user for a walking cap (e.g. "6 hr max walking, then we turn around"). AllTrails' one-way estimate is NOT the trail time here.
- `duration_minutes` = the total event time the user wants (walking cap + breaks + optional after) — ask if unstated; do not derive it from the AllTrails estimate.

For short runs under 2 hr: use 150 min (run + breakfast).

### 7. Generate description — clone the last one, don't start blank

**Read two things first, before writing a word:**

1. `docs/events/series/social-hike.md` — the series memory. Its **Description base** is the
   shape to fill, and its rules section lists what survived founder edits (quotes with star
   ratings, no entrance fee ever, warm-jacket clause only at altitude).
2. **The most recent event in this series, from prod** — the actual last description, which
   is the real reference for tone and for anything the founder improved by hand:

```bash
KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env.prod | cut -d= -f2- | tr -d '"'"'"'\'')
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?title=ilike.Social*Hike*&select=slug,title,datetime,duration_minutes,location,description&order=datetime.desc&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Write the new description by **swapping the trail-specific facts** in that last one — trail
name, park, distance, climb, walk time, highlights, quotes, cafe, meet time, date, weather —
and keeping everything else. Do not regenerate from scratch.

This is the whole point of the series file. Measured across the first two hikes: Aug 30 had
no reviewer quotes; Sept 6 added a trail quote and a cafe quote with star ratings and review
counts, at the founder's explicit request. Regenerating from a blank template would have
silently dropped that improvement on run three. **If the previous description contains
something the base does not explain, keep it and assume it was deliberate** — the founder
edits these by hand.

**If prod returns a JSON object with a `message` field instead of an array, the key is
rejected** — say so and fall back to the series-doc base alone rather than guessing.

**KISS. Hard ceiling: 150 words.** The founder cut the previous template from
350 words to 113 on 2026-08-24 with the note "cut the bullshit". What he removed,
and what must not come back:

- The "**How this works**" philosophy paragraph ("this is about time on the
  trail, not distance or finishing a route"). One clause does the same job:
  *"Relaxed pace, we turn back whenever people have had enough."*
- Section headers for their own sake — "**The direction**", "the full route, we
  won't necessarily do all of it", "Come if you're up for it".
- **Entrance fees.** Do NOT mention a fee, an amount, or a range, even when
  AllTrails states one. The founder is not confident the fee is real or
  collected and does not want it asserted. "some cash" in the bring-list is
  fine; a number is not.
- Hedged safety trivia that a reader cannot act on (a mistaken no-entry sign,
  "expect mosquitos"). Keep a hazard only if it changes what someone packs or
  whether they come. Rain probability: keep. Real closure: keep.

Facts stay; framing goes. Template:

```
Morning [hike/run] this [DAY]. Everyone welcome.

**[TRAIL NAME]**, [PARK NAME]
[DISTANCE] [TYPE], [ELEVATION]m climb, about [TIME] of walking. [2-3 HIGHLIGHTS]. [ONE LINE ON CHARACTER, e.g. "One of the gentler trails up there."]
[View on AllTrails]([ALLTRAILS_URL])

**Meet [TIME] at [VERIFIED PLACE NAME]**, [AREA].
[Directions]([PIN_URL])

[ONE LINE: what happens at the meeting point, parking, pace.]

**Bring:** trail shoes, [2L water / 1L], snacks, rain jacket, cap, mosquito spray, some cash.

[WEATHER — only if actionable, e.g. "Rain likely, around 40 percent."]

[WhatsApp group]([WHATSAPP_LINK]) for questions and cancellations.

[Coffee or lunch after for anyone who feels like it.]
```

If the founder supplied a post-activity topic, add one line for it. If not, omit
the section entirely — do not invent one.

**Prose style:** no em dashes. Commas and full stops. Short sentences.

### 7.5. Review gate — show the draft before publishing

Step 8 writes directly to **prod**. Before that, show the user the assembled draft — title, date/time, meeting point, duration, and the full description — and wait for explicit approval (CLAUDE.md "draft → show → confirm → act"). Do NOT collapse draft + publish into one step. Only proceed to step 8 after the user confirms.

### 8. Publish to prod Supabase

Read credentials from `.env.prod`:
- `VITE_SUPABASE_URL` → Supabase URL
- `VITE_SUPABASE_ANON_KEY` → for public reads only
- Service key via: `supabase projects api-keys --project-ref besjtuodziykmjidubzw`

Host ID is always: `a99042ef-e740-446a-8734-389c8589cc17` (Slava)

Generate slug: `[social-hike|clarity-run]-[trail-name-kebab]-[YYYY-MM-DD]-[6-char-random]` — derived from the title prefix above, kebab-cased
Random suffix: `openssl rand -hex 3`

Parse datetime in `Asia/Bangkok` timezone (UTC+7). Store as ISO 8601 UTC.

Location field: **the pin URL itself**, e.g.
`https://www.google.com/maps/search/?api=1&query=Hmong+Doi+Pui+Family+Coffee`.

The event page does NOT treat this field as a label — `classifyLocation`
(`src/app/prototypes/events/location-utils.ts`) hands plain text to Google as a
search query and renders the raw string as the visible link text, which reads as
a database row. A Google Maps URL is matched first and passed through untouched,
labelled "View on Maps". The place name belongs in the description's meeting-point
line, where a human reads it. Never hardcode a city; derive from the trail.

POST to `/rest/v1/events` using Python (not shell heredoc — interpolation fails):
```python
import json, subprocess
payload = {
    "slug": "...",
    "title": "[Social Hike|Clarity Run]: [TRAIL NAME]",   # prefix per step 3
    "description": "...",
    "datetime": "[ISO 8601 UTC]",
    "duration_minutes": COMPUTED_DURATION,
    "timezone": "Asia/Bangkok",
    "location": "[PLACE NAME], [CITY], Thailand",
    "host_id": "a99042ef-e740-446a-8734-389c8589cc17",
    "max_attendees": None,
    "status": "upcoming"
}
subprocess.run(["curl", "-s", "-X", "POST", url, "-H", ..., "-d", json.dumps(payload)], ...)
```

**Always use Python `json.dumps()` for the payload** — shell variable interpolation breaks multi-line descriptions.

### 8b. Banner photo (only if one was supplied)

The event page has **no custom-upload control** — its "New banner" UI offers Unsplash search
and AI regenerate only (confirmed 2026-08-31). A supplied photo goes in through storage:

```bash
./scripts/event-photo-prep.sh "$SLUG" "<local photo path>"
```

Capture the `PUBLIC=` URL and PATCH the event row's `banner_url` to it (same prod-patch shape
as `re-create-event` step 9).

**Then verify the crop at desktop AND 375 px before any promotion runs.** Faces near the top
of a wide crop get cut, and on 2026-08-31 this was only caught after the banner was live —
adjust the crop offset and re-upload until every face is intact. Fixing it after five
platforms already have the image means re-doing all five.

Note `event-photo-prep.sh` skips the upload when an object already exists at that path
(idempotent HEAD check) — when replacing a banner with a new crop, confirm the storage object's
dimensions actually changed rather than trusting the script's success line.

If no photo was supplied, skip this step entirely.

### 9. Open the event page

Navigate the Chrome tab to: `https://claritypledge.com/events/[SLUG]`

Take a screenshot and report the URL to the user.

---

## Notes

- **Directions link priority:** AllTrails directions link → `Current+Location/LAT,LNG` → raw Maps coords. Never just `?q=LAT,LNG` (that shows the pin but doesn't route from the user's location).
- **Duration** is derived from AllTrails estimated time, not hardcoded.
- **Timezone** is `Asia/Bangkok` for all Thailand events.
- **Location field** is derived from the trail — never hardcoded to a city.
- **Activity type** drives title prefix, description language, and what-to-bring list. The prefix is also what the short links and group-promotion config match on — see step 3.
- **Entrance fee** — do NOT publish one. See step 7: the founder does not want a fee amount asserted, even when AllTrails states one.
- **Payload encoding** — always use `json.dumps()` in Python; shell heredocs silently fail with multi-line descriptions.
- **Duplicate check** after publish: query prod for events with the same title created in the last 5 min.
- Reference `docs/events/process.md` for event type context.
