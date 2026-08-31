---
name: promote-luma
description: "Create a Luma event page for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com. UI-driven via claude-in-chrome; user clicks Publish."
version: 1.3.0
---

# Promote Event on Luma

Promotes a Clarity Pledge event by creating a Luma event page. Stops before publishing — user reviews and clicks Publish.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Steps

### 1. Get event data from prod

`curl` the prod REST API with the public anon key (works in any context, including subagents; events are public-read — RLS guards the data). Do NOT use the Supabase MCP here — it points at the test DB.

```bash
# Public anon key — safe to publish (it ships in the site's JS bundle).
# Rotated? Current value: VITE_SUPABASE_ANON_KEY in .env.prod.
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2p0dW9keml5a21qaWR1Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTgyNTQsImV4cCI6MjA4MDE3NDI1NH0.Z0Ap-VDprOzBRVEWF1wOXwVnNlCaqvv8i9JCCgiPsFY}"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?datetime=gt.$(date -u +%Y-%m-%dT%H:%M:%S)&status=eq.upcoming&order=datetime.asc&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
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

Verify the curl returned `HTTP:200` with a non-zero byte count. If it didn't:
- `PROD_SUPABASE_SERVICE_ROLE_KEY` set (founder machine): fall back to `./scripts/event-photo-prep.sh <slug> --unsplash "<query>"` (founder-only, macOS-only).
- No service key (operator machine): stop and tell the user — "The event banner is missing. Open the event on claritypledge.com (banner auto-generates; Regenerate control on the event page), then re-run."

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
| Cover photo | file input | `file_upload` with `LOCAL` path — then **wait, then re-read** (see below) |
| Location | text input + suggestion dropdown | `find` "Add Event Location" → click → `type` location → `find` matching suggestion row → click |
| Description | **contenteditable DIV** | `find` "Add Description" button → click → on the modal's input ref, use `computer left_click` + `type` (form_input fails with "Element type DIV is not a supported form input") → click Done |
| Visibility | dropdown | leave default (Public) |
| Require Approval | toggle | leave default (off) unless user requested approval-gated RSVPs |

**Description text source:** use the canonical promo blurb passed from `promote-all` (step 3b) verbatim — it already carries the register CTA + series short link + moderated-discussion line, and is plain text (Luma's markdown rendering is unverified, so plain text is the safe default). Fallback only if no blurb was passed: short plain-text description from `description` — the registration link (`claritypledge.com/events/<slug>`) right after the first hook line AND again as the closing `Register:` CTA.

**Write→wait→re-read after the cover-photo upload.** Luma's UI can show a write as applied for one frame and then silently revert it (this is the exact failure mode that hit the date field — see step 5). After `file_upload`, wait briefly for the thumbnail to render, then re-read the page (`read_page` or a screenshot) and confirm the cover-photo thumbnail is still present before moving to the next field. Do not trust the immediate post-call state as final.

**Date/time fields are NOT programmable.** Luma uses a custom React date/time picker that ignores both `form_input` and `triple_click + type`. **Do not waste tool calls trying.** After filling everything else, tell the user:

> Date/time picker requires manual entry. Click each Start/End date and time field in the Luma UI and pick from the calendar:
> - Start: <local start date + time, Asia/Bangkok>
> - End: <local end date + time, Asia/Bangkok>

### 5. Stop — user verifies dates explicitly, then publishes

**If invoked with `batched: true` (the orchestrated fan-out — `promote-all` step 4 Phase A):**
do everything above exactly as written, including every field verification, then **return
instead of stopping here**. Leave this tab open with the form filled and nothing submitted.
Report back: the tab number, `filled` or `failed`, and any warning the founder must act on
(a truncated field, a missing cover photo, a control that is not programmable). `promote-all`
Phase B collects those into one review sweep, and the founder clicks Publish there.

This changes **where** the click is asked for, never **whether** it is his: this skill still
does not click Publish or Create under any flag.



Wait briefly after the last manual date/time entry before capturing anything — Luma's picker has reverted a value that looked correct in an immediate screenshot (see Known Limitations). Take a screenshot of the completed form only after that wait. **Read the displayed date/time values from the screenshot** (the Start/End rows of the form) and quote them back to the user verbatim alongside the expected values from prod DB:

> Form ready on Luma. **Date check — confirm BOTH match before publish:**
>
> | Field | Displayed in Luma | Expected (from prod) |
> |---|---|---|
> | Start | `<read from screenshot>` | `<expected start, local Asia/Bangkok>` |
> | End | `<read from screenshot>` | `<expected end, local Asia/Bangkok>` |
>
> Also verify:
> - **Description renders markdown** (if literal `**asterisks**` show, Luma is NOT rendering markdown; switch to a plain-text version)
> - All other fields match the spec
>
> Reply `confirmed: <ISO date>` to acknowledge the date is correct (e.g. `confirmed: 2026-05-24T09:00 Asia/Bangkok`), then click **Create Event**. Or reply `fix dates` / `abort`.

**Do NOT click Create Event.** This skill never publishes — only the user does.

**Why the explicit date confirmation:** Luma's date/time picker rejects programmatic input (see Known Limitations). The first end-to-end run published an event with the wrong date (Sat May 23 instead of Sun May 24) because the agent moved past the date field without a hard verification gate. The textual confirmation is the gate.

---

## Conventions

- **Host name**: the operator from `.private/event-operator.json` (default: Vyacheslav Ladischenski). Verify the Luma session is logged in as the operator before filling the form.
- **One link only in description**: the claritypledge event page
- **Time zone**: always `Asia/Bangkok` for Ko Phangan / Chiang Mai events

---

## Known limitations (as of 2026-05-17)

- Date/time picker requires manual entry (see step 4)
- **A field that looks correct in an immediate screenshot can silently revert** — the date field has done this. Always wait, then re-read, before trusting any write (cover photo, date/time) as final.
- Description field is contenteditable DIV (see step 4)
- `lu.ma` redirects to `luma.com` — use the redirected host
- Markdown rendering in description is unverified; if literal asterisks appear after publish, switch convention to plain text
