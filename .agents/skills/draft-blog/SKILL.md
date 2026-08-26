---
name: draft-blog
description: "Convert an approved post into a polished Ghost draft"
when_to_use: "After /prepare-blog, when a post is ready for Ghost conversion."
version: 1.0.0
---

# Draft Blog Post

Convert an approved post into a polished Ghost draft. Polish only — no publishing.

## Usage

```
/slava:draft-blog                        # Pick latest post with status: review
/slava:draft-blog <slug>                 # Target a specific post
/slava:draft-blog --date 2026-02-05      # Backdate the post
```

## What This Does

1. **Convert** markdown → Ghost Lexical format (proper headings, lists, blockquotes, clickable links)
2. **Inline links** — auto-link first mentions of terms from the post's `## Sources` section
3. **Feature image** — search Unsplash for a relevant photo, upload to Ghost
4. **SEO metadata** — auto-populate `meta_description`, `custom_excerpt`, tags
5. **Create/update** Ghost draft via Admin API
6. **Return** preview URL + pre-publish checklist

Does NOT publish. Does NOT send emails.

## Before Starting

Search for the post with `status: review` (or `status: preparing` / `status: editing` if user specified a slug directly):
1. `content/articles/` — check first (article drafts)
2. `content/stories/` — newer dated posts
3. `content/blog/` — fallback (older posts)

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

**Set slug from filename** — strip the date prefix if present:
- `2026-02-05-calibrated-humans-for-ai-agents.md` → slug: `calibrated-humans-for-ai-agents`
- `my-post.md` → slug: `my-post`
Pass this as `slug` in the Ghost API call. Don't let Ghost auto-generate from the title (produces long ugly slugs).

Strip frontmatter (`---` block) and the `# Title` line before converting — those go into Ghost fields, not body.

Also strip the `## Sources` / `## References` section from the body — handled separately in Step 2.

### Step 2: Inline Links (Auto-link First Mentions)

Build the link list from two sources, merged (deduped by term):
1. **`content/links.md`** — canonical registry for internal links (other posts) and recurring external references. Check this file first.
2. **Post's own `## Sources` / `## References` section** — post-specific links.

For each entry, find the **first occurrence** of the display text in the Lexical body and wrap it in a link node.

Rules:
- First mention only — don't link every occurrence
- Skip if the text is already inside a link node
- Walk paragraphs, headings, list items (not code blocks)
- Preserve existing text format (bold, italic)

**Link injection algorithm** (for each unlinked source term):
1. Walk all paragraph/heading/list children in order
2. Find first `text` node containing the term
3. Split: `[text before] + [link node] + [text after]`
4. Recurse on the remainder for other terms

This step runs **during** the Lexical conversion, not after. The `## Sources` section is parsed first, then used during the walk.

**If no Sources section:** skip this step silently.

### Step 3: Feature Image

Generate an AI image using `/slava:gen-image` (Nano Banana Pro / Gemini native image generation). This replaces Unsplash — AI-generated images are unique, on-brand, and require no attribution.

**Process:**
1. Derive a visual prompt from the article title + core theme (e.g., "Abstract visualization of two founders calibrating understanding, clean editorial style, warm tones")
2. Generate via Gemini native image gen (`gemini-3-pro-image-preview`), aspect ratio `16:9` for blog feature images, `imageSize: "4K"`
3. Save to `/tmp/post-image.{ext}`
4. Upload to Ghost:
```
POST /ghost/api/admin/images/upload/
Content-Type: multipart/form-data
file: {image binary}
purpose: image
```

Use the returned `url` as `feature_image` on the post.

**No attribution needed** — AI-generated images have no photographer credit. Set `feature_image_caption` to a brief thematic caption if desired (e.g., "Calibration meets orchestration"), or leave empty.

**Fallback chain:** Gemini native → Imagen 4 → skip image with note to user. See `/slava:gen-image` for full fallback details and curl commands.

**Skip Postiz upload** — gen-image uploads to Postiz by default, but for Ghost drafts we upload directly to Ghost's image endpoint instead.

### Step 2b: Embed Widgets (Points & Stories)

If the post's markdown contains `<iframe>` tags (for embedding ClarityPledge points or stories), convert them to Ghost's `html` card nodes in the Lexical JSON:

```json
{
  "type": "html",
  "version": 1,
  "html": "<iframe src=\"https://claritypledge.com/point/{id}?embed=true\" width=\"100%\" height=\"400\" frameborder=\"0\" style=\"border-radius: 8px; border: 1px solid #e5e7eb;\"></iframe>"
}
```

**Rules:**
- Preserve the iframe exactly as written in the markdown — don't modify src, dimensions, or styles
- Each iframe becomes its own `html` card node (not inside a paragraph)
- Surrounding text (e.g., "Take a position:") becomes a normal paragraph node before the html card
- Both `/point/{id}?embed=true` and `/story/{id}?embed=true` URLs are valid

**If no iframes in the post:** Skip this step silently.

### Step 4: SEO Metadata

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

### Step 6: Report

Update frontmatter in the source file (`content/stories/{slug}.md` or `content/blog/{slug}.md`): set `status: draft-ready`, add `ghost_post_id: {id}`.

**Bidirectional spec sync.** If the blog draft has a `source_spec:` field pointing at a `content/articles/a*.md` file, also update that a-spec:

1. Set a-spec frontmatter `status: draft-ready`.
2. Ensure `draft_file:` field exists and points at the actual blog draft path (`content/blog/{slug}.md`). Add if missing.
3. Check off `[x] Ghost draft (/draft-blog)` in the a-spec's `## Progress` section if present.

Skip if no `source_spec:` link exists (raw blog post, no a-spec).

Then report:

```
✓ Ghost draft ready
  Editor: https://blog.claritypledge.com/ghost/#/editor/post/{id}
  Feature image: AI-generated (Nano Banana Pro)
  Tags: AI, Calibration, Communication
  Excerpt: "{first 100 chars}..."
  Published at: 2026-02-05
  Inline links: {list of terms linked}

── Pre-publish checklist ──────────────────────────────
  1. Open the editor link above and review visually
  2. Check: image caption set, links work, formatting looks right
  3. Ghost v5.130 has NO test email feature (UI or API)
     → If you're the only subscriber: just publish — you get the email
     → If multiple subscribers: review carefully in Preview first
  4. When ready: /slava:ship-blog
───────────────────────────────────────────────────────
```

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
