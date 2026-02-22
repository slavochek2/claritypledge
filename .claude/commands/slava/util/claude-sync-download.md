# Claude Sync Download

Automates the full Claude.ai export → email → download → sync pipeline.

## Flow

```
claude.ai export button → email with link → download zip → ~/Downloads → claude-sync
```

## Steps

### 1. Trigger export on claude.ai

Use **Claude in Chrome** (real browser, authenticated):

```
mcp__claude-in-chrome__tabs_context_mcp       # see current tabs
mcp__claude-in-chrome__tabs_create_mcp        # open new tab
mcp__claude-in-chrome__navigate { url: "https://claude.ai/settings/account" }
```

Navigate to the export section. Look for:
- Settings → Account → "Export data" or "Download your data"
- Or try `https://claude.ai/settings/privacy` if account doesn't have it

Click the export/download button. Claude.ai will send an email — **do not wait in browser**.

### 2. Poll Gmail for the export email

Use **`mcp__slavochek-gmail__*`** — this is the dedicated personal Gmail MCP for `slavochek@googlemail.com`.

Poll every 60 seconds, up to 10 minutes:

```
mcp__slavochek-gmail__search_emails { query: "anthropic export" }
mcp__slavochek-gmail__search_emails { query: "your data is ready" }
mcp__slavochek-gmail__search_emails { query: "claude download" }
```

When a matching email appears, fetch its full content using the `uid` from search results:

```
mcp__slavochek-gmail__get_email_content { uid: <uid from search> }
```

Extract the HTTPS download URL from the email body (typically a signed S3/CDN link).

### 3. Download the zip

Use Bash to download to `~/Downloads`:

```bash
curl -L -o ~/Downloads/claude-export-$(date +%Y%m%d).zip "<download_url>"
```

Verify the file exists and is non-empty:
```bash
ls -lh ~/Downloads/claude-export-*.zip | tail -1
```

### 4. Run claude-sync

```bash
claude-sync
```

This runs `~/projects/private/claude-conversations/import-conversations.py` which:
- Scans `~/Downloads` for Claude export zips
- Imports new conversations (skips already-imported UUIDs)
- Saves markdown files to the conversations repo

### 5. Report

Tell the user:
- How many new conversations were imported
- Any errors from the sync script
- The downloaded file path

## Troubleshooting

**Export failed email arrives:** Anthropic's export pipeline has transient failures. Wait 10-15 min and re-run. If it keeps failing, contact Anthropic Support with the Error ID from the email.

**Email not arriving after 10 min:** Claude.ai may have rate-limited exports. Check if a previous export email exists (search without `newer_than`). The user may need to wait and re-run.

**Download URL expired:** Export links are time-limited (typically 24h). If curl fails with 403, trigger a new export from step 1.

**claude-sync finds no new files:** The zip may already have been imported. Check `.imported_ids.json` in `~/projects/private/claude-conversations/`.

**Browser not authenticated:** If claude.ai redirects to login, stop and tell the user — they need to be logged into Claude.ai in Chrome.
