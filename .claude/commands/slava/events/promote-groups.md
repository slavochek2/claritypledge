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
- Report: "Matched type `{type}` → {N} eligible group(s): {name1} ({platform1}), {name2} ({platform2}), ..."

### 3. Resolve blurb

Precedence (first that provides a non-empty resolved text wins):

1. **Inline `blurb` in config** — the matched entry's `blurb` field. For event types with no series doc (e.g., the hike), this is the canonical source.
2. **Series-doc `## WhatsApp blurb`** — read the fenced code block inside `## WhatsApp blurb` from the series doc auto-detected via `promote-all`'s title-prefix table.
3. **Ask the operator** — if neither is available, stop and ask for the blurb text.

**Resolve placeholders (in order):**

- `{date}` → event date as "MMM D" (e.g. "Jul 5") in `Asia/Bangkok`
- `{n}` → `#N` parsed from the event title via regex `/#(\d+)/` (e.g., `AI Running Club #7` → `7`)
- `{short_url}` → `claritypledge.com/events/<short_link>` where `short_link` comes from the series-doc frontmatter, or falls back to the event slug

**Placeholder leak guard (hard stop):**

After resolution, scan the text with the pattern `/\{[a-z_]+\}/`. If any unresolved token survives:
- STOP. Do NOT proceed to approval or sending.
- Report: "Unresolved placeholder(s): {list of tokens}. Resolve these before re-running."

(Group posting has no human paste-filter unlike `promote-all`. This guard is mandatory.)

### 4. Transport probe

Load Beeper MCP via ToolSearch. Send the resolved blurb to self-chat chatID `1011` as a transport probe.

Show: "Probe sent to your self-chat (1011). Reply `ok` to continue, or abort."

Wait for `ok`. (Group posting is higher-stakes than DMs — the probe is required, not optional.)

### 5. Approval gate

Show:
1. The verbatim resolved blurb text (exactly what will be posted — no paraphrasing)
2. The full target group list with each group's **name**, **platform**, and **verified_name**

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

**Idempotency key: `{type, chatID}`.** Before sending to any group, read the state file (if it exists) and check whether `{type, chatID}` was already sent. If found: show "Already posted to {name} on {posted_at} — skipping." A rescheduled event (different slug, same type and chatID) is recognized and not re-posted.

For each eligible group (in config order):

**a. Verify — positive confirmation only (fail-closed):**

Call Beeper `get_chat` on the chatID. The send proceeds **only if ALL of the following hold**:
- The call returned a non-error result (no error, no timeout, no empty response)
- `isGroup === true`
- `chat.network` equals `group.platform` (exact match — `whatsapp` ≠ `telegram`)
- The live display name, after lowercasing and stripping leading/trailing whitespace, equals `group.verified_name` lowercased the same way

If **any** check fails or the result is ambiguous:
- Skip this group. Flag as `verify_unavailable` (call failed/empty/timeout) or `verify_needed` (call succeeded but assertion failed).
- Write the status immediately to the state file.
- Log: "⚠️ Skipped {name}: {reason}. Not sent."
- Continue to the next group.

**Never send when verification did not positively confirm.** A call that did not return a positive result is not a pass.

**b. Send:**

Send via Beeper `send_message` to the chat object returned by the verify call — not to a re-resolved config string (avoids TOCTOU drift).

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
