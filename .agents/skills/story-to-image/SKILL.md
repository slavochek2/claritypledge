---
name: story-to-image
description: Generate OR render a supporting image for a story (Gemini diagram, or a screenshot of a live page/component), upload to GCS, and update both test + prod DB.
when_to_use: "When you need to attach a supporting image to a story identified by its tag (st1–st9) — either a generated conceptual diagram or a framed screenshot of an existing page (e.g. /partner-template). Also triggered by '/story-to-image'."
version: 1.3.0
---

# /story-to-image

Generate a 4:3 landscape conceptual diagram for a ClarityPledge story, upload to GCS, and attach it.

**Announce at start:** "Running /story-to-image."

---

## Usage

```
/story-to-image st2                              # Auto-compose prompt from story + point + antipoint
/story-to-image st2 "custom concept override"    # Use explicit concept description
```

**Argument:** Story tag (e.g. `st2`) — matches the **`system_tags`** array (NOT `tags` — see note in Credentials).

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Generate + attach image to a story | `/story-to-image` ← here |
| Generate image for a LinkedIn post | `/gen-image` |
| Generate event promotion posters | `/gen-poster` |
| Redact sensitive text from a screenshot | `/redact-image` |

---

## Image source: two modes

| Mode | When | Path |
|---|---|---|
| **A — Generate** (Gemini) | A conceptual diagram drawn from story content | Steps 3–8 below |
| **B — Render a page** | The image IS an existing product surface (e.g. the `/partner-template` agreement certificate) | "Mode B" section below → then Step 7 |

After Step 1–2 (fetch story), pick the mode. Both converge at Step 7 (resize) → Step 11.

---

## Mode B — Render an existing page/component

Use when the image should BE a real product surface, not a generated diagram. Render the **live component** so the image is pixel-identical to production — never hand-rebuild it in standalone HTML (it diverges from the real component).

**Tooling:** Chrome DevTools MCP (headless — fine for public routes; auth-gated routes need Claude-in-Chrome). Dev server must be running (`npm run dev`; use the printed port).

### B1 — Stage at 4:3 and auto-fit (the sizing recipe — don't eyeball it)

The story card renders images at **4:3 `object-cover`**, so the image MUST be 4:3 or it gets cropped. `resize_page` to **1600×1200**, navigate to the route, then one `evaluate_script` that:

1. **Finds the target** by a stable signature (e.g. border width + background color), not a brittle Tailwind class.
2. **Hides** chrome/overlays you don't want (nav, hero text, CTA, footer, watermark) and any sections the founder asked to drop.
3. **Moves it into a fixed full-viewport stage** (`position:fixed;inset:0`, chosen background, flex-centered). **Pin the element width** (e.g. `width:720px;flex:0 0 auto`) — moving it out of its layout parent drops the width constraint and text reflows huge.
4. **Auto-fit to fill the frame.** Sweep a few element widths (e.g. `[740,800,860,920,980,1040,1100]`), measure each natural height, and **pick the width whose ratio is closest to 4:3** (≈1.333) — text wrapping quantizes the ratio, so a single fixed width usually leaves a gutter. Then `scale = min((1600−safe)/natW, (1200−safe)/natH)`, `safe ≈ 28px`; apply `transform: scale(...)`, `transform-origin:center`. Fewer sections ⇒ larger scale automatically, so cutting content makes text bigger, not emptier.

**Whitespace policy — the subject always fills the frame; the only question is the background:**
- **Bounded artifact** (its own frame/background — a certificate, card, document, UI panel) → it must reach the edges. Set the stage background to the artifact's **own** background colour (e.g. the cream `#FDFBF7`, not white) so the hairline safe-margin reads as the artifact, not an empty gutter. **Never leave a white gutter around a cream card** — that's the "floaty white space" failure.
- **Unbounded content on a white canvas** (a Gemini diagram) → the white IS the canvas and merges invisibly into the white story card; margins there are fine, but content elements must still reach toward the edges (no big empty interior bands).

### B2 — Screenshot

`take_screenshot` (viewport, **not** `fullPage`) to a path **inside the workspace** — the DevTools MCP rejects `/tmp`. Use `.private/tmp/<tag>_candidate.jpeg`. The 1600×1200 viewport yields a 4:3 JPEG; Step 7 then resizes to 1200px longest edge.

Then continue at **Step 7 (resize)**.

### B3 — Form pages & personal artifacts

If the route is a form (e.g. `/sign-pledge`), the artifact and a sign-up form share one container:
- **Hide the form** — find the first form block (e.g. the element holding "Profile strength" / email) and hide it **and all following siblings**; as a safety net also hide every `input`/`textarea`/`button` and its wrapper row.
- **Filled fields render as text, not boxes.** A value set on an `<input>` still shows the input's border/shadow/fixed-width (leaving a gap). Replace it with an inline `<strong>`/`<span>` (or strip border + background + box-shadow and size to content) so the sentence flows.
- **Personal artifact → use the real person.** When the artifact is a personal oath ("I, ___, hereby commit") and the story has an author, default the name to the **story author** — never a placeholder figure. (Placeholder historical figures are only for multi-party *example* templates like the agreement, never for a personal pledge.)

---

## Credentials

Read all Supabase keys directly from `.env.local` — do **NOT** use `supabase projects api-keys` (it returns HTTP 401 unless a management token is configured). There is no `PROD_SUPABASE_URL` var; the prod URL is hardcoded below.

| Variable / Tool | Source | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `.env.local` | Nano Banana Pro image generation |
| `gcloud` (slava@inguro.com) | gcloud auth | GCS upload |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Test DB read (URL = `https://gfjctyxqlwexxwsmkakq.supabase.co`) |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Test DB write |
| `PROD_SUPABASE_ANON_KEY` | `.env.local` | Prod DB read (URL hardcoded: `https://besjtuodziykmjidubzw.supabase.co`) |
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Prod DB write |

**Load pattern (all bash steps):**
```bash
set -a && source .env.local && set +a
PROD_URL="https://besjtuodziykmjidubzw.supabase.co"
TEST_URL="$NEXT_PUBLIC_SUPABASE_URL"
```

**GCS bucket:** `claritypledge-story-images`
**GCS path pattern:** `story-images/{storyId}/{uuid}.jpg`
**Public URL pattern:** `https://storage.googleapis.com/claritypledge-story-images/story-images/{storyId}/{uuid}.jpg`

> **Tag column:** story tags (`st1`–`st9`) live in **`system_tags`** (`text[]`), NOT the `tags` column. `tags` is hashtag-derived from content and does not contain `stN` codes. Always query `system_tags`.

---

## Workflow

### Step 1 — Fetch story data

Query **prod** DB for the story by tag:

Use Supabase MCP (`execute_sql` on project `besjtuodziykmjidubzw`) if available:
```sql
SELECT id, content, system_tags FROM stories WHERE system_tags @> ARRAY['st2'] LIMIT 1;
```

Fallback (curl) — keys from `.env.local`, prod URL hardcoded:
```bash
set -a && source .env.local && set +a
curl -s -G "https://besjtuodziykmjidubzw.supabase.co/rest/v1/stories" \
  --data-urlencode "select=id,content,system_tags" \
  --data-urlencode 'system_tags=cs.{"st2"}' \
  -H "apikey: $PROD_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PROD_SUPABASE_ANON_KEY"
```

Also query **test** DB for the test-side UUID (may differ from prod if not restored from backup):
```bash
curl -s -G "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/stories" \
  --data-urlencode "select=id" \
  --data-urlencode 'system_tags=cs.{"st2"}' \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Extract: `prod_story_id`, `test_story_id`, `content`.

---

### Step 2 — Fetch linked point + antipoint

Query the point linked to this story:

```bash
# Get point via story_points join (keys from .env.local — see Credentials)
set -a && source .env.local && set +a
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/story_points?select=point_id,points(id,statement,context)&story_id=eq.{STORY_ID}" \
  -H "apikey: $PROD_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PROD_SUPABASE_ANON_KEY"
```

If the point has antipoints/opposing positions, fetch those too. Use all three (story narrative + point thesis + antipoint tension) to inform the image concept.

---

### Step 3 — Concept lock (approve before generating)

Before any image generation, compose and present a **concept brief** for user approval:

```
CONCEPT BRIEF for {tag}:
- Chart type: {stacked bars / side-by-side bars / Venn / timeline / icons}
- Visual story: {one sentence — what the reader sees left-to-right or top-to-bottom}
- Palette: {which of the 4 allowed colors: red (#D97373) danger, gray (#8B8B8B) uncertainty, blue (#6B9FD4) awareness, green (#6BAF7D) success}
- Labels: {list the text that appears in the image}
- Proportions: {what's big, what's small}
- Never include: {percentages, numbers, hex codes in image, internal card/border}
```

**Wait for user approval.** If rejected, revise the brief. Do NOT generate until the brief is approved.

---

### Step 4 — Build generation prompt

Use the approved concept brief to compose the Gemini prompt.

**Image brief template (always apply):**

```
IMPORTANT: Pure white background (#FFFFFF), NO border, NO shadow, NO card, NO rounded corners, NO padding. Content must fill the ENTIRE canvas edge to edge.

Wide landscape infographic about: {CONCEPT FROM APPROVED BRIEF}

Color palette: muted desaturated tones only. NO bright/saturated colors. NO amber, orange, yellow, or purple (design system violation). Green ONLY for verified/success states. Clean sans-serif font. Thin line weights. No decorative elements. No background color. Pure white only. Premium minimal infographic style.

ABSOLUTELY NO percentages, NO numbers, NO digits anywhere in the image.
```

**Design rules (always apply):**
- 4:3 landscape aspect ratio
- White background — no internal card, border, shadow, or padding
- ClarityPledge colors: blue `#3B82F6` accent, charcoal `#1a1a2e` text, green `#16A34A` for success only
- Thin line-weight icons, clean sans-serif labels
- Conceptual/diagrammatic — not photorealistic
- NO percentages or numbers — Gemini ignores this ~50% of the time, plan for re-prompting

---

### Step 5 — Generate image (Nano Banana Pro)

**Primary model:** `nano-banana-pro-preview` (Nano Banana Pro). Use `run_in_background` — generation takes 30-90s and will timeout in foreground.

```bash
source .env.local
curl -s --max-time 120 -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "{PROMPT}"}]}],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "imageSize": "4K",
        "aspectRatio": "4:3"
      }
    }
  }' > /tmp/story-image-response.json
```

Extract and save:

```python
import json, base64, sys
with open('/tmp/story-image-response.json') as f:
    r = json.load(f)
for p in r['candidates'][0]['content']['parts']:
    if 'inlineData' in p:
        ext = 'jpg' if 'jpeg' in p['inlineData']['mimeType'] else 'png'
        with open(f'/tmp/story-image.{ext}', 'wb') as f:
            f.write(base64.b64decode(p['inlineData']['data']))
        break
```

**Fallback chain:** If `nano-banana-pro-preview` fails → try `gemini-3-pro-image-preview` → try `gemini-3.1-flash-image-preview`. Use the same request format for all three — only the model name changes in the URL.

---

### Step 6 — Show image for approval

**Open it in Preview so the user can actually see it — do this automatically, every time** (the inline attachment is not enough; the user should never have to ask "open it"):

```bash
open <path-to-candidate>
```

Then ask: "Does this work for {tag}? Or iterate?"

- If approved → proceed to Step 7
- If rejected (Mode A) → adjust prompt and regenerate (max 3 iterations, then ask user for explicit prompt)
- If rejected (Mode B) → re-stage with the requested changes (hide/show nodes, swap text/background); the auto-fit scale (B1.4) re-adjusts on its own — no manual resizing

---

### Step 7 — Resize

Target: max 1200px on longest edge (matches client-side upload pipeline in `src/lib/image-upload.ts`).

```bash
# NOTE: the flag is -Z (resample so the LONGEST edge = 1200, preserving aspect).
# `--resampleLargest` does NOT exist and errors with "unknown function".
sips -Z 1200 /tmp/story-image.jpg --out /tmp/story-image-resized.jpg
sips -g pixelWidth -g pixelHeight /tmp/story-image-resized.jpg
ls -lh /tmp/story-image-resized.jpg
```

If the image is already ≤1200px on longest edge, skip resize.

---

### Step 8 — Self-check before upload

- [ ] Image is 4:3 landscape (width > height)
- [ ] Longest edge ≤ 1200px
- [ ] File size > 50KB (not blank/corrupt) and < 5MB (GCS limit)
- [ ] White background — no visible internal card, border, or shadow
- [ ] Concept is relevant to the story content

If any check fails, go back to Step 4.

---

### Step 9 — Upload to GCS

> **Critical:** the UUID generated here MUST be the exact one written to the DB in Step 10. Persist the canonical image URL to a file so Step 10 reads it back verbatim — never re-type or hardcode a UUID. (A stale hardcoded UUID leaking into the PATCH = both DBs point at a 404 object = broken image on prod.)

```bash
STORY_ID="<prod story id from Step 1>"
NEW_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")
IMG_URL="https://storage.googleapis.com/claritypledge-story-images/story-images/${STORY_ID}/${NEW_UUID}.jpg"
echo "$IMG_URL" > /tmp/story-image-url.txt   # canonical — Step 10 reads this

gcloud storage cp /tmp/story-image-resized.jpg \
  "gs://claritypledge-story-images/story-images/${STORY_ID}/${NEW_UUID}.jpg" \
  --content-type="image/jpeg" --account=slava@inguro.com
```

**Verify public access (the exact URL Step 10 will write):**

```bash
curl -s -o /dev/null -w "%{http_code}" "$(cat /tmp/story-image-url.txt)"
# Must return 200 — if not, do NOT proceed to Step 10
```

If 403/404 → check gcloud auth (`gcloud auth login slava@inguro.com` may be needed). Stop and ask user.

---

### Step 10 — Update both DBs

Set `image_url` on both test and prod. Use service role key for writes.

```bash
set -a && source .env.local && set +a
STORY_ID="<prod story id from Step 1>"
IMG_URL="$(cat /tmp/story-image-url.txt)"   # canonical URL from Step 9 — never re-type

# Test DB (anon key for apikey header, service-role for Authorization)
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/stories?id=eq.${STORY_ID}" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TEST_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"image_url\": \"$IMG_URL\"}"

# Prod DB
curl -s -X PATCH "https://besjtuodziykmjidubzw.supabase.co/rest/v1/stories?id=eq.${STORY_ID}" \
  -H "apikey: $PROD_SUPABASE_ANON_KEY" -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"image_url\": \"$IMG_URL\"}"
```

Both must succeed before reporting done. `Prefer: return=representation` echoes the updated row so you can confirm `image_url` matches `/tmp/story-image-url.txt` exactly.

**Read-back guard (run after both PATCHes):**
```bash
# Re-fetch both rows and confirm they point at the SAME url, and that url returns 200.
for q in "https://besjtuodziykmjidubzw.supabase.co|$PROD_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL|$NEXT_PUBLIC_SUPABASE_ANON_KEY"; do
  URL="${q%%|*}"; KEY="${q##*|}"
  GOT=$(curl -s -G "$URL/rest/v1/stories" --data-urlencode "select=image_url" --data-urlencode "id=eq.${STORY_ID}" \
        -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['image_url'])")
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GOT")
  echo "$URL -> $GOT (HTTP $CODE)"   # both must end in the Step-9 UUID and return 200
done
```

---

### Step 11 — Browser verify

Open the story detail page and take a screenshot:

```
https://claritypledge.com/story/{STORY_ID}
```

Use Claude in Chrome if available, otherwise ask user to verify.

**Confirm the image actually RENDERS** — not a broken-image placeholder or alt-text ("Supporting image for …"). A broken render means the DB `image_url` points at a non-existent GCS object (usually a UUID mismatch between Step 9 and Step 10). If broken: re-run the Step 10 read-back guard, fix the URL, reload. Do not report done on a broken render.

---

## Output

```
Story: {tag} ({story_id})
Point: "{point_statement}"
Image: {public_gcs_url}
Dimensions: {width}x{height} (4:3)
Size: {file_size}
Test DB: ✓ updated
Prod DB: ✓ updated
Verified: {screenshot or "user to verify"}
```

---

## Notes

- **GCS auth:** Uses `slava@inguro.com` gcloud account. Verify before upload: `gcloud auth print-access-token --account=slava@inguro.com`. If token expires, stop and ask user to run `! gcloud auth login slava@inguro.com`.
- **Direct gcloud upload is intentional** for agent-generated images. The edge function (`generate-story-image-url`) is for client-side uploads only (requires JWT + story ownership check).
- **Column:** `image_url` (NOT `banner_url` — banner_url is for SEO meta only).
- **Aspect ratio:** Always 4:3 landscape. The `StoryImage` component uses `aspect-ratio: 4/3` + `object-cover`. Portrait images get cropped.
- **Image size:** Gemini `imageSize: "4K"` produces high-res output. Always resize to max 1200px longest edge before upload (matches client pipeline).
- **White background:** Gemini tends to add internal cards/borders. The prompt must explicitly say "NO border, NO shadow, NO card, NO padding."
- **Known Gemini limitations:** Ignores "no percentages" instruction ~50% of the time. Cannot render proportionally-sized quadrants reliably. Approximates hex colors. Plan for 2-3 iterations minimum. Pro model times out on long prompts (>55s) — use shorter prompts or fall back to Flash 3.1.
- **Temp files:** All temp files go to `/tmp/story-image*`. Clean up after completion.

---

## Quality Gates (Agent Self-Review)

Before reporting done, verify:

- [ ] Image is 4:3 landscape with white background
- [ ] Image renders correctly in the story card (no gray borders, no cropping of content)
- [ ] GCS URL returns HTTP 200
- [ ] Both test and prod DB rows have the correct `image_url`
- [ ] User approved the image before upload

---

## Related Skills

- `/gen-image` — generate images for LinkedIn/social posts (Postiz upload, not GCS)
- `/gen-poster` — generate event promotion posters in multiple formats
- `/redact-image` — redact sensitive text from screenshots before publishing
