---
name: re-create-event
description: "Clone the most-recent event in a named recurring series into a new occurrence, then drive promotion via /slava:events:promote-all"
when_to_use: "Weekly publish for a recurring event series (e.g. AI Running Club). Pre-condition: at least one prior event in the series exists in prod. First event of any new series must be created manually via scripts/create-event.ts."
version: 1.0.0
---

# Re-create Event (Recurring Series)

Clone the most-recent event in a series, propose all fields in one screen, ask for photo + edits in one round-trip, create the event, run visual QA, then drive `/slava:events:promote-all`.

**Invocation:** `/re-create-event` (no args) or `/re-create-event <series-slug>`.

**Series config:** `docs/events/series/<slug>.md` — frontmatter is parsed; body is prose ops notes.

**Source-of-truth split:**
- `.md` frontmatter = settings constant across occurrences.
- Previous event in prod DB = description / location / duration source-of-truth.

---

## Conventions

- **Every prod mutation is preceded by an explicit user `go`.** No carve-outs from `.claude/rules/db-access.md`. State env ("**prod** DB") on every live call. Disambiguate DELETE vs UPDATE intent on destructive ops.
- **Banner is uploaded BEFORE the visual QA gate**, so the reviewer sees the real event page (banner + title + date + description) exactly as published. Trade-off: an `abort` after this point leaves a storage object — step 12 deletes it. The single `go` at step 8 authorizes the full create (row + banner upload + `banner_url` PATCH); no separate banner approval.
- **Temp files** live at `/tmp/.re-create-event-*` (OS-managed cleanup). Delete after use; never leak across steps.

---

## Steps

### 1. Series selection

```bash
ls docs/events/series/*.md
```

- Exactly one file → auto-select.
- Multiple → prompt user with alphabetical numbered list.
- Positional arg matching a series slug → auto-select that slug.

### 2. Load + validate series config

Parse YAML frontmatter from `docs/events/series/<slug>.md`.

**Required fields:** `title_prefix`, `title_format`, `cadence`, `day_of_week`, `time_local`, `timezone`, `duration_minutes`, `host_id`, `default_location`.

Missing field → halt: *"Series config missing required field `<field>`. Fix `docs/events/series/<slug>.md` and re-run."*

### 3. Prefix-uniqueness pre-check (read-only, prod)

State env: *"Querying **prod** DB to verify series prefix uniqueness."*

```bash
PROD_KEY=$(grep -E '^PROD_SUPABASE_ANON_KEY=' .env.local | cut -d'=' -f2- | tr -d '"')
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?title=ilike.$(printf '%s' "$TITLE_PREFIX" | jq -sRr @uri)%25&select=title,slug" \
  -H "apikey: $PROD_KEY" \
  -H "Authorization: Bearer $PROD_KEY"
```

For each returned row, verify the title starts with the **exact** `title_prefix` (not a prefix of it — e.g. "AI Running" must not match "AI Running Club Chiang Mai"). Any cross-series match → halt: *"Prefix collision with `<other slug>`. Title prefixes must be globally unique. See B6 deferral in features for `series_slug` column."*

### 4. Query last event in series (read-only, prod)

Same query as step 3, plus `&order=datetime.desc&limit=1`. Filter to the row whose title starts with the exact `title_prefix`.

- No rows → halt: *"No prior event in series `<slug>`. First event must be created manually via `scripts/create-event.ts`."*
- Extract: `title`, `datetime`, `description`, `location`, `duration_minutes`.
- Parse `#N` from title via regex `/#(\d+)/`. Regex failure → halt: *"Could not parse `#N` from title: `<title>`. Fix the prior event's title or update the series config."*

### 5. Compute proposal

- `next_n = last_n + 1`.
- `next_date`: **next occurrence of `day_of_week` strictly after `last_event.datetime`**; if that date is `<= now`, bump forward by the cadence interval until `> now`.
  - `weekly` → +7 days
  - `biweekly` → +14 days
  - `monthly` → +1 month (same day-of-month nearest to `day_of_week`)
- `next_title` = format `title_format` with `{prefix}`, `{n}`, `{date}` where `{date}` = "MMM DD" rendered in `timezone`.
- `next_datetime_utc` = `(next_date) (time_local)` in `timezone`, converted to UTC ISO string.
- Defaults from last event: `location`, `description`, `duration_minutes`.

### 6. Single proposal screen

Print to user, then wait for combined photo+edits reply:

```
Proposed event (cloning from #<last_n>):
  Series:       <slug>
  Title:        <next_title>
  Date/time:    <next_datetime_local> (UTC: <next_datetime_utc>)
  Duration:     <duration_minutes> min
  Location:     <last_event.location>
  Description:  <last_event.description, first ~200 chars>…

  Banner photo: ← path needed

Photo path? (or "skip")
Anything to edit? (or "go" to accept defaults)
```

### 7. Process photo locally (no upload yet)

If user provided a photo path:

```bash
OUT=/tmp/.re-create-event-banner-$$.jpg
sips -Z 1200 "$PHOTO_PATH" --out "$OUT"
```

Print: *"Resized photo at `/tmp/.re-create-event-banner-<random>.jpg` — open it to preview. Reply `go` to commit, `cancel` to abort."*

Wait for explicit `go` before any prod mutation.

If user replied `skip`: no banner; proceed without one.

### 8. Final confirmation

Re-display the proposal with edits applied. Ask once: *"Final? `go` / `cancel`"*.

### 9. INSERT event row (prod mutation — request approval)

State env: *"Creating event row in **prod** DB."* Request user `go` per `.claude/rules/db-access.md`.

```bash
TMP=/tmp/.re-create-event-$$.json
cat > "$TMP" <<JSON
{
  "title": "<next_title>",
  "datetime": "<next_datetime_utc>",
  "duration_minutes": <duration_minutes>,
  "timezone": "<timezone>",
  "location": "<location>",
  "host_id": "<host_id>",
  "description": <description-as-JSON-string>
}
JSON
npx tsx scripts/create-event.ts "$TMP"
rm -f "$TMP"
```

Capture `SLUG=` from stdout.

Then, still under the step-8 `go` (no separate approval), upload the banner and set `banner_url` — unless the photo was skipped, in which case proceed to step 10 with no banner.

```bash
./scripts/event-photo-prep.sh "$SLUG" /tmp/.re-create-event-banner-$$.jpg
```

Capture `PUBLIC=` URL from stdout.

State env: *"Patching **prod** event row to set `banner_url`."*

```bash
PROD_SR=$(grep -E '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2- | tr -d '"')
curl -s -X PATCH "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?slug=eq.$SLUG" \
  -H "apikey: $PROD_SR" \
  -H "Authorization: Bearer $PROD_SR" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"banner_url\":\"$PUBLIC\"}"
```

Delete `/tmp/.re-create-event-banner-$$.jpg`.

### 10. Visual QA gate

Print: *"Event live at `https://claritypledge.com/events/<slug>` — banner, title, date, and description all set. Open in browser and verify. Reply `go` to promote, `fix` to abort and edit, `abort` to delete."*

- `fix` → step 12.
- `abort` → step 12.
- `go` → step 11.

### 11. Promote

Invoke `/slava:events:promote-all <slug>` via the Skill tool.

After `promote-all` returns, print: *"Luma post is T+24h. Run `/promote-luma <slug>` tomorrow."*

### 12. Abort / fix cleanup path

Disambiguate intent per `.claude/rules/db-access.md`:

*"You said `<abort|fix>`. This will permanently DELETE row `slug=<slug>` from `events` in **prod**. Confirm with `delete` or cancel with anything else."*

On confirmed `delete`:

```bash
PROD_SR=$(grep -E '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2- | tr -d '"')
curl -s -X DELETE "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?slug=eq.$SLUG" \
  -H "apikey: $PROD_SR" \
  -H "Authorization: Bearer $PROD_SR"
```

Then delete the banner storage object (uploaded in step 9 before this gate):

```bash
curl -s -X DELETE "https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/event-banners/$SLUG.jpg" \
  -H "apikey: $PROD_SR" \
  -H "Authorization: Bearer $PROD_SR"
```

If the photo was skipped, no object exists — the DELETE is a harmless 404. Delete `/tmp/.re-create-event-banner-$$.jpg` if present. Exit.

---

## Error halts (summary)

| Condition | Action |
|-----------|--------|
| Missing required frontmatter field | Halt with field name + path to fix |
| Prefix collision with another series | Halt with colliding series slug |
| No prior event in series | Halt with bootstrap instructions (`scripts/create-event.ts`) |
| `#N` regex fails | Halt showing the offending title |
| User replies anything other than `go` at a gate | Honor reply (cancel / fix / abort path) |

---

## Smoke test

Run `/re-create-event ai-running-club` after event #2 is published. Expected:

- Series auto-selected.
- Frontmatter parses cleanly.
- Prefix uniqueness check passes.
- Prod query returns event #2.
- Proposal screen shows `AI Running Club Chiang Mai #3 — Sun May 31` at `2026-05-31 09:00 Asia/Bangkok`.
- User answers `cancel` at step 8.
- No row inserted. No `/tmp/` files leaked.
