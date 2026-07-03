---
name: promote-groups
description: "Post an event blurb into the mapped WhatsApp/Telegram group chats via Beeper"
when_to_use: "After the event is published, to share into recurring group chats. Reads group mapping from .private/event-channels.json"
version: 1.0.0
---

# Promote Event into Group Chats

Posts the event blurb into WhatsApp and Telegram group chats configured for the event type. Sibling to `promote-whatsapp` (personal DMs) and `promote-all` (public platforms). Group posting has higher blast radius than DMs — guards are correspondingly stricter.

## Input

Event slug, URL, or title. If not provided, use the most recent upcoming event.

---

## Steps

### 1. Resolve event

Accept slug, URL, or title. **Canonicalize to slug** before any state read/write (run-by-title and run-by-slug must not produce two state files).

If no input provided, query prod for the next upcoming event:

```bash
# Anon key: VITE_SUPABASE_ANON_KEY from .env.prod (public — ships in the site's JS bundle)
ANON_KEY="$(grep VITE_SUPABASE_ANON_KEY .env.prod | cut -d= -f2)"
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?order=datetime.asc&status=eq.upcoming&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

Extract `slug`, `title`, `datetime`.

Report: "Resolved event: «{title}» ({slug}), {datetime in Asia/Bangkok as 'MMM D, YYYY'}."

### 2. Load and validate config

Read `.private/event-channels.json` (repo-relative, gitignored).

**Config validator (hard refuse — run before any matching):**

Reject the run with a clear error if ANY of these are true:
- Any `match` pattern is empty, equals `"%"`, or contains `%`
- Any `groups` array is empty (nothing to do — stop)
- Any group in `groups` lacks a `chatID` (a missing ID cannot be verified and cannot be sent to)

If the file is absent or the validator fires: report what's wrong and stop. Do not auto-continue to posting.

**Match title against types (first-match-wins, top-to-bottom):**

For each entry in `types` (in order):
- Check each pattern in the entry's `match` array
- A pattern matches iff `title.toLowerCase().startsWith(pattern.toLowerCase())`
- No `%` wildcards, no substring matching, no regex — literal anchored prefix only
- First entry with any matching prefix wins. Stop evaluating further entries.
- Dedup by `chatID` within the matched entry's `groups` only

**If no entry matches:**

Report: "No group mapping found for «{title}». To add one, run this skill again after updating `.private/event-channels.json`."

Offer to show the current config schema and an example entry. **Do not auto-continue** — the operator adds the entry and re-runs.

**If matched:**

- Filter out groups with `status: "declined"` — hard skip, no override, not shown in eligible list
- Report: "Matched type `{type}` → {N} eligible group(s): {name1} ({platform1}, {lang1}), {name2} ({platform2}, {lang2}), ..."

### 3. Resolve blurbs — one per language present

Each group carries a `lang` field (`en`/`es`/`ru`/`de`, default `en` if absent). Collect the **distinct set of langs** across the eligible groups, and resolve one blurb per lang.

**Source per lang (first that provides a non-empty resolved text wins):**

1. **`blurbs[lang]` in the matched config entry** — the map keyed by language. This is the canonical source for multi-language event types (e.g. the hike).
2. **Legacy `blurb` field** (single-string, no `blurbs` map) — used only for `lang: "en"`; back-compat for entries not yet migrated.
3. **Series-doc `## WhatsApp blurb`** — the fenced block from the series doc auto-detected via `promote-all`'s title-prefix table (English only).
4. **Ask the operator** — if a needed lang has no source, stop and ask for that language's blurb text.

**Missing-language hard stop:** if any eligible group's `lang` has no resolvable blurb, STOP before the probe. Report: "Group «{name}» is `lang: {lang}` but no `{lang}` blurb exists. Add `blurbs.{lang}` to the config or remove the group. Not posting." Never fall back to another language — posting English into a Spanish/Russian/German group is a defect, not a degrade.

**Resolve placeholders (in order), per blurb:**

- `{date}` → event date in `Asia/Bangkok`, formatted **per the blurb's language** (an English "Jul 5" reading inside a Russian/German sentence is the wrong-language defect the per-lang split exists to avoid): `en` → "MMM D" ("Jul 5"); `es`/`ru`/`de` → language-neutral numeric day-dot-month ("5.7") to avoid an English month name. If a localized month name is preferred over numeric, provide it explicitly.
- `{n}` → `#N` parsed from the event title via regex `/#(\d+)/` (e.g., `AI Running Club #7` → `7`)
- `{short_url}` → `claritypledge.com/events/<short_link>` where `short_link` comes from the series-doc frontmatter, or falls back to the event slug. (Config blurbs may also hardcode a series short link like `claritypledge.com/events/hike` — those need no resolution.)

**Placeholder leak guard (hard stop):** After resolution, scan **each** blurb with `/\{[a-z_]+\}/`. If any unresolved token survives in any language:
- STOP. Do NOT proceed to probe, approval, or sending.
- Report: "Unresolved placeholder(s) in {lang}: {list}. Resolve before re-running."

(Group posting has no human paste-filter unlike `promote-all`. This guard is mandatory.)

### 3b. Link-liveness check (hard stop)

Before the probe, extract every URL from every resolved blurb (pattern `https?://\S+` and bare `claritypledge.com/\S+`). Check each distinct URL. **Important: claritypledge.com is a SPA — it returns HTTP `200` for every path, including nonexistent routes. A bare `200` proves nothing.** Check by URL shape:

- **Series short link `claritypledge.com/events/<series>`** (e.g. `/events/hike`): resolve via the redirect API and confirm it points at a *specific event*, not the empty listing:
  ```bash
  curl -s --max-time 10 -o /dev/null -w "%{redirect_url}" "https://claritypledge.com/api/series-redirect?series=<series>"
  ```
  PASS only if the redirect target matches `…/events/<slug>` with a non-empty slug segment. FAIL if it is bare `…/events` (no upcoming event for that series) or empty/timeout.
- **Direct event slug `claritypledge.com/events/<slug>`**: query the events REST API for that slug (see Step 1's curl) and PASS only if a row is returned. A `200` from the SPA route is NOT sufficient.
- **Any other URL**: follow redirects, require final `200` **and** non-empty body (`--max-time 10`).

If any URL fails: **STOP.** Report: "Link check failed: {url} → {reason}. Fix the link before posting." Do not probe or send. Runs once per distinct URL, not per group.

### 4. Transport probe

Load Beeper MCP via ToolSearch. Send **each distinct-language blurb** to self-chat chatID `1011` as a transport probe (one message per language, prefixed with the lang code, e.g. `[EN] …`, `[ES] …`).

Show: "Probe sent to your self-chat (1011) — {N} language variant(s). Reply `ok` to continue, or abort."

Wait for `ok`. (Group posting is higher-stakes than DMs — the probe is required, not optional.)

### 5. Approval gate

Show:
1. **Every resolved blurb, grouped by language** — the verbatim text per language (exactly what will be posted, no paraphrasing), each under its lang header. The operator can also copy any variant from here for manual posting.
2. The full target group list, each row: **name**, **platform**, **lang**, **verified_name** — so the operator sees which language each group receives.

**Blast-radius cap:** If the eligible group list contains **6 or more groups**, require the operator to type the exact count as confirmation (e.g., "7") rather than a one-click approval. No bulk gate for large fan-outs.

Ask: "Post to the above groups? Reply with the group count to confirm, or `abort`." (For ≤5 groups: "Reply `post` to confirm, or `abort`.")

Wait for explicit confirmation. Do not proceed on any other reply.

### 6. Per-group send — fail-closed verify, immediate status write

State file: `~/.private/event-state/{slug}.groups.json` (separate from `{slug}.json` owned by `promote-all` — never clobber).

Schema:

```json
{
  "slug": "<event-slug>",
  "type": "<matched type key>",
  "groups": [
    {
      "chatID": "<beeper-chatID>",
      "name": "<config name>",
      "platform": "<whatsapp|telegram>",
      "status": "sent|skipped_declined|verify_unavailable|verify_needed|failed",
      "posted_at": "<ISO timestamp or null>",
      "blurb_hash": "<first 8 chars of blurb sha256 — detects same group, different text>"
    }
  ],
  "updated_at": "<ISO timestamp>"
}
```

**Idempotency key: `{type, chatID, blurb_hash}`.** Before sending to any group, read the state file (if it exists) and compare against the blurb about to be sent (compute its `blurb_hash`):
- **Same `{type, chatID}` AND same `blurb_hash`** → already posted, identical text. Skip: "Already posted to {name} on {posted_at} — skipping." A rescheduled event (different slug, same type/chatID/text) is recognized and not re-posted.
- **Same `{type, chatID}` but DIFFERENT `blurb_hash`** → the text changed since last post (a correction — fixed date, broken link, etc.). Do NOT silently skip. Warn: "Text changed since {posted_at} for {name}. Re-post the corrected version? (yes/skip)" and act on the reply. (Silent skip here means a correction never reaches the group that saw the wrong post.)

For each eligible group (in config order):

**a. Verify — positive confirmation only (fail-closed):**

Call Beeper `get_chat` on the chatID. The send proceeds **only if ALL of the following hold**:
- The call returned a non-error result (no error, no timeout, no empty response)
- `isGroup === true`
- `chat.network` equals `group.platform` (exact match — `whatsapp` ≠ `telegram`)
- The live display name equals `group.verified_name` after **both** are Unicode-normalized to NFC, lowercased, and trimmed. (NFC normalization is mandatory — emoji/flag names like `🇨🇭🇩🇪🇦🇹Chiang Mai🇨🇭🇩🇪🇦🇹` and `Español Mai? 🌯🌮` can arrive in a different normalization form than the config literal, which would fail an unnormalized `===` and silently drop the group on every run.)

If **any** check fails or the result is ambiguous:
- Skip this group. Flag as `verify_unavailable` (call failed/empty/timeout) or `verify_needed` (call succeeded but assertion failed).
- Write the status immediately to the state file.
- Log: "⚠️ Skipped {name}: {reason}. Not sent."
- Continue to the next group.

**Never send when verification did not positively confirm.** A call that did not return a positive result is not a pass.

**b. Send:**

Select the blurb for **this group's `lang`** (resolved in Step 3). Send it via Beeper `send_message` to the chat object returned by the verify call — not to a re-resolved config string (avoids TOCTOU drift). A group never receives a language other than its own `lang`.

**c. Write status immediately:**

After each send (success or failure), write the group's row to the state file before moving to the next group. Never batch.

### 7. Summary

Print:

```
Posted:                  N
Skipped (declined):      N
Skipped (verify failed): N
Failed:                  N
```

For each `verify_unavailable` or `verify_needed` group, note: "Re-trigger required — these are never auto-retried." (A transient auth drop must not become a delayed wrong-post on the next run.)

---

## Conventions

- **Never batch status writes** — write per group immediately after send or skip. Interrupted runs resume cleanly.
- **Declined groups are never sent to** — `status: "declined"` is a hard skip, no override (mirrors `promote-whatsapp`'s convention).
- **Fail-closed verify** — no send unless verification positively confirmed group identity, platform, and display name. Absence of failure ≠ confirmation.
- **verify_needed / verify_unavailable are never auto-retried** — require explicit operator re-trigger.
- **Transport probe is mandatory** — always proves Beeper is live before any real group post.
- **Verbatim text always shown** — the exact string posted is displayed at approval; no paraphrasing.
- **Group posting is "DMs but irreversible and to hundreds"** — its guards must be stricter than the DM path, not inherited loose.
- **State is isolated from `promote-all`** — `{slug}.groups.json` is separate from `{slug}.json`.
- **Language is per-group, never inferred** — each group receives its `lang` blurb only. A missing `blurbs[lang]` is a hard stop, never a fall-back to English.
- **Links are verified live before posting** — every URL in every blurb must resolve to a final `200` (Step 3b). Group posting has no human paste-filter, so a dead RSVP link would reach hundreds silently.
