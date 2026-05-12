---
name: promote-todo-today
description: "Promote a ClarityPledge event on todo.today"
when_to_use: "After event is published on claritypledge.com."
version: 1.0.0
---

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

### 2. Prepare cover photo

Run `./scripts/event-photo-prep.sh <slug> "<query>"` via Bash. Parse the two output lines:

```
LOCAL=<absolute path to ~/Downloads/clarity-event-photo.jpg>
PUBLIC=<Supabase public URL>
```

Query suggestions by event type:
- Trail run: `"trail running jungle waterfall"`
- AI Run / talk: `"morning coffee laptop community"`
- Generic: omit the second arg (defaults to `"morning running lake park"`)

The helper is idempotent — second invocation for the same slug skips Unsplash and downloads the existing Supabase object back to the local path.

### 3. Open todo.today

Use Claude-in-Chrome: new tab → navigate to `https://todo.today/my-events/` → click **Create Event +**.

### 4. Upload photo

Click the Upload area (triggers hidden file input). Use the Claude-in-Chrome `file_upload` MCP tool with the `LOCAL` path from step 2.

**Fallback if `file_upload` denied:** tell the user to drag `~/Downloads/clarity-event-photo.jpg` onto the upload area manually (5-second step), wait for them to confirm before proceeding.

When the media library opens, select the just-uploaded image and click **Add**.

### 5. Fill the form

| Field | Value |
|-------|-------|
| Event Title | verbatim from DB (max 80 chars) |
| Event Date | MM/DD/YYYY |
| Start Time | local time (Asia/Bangkok) |
| End Time | start + duration_minutes |
| Host | Vyacheslav Ladischenski |
| More Details | see description template below |
| Tags | by event type — see tag table + resolution pattern below |
| Walk-In | unchecked (registration is required) |
| Where | Koh Phangan (or relevant city) |
| Select Event Venue | search for meeting point name (e.g. "Zoo Cafe") |
| Exchange | Free |

#### Tag selection (display names, resolved at runtime)

Choose by event type:
- **Trail run:** `Sports`, `Hiking`, `running`, `Nature Trip`
- **AI Run / talk / coffee session:** `Coffee`, `Networking`, `running`, `Community`, `Communication`

**Why names, not IDs:** todo.today's `<option>` IDs are server-generated and change on deploy. Names are stable.

**Resolution pattern (run via `javascript_tool` for each tag name):**

```js
(() => {
  const select = document.querySelector('select[name="event_category"], select#event_category, [data-testid="event-category-select"]');
  const want = ['Coffee', 'Networking', 'running']; // edit list
  for (const name of want) {
    const opt = [...select.options].find(o => o.textContent.trim().toLowerCase() === name.toLowerCase());
    if (opt) { opt.selected = true; }
    else { console.warn('tag not found:', name); }
  }
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()
```

If the page uses a chip/combobox widget instead of `<select>`, fall back to typing each name into the search input and clicking the matching dropdown option.

### 6. Description template (max 800 chars)

**Rules:**
- No links except the claritypledge event page (one link only, at the end)
- No WhatsApp links, AllTrails links, or any other URLs
- No optional post-run section (belongs on the claritypledge page, not here)
- Always end with "Registration is required."

**Truncation rule (preserves footer):**

```js
const footer = `\n\nRegistration is required. Full details: claritypledge.com/events/${slug}`;
const max = 800;
const body = rawDescription.slice(0, max - footer.length).trimEnd();
const finalDescription = body + footer;
```

The footer is always present, even when the raw description is long enough to be cut. Never let truncation drop the registration line or the URL.

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
