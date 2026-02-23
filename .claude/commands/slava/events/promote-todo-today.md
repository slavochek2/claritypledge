# Promote Event on todo.today

Promotes a Clarity Pledge event on todo.today by filling the Create Event form. Stops before submitting — user reviews and publishes.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

Get service key: `supabase projects api-keys --project-ref besjtuodziykmjidubzw`

Query: `GET /rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1` (or filter by slug).

Fields needed: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse datetime in `Asia/Bangkok` (UTC+7) to get local date, start time, end time.

### 2. Find Unsplash photo

Use `UNSPLASH_ACCESS_KEY` from `.env.local`.

Search based on event type:
- Trail run: `"trail running jungle waterfall"` then `"jungle trail path"`
- Pick the best landscape result. Download to `~/Downloads/clarity-event-photo.jpg`.

### 3. Open todo.today

Use Claude-in-Chrome: new tab → navigate to `https://todo.today/my-events/` → click **Create Event +**.

### 4. Upload photo via JS

Click the Upload area (triggers hidden file input), then inject the image:

```js
(async () => {
  const response = await fetch('[UNSPLASH_URL]');
  const blob = await response.blob();
  const file = new File([blob], 'event-photo.jpg', { type: 'image/jpeg' });
  const input = document.querySelector('input[type="file"]');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()
```

When the media library opens, select the image and click **Add**.

### 5. Fill the form

| Field | Value |
|-------|-------|
| Event Title | verbatim from DB (max 80 chars) |
| Event Date | MM/DD/YYYY |
| Start Time | local time (Asia/Bangkok) |
| End Time | start + duration_minutes |
| Host | Vyacheslav Ladischenski |
| More Details | see description template below |
| Tags | trail run → Sports, Hiking, running, Nature Trip |
| Walk-In | unchecked (registration is required) |
| Where | Koh Phangan (or relevant city) |
| Select Event Venue | search for meeting point name (e.g. "Zoo Cafe") |
| Exchange | Free |

### 6. Description template (max 800 chars)

**Rules:**
- No links except the claritypledge event page (one link only, at the end)
- No WhatsApp links, AllTrails links, or any other URLs
- No optional post-run section (belongs on the claritypledge page, not here)
- Always end with "Registration is required."

```
[1-line hook — e.g. "Morning trail run on Ko Phangan — all welcome!"]

[Trail/format info]
• [distance] loop through [terrain]
• [elevation]m elevation gain · [highlights]
• Pace: 7–10 km/h (this is a run, not a hike)

📍 Meeting point [TIME]: [VENUE NAME], [brief location note]
[Entry fee if applicable]

What to bring: [list]

Registration is required. Full details and sign-up:
claritypledge.com/events/[SLUG]
```

### 7. Stop — let user review

Do **NOT** click Create Event. Take a screenshot, scroll to show full form, report what was filled. User publishes manually.

---

## Conventions

- **Host name**: always `Vyacheslav Ladischenski`
- **Photo**: always from Unsplash, relevant to the event (jungle/waterfall for trail runs)
- **One link only**: the claritypledge.com event page — it's the registration page and the source of truth
- **Exchange**: always Free (the 100 THB park entry is not our fee)
- **Venue**: search by meeting point name — Zoo Cafe is already in the Koh Phangan venue list
