---
name: promote-luma
description: "Create a Luma event page for a ClarityPledge event"
when_to_use: "After event is published on claritypledge.com. UI-driven via claude-in-chrome; user clicks Publish."
version: 1.0.0
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
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

(Or filter by `&slug=eq.<slug>`.)

Fields needed: `title`, `slug`, `datetime`, `duration_minutes`, `location`, `description`.

Parse `datetime` in `Asia/Bangkok` (UTC+7) → local start. End = start + `duration_minutes`.

### 2. Prepare cover photo

Run `./scripts/event-photo-prep.sh <slug> "<query>"` via Bash. Parse:

```
LOCAL=<absolute path to ~/Downloads/clarity-event-photo.jpg>
PUBLIC=<Supabase public URL>
```

Keep both — Luma's UI may accept either a file upload or a remote URL for the cover.

### 3. Open Luma create-event page

Use `mcp__claude-in-chrome__tabs_create_mcp` to open a new tab, then navigate to `https://lu.ma/create`.

**Permission gate handling:** if the navigation returns `permission_required: lu.ma`, tell the user:

> Luma needs a one-time Chrome extension permission. Open `https://lu.ma/create` in your browser once, then re-run this skill.

Abort the skill cleanly (no further tool calls).

### 4. Fill the form

| Field | Value |
|---|---|
| Event name | `title` verbatim (Luma allows ~80 chars) |
| Start date + time | local (`Asia/Bangkok`) |
| End date + time | start + `duration_minutes` |
| Timezone | `Asia/Bangkok` (GMT+7) |
| Location | `location` from DB — use Luma's place picker; pick the closest match or "Use as typed" |
| Description | `description` markdown (Luma renders markdown) |
| Cover photo | upload `LOCAL` via `file_upload` MCP tool. Fallback: paste `PUBLIC` URL into the cover-image-by-URL field if Luma exposes one; else ask user to drag-drop |
| Visibility | Public |
| Registration required | Yes (Luma's default; verify) |

### 5. Stop — user publishes

Take a screenshot of the completed form. Tell the user:

> Form ready on Luma. Review and click **Publish**. Reply `next` when done (or `skip` / `abort`).

**Do NOT click Publish.** This skill never publishes — only the user does.

---

## Conventions

- **Host name**: always Vyacheslav Ladischenski (auth session)
- **One link only in description**: the claritypledge event page
- **Time zone**: always `Asia/Bangkok` for Ko Phangan events
