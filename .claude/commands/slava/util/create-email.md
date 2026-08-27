---
name: create-email
description: "Create a new email mailbox on any All-Inkl hosted domain"
when_to_use: "When setting up a new email address on All-Inkl."
version: 1.0.0
---

# Create Email Account (All-Inkl)

Create a new email mailbox on any All-Inkl hosted domain via KAS browser automation.

## Usage

```
/slava:create-email ops@claritypledge.com
/slava:create-email support@example.com
```

## Process

### Step 1: Get a session URL

All-Inkl Members Area uses session tokens — you can't navigate there cold.

Ask the user: "Can you paste the All-Inkl members URL from your browser?"
It looks like: `https://all-inkl.com/members/?s=XXXXXX&vk=`

Or if already have a valid session tab open, use it directly.

### Step 2: Navigate to KAS

From the Members Area, find and click "Technische Verwaltung" → then "KAS Login".
This opens KAS in a new tab (format: `https://kas.all-inkl.com/?l=XXXXXXXX`).

Note the `l=` token — needed for all KAS URLs.

### Step 3: Go to email creation form

Navigate directly:
```
https://kas.all-inkl.com/email/email-account/create?FOR={domain}&l={token}
```

Replace `{domain}` with the target domain (e.g. `claritypledge.com`) and `{token}` with the `l=` value.

### Step 4: Fill the form

1. Click the E-Mail-Adresse field, type the local part (e.g. `ops`)
2. Verify the domain dropdown shows the correct domain
3. Click "Automatisch generieren" to generate a strong password
4. Read the generated password via JS before saving:
   ```js
   document.querySelector('#password').value
   ```
5. Click "Speichern" (Save)

Success: URL changes to `email-account/edit?mail_login=XXXXXXXX`

### Step 5: Save credentials

Add to `.env.local`:
```bash
# {email} — created {date}, purpose: {why}
# IMAP/SMTP: w00dd4f1.kasserver.com
{ENV_VAR}_EMAIL={email}
{ENV_VAR}_EMAIL_PASSWORD={password}
```

Also update `docs/technical/accounts.md` with the new account entry.

## IMAP/SMTP Settings (for any All-Inkl mailbox)

| Setting | Value |
|---------|-------|
| Incoming (IMAP) | `w00dd4f1.kasserver.com`, port 993, SSL |
| Outgoing (SMTP) | `w00dd4f1.kasserver.com`, port 587, STARTTLS |
| Username | Full email address (e.g. `ops@claritypledge.com`) |
| Password | As set during creation |

## Notes

- All-Inkl session tokens expire — always get a fresh URL if the session is stale
- The `l=` token in KAS URLs is separate from the members area `s=` token
- Password requirements: 12+ chars, 1 digit, 1 lowercase, 1 uppercase, 1 special char, no `&`, `%`, `$`
- "Automatisch generieren" always produces a compliant password
