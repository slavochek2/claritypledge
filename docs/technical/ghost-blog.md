# Ghost Blog & Newsletter

Self-hosted Ghost CMS for the Clarity Pledge blog and newsletter.

**SSH note (2026-07-15):** port 22 is now firewalled to Google's IAP range only (no public internet access). Every `gcloud compute ssh` command below needs `--tunnel-through-iap` appended, or use the GCP Console's "SSH" button (always works over IAP regardless of firewall).

## Quick Reference

```bash
# SSH into server
gcloud compute ssh ghost-prod --zone=us-central1-a --tunnel-through-iap

# On the server:
cd ~/ghost
sudo docker compose ps          # Check status
sudo docker compose logs -f     # Watch logs
sudo docker compose restart     # Restart Ghost
~/update-ghost.sh               # Pull latest Ghost image + restart
~/backup-ghost.sh               # Manual backup to GCS
```

## URLs

| URL | Purpose |
|-----|---------|
| https://blog.claritypledge.com | Public blog |
| https://blog.claritypledge.com/ghost/ | Admin panel |

## Infrastructure

| Component | Detail |
|-----------|--------|
| VM | `ghost-prod` (e2-micro, us-central1-a) — downgraded 2026-02-25 from e2-small |
| Swap | 2GB on pd-standard disk (`/swapfile`) — added as OOM safety net before downgrade |
| Static IP | 35.224.81.21 (reserved as `ghost-prod-ip`) |
| OS | Ubuntu 22.04 LTS |
| Reverse proxy | Caddy (auto-SSL via Let's Encrypt) |
| Ghost | Docker (`ghost:6`), port 2368 |
| Database | SQLite (in Docker volume `ghost_ghost-content`) |
| Cost | ~$0.014/hour (~$0.34/day) — covered by $25K GCP credits |

## Email Configuration

Ghost uses two separate email channels:

| Channel | Provider | Purpose |
|---------|----------|---------|
| SMTP (transactional) | Mailgun SMTP | Login codes, password resets, member notifications |
| Bulk newsletters | Mailgun API | Sending newsletters to subscribers |

**Mailgun domain:** `mg.claritypledge.com` (EU region)
**Mailgun API base:** `https://api.eu.mailgun.net/v3`
**Newsletter name:** "Clarity Pledge" (slug: `default-newsletter`)
**From address:** `"Clarity Pledge" <slava@claritypledge.com>`

### Ghost Admin Settings (configured)

| Setting | Value |
|---------|-------|
| Mailgun domain | `mg.claritypledge.com` |
| Mailgun API key | Ghost Admin → Settings → Email newsletter → Mailgun → Edit. Also stored as `MAILGUN_API_KEY` in `.env.local` for reference. If newsletter emails fail with "An unexpected error occurred", the key is likely expired — rotate at app.mailgun.com → Sending → Domain mg.claritypledge.com → API Keys. |
| Mailgun base URL | `https://api.eu.mailgun.net/v3` |
| Accent color | `#3b82f6` (blue-500) |
| Icon & logo | Clarity "C" mark (blue rounded rect) |
| Primary nav | (empty — Ghost's default header is hidden; custom nav injected via Code Injection) |
| Secondary nav (footer) | Home (claritypledge.com), Privacy Policy (/privacy-policy), Terms of Service (/terms-of-service) |

### Publishing a Newsletter

To send a newsletter via Ghost Admin API (used by automation):

```
PUT /ghost/api/admin/posts/{id}/?newsletter=default-newsletter&email_segment=all
Body: { "posts": [{ "status": "published", "updated_at": "..." }] }
```

Key: the `newsletter` query param must be the **slug** (not ID). Without it, the post publishes but no email is sent.

### DNS Records (at all-inkl KAS)

| Name | Type | Value |
|------|------|-------|
| `blog` | A | 35.224.81.21 |
| `mg` | TXT (SPF) | `v=spf1 include:mailgun.org ~all` |
| `mta._domainkey.mg` | TXT (DKIM) | (long RSA key) |
| `pdki._domainkey.mg` | CNAME | `pdki._domainkey.smtp3.eu.mgun.us` |
| `email.mg` | CNAME (tracking) | `eu.mailgun.org` |
| `_dmarc.mg` | TXT | `v=DMARC1; p=none; ...` |
| `mg` | MX | `mxa.eu.mailgun.org` (priority 10) |
| `mg` | MX | `mxb.eu.mailgun.org` (priority 10) |

## Backups

**Automated:** Daily at 3 AM UTC via cron.

**Destination:** `gs://claritypledge-backups/ghost/`

**What's backed up:** Entire Ghost content volume (posts, images, themes, SQLite DB).

**Process:** Stop Ghost → tar volume → upload to GCS → restart Ghost. Downtime ~10-30 seconds.

```bash
# Check backup logs
gcloud compute ssh ghost-prod --zone=us-central1-a --command="cat /var/log/ghost-backup.log"

# List backups in GCS
gsutil ls gs://claritypledge-backups/ghost/

# Restore from backup
gcloud compute ssh ghost-prod --zone=us-central1-a
cd ~/ghost && sudo docker compose down
sudo docker run --rm -v ghost_ghost-content:/data -v /tmp:/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/ghost-backup-TIMESTAMP.tar.gz -C /data"
sudo docker compose up -d
```

## Files on VM

| File | Purpose |
|------|---------|
| `~/ghost/docker-compose.yml` | Ghost configuration |
| `~/backup-ghost.sh` | Backup script |
| `~/update-ghost.sh` | Update script |
| `/etc/caddy/Caddyfile` | Reverse proxy config |
| `/var/log/ghost-backup.log` | Backup log |

## Updating Ghost

```bash
gcloud compute ssh ghost-prod --zone=us-central1-a --command="~/update-ghost.sh"
```

This pulls the latest `ghost:6` image and restarts. Run periodically (monthly is fine). Check https://ghost.org/changelog/ for release notes.

## Troubleshooting

### Ghost not loading
```bash
gcloud compute ssh ghost-prod --zone=us-central1-a --command="cd ~/ghost && sudo docker compose ps && sudo docker compose logs --tail 20"
```

### SSL certificate issues
```bash
gcloud compute ssh ghost-prod --zone=us-central1-a --command="sudo journalctl -u caddy --no-pager -n 20"
```

### Email not sending
Check Mailgun event logs:
```bash
# Replace $MAILGUN_API_KEY with your actual key
gcloud compute ssh ghost-prod --zone=us-central1-a --command=\
  "curl -s -u 'api:$MAILGUN_API_KEY' \
  'https://api.eu.mailgun.net/v3/mg.claritypledge.com/events?limit=5' \
  | python3 -m json.tool"
```

## Code Injection (Site Header)

Custom CSS/JS injected via Ghost Admin → Settings → Advanced → Code Injection → Site Header.

**What it does:**
1. **Custom navigation** — Replaces Ghost's default header with a nav bar matching claritypledge.com (non-logged-in view)
   - Desktop: C logo + "Clarity Pledge" wordmark, nav links (Events, Blog), "Start a Clarity Session" CTA, hamburger dropdown (Pledgers, Manifesto, Co-create, About, Take the Pledge, Log In, Create Account)
   - Mobile: Logo + wordmark, hamburger → full-width panel with CTA, nav links, and menu items
   - All links point to `claritypledge.com/*` (blog is a satellite site)
   - Scroll effect: transparent → frosted glass with border on scroll
2. **Subscribe landing overlay** (homepage only, first visit) — Substack-style centered screen with author photo, blog title, description, email subscribe form, and "No thanks >" dismiss button
   - Shown when no `cp-dismissed` cookie and no Ghost member cookie
   - "No thanks" sets `cp-dismissed=1` cookie (30 days) and fades to content view
   - Subscribe uses Ghost's `/members/api/send-magic-link/` endpoint
3. **Homepage content layout** — Substack-inspired two-section layout:
   - **Featured post** (full width): image left + title/excerpt/meta right (stacks on mobile)
   - **Two-column below**: post list (65%) + sticky sidebar (35%) — single column on mobile
   - **Sidebar**: blog description, compact subscribe form, personal CTA card ("Fractional Chief Clarity Officer")
4. **Footer** — Ghost's default footer menu (Home, Privacy Policy, Terms of Service). "Powered by Ghost" hidden.
5. **Conditional** — `body.no-posts` class hides empty feed (only when no posts exist)

**Technical approach:**
- Ghost's default `header.gh-navigation` and `.gh-header` are hidden via CSS (`display: none`)
- `.gh-container.is-list` (original post feed) is hidden; custom layout elements are inserted into `.gh-viewport` before `.gh-footer`
- Custom nav is built via JS `document.createElement` and prepended to `body`
- `.gh-viewport` gets `padding-top` to account for the fixed nav (64px mobile, 80px desktop)
- Homepage JS reads `.gh-feed .gh-card` elements to extract post data, then builds custom featured post + post list + sidebar
- All CSS classes use `.cp-` prefix to avoid Ghost conflicts
- Link colors use `!important` to override Ghost theme defaults
- Desktop dropdown and mobile panel are toggled via vanilla JS

**Code is ~600 lines (CSS + JS).** Too large to embed here — edit via SQLite on VM.

**Key CSS classes:**
| Class | Purpose |
|-------|---------|
| `.cp-nav` | Fixed nav container |
| `.cp-nav-logo` | Logo + wordmark link |
| `.cp-nav-right` | Desktop right section (hidden on mobile) |
| `.cp-cta` | Blue CTA button |
| `.cp-btn` / `.cp-drop` | Desktop hamburger + dropdown |
| `.cp-mob-btn` / `.cp-mob` | Mobile hamburger + panel |
| `.cp-landing` | Subscribe landing overlay (first visit) |
| `.cp-featured` | Featured post section |
| `.cp-content-wrap` | Two-column layout wrapper |
| `.cp-posts` | Post list column |
| `.cp-sidebar` | Sidebar column (sticky on desktop) |
| `.cp-personal-card` | Personal CTA card in sidebar |

**Notes:**
- `body.no-posts` rules are conditional — only apply when no posts exist.
- `.gh-footer-signup`, `.gh-footer-logo`, and `.gh-footer-copyright` are always hidden.
- CSS `:empty` does NOT work on Ghost templates (whitespace text nodes in `.gh-feed`). Use JS `children.length === 0` instead.
- Footer links use `rgb(113, 113, 122)` — same zinc-500 palette as the main site's `text-muted-foreground`.
- Ghost's built-in search is no longer accessible (hidden with the default header). Can be re-added later if needed.
- Author photo at `/content/images/2026/03/slava.jpg` — uploaded to Ghost content volume, used by subscribe landing.
- The old `.slava-cta` (orphaned `<body>` child from footer injection) is hidden via CSS; its content is replaced by `.cp-personal-card` in the sidebar.

### Code Injection Best Practices

**Never use `fill()` for large content in Ghost's CM6 editor:**
- Types char-by-char, times out on 8KB+ content, corrupts the editor
- For small edits (< 500 chars), `fill()` after `Meta+a` select-all is OK
- **Preferred method (Ghost < 5.130):** Use Ghost Admin API (`PUT /ghost/api/admin/settings/`) to set `codeinjection_head` directly — bypasses CM6 entirely
- **Ghost 5.130+ broken:** `PUT /ghost/api/admin/settings/` returns 501 NotImplementedError — API changed. Workaround: update SQLite directly on the host:
  ```bash
  gcloud compute ssh ghost-prod --zone=us-central1-a --command="sudo python3 -c \"
  import sqlite3, time
  db = sqlite3.connect('/var/lib/docker/volumes/ghost_ghost-content/_data/data/ghost.db')
  val = db.execute(\\\"SELECT value FROM settings WHERE key='codeinjection_head'\\\").fetchone()[0]
  db.execute(\\\"UPDATE settings SET value=?, updated_at=? WHERE key='codeinjection_head'\\\", (val + NEW_CONTENT, int(time.time()*1000)))
  db.commit()
  \"" && gcloud compute ssh ghost-prod --zone=us-central1-a --command="cd ~/ghost && sudo docker compose restart"
  ```
  Container name is `ghost-ghost-1` (not `ghost`). sqlite3 not available in container — use host python3 with sudo.

**CSS `:empty` gotcha:**
- Does NOT match elements with whitespace text nodes (Ghost templates have them)
- Use JS `DOMContentLoaded` + class toggle for conditional styling based on content presence
- Current injection: `body.no-posts` class added when `.gh-feed` has no child elements

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Ghost Pro vs self-hosted | Self-hosted | Full control, GCP credits cover costs, same flexibility |
| Newsletter email provider | Mailgun | Ghost requires Mailgun specifically for bulk newsletters |
| Transactional email | Mailgun SMTP | Single provider for Ghost (Brevo remains for Supabase auth) |
| Reverse proxy | Caddy | Auto-SSL, zero config, lightweight |
| Database | SQLite | Sufficient for single-server blog, simpler than MySQL |
| Backup storage | Google Cloud Storage | GCP credits, reliable, easy access |

## Related

- [p108_newsletter_automation.md](../../features/p108_newsletter_automation.md) — Full newsletter pipeline vision
- [p108_ghost_admin_email.md](../../features/drafts/p108_ghost_admin_email.md) — Admin email switch-back task
- [cloud-agent.md](cloud-agent.md) — Dev server (separate VM)
