---
name: promote-all
description: "Promote a ClarityPledge event to todo.today, Facebook (personal), Luma, Eventbrite, and Social Layer in one pass"
when_to_use: "After event is published on claritypledge.com. Fans out sequentially across platforms with user-controlled gates."
version: 1.2.0
---

# Promote Event to All Platforms

Wraps `promote-todo-today`, `promote-facebook-personal`, `promote-luma`, `promote-eventbrite`, and `promote-sola` into one sequential pass. Each platform stops for explicit user review before the user clicks Publish / Create event. The wrapper never publishes anything. Social Layer runs only when the series has a `sola_group`.

After all platforms are done, shows the series WhatsApp blurb (or generates a fallback) for the user to paste into chat groups. If the user edits it, the series doc is updated.

## Input

Event slug. If not provided, use the most recent upcoming event from prod.

---

## Steps

### 1. Resolve slug

If user passed a slug, use it. Otherwise query prod:

```bash
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY"
```

Extract `slug`, `title`, `description`.

### 2. Load or initialize state cache

State path: `~/.private/event-state/<slug>.json`. Create the directory if missing.

Schema:

```json
{
  "slug": "ai-run-1",
  "series_doc": "docs/events/series/ai-running-club.md",
  "photo_public_url": "https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/ai-run-1.jpg",
  "photo_local_path": "~/Downloads/clarity-event-photo.jpg",
  "status": {
    "todo_today": "pending",
    "facebook_personal": "pending",
    "luma": "pending",
    "eventbrite": "pending",
    "sola": "pending"
  },
  "updated_at": "2026-05-12T08:00:00Z"
}
```

`series_doc` is optional. Auto-detect by matching event title against known series title prefixes:

| Title prefix | series_doc |
|---|---|
| `AI Running Club%` | `docs/events/series/ai-running-club.md` |

If no match, leave `series_doc` null — fall back to generated blurb in step 5.

If the file exists, read it and resume from the first `pending` platform. Otherwise initialize all three to `pending`.

### 3. Prepare cover photo once

Run `./scripts/event-photo-prep.sh <slug>` via Bash. Parse `LOCAL` and `PUBLIC`. Write them to the cache. Subsequent platform skills will re-run the helper (idempotent — it skips Unsplash if the object already exists).

### 3b. Resolve the promo blurb (single source of truth)

This is what makes every platform's description consistent — no per-platform drift.

**If `series_doc` is set and contains a `## Promo blurb` section:**

1. Read the fenced code block inside `## Promo blurb`.
2. Read `short_link` and `register_cta` from the series-doc frontmatter.
3. Resolve placeholders:
   - `{short_url}` → `claritypledge.com/events/<short_link>` (the series short link auto-redirects to the latest event — never hardcode a per-event slug here)
   - `{register_cta}` → the `register_cta` value
4. The result is the **canonical promo blurb**. Pass it verbatim to every platform sub-skill in step 4.

**If `series_doc` is null or has no `## Promo blurb`:** fall back to the platform sub-skill's own description template (legacy behavior).

### 4. Fan out — sequential, in this order

Order: **todo.today → Facebook (personal) → Luma → Eventbrite → Social Layer**. Rationale: todo.today has the highest UI friction (tag picker, character truncation), so fail-fast there. Facebook needs visual cover-photo review. Luma is a stable UI. Eventbrite is a multi-step wizard (tickets + publish are separate steps the user drives). Social Layer (sola.day) is last — it has a group prerequisite and is skipped entirely when the series has no `sola_group`. The WhatsApp blurb (step 5) always runs after the full fan-out.

For each platform:

1. Skip if `status.<platform> === "done"` in cache.
2. Invoke the sub-skill via the Skill tool, passing the slug **and the canonical promo blurb from step 3b** (when resolved):
   - `slava:events:promote-todo-today` with the slug
   - `slava:events:promote-facebook-personal` with the slug
   - `slava:events:promote-luma` with the slug
   - `slava:events:promote-eventbrite` with the slug
   - `slava:events:promote-sola` with the slug — **only if the series has a `sola_group` frontmatter value**; otherwise mark `sola = "skipped"` and move on
3. Wait for user reply:
   - `next` → set `status.<platform> = "done"`, update `updated_at`, write cache, proceed
   - `skip` → set `status.<platform> = "skipped"`, write cache, proceed
   - `abort` → exit cleanly, cache preserved for resume

### 5. WhatsApp blurb (always last — after the full platform fan-out)

Once all platforms are `done` or `skipped`:

**If `series_doc` is set:**
1. Read the `## WhatsApp blurb` section from the series doc (the fenced code block inside it).
2. Resolve placeholders against the event being promoted:
   - `{date}` → the event date as "MMM D" (e.g. "May 31") in `Asia/Bangkok`
   - `{n}` → the `#N` parsed from the event title (regex `/#(\d+)/`)
3. Show the resolved blurb:
   > Here's the blurb from the series doc — paste it or reply with an edited version:
   > ```
   > [resolved blurb content]
   > ```
   A good blurb states **what the discussion is about, how it helps, and for whom** — not just time/place. If the series blurb is logistics-only, flag that to the user.
4. Wait for user reply:
   - `use` or no reply → use the blurb as-is
   - User pastes edited text → use edited version; if it's a reusable improvement (not a one-off date tweak), update the fenced block in `## WhatsApp blurb` in the series doc **keeping the `{date}`/`{n}` placeholders unresolved** and commit: `git add <series_doc> && git commit -m "docs(events): update WhatsApp blurb for <series>"`

**If `series_doc` is null (no known series):**

Output a generated fallback:
```
🌱 [TITLE]
[ONE-LINE HOOK — first non-empty line of description, trimmed to ~80 chars]
Register: claritypledge.com/events/[SLUG]
```

The user pastes this into chat groups. No automatic sending.

### 6. Done

Print a 3-line summary:

```
todo.today:        <done | skipped>
Facebook personal: <done | skipped>
Luma:              <done | skipped>
Eventbrite:        <done | skipped>
Social Layer:      <done | skipped>
```

Cache stays at `~/.private/event-state/<slug>.json`. The user can `rm` it to fully reset, or re-run this skill to retry skipped platforms.

---

## Conventions

- **Never publishes.** Every platform stop is the user's, not the skill's. No exceptions.
- **Resume-safe.** Cache lets the user `abort` mid-flow and resume later.
- **Skip-safe.** `skipped` is recorded distinctly from `done` so retries can target skipped platforms.
- **Photo prep runs once per slug.** Re-runs are cheap (HEAD check + redownload) but never re-search Unsplash for the same slug.
