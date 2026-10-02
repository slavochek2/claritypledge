---
name: promote-dm
description: "Orchestrate personal event outreach via WhatsApp (Beeper) and optionally email (Mailgun)"
when_to_use: "When promoting a ClarityPledge event to a specific audience via personal DMs. Sibling to promote-all (which handles public platforms). Run after the event is published."
version: 1.0.0
---

# Promote Event via Personal DMs

Builds a contact list for a specific event audience, sends personal WhatsApp messages via Beeper, then optionally emails ClarityPledge users. Saves everything to `.private/campaigns/[slug]/audience.md` for reuse.

This is the personal outreach skill. For broadcast promotion (Facebook, Luma, todo.today etc.) use `/promote-all`.

---

## Input

Event slug or description, plus audience signal. If not provided, ask:
1. **What event?** (slug, or describe: "the June 15 panel at 4Seas")
2. **Who's the audience?** (natural language — see signal table below)

---

## Step 1 — Check for existing campaign

Look for `.private/campaigns/*/audience.md` files matching the event slug or description. If found:

> "Found campaign for [event] from [date] — N contacts, N sent. Reuse this list (skip/add people), or build fresh?"

If reusing: load it, skip to step 3.

---

## Step 2 — Build audience

Translate the audience signal to data sources:

| User says | Query |
|-----------|-------|
| "Chiang Mai contacts" / city name | Past campaigns with matching city + CRM `pp/data/crm.db` WHERE city LIKE '%CM%' + Supabase prod users with Mixpanel geolocation matching city |
| "people from [past event]" | Supabase `event_rsvps` WHERE event_id = [event] |
| "my [tier] contacts" e.g. "founders" | CRM `tier_label = 'founder'` (or other tier) |
| "same as last time" | Most recent campaign folder for this city/event |
| "people in my Beeper for [city]" | Beeper MCP contact search by name pattern |
| custom description | Ask clarifying questions, then combine sources |

Query the relevant source(s), deduplicate by email + chatID, resolve firstnames.

**Exclusion check — before the list is shown for pruning.** Read `.private/event-contact-exclusions.json` (`people[]`). Drop any contact whose Beeper chatID or name matches an entry's `beeper_chat_id`/`match[]` — do not include them in the audience table at all, don't ask, don't re-surface them next campaign. This is a hard block, same status as the trail and group-chat exclusion lists (`docs/events/process.md` § Exclusions). If the file is missing or empty, proceed with no exclusions.

**CRM query pattern (SQLite):**
```bash
sqlite3 ~/Projects/private/personal/data/crm.db \
  "SELECT name, email, city FROM contacts WHERE city LIKE '%Chiang Mai%' AND campaign_status != 'declined'"
```

**Supabase prod users** (for ClarityPledge-registered contacts) — a read, so it runs on the read-only helper, never the prod master key (P1214):
```bash
python3 "$(git rev-parse --show-toplevel)/scripts/supabase-readonly-sql.py" --env prod \
  "SELECT id, email, raw_user_meta_data->>'full_name' AS full_name, created_at FROM auth.users ORDER BY created_at DESC LIMIT 200"
```

**Past campaign chatIDs:** read all `.private/campaigns/*/audience.md` files and extract existing chatID entries for known contacts — avoids re-searching Beeper.

Merge sources. For each contact, populate:

| Column | Source |
|--------|--------|
| Name | CRM / Supabase `full_name` / Beeper display name |
| Email | CRM / Supabase auth |
| WA_chatID | Past campaigns (preferred) / Beeper MCP search |
| Firstname | First word of Name, or user-provided |
| Lang | Past campaign notes / CRM notes (default: EN) |
| Source | Where this contact came from |
| Status | `active` (default) |
| Past_contact | Most recent campaign slug where this contact appeared |

---

## Step 3 — Surface past history and declined contacts

For each contact appearing in a past campaign:
- Show `Past_contact` column
- Flag anyone with `status: declined` in past files — **pre-set their status to `declined`** in this list, show them separately
- Ask: "These N were previously contacted — include all, or skip some?"

Declined contacts are shown but **never auto-included**. User must explicitly override.

---

## Step 4 — User prunes list

Show the full proposed table. Ask:

> "N contacts ready. Any to add, remove, or change status? Reply `ok` to proceed."

---

## Step 5 — Create campaign folder

Slug = `[city]-[event-short-name]-[YYYY-MM-DD]` (e.g. `cm-panel-2026-06-15`). Confirm with user if unclear.

Write `.private/campaigns/[slug]/audience.md`:

```markdown
# Audience: [Event Name]
Date: YYYY-MM-DD
City: [city]
Target signal: [what was used]
wa_sent_at: —
email_sent_at: —

| Name | Email | WA_chatID | Firstname | Lang | Source | Status | Past_contact |
|------|-------|-----------|-----------|------|--------|--------|--------------|
```

---

## Step 5b — Reply status, sheet, drafts (learned on Clarity Night #2, 2026-10-02)

1. **Reply status from Beeper, not memory.** Pull every 1:1 message since the previous invite
   window via the Beeper local API `GET /v1/messages/search?chatType=single&dateAfter=…&sender=me|others`
   (page to exhaustion; confirm the oldest message reaches the window start). For each person: invite
   sent? replied after it? what they said? Registered/came (prod `event_rsvps`)? Do NOT run the full
   `mirror-beeper.py` refresh for this — it crashed Beeper Desktop twice under load.
2. **Working surface is a Google Sheet** the founder edits: Tier, Name, Chat ID, invite date, Replied?,
   What they said, Recommendation, Why, Your call, Draft, Status, **Final list** (DM / email /
   organiser / -). Emails live in the same sheet. When writing back, **match rows by Chat ID, never
   by position** — the founder re-sorts mid-session.
3. **Tiers:** warm invite (link) · light ask ("May I send you the link?") · last nudge (close, no
   reply) · respectful last message (thin, no reply) · opt-out line · drop · skip (away) · organiser
   ask · email.
4. **The founder's voice** (from his edits): open with "I'd like to invite you…", never "I'm
   hosting…"; say why it fits *them* first; relative time ("Tuesday next week, 18:30 at Zuzalu"); a
   personal hook first and the invite as a P.S. for new contacts; their language (German, Russian…).
   **Opt-out line:** "I now run these weekly on different topics. I don't like to spam you, so unless I
   hear back from you, I will stop sending you these invites. Otherwise please let me know." Never ask
   "would you like me to keep sending?".
5. **Messenger card** (`/slava:events:messenger-card`): offer it before drafting. Attach it ONLY to
   messages that already contain the link. A "may I send the link?" ask goes as text; whoever says
   yes gets the link + card as the reply.
6. Re-read the sheet immediately before sending; send only `Final list = DM/organiser` rows whose
   Status is empty; write SENT + (card|text) back per row.

## Step 6 — WhatsApp (always first)

Ask for the message (or draft one if user provides event details). Then invoke `promote-whatsapp` with `campaign_path`.

Wait for WhatsApp to complete.

---

## Step 7 — Email (optional)

After WhatsApp completes, ask:

> "WhatsApp done. Send email to contacts with an email address too? (N contacts have email)"

If yes: ask for subject + body (or reuse the WhatsApp message adapted for email). Invoke `promote-email` with `campaign_path`.

If no: done.

---

## Step 8 — Summary

```
Campaign: [slug]
WhatsApp sent: N  |  Failed: N  |  Skipped: N
Email sent: N     |  Failed: N  |  Skipped: N
Saved: .private/campaigns/[slug]/audience.md
```

---

## Conventions

- **`.private/campaigns/` is the memory** — every run saves the audience file. Future runs read it.
- **Declined = hard skip** — never sends to status:declined without explicit user override in the same session.
- **chatIDs from past campaigns are preferred** — Beeper search is the fallback, not the default.
- **Both channels share one audience file** — email and WhatsApp status columns are independent (a contact can be `wa_sent` but still `email_active`).
- **Sequential: WhatsApp first** — email only offered after WhatsApp completes.
