---
name: promote-all
description: "Promote a ClarityPledge event to todo.today, Facebook (personal), and Luma in one pass"
when_to_use: "After event is published on claritypledge.com. Fans out sequentially across three platforms with user-controlled gates."
version: 1.0.0
---

# Promote Event to All Platforms

Wraps `promote-todo-today`, `promote-facebook-personal`, and `promote-luma` into one sequential pass. Each platform stops for explicit user review before the user clicks Publish / Create event. The wrapper never publishes anything.

After all three are done, emits a 3-line WhatsApp blurb ready to paste into chat groups.

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

Extract `slug`, `title`, `description` (truncated to one-line hook for the WhatsApp blurb).

### 2. Load or initialize state cache

State path: `~/.private/event-state/<slug>.json`. Create the directory if missing.

Schema:

```json
{
  "slug": "ai-run-1",
  "photo_public_url": "https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/ai-run-1.jpg",
  "photo_local_path": "~/Downloads/clarity-event-photo.jpg",
  "status": {
    "todo_today": "pending",
    "facebook_personal": "pending",
    "luma": "pending"
  },
  "updated_at": "2026-05-12T08:00:00Z"
}
```

If the file exists, read it and resume from the first `pending` platform. Otherwise initialize all three to `pending`.

### 3. Prepare cover photo once

Run `./scripts/event-photo-prep.sh <slug>` via Bash. Parse `LOCAL` and `PUBLIC`. Write them to the cache. Subsequent platform skills will re-run the helper (idempotent — it skips Unsplash if the object already exists).

### 4. Fan out — sequential, in this order

Order: **todo.today → Facebook (personal) → Luma**. Rationale: todo.today has the highest UI friction (tag picker, character truncation), so fail-fast there. Facebook needs visual cover-photo review. Luma is most stable UI, last.

For each platform:

1. Skip if `status.<platform> === "done"` in cache.
2. Invoke the sub-skill via the Skill tool:
   - `slava:events:promote-todo-today` with the slug
   - `slava:events:promote-facebook-personal` with the slug
   - `slava:events:promote-luma` with the slug
3. Wait for user reply:
   - `next` → set `status.<platform> = "done"`, update `updated_at`, write cache, proceed
   - `skip` → set `status.<platform> = "skipped"`, write cache, proceed
   - `abort` → exit cleanly, cache preserved for resume

### 5. WhatsApp blurb

Once all three platforms are `done` or `skipped`, output this fenced block:

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
```

Cache stays at `~/.private/event-state/<slug>.json`. The user can `rm` it to fully reset, or re-run this skill to retry skipped platforms.

---

## Conventions

- **Never publishes.** Every platform stop is the user's, not the skill's. No exceptions.
- **Resume-safe.** Cache lets the user `abort` mid-flow and resume later.
- **Skip-safe.** `skipped` is recorded distinctly from `done` so retries can target skipped platforms.
- **Photo prep runs once per slug.** Re-runs are cheap (HEAD check + redownload) but never re-search Unsplash for the same slug.
