---
name: promote-email
description: "Send personalized event promo emails via Mailgun to a contact list"
when_to_use: "After WhatsApp in promote-dm, or standalone for email-only outreach. Reads audience from .private/campaigns/[slug]/audience.md."
version: 1.0.0
---

# Promote Event via Email

Sends personalized event invitation emails via Mailgun to contacts with an email address. Always tests first. Writes sent status per contact immediately after each send.

## Input

- `campaign_path` — path to the campaign folder (e.g. `.private/campaigns/ai-biz-cm-june-15/`)
- `subject` — email subject line
- `body` — email body (with `[firstname]` placeholder), or ask user to provide

---

## Steps

### 1. Load audience

Read `[campaign_path]/audience.md`. Select rows where `Email` is set AND `status` is `active` (not `declined`, `paused`, `email_sent`).

If rows with `status: email_sent` already exist: show count and ask — "N contacts already emailed. Send to remaining X only, or resend all?" Default: remaining only.

Report: "Ready to email N contacts."

### 2. Verify message

If `subject` or `body` not provided: ask. Show a preview with `[firstname]` resolved for the first contact.

Ask: "Good to send, or any changes?"

### 3. Send test

Send to Slava's personal Gmail (personal email from global CLAUDE.md) with firstname = "Slava".

```bash
source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
KEYRING_REASON="promote-email: send test email" keyring_require MAILGUN_API_KEY || exit 1   # locked half (P1318): keychain only; keyring_require only RETURNS non-zero, so the exit is what halts
# Auth header goes over stdin (curl -K -), never argv — argv is visible in ps.
printf 'header = "Authorization: Basic %s"\n' "$(printf 'api:%s' "$MAILGUN_API_KEY" | base64)" | curl -s -K - \
  https://api.eu.mailgun.net/v3/mg.claritypledge.com/messages \
  -F from="Slava <slava@claritypledge.com>" \
  -F to="[personal-gmail]" \
  -F subject="[subject]" \
  -F text="[body with firstname=Slava]"
```

Wait for: "Test sent to personal Gmail. Reply `ok` to send to all."

### 4. Bulk send — per-contact, with immediate status write

For each active contact with an email:

1. Resolve firstname from `Firstname` column. If empty, use full `Name` (first word). If still empty, omit firstname prefix entirely.
2. Load key once, then send per contact:

```bash
# Load once per bulk run — one dialog, then reuse $MAILGUN_API_KEY for every contact.
source "$(git rev-parse --show-toplevel)/scripts/keyring.sh"
[ -n "$MAILGUN_API_KEY" ] || KEYRING_REASON="promote-email: bulk send" keyring_require MAILGUN_API_KEY || exit 1   # keyring_require only RETURNS non-zero, so the exit is what halts
printf 'header = "Authorization: Basic %s"\n' "$(printf 'api:%s' "$MAILGUN_API_KEY" | base64)" | curl -s -K - \
  https://api.eu.mailgun.net/v3/mg.claritypledge.com/messages \
  -F from="Slava <slava@claritypledge.com>" \
  -F to="[email]" \
  -F subject="[subject]" \
  -F text="[body with firstname resolved]"
```

3. **Immediately** write `status: email_sent` to that row in `audience.md` — do not batch.
4. Log Mailgun message ID in a `mailgun_id` column if present.

### 5. Summary

Print:
```
Emails sent: N
Skipped (no email): N
Skipped (declined/paused): N
Failed: N
```

Update `campaign_path/audience.md` header: add `email_sent_at: YYYY-MM-DD`.

---

## Conventions

- **Credentials**: `MAILGUN_API_KEY` from the keychain (locked half, P1318 — not in `.env.local`); `MAILGUN_DOMAIN=mg.claritypledge.com`, `MAILGUN_REGION=eu` from `.env.local`
- **From**: always `Slava Ladischenski <slava@claritypledge.com>` (founder, 2026-10-01: full name, not bare "Slava"; sign-off stays "Slava")
- **Format**: multipart — a plain-text part plus a minimal HTML part (same words, no images or styling) so the footer reads "Don't want these invites? **Unsubscribe**" with the word linked. Text part ends `--\nDon't want these invites? Unsubscribe: %unsubscribe_url%`; also send header `h:List-Unsubscribe=<%unsubscribe_url%>`. With curl use `--form-string` — in `-F`, a value starting with `<` is read as a file and the send aborts.
- **Suppressions**: Mailgun auto-skips its unsubscribes/bounces/complaints lists; count them before a send and report.
- **Daily cap**: the plan allows **100 sends/day** (tests included). Over the cap Mailgun refuses with "daily request limit (100) exceeded, try again after …" — record the refused rows and retry after that time; never loop.
- **One test per send**, not several — repeated near-identical tests to the same inbox landed in spam (2026-09-15). Delivery can lag ~20 min after "accepted"; check events before re-testing.
- **Chiang Mai event emails** append the calendar P.S. from `.private/event-channels.json` (`email_ps`) after the sign-off; never in non-Chiang-Mai outreach.
- **Never batch-write status** — write per row immediately after send
- **Declined contacts are never sent to** — hard skip
- **Test recipient**: Slava's personal Gmail (from global CLAUDE.md profile) — not in the audience table, no dedup needed
