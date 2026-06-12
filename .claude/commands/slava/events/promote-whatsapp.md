---
name: promote-whatsapp
description: "Send personal WhatsApp DMs via Beeper to a contact list for a ClarityPledge event"
when_to_use: "After audience is built in promote-dm, or standalone for WhatsApp-only outreach. Reads audience from .private/campaigns/[slug]/audience.md."
version: 1.0.0
---

# Promote Event via WhatsApp (Personal DMs)

Sends personalized 1:1 WhatsApp messages via Beeper MCP to a contact list. Always tests first. Writes sent status per contact immediately after each send.

## Input

- `campaign_path` — path to the campaign folder (e.g. `.private/campaigns/ai-biz-cm-june-15/`)
- `message` — the message to send (with `[firstname]` placeholder), or ask user to provide

---

## Steps

### 1. Load audience

Read `[campaign_path]/audience.md`. Parse the audience table. Select rows where `WA_chatID` is set AND `status` is `active` (not `declined`, `paused`, `sent`).

If rows with `status: sent` already exist: show count and ask — "N contacts were already sent. Send to remaining X only, or resend all?" Default: remaining only.

Report: "Ready to send to N contacts via WhatsApp."

### 2. Verify message

If `message` not provided: ask for it. Show the message with `[firstname]` resolved for the first contact as a preview.

Ask: "Good to send, or any changes?"

### 3. Send test

Load Beeper MCP via ToolSearch. Send to own chatID `1011` with firstname = "Slava".

Show: "Test sent to your WhatsApp (chatID 1011). Reply `ok` to send to all, or edit the message first."

Wait for approval.

### 4. Bulk send — per-contact, with immediate status write

For each active contact with a `WA_chatID`:

1. Resolve firstname from `Firstname` column. If empty, use full `Name` (first word only). If still empty, send without firstname prefix.
2. Select template by `Lang` column: EN (default) or RU (use Russian version of message — ask user to provide if not already in campaign doc).
3. Verify chatID before sending: call Beeper `get_chat` or `list_chats` and confirm the contact display name contains the expected name. If mismatch → skip, flag as `status: verify_needed`, continue.
4. Send message via Beeper MCP `send_message` with the resolved chatID.
5. **Immediately** write `status: sent` to that row in `audience.md` — do not batch.

Log any failures inline. Continue on failure (don't abort entire run).

### 5. Summary

Print:
```
WhatsApp sent: N
Skipped (no chatID): N
Skipped (declined/paused): N
Needs verification: N
Failed: N
```

Update `campaign_path/audience.md` header: add `wa_sent_at: YYYY-MM-DD`.

---

## Conventions

- **Never batch-write status** — write per row immediately after send. Interrupted runs resume cleanly.
- **Declined contacts are never sent to** — `status: declined` is a hard skip, no override.
- **Test chatID (1011) is excluded from bulk send** — it is a test-only row.
- **chatID verification** — stale IDs (bridge restart, device migration) send to wrong person. Verify display name before sending.
- **Language** — `Lang: RU` contacts get Russian template. Ask user for RU version if not provided; never auto-translate without showing the result.
