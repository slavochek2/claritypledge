---
name: claude-sync-download
description: "Automate Claude.ai export, email download, and sync — all steps run inline (Chrome + Gmail MCP); scripts/generated/claude-sync-download.sh is reference only"
when_to_use: "When syncing Claude.ai conversation exports to local storage."
version: 2.1.0
verified: true
---

# Claude Sync Download (script twin)

Hybrid of the original `claude-sync-download` skill (archived — see
`.claude/commands/slava/util/archive/claude-sync-download.md`). Steps 1–4 run **inline**
— they need MCP/tool context and a per-link check between opens. The deterministic tail
was extracted to `scripts/generated/claude-sync-download.sh`, but that script opens links
with `open` and opens **every** URL in a manifest, so it is **reference only** (see the
section below and Troubleshooting). Do not run it for a normal sync.

## Export shape (changed 2026-09)

An export is no longer one zip. It is **up to eight single-use downloads** plus a manifest
(`frames` added 2026-10; `artifact_data` and `claude_code_cloud` first seen 2026-10-27):

| File | Contents | Imported |
|------|----------|----------|
| `conversations-NNN.zip` | `conversations.json` | ✅ markdown per conversation |
| `projects-NNN.zip` | project docs + custom instructions | ✅ `projects/` |
| `memories-NNN.zip` | memory files + conversations memory | ✅ `memories/` |
| `design_chats-NNN.zip` | design chats | ✅ `design-chats/` |
| `frames-NNN.zip` | published claude.ai Artifacts, every version (~170–230MB, growing) | ✅ `frames/` — metadata + active version only, `artifact-type/` runtime skipped |
| `light_metadata-NNN.zip` | `users.json`, `login_history.json` | ❌ no durable value — skip the download |
| `artifact_data-NNN.zip`, `claude_code_cloud-NNN.zip` | unknown — never opened | ❌ importer does not know them yet. Leave their URLs **unspent** until `CATEGORIES` in `import-conversations.py` gains them. The importer keeps the manifest locally; the manifest's own text says each link expires 24h after the export was created |

Each `export_url` works **exactly once**. The legacy single `data-*-batch-*.zip` is
still handled by the importer as a fallback.

## Script contract  *(reference only — the inline Steps 1–5 below are the path to run)*

`scripts/generated/claude-sync-download.sh <url> [<url>...]`
`scripts/generated/claude-sync-download.sh /path/to/manifest-<uuid>-....json`
- Either one or more `https://claude.ai/export/<uuid>/download/<hash>` URLs, or the
  manifest JSON the export mail links to (the script reads every `export_url` out of it).
  Handing it a manifest opens **all** its URLs, including the ones the table says to leave unspent.
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

Record the trigger time with `date -u +%Y-%m-%dT%H:%M:%SZ`, and write it to
`<scratchpad>/export-trigger-utc.txt` so an interrupted session can resume — you'll reject
any export email dated before it. Claude.ai emails a download link; do not wait in the
browser. Confirm the "Export started" toast before moving on.

## Step 2: Poll Gmail for the export email  *(inline — Gmail MCP + judgment)*

**Poll every ~60s for up to 20 minutes, without asking the user anything in between.**
Measured 2026-10-27: the ready email arrived 3.7 and 4.0 min after two triggers. Right
after the trigger an "Your data export is in progress" email says the export "takes a few
hours, up to 12" — that is boilerplate. **Never stop polling or tell the user to come back
later because of it** (the 2026-10-27 run did, at minute 4, and the user had to say
"now?"). Only report "not ready" after the full 20 minutes, with the elapsed time.

One 60s cycle = six `mcp__claude-in-chrome__computer { action: "wait", duration: 10 }`
calls (they return text only, no screenshot) followed by one search **as the last call**, in
a single message. Calls run in order — on 2026-10-27 18 waits and 3 searches took ~3.9 min.
If the extension drops mid-cycle (seen once, recovered on the next call), keep polling.
Two Gmail routes, search then read:
- `mcp__slavochek-gmail__search_emails` → `mcp__slavochek-gmail__get_email_content`
  (its field names were not checked on 2026-10-27), or
- `mcp__claude_ai_Gmail__search_threads` → `mcp__claude_ai_Gmail__get_message` with
  `FULL_CONTENT` (verified 2026-10-27: returns `date`, `toRecipients`, `htmlBody`).

If neither is loaded, `ToolSearch` for it; if still absent, stop and tell the user to start
the next session with the email alias (`ce`) — there is no bash fallback for the mailbox.
Confirm `toRecipients` is the personal Google account. Query:
`from:anthropic.com subject:"ready for download" newer_than:1d`.
**Compare each result's `date` to the Step 1 trigger time** — a ready email from an earlier
run is still in the inbox and shares the subject (seen 2026-10-27: the 06:43 email was
still there when the 07:02 re-trigger polled).

Cost: at most ~22 Gmail searches and one read per export (read-only, unbilled). Do not
poll faster than 60s.

The valid email links **one** URL (`https://claude.ai/export/<uuid>/download/<hash>`, the
`Download data` button). Read it from the `htmlBody` — the `href="https://claude.ai/export/`
attribute. Opening it downloads `manifest-*.json`, not data.

## Step 3: Download the categories  *(inline — Chrome MCP; the verified path)*

0. The Step 1 tab may have been closed or logged out during the poll: run
   `mcp__claude-in-chrome__tabs_context_mcp`, and open a fresh `claude.ai` tab if needed.
   Then `touch <scratchpad>/dl-marker`. An old `conversations-000.zip` left in
   `~/Downloads` must never count as "landed" — every check below is `-newer` that marker.
1. `mcp__claude-in-chrome__navigate` to the Step 2 link; wait ~4s;
   `find ~/Downloads -maxdepth 1 -name 'manifest-*.json' -newer <scratchpad>/dl-marker`
   shows the new manifest.
2. Print each category with its **full** `export_url`
   (`python3 -I -c` over `data_files[]`). Never print a shortened hash and paste it
   back — on 2026-10-27 an 8-char hash gave "Invalid link" and spent nothing.
3. For each category in turn: re-`touch <scratchpad>/dl-marker` immediately before the
   open (so only this link's file can be newer), open **one** category URL with `navigate`
   on that same tab, then wait and
   `find ~/Downloads -maxdepth 1 -name '*.zip' -newer <scratchpad>/dl-marker`. Landed = a new
   zip whose size is stable across two looks, **before opening the next**. Expect
   `<category>-000.zip`; if the name differs (`dow.zip`, a `(1)` suffix) accept it only when
   exactly one new zip appeared, and say so in the report. `frames` (~230MB on 2026-10-27)
   landed within ~20s; look rather than sleeping a fixed time. A page reading
   "Downloading… Your export should begin downloading automatically" is normal.
4. Skip `light_metadata`, `artifact_data` and `claude_code_cloud` (table above).

**If nothing new has landed after ~30s: do not navigate to that URL again.** Read the page
(`get_page_text` or a screenshot). "Downloading…" → wait up to 60s more. "Invalid link" →
a mistyped URL was observed to spend nothing, so retry once with the exact URL from the
manifest. "Expired link" or "has been used" → treat that link as spent. Stop only if the link is
spent, or still has no zip after the 60s wait or the one retry: then list each link as
landed / failed / unopened and ask whether to re-trigger the export (Step 1).

**Never open several URLs back-to-back without checking.** 2026-10-27, first attempt:
four URLs navigated ~4s apart, no zip landed, and the last page read "Expired link".
The one-at-a-time run on the next export landed all five. The cause of the first failure
was not isolated, so do not treat this as proven — treat the check-between-opens
sequence as the contract, because a failure then shows on the first link instead of
burning all of them.

## Steps 3–4 alternative: script  *(reference only — `open` can burn the links)*

```bash
./scripts/generated/claude-sync-download.sh "<download_url from Step 2>"
```

This opens the URL (native Chrome download, Cloudflare-gated) and handles **either**
export format claude.ai may return:

- **Legacy** — one `data-*.zip`; copied to `~/Downloads`.
- **Manifest** (current, since ~2026-09) — a `manifest-*.json` listing N **single-use**
  per-category zip URLs (every category in the table above). The script opens **all** of
  them, including the ones that table says to leave unspent; each lands directly in
  `~/Downloads/` (flat, not a subfolder — `import-conversations.py` globs `DOWNLOADS/*.zip`
  directly). Don't move them into a `data-*-batch-*/` folder — that pattern is the legacy
  single-zip fallback only, and the importer never looks for per-category files there.

Then it runs `claude-sync`.

**Never fetch the export URLs with `curl`** — they are Cloudflare-gated and return HTTP
403 with an HTML body. Only the logged-in Chrome session gets the bytes. Chrome also does
not always honor the manifest's filename (a part has been seen landing as `dow.zip`), so
the script collects parts by mtime, not by name.

## Step 4: Sync  *(inline)*

Run the importer's `sync` entry point — its path is the last line of
`scripts/generated/claude-sync-download.sh` (`claude-sync` is a zsh alias, invisible to a
non-interactive shell). The importer skips any zip whose
mtime is under **~2 minutes** old (2026-10-27: a zip 97s old was skipped, 2+ min old was
imported). **Wait until the newest new zip is over 2 minutes old** (compare `stat -f %m <zip>` with
`date +%s`), then run it. If the output still says "modified seconds ago", wait and run it
again; report only after every landed category shows as imported. A second pass with
nothing new is harmless.

## Step 5: Report  *(inline)*

Relay: how many conversations imported (and per-category counts), any errors, and which
manifest URLs remain unspent (`artifact_data`, `claude_code_cloud`). The importer prints
"keeping manifest" itself — confirm that line rather than assuming it.

---

## Troubleshooting

Same as the original — see `.claude/commands/slava/util/archive/claude-sync-download.md`
(export failures, expired links, rate limits, unauthenticated browser). If the reference
script exits non-zero:
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
in Step 1** — inline, one URL at a time, each confirmed landed before the next (Step 3).
This is the reliable path; treat the generated script as reference only until it's fixed
to do the same.

**`import-conversations.py` says "modified seconds ago, may still be downloading" for
minutes after the file finished?** It uses the file's OS mtime, not wall-clock progress —
if the download briefly re-touches the file (or you `mv` it after landing), the settle
timer restarts. Don't `mv` downloaded zips into any subfolder before running the sync (Step 4)
(see the flat-`~/Downloads/` note above) — that alone resets the "seconds ago" clock and
costs a redundant wait. Just re-run the sync again once every zip is over ~2 min old;
it imports whatever has settled and reports per-category counts, so a second pass with
zero new bystanders is harmless.
