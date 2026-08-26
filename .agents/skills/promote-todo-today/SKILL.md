---
name: promote-todo-today
description: "Promote a ClarityPledge event on todo.today"
when_to_use: "After event is published on claritypledge.com."
version: 1.1.0
---

# Promote Event on todo.today

Promotes a Clarity Pledge event on todo.today by filling the Create Event form. Stops before submitting — user reviews and publishes.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

`curl` the prod REST API with the public anon key (no CLI auth or org membership needed; events are public-read — RLS guards the data):

```bash
# Public anon key — safe to publish (it ships in the site's JS bundle).
# Rotated? Current value: VITE_SUPABASE_ANON_KEY in .env.prod.
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2p0dW9keml5a21qaWR1Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTgyNTQsImV4cCI6MjA4MDE3NDI1NH0.Z0Ap-VDprOzBRVEWF1wOXwVnNlCaqvv8i9JCCgiPsFY}"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

(Or filter by `&slug=eq.<slug>`.) Fields needed: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse datetime in `Asia/Bangkok` (UTC+7) to get local date, start time, end time.

### 2. Prepare cover photo

The banner normally already exists — claritypledge.com auto-generates it on event creation. Download it (portable, no credentials):

```bash
SLUG="<event-slug>"
PUBLIC="https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/${SLUG}.jpg"
LOCAL="$HOME/Downloads/clarity-event-photo.jpg"
curl -s -o "$LOCAL" -w "HTTP:%{http_code} bytes:%{size_download}\n" "$PUBLIC"
```

**If the banner is missing (404/400):**
- `PROD_SUPABASE_SERVICE_ROLE_KEY` set (founder machine): run `./scripts/event-photo-prep.sh <slug> "<query>"` (Unsplash generation + storage upload; founder-only, macOS-only). Query suggestions — trail run: `"trail running jungle waterfall"`; AI Run / talk: `"morning coffee laptop community"`.
- No service key (operator machine): stop and tell the user — "The event banner is missing. Open the event on claritypledge.com (banner auto-generates; Regenerate control on the event page), then re-run."

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
| Host | the operator from `.private/event-operator.json` (default: Vyacheslav Ladischenski) |
| More Details | see description template below |
| Tags | by event type — see tag table + resolution pattern below |
| Walk-In | unchecked (registration is required) |
| Where | the event's city, derived from the `location` field |
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

### 6. Description (max 1000 chars)

**Primary source: the canonical promo blurb passed from `promote-all` (step 3b).** It already
includes the register CTA + series short link (`claritypledge.com/events/<short_link>`) and the
moderated-discussion line. Paste it verbatim into More Details.

**Rules:**
- Use the promo blurb as-is — do NOT rewrite it per platform (that reintroduces the drift this design removed).
- The series short link is the one link. No WhatsApp / AllTrails / other URLs.
- todo.today's editor may auto-unfurl the link and re-format on blur — that's expected; verify the moderated-discussion line and short link survive (read the textarea value back).

**Fallback only if no promo blurb was passed** (no series doc): build a short plain-text description from `description` — registration link (`claritypledge.com/events/<slug>`) right after the hook line AND as the closing "Register:" CTA with "Registration is required." Truncate body to fit 1000 chars while preserving BOTH link lines.

### 7. Stop — let user review

Do **NOT** click Create Event. Take a screenshot, scroll to show full form, report what was filled. User publishes manually.

---

## Conventions

- **Host name**: the operator from `.private/event-operator.json` (default: Vyacheslav Ladischenski). Verify the todo.today session is logged in as the operator.
- **Photo**: the event's claritypledge.com banner (auto-generated); Unsplash generation is the founder-only fallback
- **One link only**: the claritypledge.com event page — it's the registration page and the source of truth
- **Exchange**: always Free (the 100 THB park entry is not our fee)
- **Venue**: search by meeting point name — Zoo Cafe is already in the Koh Phangan venue list
