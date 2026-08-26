---
name: promote-all
description: "Promote a ClarityPledge event to todo.today, Facebook (personal), Luma, Eventbrite, and Social Layer in one pass"
when_to_use: "After event is published on claritypledge.com. Fans out sequentially across platforms with user-controlled gates."
version: 1.4.0
---

# Promote Event to All Platforms

Wraps `promote-todo-today`, `promote-facebook-personal`, `promote-luma`, `promote-eventbrite`, and `promote-sola` into one sequential pass. Each platform stops for explicit user review before the user clicks Publish / Create event. The wrapper never publishes anything. Social Layer runs only when the series has a `sola_group`.

After all platforms are done, shows the series WhatsApp blurb (or generates a fallback) for the user to paste into chat groups. If the user edits it, the series doc is updated.

## Input

Event slug. If not provided, use the most recent upcoming event from prod.

---

## Steps

### 0. Load operator config

Read `.private/event-operator.json` (repo-relative, gitignored — each operator creates their own; see [docs/events/operator-guide.md](../../../../docs/events/operator-guide.md)). Schema:

```json
{
  "operator_name": "<name the platform browser sessions are logged in as>",
  "platforms": ["todo-today", "facebook-personal", "luma", "eventbrite", "sola"],
  "facebook_groups": ["<optional — known groups for promote-facebook, grows run over run>"]
}
```

- **File absent → founder defaults:** operator = Vyacheslav Ladischenski, all platforms. Behavior identical to pre-P901.
- `platforms` filters the step-4 fan-out: a platform not listed is marked `"skipped (not in operator config)"` without invoking its sub-skill.
- Pass `operator_name` to every platform sub-skill — each verifies its browser session is logged in as this operator before filling forms.

### 1. Resolve slug

If user passed a slug, use it. Otherwise query prod (anon key — events are public-read; RLS guards the data):

```bash
# Public anon key — safe to publish (it ships in the site's JS bundle).
# Rotated? Current value: VITE_SUPABASE_ANON_KEY in .env.prod.
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlc2p0dW9keml5a21qaWR1Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTgyNTQsImV4cCI6MjA4MDE3NDI1NH0.Z0Ap-VDprOzBRVEWF1wOXwVnNlCaqvv8i9JCCgiPsFY}"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
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

### 2b. Auth/session preflight — all platforms, one pass

Before any copy review or form-filling, check every platform in this run's scope (per the operator config's `platforms` list from step 0) is logged in as the operator — **together, in one pass**, not discovered one at a time mid-run.

For each in-scope platform, open its base page (todo.today `/my-events/`, `facebook.com` (own profile), `luma.com`, `eventbrite.com`, `sola.day` — only if the series has a `sola_group`) via claude-in-chrome and read the logged-in identity from the page (avatar/name in nav, account menu, etc.). Do not fill any form yet — this is a read-only identity check.

Report one table before proceeding:

```
todo.today:        <logged in as <name> | NOT logged in>
Facebook personal: <logged in as <name> | NOT logged in>
Luma:              <logged in as <name> | NOT logged in>
Eventbrite:        <logged in as <name> | NOT logged in>
Social Layer:      <logged in as <name> | NOT logged in | n/a — no sola_group>
```

**If any in-scope platform is NOT logged in:** stop here and list exactly which platforms need attention before continuing — this is the fix for Aug 30, where three of five platforms hit auth/consent walls mid-run instead of being caught together at the start. Do not proceed to step 3 until the operator confirms all in-scope platforms are ready (re-run this preflight, or explicitly say which platforms to skip via the operator config's `platforms` list).

### 3. Prepare cover photo once

The banner normally already exists — claritypledge.com auto-generates it when the event is created. Download it (portable, no credentials needed):

```bash
SLUG="<event-slug>"
PUBLIC="https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/${SLUG}.jpg"
LOCAL="$HOME/Downloads/clarity-event-photo.jpg"
curl -s -o "$LOCAL" -w "HTTP:%{http_code} bytes:%{size_download}\n" "$PUBLIC"
```

`HTTP:200` with non-zero bytes → write `LOCAL` and `PUBLIC` to the cache and continue.

**If the banner is missing (404/400):**
- `PROD_SUPABASE_SERVICE_ROLE_KEY` set (founder machine): run `./scripts/event-photo-prep.sh <slug> "<query>"` (generates via Unsplash + uploads to storage; founder-only, macOS-only) and parse its `LOCAL`/`PUBLIC` output.
- No service key (operator machine): stop and tell the user — "The event banner is missing. Open the event on claritypledge.com — the banner auto-generates on creation (use the Regenerate control on the event page if needed) — then re-run." Never attempt the upload path without the service key.

### 3b. Resolve the promo blurb (single source of truth)

This is what makes every platform's description consistent — no per-platform drift.

**If invoked by the events orchestrator (`slava:events:run`) with an already-approved blurb passed in:** use that text verbatim as the canonical promo blurb and **skip the rest of this step entirely, including its own approval stop below**. The orchestrator's combined copy review (its Gate 2) already resolved and approved this text — stopping again here would be a second approval turn for the same decision. This is the one required change for the orchestrator to wrap this skill without adding a duplicate stop.

**Otherwise (standalone invocation — no orchestrator, no pre-approved blurb), resolve it here as before:**

**If `series_doc` is set and contains a `## Promo blurb` section:**

1. Read the fenced code block inside `## Promo blurb`.
2. Read `short_link` and `register_cta` from the series-doc frontmatter.
3. Resolve placeholders:
   - `{short_url}` → `claritypledge.com/events/<short_link>` (the series short link auto-redirects to the latest event — never hardcode a per-event slug here)
   - `{register_cta}` → the `register_cta` value
4. The result is the **canonical promo blurb**. Pass it verbatim to every platform sub-skill in step 4.

**If `series_doc` is null or has no `## Promo blurb`:** generate the canonical blurb here, so every platform gets the same link discipline:

```
[ONE-LINE HOOK — first non-empty line of the event description]
Full details & registration: claritypledge.com/events/<slug>

[BODY — 2-4 key lines from the event description: what happens, who it's for, what to bring]

Register: claritypledge.com/events/<slug>
```

Pass this as the canonical promo blurb to every platform sub-skill in step 4, same as the series case.

**Link discipline (both branches):** the claritypledge event page is the ONLY destination ever linked — and it appears **twice**: right after the hook AND as the closing Register CTA. "One link only" in the platform skills means one *destination*, not one occurrence.

### 4. Fan out — sequential, in this order

Order: **todo.today → Facebook (personal) → Luma → Eventbrite → Social Layer**. Rationale: todo.today has the highest UI friction (tag picker, character truncation), so fail-fast there. Facebook needs visual cover-photo review. Luma is a stable UI. Eventbrite is a multi-step wizard (tickets + publish are separate steps the user drives). Social Layer (sola.day) is last — it has a group prerequisite and is skipped entirely when the series has no `sola_group`. The WhatsApp blurb (step 5) always runs after the full fan-out.

For each platform:

1. Skip if the platform is not in the operator config's `platforms` list (step 0) — mark `"skipped (not in operator config)"` and move on.
2. Skip if `status.<platform> === "done"` in cache.
3. Invoke the sub-skill via the Skill tool, passing the slug, **the canonical promo blurb from step 3b** (when resolved), **and the `operator_name` from step 0**:
   - `slava:events:promote-todo-today` with the slug
   - `slava:events:promote-facebook-personal` with the slug
   - `slava:events:promote-luma` with the slug
   - `slava:events:promote-eventbrite` with the slug
   - `slava:events:promote-sola` with the slug — **only if the series has a `sola_group` frontmatter value**; otherwise mark `sola = "skipped"` and move on
4. Wait for user reply:
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

To post this into configured group chats (WhatsApp/Telegram groups that auto-match by event type), run `/slava:events:promote-groups <slug>`.

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
