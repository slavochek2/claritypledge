---
name: prep-email
description: Insert email-safe fallback cards after iframe embeds in Ghost blog posts so newsletter readers see a static preview instead of blank space.
when_to_use: "After /draft-blog or /enhance-blog creates a Ghost post with embedded iframes. Run before /ship-blog. Triggered by 'prep email', 'prepare for email', 'email fallbacks', or '/prep-email'."
version: 1.0.0
---

# /prep-email

Insert email-safe fallback cards after iframe embeds in a Ghost blog post. Ghost strips all iframes from newsletter emails — this skill adds an Email Content card (visible only in email) after each embed with a static screenshot + CTA link.

**Announce at start:** "Running /prep-email."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Add email fallbacks for embeds before sending newsletter | `/prep-email` <- here |
| Draft blog post text from scratch | `/draft-blog` |
| Add interactive visuals to a blog post (web view) | `/enhance-blog` |
| Publish a draft to Ghost + send email | `/ship-blog` |
| Generate a feature image for the post | `/gen-image` |

---

## Usage

```bash
/prep-email <ghost-post-id>      # by Ghost post ID
/prep-email <slug>                # by post slug
/prep-email                       # uses most recent draft
```

---

## Before Starting

Fetch the post via Ghost Admin API. Halt if:
- Post not found -> "Post not found. Check the ID/slug."
- Post has no iframe embeds -> "No iframes found in this post. Nothing to do."

```bash
source .env.local
# Requires: GHOST_ADMIN_API_KEY in format id:secret
# Verify: node -e "..." (see Ghost API Auth section below)
```

---

## Workflow

### Step 1: Fetch post and parse Lexical

1. Authenticate with Ghost Admin API (JWT — see auth section below)
2. Fetch post: `GET /ghost/api/admin/posts/{id}/?formats=lexical`
3. Parse: `JSON.parse(post.lexical)`
4. Walk `root.children` and catalog all non-email-safe nodes:
   - `type: "html"` -> **process ALL** (iframes, JS blocks, CSS-only visuals — none render reliably across email clients)
   - `type: "embed"` where `embedType` is `video` (YouTube/Vimeo) -> **skip** (Ghost auto-generates thumbnail+play button)
   - `type: "embed"` where `embedType` is NOT video -> **process**

   Simple rule: every HTML card gets an email fallback. No guessing about what CSS renders OK in Gmail vs Outlook.

Report to user:
```
Found {N} non-email-safe blocks to process:
  1. {description} (html card — iframe)
  2. {description} (html card — interactive JS)
  3. {description} (embed card)
Skipped: {K} video embeds (Ghost handles these natively).
```

### Step 2: Screenshot each block

For each block to process, use Playwright with **`deviceScaleFactor: 2`** for retina-quality images:

**For iframe embeds:**
1. Extract the `src` URL from the iframe HTML (regex: `src="([^"]+)"`)
2. Open the URL in a new Playwright context with `{ viewport: { width: 600, height: 400 }, deviceScaleFactor: 2 }`
3. Wait for content to load (3s or network idle)
4. Screenshot the content element (not full viewport — avoids whitespace). Use element-level screenshot when possible.
5. Save to `/tmp/prep-email-{index}.png`

**For interactive JS blocks (enhance-blog visuals):**
1. These are self-contained HTML/CSS/JS — render them in a standalone page
2. Create a temp HTML file with the block's HTML content, open it in Playwright
3. Wait for animations to settle (3s)
4. Screenshot the rendered block element at 2x
5. Save to `/tmp/prep-email-{index}.png`

**For embed cards:**
1. Navigate to the embed URL
2. Screenshot as with iframes

If screenshot fails for any block, report it and skip — don't block others:
```
⚠ Could not screenshot block at index {i} — skipping. Add email fallback manually in Ghost editor.
```

### Step 3: Upload screenshots to Ghost

For each successful screenshot:

```
POST /ghost/api/admin/images/upload/
Content-Type: multipart/form-data
file: @/tmp/prep-email-{index}.png
```

Extract the returned `url` from the response. This is the Ghost-hosted image URL.

### Step 4: Build email cards

For each embed, construct an Email Content card (Lexical node `type: "email"`):

```json
{
  "type": "email",
  "version": 1,
  "html": "<div style=\"text-align:center;margin:8px 0;\"><a href=\"{embed_url}\" style=\"text-decoration:none;\"><img src=\"{screenshot_url}\" alt=\"Interactive content — click to view\" style=\"max-width:100%;border-radius:8px;border:1px solid #e5e7eb;\"></a><p style=\"margin:8px 0 0;font-size:14px;color:#6b7280;\"><a href=\"{embed_url}\" style=\"color:#3b82f6;text-decoration:none;\">View interactive version &rarr;</a></p></div>"
}
```

Where:
- `{embed_url}` = the iframe src URL (where clicking takes the reader)
- `{screenshot_url}` = the Ghost-hosted screenshot URL from Step 3

**Show the user a preview of all cards before inserting:**

```
Email cards ready to insert:

1. After embed: {iframe_src_1}
   Screenshot: {ghost_image_url_1}
   CTA links to: {embed_url_1}

2. After embed: {iframe_src_2}
   Screenshot: {ghost_image_url_2}
   CTA links to: {embed_url_2}

Insert into post? (y/n)
```

Wait for confirmation.

### Step 5: Hide originals + insert email cards into Lexical and PUT

1. **Fetch fresh** `updated_at` from Ghost (GET the post again — prevents 409 conflict)
2. Walk `root.children` again, find each non-email-safe node by matching its HTML content
3. **Hide the original from email** by setting `visibility` on the HTML card:
   ```json
   {
     "visibility": {
       "web": { "nonMember": true, "memberSegment": "status:free,status:-free" },
       "email": { "memberSegment": "" }
     }
   }
   ```
   This keeps the original visible on web but hides it from email. Without this, Ghost strips scripts/iframes but keeps the remaining HTML/CSS — rendering as empty blocks or partial visuals in the email.
4. Insert the corresponding email card node **immediately after** each original node
5. Check for idempotency: if an email card already follows a node (from a previous run), skip it
6. `JSON.stringify` the modified Lexical document
7. PUT to Ghost:

```
PUT /ghost/api/admin/posts/{id}/
Content-Type: application/json

{
  "posts": [{
    "lexical": "{stringified_lexical}",
    "updated_at": "{fresh_updated_at}"
  }]
}
```

### Step 6: Append email signature card

Append a styled signature card as the last element in the post (email-only). This replaces the web version's personal card for email readers.

```json
{
  "type": "email",
  "version": 1,
  "html": "<div style=\"margin:32px 0 16px;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;\"><p style=\"margin:0 0 4px;font-size:16px;font-weight:700;color:#1a1a1a;\">Vyacheslav Ladischenski</p><p style=\"margin:0 0 12px;font-size:14px;color:#6b7280;font-style:italic;\">I&rsquo;ve lost co-founders. I help you keep yours.</p><a href=\"https://ladischenski.com/#services\" style=\"font-size:14px;color:#3b82f6;text-decoration:none;\">Learn more &rarr;</a></div>"
}
```

**Idempotency:** Check if the last node is already an email card containing "Vyacheslav Ladischenski" — skip if so.

### Step 7: Verify and report

1. GET the post again with `?formats=lexical`
2. Count email nodes in `root.children` — should match expected count (embeds + 1 signature)
3. Report:

```
Done — email fallbacks inserted.

Post: "{title}"
Embeds processed: {N}
Email cards added: {M}
Skipped (video/already done): {K}

Preview email version:
  Ghost Editor -> {editor_url} -> click "Email" tab

Next: /ship-blog to publish and send newsletter
```

---

## Self-check before inserting (Step 5 gate)

- [ ] Every non-email-safe node has exactly one email card to insert after it
- [ ] Every non-email-safe node has `visibility.email.memberSegment: ""` set (hidden from email)
- [ ] No duplicate email cards (skip if email card already follows a processed node)
- [ ] YouTube/Vimeo embeds skipped (only exception)
- [ ] Fresh `updated_at` fetched immediately before PUT (not stale from Step 1)
- [ ] All screenshot URLs are valid Ghost image URLs (start with `https://blog.claritypledge.com/content/images/`)
- [ ] Lexical JSON is valid after modification (parseable, root.children is array)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| 409 Conflict on PUT | Stale `updated_at`. Re-fetch the post and retry with fresh value. |
| Screenshot is blank/broken | The embed URL may require auth or cookies. Screenshot it manually, upload to Ghost, and add the email card in Ghost editor. |
| Email card shows on web too | Wrong card type. Must be `type: "email"`, NOT `type: "html"`. Email cards are invisible on web. |
| Gmail clips the email | Gmail clips emails >102KB. If many embeds, consider reducing screenshot quality or dimensions. |
| Already-processed embed | The idempotency check in Step 5 should skip it. If not, manually check `root.children` for adjacent email nodes. |

---

## Ghost API Auth

```javascript
// From .env.local: GHOST_ADMIN_API_KEY (format: id:secret)
const [id, secret] = GHOST_ADMIN_API_KEY.split(':');
// JWT header: { alg: 'HS256', typ: 'JWT', kid: id }
// JWT payload: { iat: now, exp: now + 300, aud: '/admin/' }
// Sign with: Buffer.from(secret, 'hex')

// Bash fallback (node one-liner):
node -e "
const jwt = require('jsonwebtoken');
const [id, secret] = process.env.GHOST_ADMIN_API_KEY.split(':');
const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
  keyid: id, algorithm: 'HS256', expiresIn: '5m', audience: '/admin/'
});
console.log(token);
"
```

**Base URL:** `https://blog.claritypledge.com/ghost/api/admin/`

**Endpoints used:**
- `GET /posts/{id}/?formats=lexical` — fetch post with Lexical content
- `GET /posts/?filter=status:draft&limit=1&order=updated_at desc&formats=lexical` — latest draft
- `GET /posts/slug/{slug}/?formats=lexical` — fetch by slug
- `POST /images/upload/` — upload screenshot (multipart/form-data)
- `PUT /posts/{id}/` — update post with modified Lexical

---

## Related Skills

- `/draft-blog` — previous step: creates the Ghost draft
- `/enhance-blog` — adds interactive visuals (web view); run `/prep-email` after if enhance added new embeds
- `/ship-blog` — next step: publishes draft + sends newsletter email
- `/promote-blog` — after shipping: distributes to LinkedIn
