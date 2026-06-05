---
name: promote-eventbrite
description: "Create an Eventbrite event (draft) for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com, as a platform in /promote-all. UI-driven via claude-in-chrome; user adds tickets and clicks Publish."
version: 1.1.0
---

# Promote Event on Eventbrite

Fills the Eventbrite "Build event page" wizard for a ClarityPledge event. Stops before the user adds tickets / publishes.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

`curl` the prod REST API with the public anon key (works in any context; events are public-read — RLS guards the data). Do NOT use the Supabase MCP here — it points at the test DB.

```bash
# Public anon key — safe to publish (it ships in the site's JS bundle).
# Rotated? Current value: VITE_SUPABASE_ANON_KEY in .env.prod.
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2p0dW9keml5a21qaWR1Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTgyNTQsImV4cCI6MjA4MDE3NDI1NH0.Z0Ap-VDprOzBRVEWF1wOXwVnNlCaqvv8i9JCCgiPsFY}"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?datetime=gt.$(date -u +%Y-%m-%dT%H:%M:%S)&status=eq.upcoming&order=datetime.asc&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

(Or `&slug=eq.<slug>`.) Fields: `title`, `slug`, `datetime`, `duration_minutes`, `location`. Parse `datetime` in `Asia/Bangkok` → local start; End = start + `duration_minutes`.

### 2. Open the create wizard

Use claude-in-chrome with the logged-in session. New tab → navigate to **`https://www.eventbrite.com/create`** (redirects to `/manage/events/create`). This creates a fresh Draft "Untitled Event" with the "Build event page" step active.

If the header shows a login prompt instead of the profile name, ask the user to sign in at eventbrite.com and re-run. The right panel is a live mobile Preview — useful for verifying each field landed.

### 3. Fill the Build event page

| Field | How to set |
|---|---|
| Cover photo | "Upload photos and video" area — `file_upload` is blocked (host-path deprecated) and Eventbrite does **not** auto-unfurl. Hand off to the user to drag `~/Downloads/clarity-event-photo.jpg` |
| Event title | Click the **"Event Title"** heading → it expands an "Event Overview" panel with a real **"Event title \*"** input. Click that input (not the heading) and type the title |
| Summary | 140-char max teaser. Click the field, type the **short** promo summary (see below) |
| Type of event | "Single event" (default) |
| Date | Click the Date block → "Date and location" panel → click the **Date** field → month-nav arrows (display locale is DD/MM/YYYY) → click the day |
| Start / End time | Combobox: click → `cmd+a` to clear → type `HH:MM` → click the matching option. End offsets from start; set it explicitly |
| Timezone | GMT+7 default — leave for CNX/Ko Phangan |
| Location | "Venue" tab (default) → "Location \*" field → type venue → pick the geocode suggestion (adds a map pin) |
| Description | "Overview" section → click → rich-text editor → click the body and type the **full** promo blurb. **The CDP type call may report a 30s timeout — the text usually still lands. Screenshot to confirm before retrying** (a blind retry double-pastes) |

**Two description forms:**
- **Summary** (≤140 chars): the series `promo_summary` frontmatter if present; else derive a one-liner from the blurb's first line + `Register: claritypledge.com/events/<short_link>`. Verify ≤140.
- **Overview** (full): the canonical promo blurb passed from `/promote-all` (step 3b) verbatim.

### 4. Stop — user adds tickets and publishes

Screenshot the form and the Preview. Quote date/time read from the screen vs expected (Eventbrite's date locale is DD/MM — easy to misread):

> Eventbrite "Build event page" ready. Confirm before you continue:
> | Field | Shows | Expected (Asia/Bangkok) |
> |---|---|---|
> | Start | `<read>` | `<expected>` |
> | End | `<read>` | `<expected>` |
>
> Then: drag the cover photo onto the top image area, **Save and continue → Add tickets (set Free) → Publish**. The event is Free; tickets are set in the Add tickets step. Reply `next` when published (or `skip` / `abort`).

**Do NOT click Save and continue / Publish.** The user drives ticketing and publishing.

---

## Conventions

- **Account**: the operator from `.private/event-operator.json` (default: Vyacheslav Ladischenski) — verify the Eventbrite session is the operator's.
- **One link in description**: the series short link (`claritypledge.com/events/<short_link>`).
- **Free event**: ticket type set Free in the Add tickets step by the user.
- **Time zone**: `Asia/Bangkok` for CNX / Ko Phangan events.

## Known limitations (as of 2026-05-24)

- Cover upload via `file_upload` is blocked; no link auto-unfurl — manual drag.
- Clicking the "Event Title" heading opens a panel; type into the revealed input, not the heading.
- Date field display locale is DD/MM/YYYY — navigate the calendar, don't assume MM/DD.
- The description rich-text editor can return a CDP `Input.dispatchKeyEvent` timeout while still applying the text — verify by screenshot, don't blind-retry.
- Tickets + publish are separate wizard steps after "Build event page".
