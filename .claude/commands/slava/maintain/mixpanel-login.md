---
name: mixpanel-login
description: Log into Mixpanel EU project via magic link. Uses slavochek-gmail MCP to fetch the link automatically. NOTE — prefer Mixpanel MCP for queries (no login needed). Use this skill only when Chrome-based Mixpanel access is required (e.g., creating alerts, visual board inspection).
when_to_use: "When Chrome-based Mixpanel access is needed (alerts, dashboards). Prefer Mixpanel MCP for queries."
version: 1.0.0
---

# /slava:maintain:mixpanel-login

**Prefer Mixpanel MCP** (`mcp__mixpanel__*`) for queries — no login needed. Use this skill only when Chrome-based access is required (creating alerts, visual inspection, UI-only features).

Logs into `eu.mixpanel.com` as `slava@claritypledge.com` using browser automation + Gmail MCP.

## Steps

### 1. Get browser tab context

```
Use mcp__claude-in-chrome__tabs_context_mcp to get available tabs.
Create a new tab if needed (tabs_create_mcp).
```

### 2. Navigate to Mixpanel EU login

```
Navigate tab to: https://eu.mixpanel.com/login/
```

### 3. Fill in email and request magic link

```
Read the page (mcp__claude-in-chrome__read_page, filter: interactive).
Find the email input field and fill it with: slava@claritypledge.com
Click the "Continue" button (or "Send magic link" / "Log In" — label varies).
```

### 4. Fetch magic link from Gmail

Wait ~5 seconds, then use `slavochek-gmail` MCP:

```
mcp__slavochek-gmail__search_emails:
  query: "subject:Your Mixpanel login link"
  maxResults: 1
```

If no result, retry once after 5s. The email arrives at the owner's personal Gmail (see `.private/docs/accounts.md`).

Extract the nonce URL — it matches: `https://mixpanel.com/signup/?nonce_id=<hex>`

### 5. Navigate to nonce URL

```
Navigate the tab to the extracted nonce_id URL.
```

### 6. Confirm redirect to EU project

Wait for the tab title to change to "Claritypledge Project / Mixpanel" and URL to match `eu.mixpanel.com/project/3968494/...`.

Use `mcp__claude-in-chrome__read_page` or `get_page_text` to confirm. If still on the signup page after 10s, the link expired — restart from step 2.

### 7. Navigate to dashboard

```
Navigate to: https://eu.mixpanel.com/project/3968494/view/4464294/app/boards
```

## Credentials

- **Login email:** `slava@claritypledge.com`
- **Magic links arrive at:** personal Gmail (see `.private/docs/accounts.md`)
- **Project ID:** `3968494`
- **View ID:** `4464294`

## Dashboard URLs

| Board | URL |
|-------|-----|
| Session Value | https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989894 |
| Activation | https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989933 |
| Retention | https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989955 |

## Notes

- Magic links expire quickly (~5 min). Fetch the email promptly after requesting.
- The nonce URL is at `mixpanel.com` (not `eu.mixpanel.com`) but redirects to the EU project automatically.
- Sessions persist via cookie — login is not needed every session, only when logged out.
