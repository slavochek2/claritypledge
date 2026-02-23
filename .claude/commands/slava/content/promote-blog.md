# Promote Blog Post

Distribute a published blog post to LinkedIn. Generates copy + image options, waits for approval, then posts via Postiz.

Run after `/slava:ship-blog`. The post must already be live on Ghost.

## Usage

```
/slava:promote-blog               # Promote the latest published post
/slava:promote-blog <ghost-id>    # Promote a specific post by Ghost ID
```

## Step 1 — Find the Post

Search `content/stories/` then `content/blog/` for a post with `status: published` and a `ghost_post_id`.

Fetch the full post from Ghost to get title, excerpt, and body:
```
GET /ghost/api/admin/posts/{id}/?formats=html
```

## Step 2 — Generate Copy Variants

Write **3 LinkedIn post variants** from the post content. Each variant:
- Max 4 sentences
- Starts with a strong hook (insight, tension, or provocative question — not "I wrote a post about...")
- One sentence of context
- Ends with the URL: `https://blog.claritypledge.com/{slug}/`
- No hashtags unless they're clearly relevant

Vary the angle across variants (e.g., personal angle / contrarian take / practical insight).

## Step 3 — Find Image Candidates

Search Unsplash for 3 candidate images relevant to the post topic:
```
GET https://api.unsplash.com/search/photos?query={topic}&per_page=3&orientation=landscape
Authorization: Client-ID {UNSPLASH_ACCESS_KEY from .env.local}
```

For each result return:
- `urls.regular` — the image URL to display
- `user.name` + `user.links.html` — for attribution
- `alt_description` — brief description

## Step 4 — Present for Approval

Generate a static HTML approval page at `/tmp/promote-blog-approval.html` and open it:

```bash
open /tmp/promote-blog-approval.html
```

The HTML page must include:
- Post title + live URL (linked)
- Instruction banner (yellow, prominent): "Reply with: **copy 1/2/3** (or paste edits) + **image A/B/C** — required. Type 'none' only if you explicitly want no image."
- **Copy section**: 3 labeled cards (label, angle name, full copy text with URL)
- **Image section**: 3 image cards with `<img>` tags using `urls.regular` (add `?w=600` for fast loading), alt_description, photographer name. Plus a "[none] — Text-only, no image" option styled as clearly secondary/dashed.

Use clean card-based HTML with hover states. No JS needed — purely visual review.

After opening, tell the user: "Approval page open — reply with copy number + image letter (e.g. '2 B' or '1 C'). Both required."

**Wait for explicit approval before posting.** The user may also paste edited copy directly in their reply.

## Step 5 — Post via Postiz

Postiz uses cookie-based auth (no Bearer token from CLI). Auth flow:

```bash
# 1. Login — sets postiz.sid cookie
curl -c /tmp/postiz-cookies.txt -X POST {POSTIZ_URL}/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"{POSTIZ_EMAIL}","password":"{POSTIZ_PASSWORD}","provider":"LOCAL"}'
# → {"login":true}

# 2. Schedule post
curl -b /tmp/postiz-cookies.txt -X POST {POSTIZ_URL}/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "type": "schedule",
    "date": "$(node -e 'console.log(new Date(Date.now()+2*60000).toISOString())')",
    "shortLink": false,
    "tags": [],
    "posts": [{
      "integration": {"id": "{POSTIZ_LINKEDIN_CHANNEL_ID}"},
      "value": [{"content": "{approved copy}", "image": []}]
    }]
  }'
# → [{"postId":"...","integration":"..."}]

# 3. Clean up cookie file
rm /tmp/postiz-cookies.txt
```

Verify: `201` response with a `postId` = success.

**With image** (if user selected one): download the Unsplash image to `/tmp/`, then upload before creating post:
```bash
curl -b /tmp/postiz-cookies.txt -X POST {POSTIZ_URL}/api/media \
  -F "file=@/tmp/unsplash-image.jpg"
# → {"path":"..."} — use returned path as image value:
# "image": [{"url": "{path}", "id": "..."}]
```
If media upload fails, post text-only (skip `image` field entirely, set `image: []`).

## Report

```
✓ Posted to LinkedIn
  Copy: "{first 80 chars}..."
  Image: {description or "none"}
  Postiz post ID: {id}
  View in Postiz: https://postiz.claritypledge.com/launches
```

## Credentials (all in `.env.local`)

| Variable | Value |
|----------|-------|
| `POSTIZ_URL` | `https://postiz.claritypledge.com` |
| `POSTIZ_EMAIL` | `ops@claritypledge.com` |
| `POSTIZ_PASSWORD` | Postiz account password |
| `POSTIZ_LINKEDIN_CHANNEL_ID` | `cmlzashw80001t86nxnlk6pi2` (Vyacheslav Ladischenski) |
| `UNSPLASH_ACCESS_KEY` | Client-ID for Unsplash API |

Note: `POSTIZ_API_TOKEN` in `.env.local` is stored for reference but Postiz uses cookie-based session auth for API calls — Bearer token auth returns 401 from CLI.

## Troubleshooting

**Postiz 401:** Token stale — rotate at Postiz → Settings → Public API → Rotate Key, update `POSTIZ_API_TOKEN` in `.env.local`.

**LinkedIn channel not found:** Re-fetch channel ID: `GET {POSTIZ_URL}/api/integrations/list` with Bearer token → use `id` field from the linkedin entry.

**Postiz container patch:** If LinkedIn fails with scope error after a Postiz update, re-apply the LinkedIn scope patch — see [postiz.md](docs/technical/postiz.md).

**Unsplash 403:** Key expired or rate-limited. Check app at unsplash.com/oauth/applications.

**Image upload fails:** Skip the image and post text-only — LinkedIn text posts perform fine without images.

## Related

- [ship-blog.md](ship-blog.md) — Previous step (publish to Ghost + email)
- [postiz.md](docs/technical/postiz.md) — Postiz infrastructure + LinkedIn patch
- [draft-blog.md](draft-blog.md) — Full pipeline start
