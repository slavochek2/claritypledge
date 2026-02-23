# Promote Event on Facebook Groups

Promotes a Clarity Pledge event by creating Facebook Events in relevant local groups. Stops before submitting each — user reviews and publishes.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

Get service key: `supabase projects api-keys --project-ref besjtuodziykmjidubzw`

Query: `GET /rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1` (or filter by slug).

Fields needed: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse datetime in `Asia/Bangkok` (UTC+7) to get local date, start time, and end time (start + duration_minutes).

### 2. Find Unsplash cover photo

Use `UNSPLASH_ACCESS_KEY` from `.env.local`.

Search based on event type:
- Trail run: `"trail running jungle waterfall"` then `"jungle trail path"`

Pick the best landscape result. Download to `~/Downloads/clarity-event-photo.jpg`.

### 3. Discover relevant Facebook groups

Use Claude-in-Chrome. Check the session is logged in as **Vyacheslav Ladischenski** before proceeding.

Open a new tab and search Facebook for groups matching the event's location. Derive search terms from the event's `location` field — for Ko Phangan events use:

- `"Koh Phangan expats"`
- `"Koh Phangan community"`
- `"Digital Nomads Koh Phangan"`
- `"Koh Phangan fitness"` / `"Koh Phangan running"`

For events in other locations, adapt the keywords to the city/island name and equivalent community terms.

For each result, note:
- Group name + member count
- Public or private
- Already a member?
- Has an Events tab?

**Prioritise:** Public groups with an Events tab. Skip private groups not yet a member of — list them separately for manual follow-up.

**Known Ko Phangan groups:**
- Koh Phangan expats community — 8.4K members, public ✓
- Digital Nomads Koh Phangan — verify current status on each run

### 4. For each eligible group — fill the Create Event form

Navigate to the group's Events tab → click **Create Event**.

#### 4a. Cover photo

Upload the Unsplash photo downloaded in Step 2 using the cover photo field at the top of the form.

#### 4b. Fill the form fields

| Field | Value |
|-------|-------|
| Event name | verbatim from DB (max 100 chars) |
| Start date | local date (Asia/Bangkok) |
| Start time | local time (Asia/Bangkok) |
| End date | same as start date |
| End time | start time + duration_minutes |
| Time zone | GMT+7 |
| In person / virtual | In person |
| Location | meeting point name + city (e.g. "Zoo Cafe, Ko Phangan") — use "Just use [text]" if no match |
| Who can see it? | the group (already pre-filled) |
| Description | see template below |

**Do NOT click "Create event".** Take a screenshot of the completed form.

### 5. Description template

**Rules:**
- One link only: the claritypledge event page (registration + full details)
- No WhatsApp links, AllTrails links, or any other URLs

For trail runs:
```
[1-line hook]

• [distance] loop through [terrain]
• [elevation]m elevation gain · [key highlight]
• Pace: 7–10 km/h (this is a run, not a hike)

📍 Meet at [TIME]: [VENUE], [brief location note]
[Entry fee if applicable]

What to bring: trail shoes, water (1.5L+), snacks, small backpack

Registration is required. Full details and sign-up:
claritypledge.com/events/[SLUG]
```

### 6. Report to user

For each group processed, show:
- Group name + member count
- Screenshot of completed event form
- Status: ready to submit / skipped (reason)

Also list any **private groups not yet joined** so the user can request to join and rerun later.

**Do NOT submit any form.** User reviews each and publishes manually.

---

## Conventions

- **Account**: always Vyacheslav Ladischenski — verify session before starting
- **One link only**: `claritypledge.com/events/[slug]` — registration page and source of truth
- **Cover photo**: always from Unsplash, relevant to event type (jungle/waterfall for trail runs)
- **End time**: always fill — start time + duration_minutes from DB
- **Location**: use the meeting point name; choose "Just use [text]" if Facebook doesn't find the exact venue
- **Time zone**: always GMT+7 (Asia/Bangkok)
- **Private groups**: flag but do not attempt to join automatically — list for manual follow-up
