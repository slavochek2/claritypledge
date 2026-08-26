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

**CRM query pattern (SQLite):**
```bash
sqlite3 ~/Projects/private/personal/data/crm.db \
  "SELECT name, email, city FROM contacts WHERE city LIKE '%Chiang Mai%' AND campaign_status != 'declined'"
```

**Supabase prod users** (for ClarityPledge-registered contacts):
```bash
PROD_KEY=$(grep PROD_SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)
curl -s "https://besjtuodziykmjidubzw.supabase.co/auth/v1/admin/users?page=1&per_page=200" \
  -H "apikey: $PROD_KEY" -H "Authorization: Bearer $PROD_KEY"
```

**Past campaign chatIDs:** read all `.private/campaigns/*/audience.md` files and extract existing chatID entries for known contacts — avoids re-searching Beeper.

Merge sources. For each contact, populate:

| Column | Source |
|--------|--------|
| Name | CRM / Supabase `user_metadata.full_name` / Beeper display name |
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
