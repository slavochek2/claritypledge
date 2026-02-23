# Draft Blog Post

Convert an approved `content/blog/` post into a polished Ghost draft. Polish only — no publishing.

## Usage

```
/slava:draft-blog                        # Pick latest content/blog/ post with status: review
/slava:draft-blog <slug>                 # Target a specific post
/slava:draft-blog --date 2026-02-05      # Backdate the post
```

## What This Does

1. **Convert** markdown → Ghost Lexical format (proper headings, lists, blockquotes, clickable links)
2. **Feature image** — search Unsplash for a relevant photo, upload to Ghost
3. **SEO metadata** — auto-populate `meta_description`, `custom_excerpt`, tags
4. **Create/update** Ghost draft via Admin API
5. **Return** preview URL for visual review in Ghost Admin

Does NOT publish. Does NOT send emails.

## Before Starting

Find the post in `content/blog/` with `status: review` (or `status: preparing` if user specified a slug directly).

If no post is ready, tell the user: "No post ready to draft. Run `/slava:prepare-blog` first."

## Process

### Step 1: Convert Markdown → Lexical

Read the post from `content/blog/{slug}.md`. Convert to Ghost Lexical JSON:

**Node types to handle:**
- `## Heading` → `heading` node with `tag: "h2"`
- `### Heading` → `heading` node with `tag: "h3"`
- `> Blockquote` → `quote` node
- `- item` / `* item` → `list` node (type: `bullet`) with `listitem` children
- `1. item` → `list` node (type: `number`) with `listitem` children
- `[text](url)` → `link` node wrapping a `text` node
- `**bold**` → `text` node with `format: 1`
- `*italic*` → `text` node with `format: 2`
- `---` → `horizontalrule` node
- Regular paragraph → `paragraph` node
- Empty lines → skip

**Lexical node structure:**
```json
{
  "root": {
    "children": [...nodes],
    "direction": "ltr",
    "format": "",
    "indent": 0,
    "type": "root",
    "version": 1
  }
}
```

**Paragraph node:**
```json
{
  "children": [{ "detail": 0, "format": 0, "mode": "normal", "style": "", "text": "...", "type": "text", "version": 1 }],
  "direction": "ltr", "format": "", "indent": 0, "type": "paragraph", "version": 1
}
```

**Link node:**
```json
{
  "children": [{ "detail": 0, "format": 0, "mode": "normal", "style": "", "text": "link text", "type": "text", "version": 1 }],
  "direction": "ltr", "format": "", "indent": 0, "rel": "noopener", "target": "_blank",
  "title": null, "type": "link", "url": "https://...", "version": 1
}
```

**List node:**
```json
{
  "children": [
    { "children": [{ "text": "item text", "type": "text", ... }], "direction": "ltr", "format": "", "indent": 0, "type": "listitem", "value": 1, "version": 1 }
  ],
  "direction": "ltr", "format": "", "indent": 0, "listType": "bullet", "start": 1, "tag": "ul", "type": "list", "version": 1
}
```

Strip frontmatter (`---` block) and the `# Title` line before converting — those go into Ghost fields, not body.

### Step 2: Feature Image

Search Unsplash for a photo matching the article topic. Use the Unsplash API:

```
GET https://api.unsplash.com/search/photos?query={topic}&orientation=landscape&per_page=5
Authorization: Client-ID {UNSPLASH_ACCESS_KEY}
```

`UNSPLASH_ACCESS_KEY` from `.env.local`. If not set, skip image with a note to user.

Pick the photo with highest relevance (first result is usually best). Download it and upload to Ghost:

```
POST /ghost/api/admin/images/upload/
Content-Type: multipart/form-data
file: {image binary}
purpose: image
```

Use the returned `url` as `feature_image` on the post.

**If Unsplash fails or key is missing:** Create the post without a feature image, note it to user.

### Step 3: SEO Metadata

Auto-populate from the post content:

| Field | Source |
|-------|--------|
| `custom_excerpt` | First non-heading paragraph (≤ 300 chars) |
| `meta_description` | Same as `custom_excerpt` |
| `meta_title` | Post title (Ghost default — only override if title > 60 chars) |
| `tags` | Infer 2-4 tags from content (e.g. "AI", "Calibration", "Communication", "Build in Public") |
| `og_image` | Same as `feature_image` |

### Step 4: Create/Update Ghost Draft

**Auth:** Generate JWT from `GHOST_ADMIN_API_KEY` in `.env.local`:
```js
const [id, secret] = key.split(':');
// header: { alg: 'HS256', typ: 'JWT', kid: id }
// payload: { iat, exp: iat+300, aud: '/admin/' }
// sign with Buffer.from(secret, 'hex')
```

**Check if draft already exists** (post may have been created in a previous run):
```
GET /ghost/api/admin/posts/?filter=status:draft&fields=id,title,slug
```
Look for matching title or slug. If found, UPDATE. If not, CREATE.

**Create:**
```
POST /ghost/api/admin/posts/
{
  "posts": [{
    "title": "...",
    "slug": "...",
    "lexical": "...",
    "status": "draft",
    "published_at": "2026-02-05T09:00:00.000Z",   // from --date flag or frontmatter date
    "feature_image": "...",
    "custom_excerpt": "...",
    "meta_description": "...",
    "tags": [{ "name": "AI" }, { "name": "Calibration" }],
    "email_only": false
  }]
}
```

**Update** (if draft already exists — fetch `updated_at` first for optimistic locking):
```
PUT /ghost/api/admin/posts/{id}/
```

### Step 5: Report

```
✓ Ghost draft ready
  Preview: https://blog.claritypledge.com/ghost/#/posts/{id}
  Feature image: {unsplash photo credit}
  Tags: AI, Calibration, Communication
  Excerpt: "{first 100 chars}..."
  Published at: 2026-02-05

To publish: /slava:ship-blog
```

Update frontmatter in `content/blog/{slug}.md`: set `status: draft-ready`, add `ghost_post_id: {id}`.

## Ghost API Reference

**Base URL:** `https://blog.claritypledge.com/ghost/api/admin/`

**Key endpoints:**
- `POST /posts/` — create post
- `PUT /posts/{id}/` — update post
- `POST /images/upload/` — upload image
- `GET /posts/?filter=status:draft` — list drafts

**JWT auth:** `Authorization: Ghost {token}` header on every request.

## Related

- [ghost-blog.md](docs/technical/ghost-blog.md) — Infrastructure
- [prepare-blog.md](prepare-blog.md) — Previous step
- [ship-blog.md](ship-blog.md) — Next step
