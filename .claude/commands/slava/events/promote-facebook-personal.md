---
name: promote-facebook-personal
description: "Create a Facebook Event from a personal profile (not group) for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com. Sibling to promote-facebook (groups) — this targets the personal-profile event flow."
version: 1.0.0
---

# Promote Event on Facebook (Personal Profile)

Promotes a Clarity Pledge event by creating a Facebook Event from Slava's personal profile. Stops before submitting — user reviews and clicks Create event.

This is a sibling skill to `promote-facebook` (groups). They share the cover-photo helper but post to different destinations.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

Use Supabase MCP if available.

Fallback (any context): `curl` against the prod REST API with `PROD_SUPABASE_SERVICE_ROLE_KEY` from `.env.local`:

```bash
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

Fields: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse `datetime` in `Asia/Bangkok` (UTC+7). End time = start + `duration_minutes`.

### 2. Prepare cover photo

Run `./scripts/event-photo-prep.sh <slug> "<query>"` via Bash. Parse:

```
LOCAL=<absolute path to ~/Downloads/clarity-event-photo.jpg>
PUBLIC=<Supabase public URL>
```

### 3. Open Facebook create-event

Use Claude-in-Chrome. Confirm the session is logged in as **Vyacheslav Ladischenski** before proceeding.

Open a new tab and navigate to `https://www.facebook.com/events/create/`.

**Permission gate:** if the extension returns `permission_required: www.facebook.com`, tell the user to open the URL manually one time and re-run. Abort cleanly.

### 4. Fill the form

| Field | Value |
|---|---|
| Event name | `title` verbatim (max 100 chars) |
| Start date / time | local (`Asia/Bangkok`) |
| End date / time | start + `duration_minutes` |
| Time zone | GMT+7 |
| In person / virtual | In person |
| Location | meeting-point name + city (e.g. "Zoo Cafe, Ko Phangan") — use "Just use [text]" if FB doesn't find an exact venue |
| Who can see it? | **Public** |
| Description | see template below |

#### Cover photo

Call `file_upload` MCP tool with the `LOCAL` path from step 2.

**Fallback if `file_upload` returns "Not allowed":** print this exact instruction and wait:

> Drag `~/Downloads/clarity-event-photo.jpg` onto Facebook's cover-photo area, then reply `done`.

Do NOT attempt remote fetch from inside the FB page — Facebook's CSP blocks it.

### 5. Description template

**Rules:**
- One link only: `claritypledge.com/events/<slug>` (registration page, source of truth)
- No WhatsApp links, AllTrails links, or any other URLs
- FB autolinks plain URLs — keep text plain, not markdown

```
[1-line hook]

[Body: 3-6 lines describing what happens and who it's for.]

📍 Meet at [TIME]: [VENUE], [brief location note]
[Entry fee if applicable]

What to bring: [list]

Registration is required. Full details and sign-up:
claritypledge.com/events/[SLUG]
```

### 6. Stop — user creates

Take a screenshot showing the full form. Tell the user:

> Form ready on Facebook (personal). Review and click **Create event**. Reply `next` when done (or `skip` / `abort`).

**Do NOT click Create event.** User submits manually.

---

## Conventions

- **Account**: Vyacheslav Ladischenski personal profile (not a group)
- **Visibility**: always Public
- **Cover photo path**: local file via `file_upload`, drag-drop fallback
- **Time zone**: GMT+7
