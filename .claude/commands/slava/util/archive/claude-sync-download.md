---
name: claude-sync-download
description: "Automate Claude.ai export, email download, and sync pipeline"
when_to_use: "When syncing Claude.ai conversation exports to local storage."
version: 1.0.0
archived_reason: "replaced by verified script twin /slava:script:claude-sync-download"
---

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
mcp__claude-in-chrome__navigate { url: "https://claude.ai/settings/data-privacy-controls" }
```

The export button is on the **Privacy** page, not Account. Look for `button "Export data"` in the page.

Click it via JavaScript (the button label is exactly "Export data"):
```javascript
const buttons = Array.from(document.querySelectorAll('button'));
const btn = buttons.find(b => b.textContent.trim() === 'Export data');
btn && btn.click();
```

A dialog appears with date range options (All / 30 days / 90 days / Custom). "All" is selected by default. Click Export:
```javascript
const dialog = document.querySelector('[role="dialog"]');
const exportBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === 'Export');
exportBtn && exportBtn.click();
```

Claude.ai will send an email — **do not wait in browser**.

### 2. Poll Gmail for the export email

Note the current time before polling — **only accept emails that arrived after you triggered the export** in step 1. Stale emails from previous runs have the same subject line and will cause downloading an old zip.

Use **`mcp__slavochek-gmail__*`** — this is the dedicated personal Gmail MCP (see global CLAUDE.md User Profile for account).

Poll every 60 seconds (Bash `sleep 60`), up to 10 minutes total:

```
mcp__slavochek-gmail__search_emails { query: "your data is ready" }
```

When results appear, check the `date` field on each result. **Skip any email older than your export trigger time.** Take the most recent matching email that arrived after the trigger.

Fetch its full content:

```
mcp__slavochek-gmail__get_email_content { uid: <uid from search> }
```

Extract the HTTPS download URL from the email body — it looks like `https://claude.ai/export/<uuid>/download/<hash>`.

### 3. Download the zip

The download URL is behind Cloudflare — `curl` will fail with a JS challenge page. Use `open` to let Chrome download it natively (uses the logged-in session):

```bash
open "<download_url>"
```

Chrome downloads to `~/Desktop` by default. Mark the time before calling `open`, then wait ~5 seconds and find the new file:

```bash
BEFORE=$(date +%s)
open "<download_url>"
sleep 6
# Find zip files on Desktop newer than $BEFORE
python3 -c "
import os, time, glob
before = $BEFORE
zips = [f for f in glob.glob(os.path.expanduser('~/Desktop/*.zip')) if os.path.getmtime(f) > before]
print(zips[0] if zips else 'NOT FOUND')
"
```

The file will be named like `data-YYYY-MM-DD-HH-MM-SS-batch-0000.zip`. Copy it to `~/Downloads` (where claude-sync scans):

```bash
python3 -c "
import os, shutil, glob, time
# Find the newest zip on Desktop
zips = sorted(glob.glob(os.path.expanduser('~/Desktop/data-*.zip')), key=os.path.getmtime, reverse=True)
if zips:
    dst = os.path.expanduser('~/Downloads/' + os.path.basename(zips[0]))
    shutil.copy(zips[0], dst)
    print('Copied:', dst)
else:
    print('No zip found on Desktop')
"
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

**Download URL expired:** Export links are time-limited (typically 24h). If `open` downloads an HTML file instead of a zip, trigger a new export from step 1.

**claude-sync finds no new files:** The zip may already have been imported. Check `.imported_ids.json` in `~/projects/private/claude-conversations/`.

**Browser not authenticated:** If claude.ai redirects to login, stop and tell the user — they need to be logged into Claude.ai in Chrome.
