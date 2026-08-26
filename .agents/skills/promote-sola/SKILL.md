---
name: promote-sola
description: "Create a Social Layer (sola.day) event under a community group for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com, as a platform in /promote-all. Pre-condition: the series has a `sola_group` (Social Layer group handle) — events cannot be hosted on a bare profile. UI-driven via claude-in-chrome; user clicks Create Event."
version: 1.1.0
---

# Promote Event on Social Layer (sola.day)

Creates a Social Layer event under a community **group**. Stops before submitting — user reviews and clicks **Create Event**.

## Input

Event slug or "latest". If not provided, use the most recent upcoming event from prod DB.

---

## Prerequisite: a group (hard requirement)

Social Layer events **must** be hosted under a group. A bare profile cannot create events — `app.sola.day/event/create` and `app.sola.day/event/<profile-handle>/create` both return a server error ("Something went wrong").

Read `sola_group` from the series-doc frontmatter (passed by `/promote-all`). If absent → halt:

> *Social Layer needs a host group for this series. Add `sola_group: <handle>` to `docs/events/series/<slug>.md` (the group must already exist and you must be able to host in it — check `app.sola.day/group/<handle>`). Then re-run.*

Do **not** create a group automatically — group creation/naming is a founder decision.

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

### 2. Open the group create-event page

Use claude-in-chrome with the logged-in session. Navigate to:

```
https://app.sola.day/event/<sola_group>/create
```

If the header shows "Sign In" (not the profile name), the session is stale — reload once. If still signed out, tell the user to sign in at `app.sola.day` and re-run. If a Chrome permission gate fires on `app.sola.day`, ask the user to open the URL once and grant access, then re-run.

**If screenshots error (`params.clip.scale`) or `read_page` returns a 0×0 viewport:** the tab isn't painted — ask the user to bring the Chrome window to the foreground, then continue. `find` + `form_input` + `get_page_text` still work meanwhile, but do NOT type into contenteditable/date fields while the viewport is broken (keystrokes leak into the wrong field — observed: description text leaked into Event Name).

### 3. Fill the form

Read with `find` (resilient when `read_page` is flaky). Behaviors observed:

| Field | Type | How to set |
|---|---|---|
| Event Name | text input | `form_input` works and persists |
| Kind (optional) | dropdown | leave default ("activity") |
| Date — From/To | calendar popover | click the date → click the day in the calendar; To auto-matches From's date |
| Time — From/To | scrollable dropdown | click the time → scroll the list to the value → click it; To auto-offsets, then fix it |
| Timezone | — | defaults to (GMT+7) Asia/Bangkok — leave for CNX/Ko Phangan |
| Location | "Select Venue" dropdown | preset group venues + **New Location**. For an off-site venue: click **New Location** → type address in the Location field → pick the geocode suggestion (gives a "View map" link on the event) |
| Meeting URL | text | leave blank for in-person |
| Event Description | **contenteditable editor** | `form_input` fails — click into the editor body, then `type`. Paste the canonical promo blurb verbatim |
| Tags | toggle chips | click each relevant chip (e.g. AI, Technology, Digital Nomad) |
| Cover | — | **auto-unfurls** from the `claritypledge.com/events/<short_link>` link in the description (the event banner appears on its own). If it doesn't, "Upload Cover" needs a manual drag (`file_upload` is blocked) |
| Host | — | defaults to your profile — leave |
| **Display** | radio (in form / More Settings) | **select "Public Event"** so it's open to the public, not just group members |

**Description source:** the canonical promo blurb passed from `/promote-all` (step 3b) — register CTA + event link near the top and at the end, plain text. Fallback if none passed: short plain-text description from `description` — registration link (`claritypledge.com/events/<slug>`) right after the hook line AND as the closing `Register:` CTA. (The early link also triggers the cover auto-unfurl.)

### 4. Stop — user verifies and creates

Screenshot the form. Quote back the date/time read from the screen vs expected (same hard date-check discipline as `/promote-luma` — the time picker is click-driven and easy to leave wrong):

> Form ready on Social Layer (group `<sola_group>`). Confirm before you submit:
> | Field | Shows | Expected (Asia/Bangkok) |
> |---|---|---|
> | Start | `<read>` | `<expected>` |
> | End | `<read>` | `<expected>` |
>
> Also verify: Event Name has no stray characters, description shows the moderated-discussion line + `ai-run` link, cover image loaded, **Display = Public Event**, location shows "View map".
>
> Reply `confirmed: <ISO date>` and click **Create Event** yourself. Or `fix` / `abort`.

**Do NOT click Create Event.** Only the user submits. On success the page becomes `/event/share/<id>` (share screen with QR + social buttons) and the event is live at `/event/detail/<id>`.

---

## Conventions

- **Host group**: from `sola_group` frontmatter — never a bare profile.
- **One link in description**: the series short link (`claritypledge.com/events/<short_link>`) — also what triggers cover auto-unfurl.
- **Visibility**: always select **Public Event**.
- **Time zone**: `Asia/Bangkok` for CNX / Ko Phangan events.

## Known limitations (as of 2026-05-24)

- Events require a group; no personal-profile creation.
- Description is a contenteditable editor (click + type, not `form_input`).
- Date/time pickers are click-driven, not programmable.
- Cover upload via `file_upload` is blocked (host-path deprecated) — rely on link auto-unfurl or manual drag.
- claude-in-chrome screenshot/`read_page` can enter a broken-viewport state — bring Chrome to the foreground to recover.
