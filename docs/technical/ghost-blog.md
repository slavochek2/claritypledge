# Ghost Blog & Newsletter

Self-hosted Ghost CMS for the Clarity Pledge blog and newsletter.

## Quick Reference

```bash
# SSH into server
gcloud compute ssh ghost-prod --zone=us-central1-a

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
| VM | `ghost-prod` (e2-small, us-central1-a) |
| Static IP | 35.224.81.21 (reserved as `ghost-prod-ip`) |
| OS | Ubuntu 22.04 LTS |
| Reverse proxy | Caddy (auto-SSL via Let's Encrypt) |
| Ghost | Docker (`ghost:5`), port 2368 |
| Database | SQLite (in Docker volume `ghost_ghost-content`) |
| Cost | ~$0.05/hour (~$1.20/day) — covered by $25K GCP credits |

## Email Configuration

Ghost uses two separate email channels:

| Channel | Provider | Purpose |
|---------|----------|---------|
| SMTP (transactional) | Mailgun SMTP | Login codes, password resets, member notifications |
| Bulk newsletters | Mailgun API | Sending newsletters to subscribers |

**Mailgun domain:** `mg.claritypledge.com` (EU region)

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

This pulls the latest `ghost:5` image and restarts. Run periodically (monthly is fine). Check https://ghost.org/changelog/ for release notes.

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
