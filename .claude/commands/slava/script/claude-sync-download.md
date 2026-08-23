---
name: claude-sync-download
description: "Automate Claude.ai export, email download, and sync — mechanical tail (download + sync) extracted to scripts/generated/claude-sync-download.sh"
when_to_use: "When syncing Claude.ai conversation exports to local storage."
version: 1.0.0
verified: true
---

# Claude Sync Download (script twin)

Hybrid of the original `claude-sync-download` skill (archived — see
`.claude/commands/slava/util/archive/claude-sync-download.md`). Steps 1–2 (browser
export click, Gmail poll) stay inline — they need MCP/tool context. Steps 3–4
(download + sync) are the deterministic tail, extracted to
`scripts/generated/claude-sync-download.sh`.

## Contract

`scripts/generated/claude-sync-download.sh <download_url>`
- `<download_url>` — the `https://claude.ai/export/<uuid>/download/<hash>` URL extracted
  from the export email in Step 2 below (this is the judgment→script handoff).
- The script validates the URL shape and `exit 1`s if missing/malformed.
- Set `DRY_RUN=1` to validate args + control flow without downloading or syncing.

---

## Step 1: Trigger export on claude.ai  *(inline — Chrome MCP)*

Use **Claude in Chrome** (authenticated real browser):
- `mcp__claude-in-chrome__navigate` to `https://claude.ai/settings/data-privacy-controls`
- Click **Export data** (button label exactly "Export data"), then **Export** in the dialog ("All" range default).

Note the **current time** — you'll reject any export email older than this.
Claude.ai emails a download link; do not wait in the browser.

## Step 2: Poll Gmail for the export email  *(inline — Gmail MCP + judgment)*

Use `mcp__slavochek-gmail__*` (personal Gmail — see global CLAUDE.md profile).
Poll `search_emails { query: "your data is ready" }` every 60s up to 10 min.
**Skip any email older than the Step 1 trigger time** (stale prior-run emails share the subject).
From the newest valid email, extract the download URL: `https://claude.ai/export/<uuid>/download/<hash>`.

## Steps 3–4: Download + sync  *(script)*

```bash
./scripts/generated/claude-sync-download.sh "<download_url from Step 2>"
```

This opens the URL (native Chrome download, Cloudflare-gated), waits for the
`data-*.zip` on the Desktop, copies it to `~/Downloads`, and runs `claude-sync`.

## Step 5: Report  *(inline)*

Relay the script output: how many conversations imported, any errors, the file path.

---

## Troubleshooting

Same as the original — see `claude-sync-download.md` (export failures, expired links,
rate limits, unauthenticated browser). If the script exits non-zero:
- `exit 1` — missing/malformed URL arg (Step 2 didn't produce a valid link)
- `exit 2` — no zip appeared (download failed or returned HTML → re-trigger export)
