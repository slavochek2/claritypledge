---
status: backlog
type: task
workstream: C2
tags:
  - ghost
  - infrastructure
rank: 125303.0
created_date: 2026-02-05
---

# P161: Switch Ghost Admin Email Back

**Context:** Ghost admin email was temporarily changed to a personal Gmail address (see `.private/docs/accounts.md`) because kasserver.com cached a negative DNS result for `mg.claritypledge.com` (no MX records at the time). MX records have since been added.

**When:** Try after kasserver DNS cache clears (typically within 24 hours).

**How:**
```bash
gcloud compute ssh ghost-prod --zone=us-central1-a --command="sudo docker run --rm -v ghost_ghost-content:/data alpine sh -c \"apk add --quiet sqlite && sqlite3 /data/data/ghost.db \\\"UPDATE users SET email='slava@claritypledge.com' WHERE id='1';\\\"\""
gcloud compute ssh ghost-prod --zone=us-central1-a --command="cd ~/ghost && sudo docker compose restart"
```

**Test:** Send test email via Mailgun API to slava@claritypledge.com first. If it arrives, run the commands above.

```bash
gcloud compute ssh ghost-prod --zone=us-central1-a --command="curl -s --user 'api:REDACTED' https://api.eu.mailgun.net/v3/mg.claritypledge.com/messages -F from='Test <test@mg.claritypledge.com>' -F to=slava@claritypledge.com -F subject='DNS test' -F text='Cache cleared'"
```

## Ghost Admin Reference

- **URL:** https://blog.claritypledge.com/ghost/
- **Current email:** see `.private/docs/accounts.md`
- **Update script:** `~/update-ghost.sh` (pulls latest Ghost image)
- **Backup:** Daily at 3 AM UTC → `gs://claritypledge-backups/ghost/`
- **Static IP:** 35.224.81.21 (reserved)
