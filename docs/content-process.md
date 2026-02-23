# Content Process — End to End

How a blog post goes from raw experience to published newsletter.

---

## The Pipeline

```
Experience / idea
      ↓
/story or /sifter        →  content/stories/       (raw capture)
      ↓
/interview               →  (optional — extract real story via questions)
      ↓
/prepare-blog            →  content/blog/           (shaped for publishing)
      ↓
user reviews locally
      ↓
/draft-blog              →  Ghost draft             (Lexical conversion + images + SEO)
      ↓
user reviews in Ghost Admin (visual preview)
      ↓
/ship-blog               →  send to subscribers
      ↓
published at blog.claritypledge.com
```

---

## Each Step in Plain English

### 1. `/story` or `/sifter` — Capture

**What:** Record the raw experience before it fades. No polish needed.

**Input:** Brain dump, conversation notes, something that just happened.

**Output:** `content/stories/YYYY-MM-DD-slug.md` — unstructured, first-person, messy is fine.

**When to use:** After an event, after a conversation that sparked something, after a rabbit hole like Moltbook.

---

### 2. `/interview` — Extract (optional)

**What:** A structured interview to pull out the real insight buried in the story.

**When to use:** When the raw story exists but the "so what" is unclear. Skip if the insight is already obvious.

**Output:** Annotated story with the core insight surfaced.

---

### 3. `/prepare-blog` — Shape

**What:** Rewrites the raw story into a publishable post. Applies voice, structure, sources.

**Reads:** `content/voice.md` (how Slava sounds) + `content/strategy.md` (what and why).

**Process:**
1. Extracts: insight, tension, evidence
2. Proposes structure — user approves
3. Writes full draft
4. User scores 1–10, iterates until ready

**Output:** `content/blog/{slug}.md` with frontmatter:
```yaml
---
title: "Post Title"
status: preparing     # → review when user approves
series: manifesto     # optional
series_order: 1
series_total: 7
---
```

**Quality bar (from `strategy.md`):**
- Has a specific moment or insight (not just an opinion)
- Sounds like Slava talking to a smart friend
- A reader could forward it saying "read this"
- Honest about what he doesn't know

---

### 4. User Review (local)

**What:** Read the draft in `content/blog/`. Change `status: preparing` → `status: review` when approved.

---

### 5. `/draft-blog` — Polish & Preview

**What:** Converts the approved `content/blog/` post into a polished Ghost draft. Handles all technical enrichment — no publishing yet.

**Does:**
1. Converts markdown → Ghost Lexical format (proper headings, lists, blockquotes, clickable links)
2. Finds and uploads a feature image (Unsplash, matched to article topic)
3. Populates SEO metadata (`meta_description`, `custom_excerpt`, tags)
4. Sets `published_at` (supports backdating)
5. Creates/updates draft in Ghost Admin
6. Returns preview URL for visual review

**Output:** Ghost draft URL + updates frontmatter `status: draft-ready`

**Ghost API:** JWT auth via `GHOST_ADMIN_API_KEY` from `.env.local`.

---

### 6. User Review (Ghost Admin)

**What:** Open the Ghost draft URL. Check formatting, image, how it reads on mobile. Make edits directly in Ghost if needed.

When happy: tell Claude "ship it."

---

### 7. `/ship-blog` — Send

**What:** One action — publishes the approved Ghost draft to all subscribers.

**Does:**
1. Fetches fresh `updated_at` from Ghost (required for optimistic locking)
2. Publishes: `status: published`, newsletter: `default-newsletter`, segment: `all`
3. Updates frontmatter: `status: published`
4. Reports subscriber count + delivery status

**Note:** Does no conversion or enrichment — that's `/draft-blog`'s job.

---

## Content Locations

| What | Where |
|------|-------|
| Raw stories | `content/stories/` |
| Blog-ready drafts | `content/blog/` |
| Voice reference | `content/voice.md` |
| Strategy reference | `content/strategy.md` |
| Series epics | `content/blog/_series-{name}.md` |
| Ghost Admin | https://blog.claritypledge.com/ghost/ |
| Public blog | https://blog.claritypledge.com |

---

## Ghost Technical Details

**Infrastructure:** Self-hosted Ghost 5 on GCP VM `ghost-prod` (us-central1-a). Full details in [docs/technical/ghost-blog.md](technical/ghost-blog.md).

**API auth:** Ghost Admin API key stored as `GHOST_ADMIN_API_KEY` in `.env.local` (format: `{id}:{secret}`). JWT tokens are generated per-request (5-min expiry).

**Newsletter slug:** `default-newsletter` (name: "Clarity Pledge")

**Published_at:** Can be set to any past date — posts will appear backdated on the blog. Newsletter email sends at time of publish (can't retroactively send emails).

**Content format:** Ghost uses Lexical editor format (JSON). The `/draft-blog` skill converts markdown → Lexical nodes.

---

## Newsletter Structure

Two streams, both sent via the same `default-newsletter`:

| Stream | Content | Cadence |
|--------|---------|---------|
| **Manifesto Series** | 7-post sequence (the Clarity Tax ideas) | Drip for new subscribers |
| **Clarity Notes** | Build-in-public, AI coding, events, reflections | Whenever Slava writes |

Tags keep them visually distinct on the blog (`manifesto-series`).

---

## Skills Reference

| Skill | Invoke | What |
|-------|--------|------|
| Capture story | `/slava:story` | Raw experience → `content/stories/` |
| Sifter capture | `/slava:sifter-story` | Sifter session → `content/stories/` |
| Interview | `/slava:interview` | Extract insight from raw story (optional) |
| Shape for blog | `/slava:prepare-blog` | Raw story → polished draft in `content/blog/` |
| Polish & preview | `/slava:draft-blog` | `content/blog/` → Ghost draft with image + SEO |
| Send to subscribers | `/slava:ship-blog` | Publish approved Ghost draft to newsletter |
