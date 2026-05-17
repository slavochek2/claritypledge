---
name: promote-luma
description: "Create a Luma event page for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com. UI-driven via claude-in-chrome; user clicks Publish."
version: 1.1.0
---

# Promote Event on Luma

Promotes a Clarity Pledge event by creating a Luma event page. Stops before publishing — user reviews and clicks Publish.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

Use Supabase MCP if available.

Fallback (any context, including subagents): `curl` against the prod REST API with `PROD_SUPABASE_SERVICE_ROLE_KEY` from `.env.local`:

```bash
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?datetime=gt.$(date -u +%Y-%m-%dT%H:%M:%S)&status=eq.upcoming&order=datetime.asc&limit=1" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

(Or filter by `&slug=eq.<slug>`. Always filter with `datetime=gt.<now>` — DB `status` lags actual time.)

Fields needed: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse `datetime` in `Asia/Bangkok` (UTC+7) → local start. End = start + `duration_minutes`.

### 2. Download cover photo

The event's banner already exists in Supabase Storage from when it was published on claritypledge.com. Download it directly:

```bash
SLUG="<event-slug>"
PUBLIC="https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/${SLUG}.jpg"
LOCAL="$HOME/Downloads/clarity-event-photo.jpg"
curl -s -o "$LOCAL" -w "HTTP:%{http_code} bytes:%{size_download}\n" "$PUBLIC"
```

Verify the curl returned `HTTP:200` with a non-zero byte count. If it didn't, fall back to `./scripts/event-photo-prep.sh <slug> --unsplash "<query>"` to generate one.

### 3. Open Luma create-event page

Use `mcp__claude-in-chrome__tabs_create_mcp` to open a new tab, then navigate to **`https://luma.com/create`** (NOT `lu.ma/create` — that redirects, and the Chrome MCP permission gate fires on the pre-redirect host).

**Permission gate handling:** if the navigation returns `permission_required: luma.com`, tell the user:

> Luma needs a one-time Chrome extension permission. Open `https://luma.com/create` in your browser, click the orange Claude extension icon, and grant "Always allow on this site". Then re-run this skill.

Abort cleanly (no further tool calls).

### 4. Fill the form

Read the page interactively (`mcp__claude-in-chrome__read_page` with `filter: "interactive"`) to find refs. Expected fields:

| Field | Element type | How to set |
|---|---|---|
| Event name | textarea | `form_input` with `title` verbatim |
| Cover photo | file input | `file_upload` with `LOCAL` path |
| Location | text input + suggestion dropdown | `find` "Add Event Location" → click → `type` location → `find` matching suggestion row → click |
| Description | **contenteditable DIV** | `find` "Add Description" button → click → on the modal's input ref, use `computer left_click` + `type` (form_input fails with "Element type DIV is not a supported form input") → click Done |
| Visibility | dropdown | leave default (Public) |
| Require Approval | toggle | leave default (off) unless user requested approval-gated RSVPs |

**Date/time fields are NOT programmable.** Luma uses a custom React date/time picker that ignores both `form_input` and `triple_click + type`. **Do not waste tool calls trying.** After filling everything else, tell the user:

> Date/time picker requires manual entry. Click each Start/End date and time field in the Luma UI and pick from the calendar:
> - Start: <local start date + time, Asia/Bangkok>
> - End: <local end date + time, Asia/Bangkok>

### 5. Stop — user verifies and publishes

Take a screenshot of the completed form. Tell the user:

> Form ready on Luma. Verify:
> - **Dates correct** (manual entry needed — see step 4)
> - **Description renders markdown** (if literal `**asterisks**` show, Luma is NOT rendering markdown; switch to a plain-text version)
> - All other fields match the spec
>
> Then click **Create Event**. Reply `next` when done (or `skip` / `abort`).

**Do NOT click Create Event.** This skill never publishes — only the user does.

---

## Conventions

- **Host name**: always Vyacheslav Ladischenski (auth session)
- **One link only in description**: the claritypledge event page
- **Time zone**: always `Asia/Bangkok` for Ko Phangan / Chiang Mai events

---

## Known limitations (as of 2026-05-17)

- Date/time picker requires manual entry (see step 4)
- Description field is contenteditable DIV (see step 4)
- `lu.ma` redirects to `luma.com` — use the redirected host
- Markdown rendering in description is unverified; if literal asterisks appear after publish, switch convention to plain text
