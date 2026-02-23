# Ship Blog Post

Publish an approved Ghost draft to all subscribers. One action — no conversion, no enrichment.

Run `/slava:draft-blog` first to create and polish the Ghost draft. This skill just sends it.

After shipping, run `/slava:promote-blog` to distribute to LinkedIn (copy + image approval required).

## Usage

```
/slava:ship-blog               # Publish the latest draft-ready post
/slava:ship-blog <ghost-id>    # Publish a specific Ghost post by ID
```

## Before Running

The post must already exist as a Ghost draft. Search for a post with `status: draft-ready` and a `ghost_post_id` in frontmatter:
1. `content/stories/` — check first (newer dated posts)
2. `content/blog/` — fallback (older posts)

If not found, tell the user to run `/slava:draft-blog` first.

## Pre-flight Checks

Before publishing, verify:

```
GET /ghost/api/admin/newsletters/
```
→ Newsletter `default-newsletter` is active.

```
GET /ghost/api/admin/members/?limit=1
```
→ At least 1 subscriber exists.

Report both counts to user: "Ready to send to {N} subscribers. Confirm?"

Wait for explicit confirmation before publishing.

## Publish

1. **Fetch fresh `updated_at`** from the draft (Ghost uses optimistic locking — stale `updated_at` → 409 error):
   ```
   GET /ghost/api/admin/posts/{id}/
   ```

2. **Publish with newsletter:**
   ```
   PUT /ghost/api/admin/posts/{id}/?newsletter=default-newsletter&email_segment=all
   {
     "posts": [{
       "status": "published",
       "updated_at": "{fresh value}"
     }]
   }
   ```
   Note: `newsletter` param must be the **slug** (`default-newsletter`), not the ID.

3. **Verify delivery** (wait ~15s after publish, then check):
   ```
   GET /ghost/api/admin/posts/{id}/?include=email
   ```
   Check `posts[0].email.status` — should be `submitted` (not `pending` or `failed`).
   Note: `delivered_count` stays 0 without Mailgun webhooks — `submitted` means sent to Mailgun successfully.

4. **Update frontmatter** in the source file (`content/stories/{slug}.md` or `content/blog/{slug}.md`):
   ```yaml
   status: published
   published_at: {actual publish date}
   ```

## Report

```
✓ Published
  URL: https://blog.claritypledge.com/{slug}/
  Sent to: {N} subscribers
  Email status: {submitted/delivered/failed}

Next: run /slava:promote-blog to post to LinkedIn
```

## Troubleshooting

**409 UpdateCollisionError:** Fetch fresh `updated_at` and retry once.

**Newsletter param error:** Must use slug (`default-newsletter`), not newsletter ID.

**`delivered_count` stays 0:** Normal without Mailgun webhooks. Email still delivers — tracking just doesn't update in real time.

**Email not received:** Check spam. Check Mailgun event logs via Ghost server SSH (see [ghost-blog.md](docs/technical/ghost-blog.md)).

## Ghost API Auth

JWT from `GHOST_ADMIN_API_KEY` in `.env.local`:
```js
const [id, secret] = key.split(':');
// header: { alg: 'HS256', typ: 'JWT', kid: id }
// payload: { iat, exp: iat+300, aud: '/admin/' }
// sign with Buffer.from(secret, 'hex')
```

## Related

- [draft-blog.md](draft-blog.md) — Previous step (create + polish Ghost draft)
- [promote-blog.md](promote-blog.md) — Next step (LinkedIn distribution)
- [ghost-blog.md](docs/technical/ghost-blog.md) — Infrastructure
