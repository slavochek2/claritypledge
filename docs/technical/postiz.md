# Postiz — Social Media Scheduler

Self-hosted Postiz v2.19.0 for scheduling and distributing content to social channels.

## Quick Reference

```bash
# SSH into server
gcloud compute ssh clarity-agent --zone=us-central1-a

# On the server:
cd ~/postiz
sudo docker compose ps          # Check status
sudo docker compose logs -f postiz  # Watch logs
sudo docker compose restart postiz  # Restart (keeps patches)
```

## URLs

| URL | Purpose |
|-----|---------|
| https://postiz.claritypledge.com | Postiz web UI (redirects to /launches) |
| https://postiz.claritypledge.com/launches | Calendar / scheduled posts |
| https://postiz.claritypledge.com/plugs | Connect social channels (Instagram, X, etc.) |
| https://postiz.claritypledge.com/settings | API keys, account settings |

## Infrastructure

| Component | Detail |
|-----------|--------|
| VM | `clarity-agent` (e2-standard-4, us-central1-a) |
| Container | `postiz` (ghcr.io/gitroomhq/postiz-app:latest) |
| Reverse proxy | nginx (built into the container, port 4007 → 5000) |
| Database | `postiz-postgres` (postgres:17-alpine) |
| Queue | `temporal` + `postiz-redis` |
| Config | `~/postiz/.env` + `~/postiz/docker-compose.yml` |

## Connected Channels

| Channel | Account | Postiz Channel ID | Notes |
|---------|---------|-------------------|-------|
| LinkedIn | Vyacheslav Ladischenski (personal) | `cmlzashw80001t86nxnlk6pi2` | Posts from personal profile, not company page |

## Environment Variables (`~/postiz/.env`)

```bash
# LinkedIn OAuth — see ~/postiz/.env on clarity-agent VM for values.
# Public identifiers (Client ID, App ID, redirect URLs) are listed in the
# "LinkedIn Developer App" table below.
LINKEDIN_CLIENT_ID=<see .env on clarity-agent VM>
LINKEDIN_CLIENT_SECRET=<see .env on clarity-agent VM>
```

## Automation Credentials (in `.env.local`)

| Variable | Purpose |
|----------|---------|
| `POSTIZ_API_TOKEN` | Bearer token for Postiz REST API (Settings → Public API) |
| `POSTIZ_LINKEDIN_CHANNEL_ID` | LinkedIn channel ID (`cmlzashw80001t86nxnlk6pi2`) |
| `POSTIZ_URL` | `https://postiz.claritypledge.com` |

## LinkedIn OAuth — Known Limitation & Patch

LinkedIn's `w_organization_social` scope (required for Company Page posting) is gated behind the "Marketing Developer Platform" product, which is NOT available as self-service. The product doesn't appear in the LinkedIn developer portal's Available Products list.

Postiz v2.19.0 requests this scope for both `linkedin` and `linkedin-page` channels, causing `unauthorized_scope_error`.

**Workaround:** Remove org scopes from the compiled JS inside the container:

```bash
for f in \
  /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/linkedin.provider.js \
  /app/apps/orchestrator/dist/libraries/nestjs-libraries/src/integrations/social/linkedin.provider.js; do
  sudo docker exec postiz sed -i \
    -e "/'r_basicprofile',/d" \
    -e "/'rw_organization_admin',/d" \
    -e "/'w_organization_social',/d" \
    -e "/'r_organization_social',/d" \
    "$f"
done
cd ~/postiz && sudo docker compose restart postiz
```

After this patch, Postiz requests only `openid profile w_member_social` — sufficient for personal LinkedIn posting.

**⚠️ Patch persistence:** Lives in the container's writable layer. Survives `docker compose restart` but NOT `docker compose up -d` (which recreates the container from the image). Re-apply after any container recreation.

### LinkedIn Developer App

| Setting | Value |
|---------|-------|
| App name | Clarity Pledge |
| Client ID | `864b65vz0pu12l` |
| App ID | `230886408` |
| Products | Share on LinkedIn (Default), Sign In with LinkedIn using OpenID Connect (Standard) |
| Redirect URLs | `https://postiz.claritypledge.com/integrations/social/linkedin` |
| | `https://postiz.claritypledge.com/integrations/social/linkedin-page` |
| Scopes granted | `openid`, `profile`, `w_member_social`, `email` |

## Postiz API

**Auth: session cookie, not Bearer token.** The public API token (Settings → Public API) returns 401 from CLI. Use login→cookie flow:

```bash
# 1. Login — sets postiz.sid cookie
curl -c /tmp/postiz-cookies.txt -X POST https://postiz.claritypledge.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ops@claritypledge.com","password":"...","provider":"LOCAL"}'
# → {"login":true}

# 2. Schedule a post
curl -b /tmp/postiz-cookies.txt -X POST https://postiz.claritypledge.com/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "type": "schedule",
    "date": "2026-02-24T10:02:00.000Z",
    "shortLink": false,
    "tags": [],
    "posts": [{
      "integration": {"id": "cmlzashw80001t86nxnlk6pi2"},
      "value": [{"content": "Post text here", "image": []}]
    }]
  }'
# → [{"postId":"...","integration":"..."}]

# 3. Clean up
rm /tmp/postiz-cookies.txt
```

**Key payload fields** (all required, wrong values → NestJS validation error):
- `type`: must be `draft | schedule | now | update` (not `"social"`)
- `shortLink`: boolean required
- `tags`: array required (can be empty)
- `posts[].integration`: object with `id` field (not a bare string)
- `posts[].value[].image`: array required (can be empty)

**With image:** upload first via `POST /api/media` multipart (`file=@/tmp/image.jpg`), get back `{path}`, use as `image: [{url: path, id: "..."}]`.

List connected integrations: `GET /api/integrations/list` (with cookie auth).

## Known Issues

**Copilot loading spinner:** On page load, Postiz calls `/api/copilot/chat` which times out after ~60s (no OpenAI key configured). The main UI shows a loading spinner during this time. Page renders normally after timeout. Not a bug — just expected behavior with no OpenAI key.

## Updating Postiz

```bash
gcloud compute ssh clarity-agent --zone=us-central1-a --command="cd ~/postiz && sudo docker compose pull && sudo docker compose up -d"
```

After update, re-apply the LinkedIn scope patch (container was recreated from new image).

## Troubleshooting

### Check status
```bash
gcloud compute ssh clarity-agent --zone=us-central1-a --command="cd ~/postiz && sudo docker compose ps"
```

### View logs
```bash
gcloud compute ssh clarity-agent --zone=us-central1-a --command="cd ~/postiz && sudo docker compose logs --tail 30 postiz"
```

### Re-apply LinkedIn patch after container recreation
```bash
gcloud compute ssh clarity-agent --zone=us-central1-a --command="
for f in /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/linkedin.provider.js /app/apps/orchestrator/dist/libraries/nestjs-libraries/src/integrations/social/linkedin.provider.js; do
  sudo docker exec postiz sed -i -e \"/'r_basicprofile',/d\" -e \"/'rw_organization_admin',/d\" -e \"/'w_organization_social',/d\" -e \"/'r_organization_social',/d\" \"\$f\"
done
cd ~/postiz && sudo docker compose restart postiz
"
```

## Related

- [ghost-blog.md](ghost-blog.md) — Ghost CMS setup (source of content)
- [cloud-agent.md](cloud-agent.md) — clarity-agent VM (where Postiz runs)
- [accounts.md](accounts.md) — service accounts registry
