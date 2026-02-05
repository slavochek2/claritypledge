# Ship Blog Post

Two-stage newsletter publishing via Ghost Admin API. Run `/slava:prepare-blog` first to shape content.

## Usage

```
/slava:ship-blog                     # Start from latest draft in content/stories/
/slava:ship-blog test                # Re-send test email for current draft
/slava:ship-blog send                # Publish confirmed draft to all subscribers
```

## Process

### Stage 1: Draft & Test

1. **Navigate** to Ghost Admin (`blog.claritypledge.com/ghost/`)
2. **Create draft** via API:
   ```
   POST /ghost/api/admin/posts/
   Body: { posts: [{ title, lexical, status: "draft", email_only: false }] }
   ```
3. **Send test email** to admin:
   ```
   POST /ghost/api/admin/email_previews/posts/{id}/
   Body: { emails: ["slavochek@googlemail.com"], newsletter: "default-newsletter" }
   ```
4. **Tell user:** "Test email sent. Check your inbox. Reply 'ship' when ready, or tell me what to change."

### Stage 2: Ship

Only after user confirms the test email looks good:

1. **Get fresh `updated_at`** from the draft
2. **Publish with newsletter:**
   ```
   PUT /ghost/api/admin/posts/{id}/?newsletter=default-newsletter&email_segment=all
   Body: { posts: [{ status: "published", updated_at: "..." }] }
   ```
3. **Verify** email status:
   ```
   GET /ghost/api/admin/emails/
   ```
4. **Report:** subscriber count, delivery status, any errors

## Technical Details

**Ghost Admin API access:** All calls via `evaluate_script` (Chrome DevTools MCP) — uses httpOnly session cookies automatically.

**Newsletter slug:** `default-newsletter` (name: "Clarity Pledge")

**From address:** `"Clarity Pledge" <slava@claritypledge.com>`

**Content format:** Ghost uses Lexical editor format. Paragraph structure:
```json
{
  "root": {
    "children": [
      {
        "children": [{"text": "Your text here", "type": "text", ...}],
        "type": "paragraph", "version": 1
      }
    ],
    "type": "root", "version": 1
  }
}
```

**email_only posts:** Set `email_only: true` if the post should only go to email (not appear on blog). Default `false` shows on both blog and email.

## Pre-flight Checks

Before publishing, verify:
- [ ] Mailgun configured (`GET /ghost/api/admin/settings/` — check `mailgun_domain`)
- [ ] At least 1 subscriber (`GET /ghost/api/admin/members/?limit=1`)
- [ ] Newsletter active (`GET /ghost/api/admin/newsletters/`)
- [ ] Test email received and approved by user

## Troubleshooting

**Test email not received:**
- Check spam folder
- Verify Mailgun domain status at mailgun.com
- Check Ghost logs: `gcloud compute ssh ghost-prod --zone=us-central1-a --command="cd ~/ghost && sudo docker compose logs --tail 30"`

**Publish returns 409 (UpdateCollisionError):**
- Fetch fresh `updated_at` before publishing. Ghost uses optimistic locking.

**Newsletter query param error:**
- Must use slug (`default-newsletter`), not the newsletter ID.

**delivered_count stays 0:**
- Normal without Mailgun webhooks. Email still delivers — tracking just doesn't update.

## Related

- [ghost-blog.md](docs/technical/ghost-blog.md) — Infrastructure & configuration
- [p108_ghost_admin_email.md](features/drafts/p108_ghost_admin_email.md) — Admin email task
