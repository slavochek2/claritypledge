---
id: p640
title: Ghost 5→6 Security Upgrade
type: task
status: in_progress
priority: critical
delivery_stage: 1
branch: feature/p640-ghost-v6-upgrade
created: 2026-04-03
---

# P640: Ghost 5→6 Security Upgrade

## Problem

Ghost CMS 5.130.6 is vulnerable to **CVE-2026-26980** (unauthenticated SQL injection). The fix requires upgrading to Ghost 6.19.3+. The upgrade involves two non-trivial changes:

1. **Docker image swap** — `ghost:5` → `ghost:6` (SQLite still works as optional dep)
2. **Code injection selector refactor** — 30 Ghost CSS classes referenced in the 39,700-char code injection; ~6 are confirmed renamed in Ghost 6's Casper theme

## Current State

- **VM**: `ghost-prod` (e2-micro, us-central1-a, `35.224.81.21`)
- **Ghost version**: 5.130.6
- **DB**: SQLite3 at `/var/lib/ghost/content/data/ghost.db` (Docker volume `ghost-content`)
- **Proxy**: Caddy (auto-SSL)
- **Backup**: `ghost-backup-20260403_165014.tar.gz` in GCS ← fresh backup taken today

## Confirmed Breaking Changes (Ghost 5 → Ghost 6 Casper)

| Old selector | New selector | Used for |
|---|---|---|
| `.gh-feed` | `.post-feed` | JS reads this to extract post data |
| `.gh-card` | `.post-card` | JS reads cards to build custom layout |
| `.gh-viewport` | `.viewport` | JS inserts custom elements here |
| `.gh-container.is-list` | `.site-main outer` (approx) | Hidden via CSS |
| `.gh-navigation` | `.gh-head-menu` | Hidden via CSS |
| `.gh-footer` | `.site-footer` | CSS overrides |

Additional classes to verify in Ghost 6 Casper (may or may not have changed):
`gh-header`, `gh-main`, `gh-canvas`, `gh-content`, `gh-footer-bar`, `gh-footer-inner`, `gh-footer-signup`, `gh-footer-logo`, `gh-footer-copyright`, `gh-footer-menu`, `gh-powered-by`

## Implementation Plan

### Phase 1: Extract & Update Code Injection (on VM, Ghost 5 still running)

```bash
gcloud compute ssh ghost-prod --zone=us-central1-a
```

1. Dump current code injection to a local file:
```bash
sudo python3 << 'EOF'
import sqlite3
db = sqlite3.connect('/var/lib/docker/volumes/ghost_ghost-content/_data/data/ghost.db')
val = db.execute("SELECT value FROM settings WHERE key='codeinjection_head'").fetchone()[0]
with open('/tmp/injection_backup.html', 'w') as f:
    f.write(val)
print(f"Saved {len(val)} chars to /tmp/injection_backup.html")
EOF
```

2. Copy injection file locally for editing:
```bash
gcloud compute scp ghost-prod:/tmp/injection_backup.html ~/injection_backup.html --zone=us-central1-a
```

3. Apply selector renames (sed on local copy):
```bash
sed -i 's/\.gh-feed\b/.post-feed/g;
        s/\.gh-card\b/.post-card/g;
        s/\.gh-viewport\b/.viewport/g;
        s/\.gh-navigation\b/.gh-head-menu/g;
        s/\.gh-footer\b/.site-footer/g' ~/injection_backup.html
```
   Also update JS querySelector calls (same patterns, inside string literals).

4. Verify remaining `gh-` class references (run grep on edited file — any remaining `.gh-` that might need review).

5. Upload updated injection back and write to SQLite:
```bash
gcloud compute scp ~/injection_backup.html ghost-prod:/tmp/injection_updated.html --zone=us-central1-a
```

### Phase 2: Upgrade Docker Image

```bash
# On VM:
cd ~/ghost
sudo sed -i 's/image: ghost:5/image: ghost:6/' docker-compose.yml
sudo docker compose pull   # pulls ghost:6
sudo docker compose up -d
sudo docker compose logs -f --tail=50  # watch for migration errors
```

Ghost auto-migrates SQLite on first boot. Watch logs for:
- `Database migration: {n} migrations run`
- No `Error` or `ECONNREFUSED`

### Phase 3: Write Updated Code Injection

After Ghost 6 is running, write the updated injection:

```bash
sudo python3 << 'PYEOF'
import sqlite3, time
db = sqlite3.connect('/var/lib/docker/volumes/ghost_ghost-content/_data/data/ghost.db')
with open('/tmp/injection_updated.html') as f:
    val = f.read()
db.execute("UPDATE settings SET value=?, updated_at=? WHERE key='codeinjection_head'",
           (val, int(time.time() * 1000)))
db.commit()
print(f"Written {len(val)} chars")
PYEOF

# Restart to pick up changes:
sudo docker compose restart
```

### Phase 4: Verification

| Check | Command / Action |
|---|---|
| Ghost up | `curl -I https://blog.claritypledge.com` → 200 |
| Ghost version | Admin panel → About → should show 6.x |
| Custom nav renders | Visual: frosted nav with hamburger + CTA |
| Subscribe overlay | Visual: first-visit landing overlay on homepage |
| 2-column layout | Visual: featured post + post list + sidebar |
| Ghost elements hidden | No default Ghost nav/footer visible |
| Mailgun config intact | Admin → Settings → Email newsletter |
| Test email | Admin → send test email to slava@ |

### Phase 5: Rollback (if Phase 4 fails)

```bash
cd ~/ghost
# Revert image
sudo sed -i 's/image: ghost:6/image: ghost:5/' docker-compose.yml
sudo docker compose down
# Restore volume from backup
sudo docker run --rm \
  -v ghost_ghost-content:/data \
  -v /tmp:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/ghost-backup-20260403_165014.tar.gz -C /data"
sudo docker compose up -d
```

## Acceptance Criteria

- [ ] Ghost version in admin shows 6.x
- [ ] `https://blog.claritypledge.com` returns 200 with custom nav visible
- [ ] Subscribe overlay appears on first visit (no cookies)
- [ ] 2-column homepage layout renders (featured post + sidebar)
- [ ] No default Ghost navigation or footer visible
- [ ] Test email sends successfully via Mailgun
- [ ] Ghost logs show no errors on startup

## Risks

| Risk | Mitigation |
|---|---|
| Additional Casper selector renames missed | Verify each `.gh-*` class still exists in Ghost 6 Casper before writing injection |
| SQLite migration fails silently | Watch Docker logs for migration output; compare DB size before/after |
| Ghost 6 boots but code injection crashes JS | Check browser console; rollback injection to backup if needed |
| e2-micro OOM during pull | `ghost:6` is ~200MB; 9.3G disk free — no issue |

## References

- CVE-2026-26980: documented in `docs/decisions.md` line 10
- Backup: `gs://claritypledge-backups/ghost/ghost-backup-20260403_165014.tar.gz`
- Code injection docs: `docs/technical/ghost-blog.md` → Code Injection section
- Ghost 6 breaking changes: https://docs.ghost.org/changes
