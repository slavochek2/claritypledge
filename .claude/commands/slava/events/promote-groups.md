---
name: promote-groups
description: "Post an event blurb into the mapped WhatsApp/Telegram group chats via Beeper"
when_to_use: "After the event is published, to share into recurring group chats. Reads group mapping from .private/event-channels.json"
version: 1.3.0
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

**A blurb is a proper invitation, not a headline.** These post into real community group chats as the founder, so the copy must read like a person inviting friends, not a calendar entry. Every language variant must contain, in a warm conversational voice:

- A personal opener ("Hey everyone 👋 I'd love to invite you…")
- What it is + when: day, date, start time
- **Duration** (e.g. "about 5 to 6 hours") — people plan their day around this
- Pace / vibe / what to expect (relaxed pace, difficulty, scenery)
- **Meeting point** and any parking/access note
- What to bring (if physical) and cost/fee if any
- A clear "all welcome" + the RSVP link

Pull these facts from the event's `description`, `duration_minutes`, `location`, and `datetime` (query the events REST API by slug — same call as Step 1 with `select=description,duration_minutes,location,datetime`). **No em/en dashes** in the copy (founder-voice rule); hyphens in ranges ("5-6") are fine. If the config `blurbs` are still skeletal one-liners, STOP and rewrite them to this standard before probing — a terse headline is not an approvable invitation.

**Reference example (English, hike):**

```
Hey everyone 👋 I'd love to invite you on a morning hike this Sunday, July 5.

🥾 Clarity Hike: Buddha Footprint to Doi Pui Peak, in Doi Suthep-Pui National Park
🕘 9:00 AM start, plan for about 5 to 6 hours including breaks
🚶 Relaxed pace. We walk as far as we feel like, turn around together, and head back the same way. No pressure to finish the whole route
📍 Meet at Ban Pa Nok Nook trailhead (a motorbike is easiest for parking)
⛰️ Forest, mountain views and the Buddha Footprint. Some steep, slippery sections, so bring trail shoes, 2L of water, snacks and a rain jacket

All welcome, no strings attached. Full details and RSVP:
claritypledge.com/events/hike
```

Because route, meeting point, duration, and difficulty change every event, the hike `blurbs` are **hand-written per event** in all four languages (translations, not one auto-translated from another — the operator writes/approves each). The `_note` field in the config records this.

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

**Staleness check (hard stop) — a deterministic token test, not a judgment call:**

After placeholders are resolved, assert **each** resolved blurb text contains the current event's date string, formatted the way step 3's `{date}` resolution produced it for that language (e.g. `en` → "Jul 5"; `es`/`ru`/`de` → "5.7" or the explicit localized form). If the matched type entry in `.private/event-channels.json` also defines a `venue_token` (optional field — see schema note below), assert that token is present too. This is a plain substring test, run for every language, not an LLM read of "does this sound current."

If any language's blurb is **missing** the required date/venue token(s): **STOP.** Do NOT proceed to the link-liveness check, probe, or approval. Report: "Staleness check failed for {lang}: expected date token `{token}` not found in the resolved blurb. This blurb may be reused from a past event — rewrite `blurbs.{lang}` in `.private/event-channels.json` before re-running." A stale hand-written blurb (correct format, wrong event — the July 5 failure) has zero unresolved `{placeholder}` tokens and would otherwise pass every other guard in this step.

**Schema note (no data change):** `.private/event-channels.json` type entries may optionally carry a `venue_token` string (e.g. a trail or venue name that must appear in every blurb for that type). This spec does not populate it — it only defines the field the check above reads if present.

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

**The probe is required on every style/tone revision, not only once at the top.** If, at any point later in this run (approval-gate edits, a re-run after `abort`, an operator-requested rewrite), any language's blurb text changes from what was probed here, re-run this probe for the revised language variant(s) and get a fresh `ok` before that text is sent to any group. Three copy-style iterations going straight into three different live community groups in one session is the failure this closes — the probe binds to the *text actually about to be sent*, not to "a probe happened earlier this run."

### 5. Approval gate

**If invoked by the events orchestrator (`slava:events:run`) with already-approved group blurbs passed in:** the wording was already shown and approved at the orchestrator's combined copy review (its Gate 2) — **skip item 1 below** (do not re-show the copy for a second wording approval; that would be the same duplicate-approval-turn defect the orchestrator's design closes for `promote-all` step 3b). The blast-radius group-count confirmation (item 2 + the ask) is unchanged and always runs — it is a distinct gate (Gate 4 in the orchestrator's numbering) about send scope, not wording, and stays inherited unmodified regardless of who invokes this skill.

**Otherwise (standalone invocation), show, in this order:**

1. **Full copy for EVERY language, copy-paste ready.** For each distinct language present, print a clearly demarcated block the operator can copy verbatim into a chat — even if only one language is being posted, show all resolved languages. Format per language:
   - A header line: `### <LANGUAGE NAME> — posts to N group(s)`
   - The exact message text on its own lines, bounded above and below by a `---` separator so it copies clean (no blockquote `>` prefixes, no surrounding prose on the text lines).
   - This is mandatory and never abbreviated — the operator approves the wording from THIS display, not from the self-chat probe. If any language's copy is missing here, that is a skill defect: STOP and fix before asking for approval.
2. The full target group list, each row: **name**, **platform**, **lang**, **verified_name** — so the operator sees which language each group receives.

**Blast-radius cap (always runs, orchestrated or standalone):** If the eligible group list contains **6 or more groups**, require the operator to type the exact count as confirmation (e.g., "7") rather than a one-click approval. No bulk gate for large fan-outs.

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

**c. Verify-by-content, not by timestamp:**

After the send call returns, confirm the message actually landed by searching the chat's recent content for a distinctive substring of the sent text — not by checking that the chat's last-activity timestamp moved (one busy chat's timestamp moved from unrelated traffic while the send itself hadn't landed).

**Which tool call to use:** this file does not hardcode a Beeper MCP tool name for content search — `ToolSearch` for the Beeper MCP's message/content-search tool at runtime (its exact name is not verified as of this writing; do not guess or invent one). If no content-search tool exists in the loaded Beeper MCP, content verification is unavailable — fall back to `get_chat`'s last-activity field, but treat that fallback as weaker evidence and note it explicitly in the status write (e.g. `"verify_method": "timestamp_fallback"`).

**Never resend blind after a connection error.** If the send call itself errors (timeout, dropped connection), re-verify by content **before** retrying — the message may have landed despite the error. Only retry if content verification confirms it did NOT land. Retrying without this check risks a duplicate post to a live group.

**d. Write status immediately:**

After each send (success or failure) and its content verification, write the group's row to the state file before moving to the next group. Never batch.

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
- **Staleness is a token test, never a judgment call** — every resolved blurb must contain the current event's date (and venue token, if the type defines one). A reused blurb with zero unresolved placeholders is exactly the shape that must fail this check.
- **Probe binds to the text being sent, not to "a probe happened this run"** — any mid-run copy revision needs its own fresh self-chat probe before it reaches a group.
- **Verify-by-content, never by timestamp, and never resend blind** — a send is confirmed by finding the actual text in the chat, not by a moved last-activity timestamp; a connection error triggers re-verification before any retry.
