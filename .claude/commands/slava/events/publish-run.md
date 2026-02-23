# Publish Trail Run Event

Publishes a Clarity Run event to claritypledge.com from an AllTrails link.

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
- **Coordinates** from the schema.org JSON: `"geo":{"latitude":"...","longitude":"..."}`
- **Directions link** from the interactive elements (look for `href` containing `google.com/maps/dir`)
- **Useful reviewer tips** (entrance fees, opening hours, direction recommendations)
- **Trail description** (highlights: waterfalls, views, forest, etc.)

### 3. Get the meeting point name from Google Maps

Navigate to `https://www.google.com/maps?q=LAT,LNG` (using extracted coordinates) via Claude-in-Chrome. Read the page text to extract the place name and address shown at those coordinates (e.g. "Zoo Cafe, 108/8 Moo 3...").

Construct the clean Maps link: `https://www.google.com/maps/search/PLACE+NAME+ADDRESS` (URL-encoded).

### 4. Ask the user 3 questions

Ask all in one message:
1. **Date & time?** (e.g. "Wednesday 25 Feb, 9:00 AM")
2. **WhatsApp group link?** (for coordination — paste invite link or skip)
3. **Post-run idea?** (optional — breakfast topic, discussion theme, or skip)

### 5. Generate description

Use this template (calibrated from the first Clarity Run event):

```
Please join me for a morning trail run on [DAY] — all welcome, no strings attached.

**The route**
[TRAIL NAME], [PARK NAME]
• [DISTANCE] [TYPE]
• [ELEVATION]m elevation gain
• [TRAIL HIGHLIGHTS from description]
• Running pace: 7–10 km/h
• [View on AllTrails]([ALLTRAILS_URL])

**Meeting point — [TIME]**
[PLACE NAME], [ADDRESS]
[Get directions on Google Maps]([MAPS_LINK])

[ENTRANCE FEE / HOURS from reviews if available]

This is a run — expect 7–10 km/h. The trail has elevation and can be slippery, so it's a proper effort. Come if you're up for it.

**What to bring**
Trail shoes (slippery in places), 1L+ water[, ENTRANCE FEE if applicable].

[IF WhatsApp link provided:]
**WhatsApp group**
For coordination — announcements, cancellations, questions: [Join here]([WHATSAPP_LINK])

---

**After the run — entirely optional**
If anyone feels like grabbing breakfast or coffee nearby, I'll be going. No plan, no agenda, just spontaneous.

[IF post-run idea provided:]
If a conversation happens to start, I'd love to explore this question: [POST-RUN IDEA]. How miscalibration quietly creates friction in relationships, teams, and organisations — and what we can do about it.

Completely optional. No commitment. The run is the run.

I encourage you to read the [Clarity Pledge manifesto](https://claritypledge.com/manifesto) beforehand — it's short and sets the context well.

[IF no post-run idea: omit the entire "After the run" section]
```

### 6. Publish to prod Supabase

Read credentials from `.env.prod`:
- `VITE_SUPABASE_URL` → Supabase URL
- Get service key via: `supabase projects api-keys --project-ref besjtuodziykmjidubzw`

Host ID is always: `a99042ef-e740-446a-8734-389c8589cc17` (Slava)

Generate slug: `clarity-run-[trail-name-kebab]-[YYYY-MM-DD]-[6-char-random]`

Parse datetime in `Asia/Bangkok` timezone (UTC+7). Store as ISO 8601.

POST to `/rest/v1/events`:
```json
{
  "slug": "...",
  "title": "Clarity Run: [TRAIL NAME]",
  "description": "...",
  "datetime": "[ISO 8601 in UTC]",
  "duration_minutes": 150,
  "timezone": "Asia/Bangkok",
  "location": "[PLACE NAME], Ko Phangan, Thailand",
  "host_id": "a99042ef-e740-446a-8734-389c8589cc17",
  "max_attendees": null,
  "status": "upcoming"
}
```

### 7. Open the event page

Navigate the Chrome tab to: `https://claritypledge.com/events/[SLUG]`

Report the URL to the user.

---

## Notes

- All links in descriptions open in new tabs (already handled by the app's markdown renderer)
- Duration is always 150 min (2.5 hrs) for run + optional breakfast
- Timezone is always `Asia/Bangkok` for Ko Phangan events
- If Google Maps doesn't show a named place at the coordinates, fall back to: `[TRAIL NAME] trailhead, Ko Phangan` with the raw coords link
- Reference `docs/events/process.md` for event type context
