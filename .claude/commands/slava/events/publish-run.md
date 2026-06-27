---
name: publish-run
description: "Publish a Clarity trail event (run, hike, trail walk) to claritypledge.com from an AllTrails link"
when_to_use: "When creating a new trail event — run, hike, walk — from an AllTrails link."
version: 2.0.0
---

# Publish Trail Event (Run / Hike / Walk)

Publishes a Clarity trail event to claritypledge.com from an AllTrails link.

## Steps

### 1. Get the AllTrails link

If the user hasn't provided one, ask: "Paste the AllTrails trail link."

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
- Tags include "Hiking" / no running tag → **Hike** → title prefix "Clarity Hike:", no pace note
- Tags include both → default to **Hike** unless user specified "run" in their request

If ambiguous, ask once: "Is this a run or a hike?"

### 4. Get the meeting point name from Google Maps

Navigate to `https://www.google.com/maps?q=LAT,LNG` (using extracted coordinates) via Claude-in-Chrome. Read the page text to extract the place name and address shown at those coordinates.

**If a named place is found:** use it as the meeting point; construct the Maps search link as `https://www.google.com/maps/search/PLACE+NAME+ADDRESS` (URL-encoded).

**If no named place (raw coordinates only):** fall back to the "Getting there" text from AllTrails (e.g. "Doi Pui Visitor Center"). Use the directions link from step 2: `https://www.google.com/maps/dir/Current+Location/LAT,LNG`.

### 5. Ask the user 3 questions

Ask all in one message:
1. **Date & time?** (e.g. "Sunday 21 Jun, 9:00 AM") — skip if already provided
2. **WhatsApp group link?** (for coordination — paste invite link or skip; check prod DB for a recent event in the same city if the user says "same as last time")
3. **Post-activity idea?** (optional — breakfast topic, discussion theme, or skip)

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

### 7. Generate description

Use this template, adapting activity-specific language:

```
Please join me for a morning [hike/run] this [DAY] — all welcome, no strings attached.

**The route**
[TRAIL NAME], [PARK NAME]
• [DISTANCE] [TYPE]
• [ELEVATION]m elevation gain
• [TRAIL HIGHLIGHTS — peaks, views, forest, villages, waterfalls, etc.]
• Hard difficulty — steep sections, can be slippery  ← only if Hard
• [View on AllTrails]([ALLTRAILS_URL])

**Meeting point — [TIME]**
[PLACE NAME], [LOCATION/CITY]
[Get directions on Google Maps]([DIRECTIONS_LINK])

[ENTRANCE FEE if found — e.g. "National park entrance fee: ~200 THB (foreigners) / 100 THB (Thai) — bring cash."]
[WEATHER WARNING if found — e.g. "Note: avoid March–May (smoky season)."]

[IF loop / short out & back:] This is a [full-day hike / trail run]. Expect [ESTIMATED TIME] on trail[, with steep ascents and descents if Hard]. Come if you're up for it.

[IF point-to-point / time-capped turn-around:] This is a full-day hike. The full route is a [DISTANCE] point-to-point ([ESTIMATED TIME] one way), so we won't complete it — we'll walk up to ~[WALKING CAP]h toward [ENDPOINT], turn around wherever we are, and head back the same way. Total ~[DURATION]h with breaks. Come if you're up for it.

**What to bring**
Trail shoes (slippery in places), [2L+ water for hikes / 1L+ for short runs], snacks[, ENTRANCE FEE if applicable], rain jacket (weather can change fast), sun protection + cap, mosquito spray, long pants recommended.

[IF WhatsApp link provided:]
**WhatsApp group**
For coordination — announcements, cancellations, questions: [Join here]([WHATSAPP_LINK])

---

**After the [hike/run] — entirely optional**
If anyone feels like grabbing [coffee/breakfast/lunch] nearby[./ , I'll be going.]

[IF post-activity idea provided:]
If a conversation happens to start, I'd love to explore this question: [POST-ACTIVITY IDEA]. How miscalibration quietly creates friction in relationships, teams, and organisations — and what we can do about it.

[IF no post-activity idea: keep "After" section short — one sentence only]

[IF Run:]
I encourage you to read the [Clarity Pledge manifesto](https://claritypledge.com/manifesto) beforehand — it's short and sets the context well.
```

**Activity-specific language:**
- Hike: "morning hike", "full-day hike", "hike is the hike" → omit pace note
- Run: "morning trail run", "7–10 km/h", "the run is the run", include manifesto link

### 7.5. Review gate — show the draft before publishing

Step 8 writes directly to **prod**. Before that, show the user the assembled draft — title, date/time, meeting point, duration, and the full description — and wait for explicit approval (CLAUDE.md "draft → show → confirm → act"). Do NOT collapse draft + publish into one step. Only proceed to step 8 after the user confirms.

### 8. Publish to prod Supabase

Read credentials from `.env.prod`:
- `VITE_SUPABASE_URL` → Supabase URL
- `VITE_SUPABASE_ANON_KEY` → for public reads only
- Service key via: `supabase projects api-keys --project-ref besjtuodziykmjidubzw`

Host ID is always: `a99042ef-e740-446a-8734-389c8589cc17` (Slava)

Generate slug: `clarity-[hike/run]-[trail-name-kebab]-[YYYY-MM-DD]-[6-char-random]`
Random suffix: `openssl rand -hex 3`

Parse datetime in `Asia/Bangkok` timezone (UTC+7). Store as ISO 8601 UTC.

Location field: `[PLACE NAME], [CITY], Thailand` — never hardcode "Ko Phangan"; derive from trail location.

POST to `/rest/v1/events` using Python (not shell heredoc — interpolation fails):
```python
import json, subprocess
payload = {
    "slug": "...",
    "title": "Clarity [Hike/Run]: [TRAIL NAME]",
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

### 9. Open the event page

Navigate the Chrome tab to: `https://claritypledge.com/events/[SLUG]`

Take a screenshot and report the URL to the user.

---

## Notes

- **Directions link priority:** AllTrails directions link → `Current+Location/LAT,LNG` → raw Maps coords. Never just `?q=LAT,LNG` (that shows the pin but doesn't route from the user's location).
- **Duration** is derived from AllTrails estimated time, not hardcoded.
- **Timezone** is `Asia/Bangkok` for all Thailand events.
- **Location field** is derived from the trail — never hardcoded to a city.
- **Activity type** drives title prefix, description language, and what-to-bring list.
- **Entrance fee** — extract from AllTrails; if not found, omit rather than guess.
- **Payload encoding** — always use `json.dumps()` in Python; shell heredocs silently fail with multi-line descriptions.
- **Duplicate check** after publish: query prod for events with the same title created in the last 5 min.
- Reference `docs/events/process.md` for event type context.
