---
name: promote-facebook-personal
description: "Create a Facebook Event from a personal profile (not group) for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com. Sibling to promote-facebook (groups) — this targets the personal-profile event flow."
version: 1.2.0
---

# Promote Event on Facebook (Personal Profile)

Promotes a Clarity Pledge event by creating a Facebook Event from the operator's own personal profile. Stops before submitting — user reviews and clicks Create event.

This is a sibling skill to `promote-facebook` (groups). They share the cover-photo helper but post to different destinations.

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
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

Fields: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse `datetime` in `Asia/Bangkok` (UTC+7). End time = start + `duration_minutes`.

### 2. Prepare cover photo

The banner normally already exists — claritypledge.com auto-generates it on event creation. Download it (portable, no credentials):

```bash
SLUG="<event-slug>"
PUBLIC="https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/${SLUG}.jpg"
LOCAL="$HOME/Downloads/clarity-event-photo.jpg"
curl -s -o "$LOCAL" -w "HTTP:%{http_code} bytes:%{size_download}\n" "$PUBLIC"
```

**If the banner is missing (404/400):** founder machine (`PROD_SUPABASE_SERVICE_ROLE_KEY` set) → `./scripts/event-photo-prep.sh <slug> "<query>"` (founder-only, macOS-only). Operator machine (no key) → stop: "Open the event on claritypledge.com (banner auto-generates), then re-run."

### 3. Open Facebook create-event

Use Claude-in-Chrome. Confirm the session is logged in as **the operator** (from `.private/event-operator.json`; default: Vyacheslav Ladischenski) before proceeding.

Open a new tab and navigate to `https://www.facebook.com/events/create/`.

**Permission gate:** if the extension returns `permission_required: www.facebook.com`, tell the user to open the URL manually one time and re-run. Abort cleanly.

### 4. Fill the form

**Fill order matters — date/time last.** Facebook's start time resets on every unrelated field edit (undocumented until now). Fill every field below EXCEPT start/end date-time first, then fill date/time last per the note under the table.

| Field | Value |
|---|---|
| Event name | `title` verbatim (max 100 chars) |
| Time zone | GMT+7 |
| In person / virtual | In person |
| Location | meeting-point name + city (e.g. "Zoo Cafe, Ko Phangan") — use "Just use [text]" if FB doesn't find an exact venue |
| Who can see it? | **Public** |
| Description | see template below |
| Cover photo | see below |
| Start date / time | local (`Asia/Bangkok`) — fill LAST, then **write→wait→re-read** |
| End date / time | start + `duration_minutes` — fill LAST, then **write→wait→re-read** |

#### Date/time — write→wait→re-read (undocumented until now)

**Facebook's start time resets on every unrelated field edit.** Fill start date/time and end date/time **last**, after every other field (location, description, cover photo) is set — any subsequent field edit can silently revert the time fields. After entering the date/time fields, wait briefly, then re-read the form (screenshot or `read_page`) and confirm the displayed values still match before moving to Step 6. If a later edit reverts them, re-enter and re-verify again — do not assume a single write holds.

#### Cover photo

Call `file_upload` MCP tool with the `LOCAL` path from step 2.

**Fallback if `file_upload` returns "Not allowed":** print this exact instruction and wait:

> Drag `~/Downloads/clarity-event-photo.jpg` onto Facebook's cover-photo area, then reply `done`.

Do NOT attempt remote fetch from inside the FB page — Facebook's CSP blocks it.

After the upload (or the manual-drag fallback confirms `done`), wait briefly, then re-read the page and confirm the cover-photo thumbnail is present before continuing — the same write→wait→re-read discipline as the date/time fields above.

### 5. Description

**Primary source: the canonical promo blurb passed from `promote-all` (step 3b).** Paste it
verbatim. It already carries the register CTA + series short link + moderated-discussion line.

**Rules:**
- Use the promo blurb as-is — do not rewrite per platform.
- FB autolinks plain URLs — the blurb is already plain text (no markdown), so it pastes cleanly.
- The series short link (`claritypledge.com/events/<short_link>`) is the one link. No other URLs.

**Fallback only if no promo blurb was passed** (no series doc): build a plain-text description from `description` — registration link (`claritypledge.com/events/<slug>`) right after the hook line AND as the closing "Register:" CTA with "Registration is required."

### 6. Stop — user creates

**If invoked with `batched: true` (the orchestrated fan-out — `promote-all` step 4 Phase A):**
do everything above exactly as written, including every field verification, then **return
instead of stopping here**. Leave this tab open with the form filled and nothing submitted.
Report back: the tab number, `filled` or `failed`, and any warning the founder must act on
(a truncated field, a missing cover photo, a control that is not programmable). `promote-all`
Phase B collects those into one review sweep, and the founder clicks Publish there.

This changes **where** the click is asked for, never **whether** it is his: this skill still
does not click Publish or Create under any flag.



Take a screenshot showing the full form. Tell the user:

> Form ready on Facebook (personal). Review and click **Create event**. Reply `next` when done (or `skip` / `abort`).

**Do NOT click Create event.** User submits manually.

---

## Conventions

- **Account**: the operator's own personal profile, from `.private/event-operator.json` (default: Vyacheslav Ladischenski) — not a group
- **Visibility**: always Public
- **Cover photo path**: local file via `file_upload`, drag-drop fallback
- **Time zone**: GMT+7
- **Fill date/time last, then write→wait→re-read**: start time resets on unrelated field edits — an undocumented Facebook behavior. Verify date/time only after every other field is set.
