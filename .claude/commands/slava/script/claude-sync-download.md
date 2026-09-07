---
name: claude-sync-download
description: "Automate Claude.ai export, email download, and sync — mechanical tail (download + sync) extracted to scripts/generated/claude-sync-download.sh"
when_to_use: "When syncing Claude.ai conversation exports to local storage."
version: 2.0.0
verified: true
---

# Claude Sync Download (script twin)

Hybrid of the original `claude-sync-download` skill (archived — see
`.claude/commands/slava/util/archive/claude-sync-download.md`). Steps 1–2 (browser
export click, Gmail poll) stay inline — they need MCP/tool context. Steps 3–4
(download + sync) are the deterministic tail, extracted to
`scripts/generated/claude-sync-download.sh`.

## Export shape (changed 2026-09)

An export is no longer one zip. It is **five single-use downloads** plus a manifest:

| File | Contents | Imported |
|------|----------|----------|
| `conversations-NNN.zip` | `conversations.json` | ✅ markdown per conversation |
| `projects-NNN.zip` | project docs + custom instructions | ✅ `projects/` |
| `memories-NNN.zip` | memory files + conversations memory | ✅ `memories/` |
| `design_chats-NNN.zip` | design chats | ✅ `design-chats/` |
| `light_metadata-NNN.zip` | `users.json`, `login_history.json` | ❌ no durable value |

Each `export_url` works **exactly once**. The legacy single `data-*-batch-*.zip` is
still handled by the importer as a fallback.

## Contract

`scripts/generated/claude-sync-download.sh <url> [<url>...]`
`scripts/generated/claude-sync-download.sh /path/to/manifest-<uuid>-....json`
- Either one or more `https://claude.ai/export/<uuid>/download/<hash>` URLs, or the
  manifest JSON the export mail links to (the script reads every `export_url` out of it).
  This is the judgment→script handoff from Step 2.
- The script validates every URL shape and `exit 1`s if missing/malformed.
- It warns (does not fail) when fewer files land than URLs were opened — the importer
  then reports which categories are missing against the manifest.
- Set `DRY_RUN=1` to validate args + control flow without downloading or syncing.

---

## Step 0: Confirm Chrome auto-downloads (once per machine)

Downloads only complete unattended if Chrome's **"Ask where to save each file before
downloading"** setting is OFF (Settings → Downloads). If it's on, every single-use export
URL opened below stalls as a hidden `.com.google.Chrome.XXXXXX` temp file behind a native
macOS Save dialog that no browser-automation tool (Claude in Chrome, chrome-devtools) can
click through — it lives outside the page DOM. Since navigating automation tools to
`chrome://` URLs is banned ([browser.md](../../../rules/browser.md)), this is a **one-time
manual step for the founder**: ask them to open `chrome://settings/downloads` themselves
and flip the toggle off. Confirmed once, it stays off — never re-check it after the first
successful run on a machine. See P1257 (2026-09-07) for the full failure trace.

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
From the newest valid email, extract **every** download URL
(`https://claude.ai/export/<uuid>/download/<hash>`) — an export is now five of them.
If the mail links a `manifest-*.json` instead, download that and pass its path to the
script; it will read the URLs out of it.

## Steps 3–4: Download + sync  *(script)*

```bash
./scripts/generated/claude-sync-download.sh "<download_url from Step 2>"
```

This opens the URL (native Chrome download, Cloudflare-gated) and handles **either**
export format claude.ai may return:

- **Legacy** — one `data-*.zip`; copied to `~/Downloads`.
- **Manifest** (current, since ~2026-09) — a `manifest-*.json` listing N **single-use**
  per-category zip URLs (`conversations`, `projects`, `memories`, `design_chats`,
  `light_metadata`). The script opens each in Chrome; each lands directly in
  `~/Downloads/` (flat, not a subfolder — `import-conversations.py` globs `DOWNLOADS/*.zip`
  directly). Don't move them into a `data-*-batch-*/` folder — that pattern is the legacy
  single-zip fallback only, and the importer never looks for per-category files there.

Then it runs `claude-sync`.

**Never fetch the export URLs with `curl`** — they are Cloudflare-gated and return HTTP
403 with an HTML body. Only the logged-in Chrome session gets the bytes. Chrome also does
not always honor the manifest's filename (a part has been seen landing as `dow.zip`), so
the script collects parts by mtime, not by name.

## Step 5: Report  *(inline)*

Relay the script output: how many conversations imported, any errors, the file path.

---

## Troubleshooting

Same as the original — see `claude-sync-download.md` (export failures, expired links,
rate limits, unauthenticated browser). If the script exits non-zero:
- `exit 1` — missing/malformed URL arg (Step 2 didn't produce a valid link)
- `exit 2` — nothing downloaded, or the manifest's parts yielded no `conversations.json`
  (download failed or returned HTML → re-trigger export)

**Step 2 hangs instead of erroring?** Check the VPN before anything else. Surfshark (and
most commercial VPNs) silently blackhole IMAP/SMTP ports: TCP connects, then the TLS
handshake never completes, so the Gmail MCP reports a connect timeout that reads like a
dead server. `route -n get default` naming a `utun*` interface is the tell. Fix is a
split-tunnel bypass for the mail host. The ops mailbox reader is affected the same way.
Mechanism, probe and bypass list: `pp/docs/infra/surfshark-vpn.md`.

**Script's `open <url>` produced no zip, but the link now says "Expired link — this link
has been used"?** `open` on macOS launches the URL in whatever app/browser macOS resolves
it to, not necessarily the authenticated Chrome tab from Step 1 — if it lands anywhere
without the claude.ai session cookie, the page 403s, no zip lands, and the single-use URL
is burned anyway. **Skip the shell script's `open` step entirely and drive each
`export_url` through `mcp__claude-in-chrome__navigate` on the SAME authenticated tab used
in Step 1** — inline, one URL at a time, ~3s apart. This is the reliable path; treat the
generated script as reference only until it's fixed to do the same.

**`import-conversations.py` says "modified seconds ago, may still be downloading" for
minutes after the file finished?** It uses the file's OS mtime, not wall-clock progress —
if the download briefly re-touches the file (or you `mv` it after landing), the settle
timer restarts. Don't `mv` downloaded zips into any subfolder before running `claude-sync`
(see the flat-`~/Downloads/` note above) — that alone resets the "seconds ago" clock and
costs a redundant wait. Just re-run `claude-sync` again after ~60s; it imports whatever has
settled and reports per-category counts, so a second pass with zero new bystanders is
harmless.
