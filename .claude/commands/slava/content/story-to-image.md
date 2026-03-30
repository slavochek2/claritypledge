---
name: story-to-image
description: Generate a supporting conceptual diagram for a story, upload to GCS, and update both test + prod DB.
when_to_use: "When you need to generate and attach a supporting image to a story identified by its tag (st1–st9). Also triggered by '/story-to-image'."
version: 1.0.0
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

**Argument:** Story tag (e.g. `st2`) — matches the `tags` array in the stories table.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Generate + attach image to a story | `/story-to-image` ← here |
| Generate image for a LinkedIn post | `/gen-image` |
| Generate event promotion posters | `/gen-poster` |
| Redact sensitive text from a screenshot | `/redact-image` |

---

## Credentials

| Variable / Tool | Source | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `.env.local` | Nano Banana Pro image generation |
| `gcloud` (slava@inguro.com) | gcloud auth | GCS upload |
| Supabase test keys | `supabase projects api-keys --project-ref gfjctyxqlwexxwsmkakq` | Test DB read/write |
| Supabase prod keys | `supabase projects api-keys --project-ref besjtuodziykmjidubzw` | Prod DB read/write |

**GCS bucket:** `claritypledge-story-images`
**GCS path pattern:** `story-images/{storyId}/{uuid}.jpg`
**Public URL pattern:** `https://storage.googleapis.com/claritypledge-story-images/story-images/{storyId}/{uuid}.jpg`

---

## Workflow

### Step 1 — Fetch story data

Query **prod** DB for the story by tag:

Use Supabase MCP (`execute_sql` on project `besjtuodziykmjidubzw`) if available:
```sql
SELECT id, content, tags FROM stories WHERE tags @> ARRAY['st2'] LIMIT 1;
```

Fallback (curl):
```bash
ANON_KEY=$(supabase projects api-keys --project-ref besjtuodziykmjidubzw 2>/dev/null | grep "anon" | awk '{print $NF}')
curl -s -G "https://besjtuodziykmjidubzw.supabase.co/rest/v1/stories" \
  --data-urlencode "select=id,content,tags" \
  --data-urlencode 'tags=cs.{"st2"}' \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

Also query **test** DB for the test-side UUID (may differ from prod if not restored from backup):
```bash
TEST_ANON=$(supabase projects api-keys --project-ref gfjctyxqlwexxwsmkakq 2>/dev/null | grep "anon" | awk '{print $NF}')
curl -s -G "https://gfjctyxqlwexxwsmkakq.supabase.co/rest/v1/stories" \
  --data-urlencode "select=id" \
  --data-urlencode 'tags=cs.{"st2"}' \
  -H "apikey: $TEST_ANON" -H "Authorization: Bearer $TEST_ANON"
```

Extract: `prod_story_id`, `test_story_id`, `content`.

---

### Step 2 — Fetch linked point + antipoint

Query the point linked to this story:

```bash
# Get point via story_points join
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/story_points?select=point_id,points(id,statement,context)&story_id=eq.{STORY_ID}" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
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

Display the generated image to the user. Ask: "Does this work for {tag}? Or iterate?"

- If approved → proceed to Step 6
- If rejected → adjust prompt and regenerate (max 3 iterations, then ask user for explicit prompt)

---

### Step 7 — Resize

Target: max 1200px on longest edge (matches client-side upload pipeline in `src/lib/image-upload.ts`).

```bash
sips --resampleLargest 1200 /tmp/story-image.jpg --out /tmp/story-image-resized.jpg
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

```bash
NEW_UUID=$(python3 -c "import uuid; print(uuid.uuid4())")
gcloud storage cp /tmp/story-image-resized.jpg \
  "gs://claritypledge-story-images/story-images/{STORY_ID}/${NEW_UUID}.jpg" \
  --content-type="image/jpeg" --account=slava@inguro.com
```

**Verify public access:**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://storage.googleapis.com/claritypledge-story-images/story-images/{STORY_ID}/${NEW_UUID}.jpg"
# Must return 200
```

If 403/404 → check gcloud auth (`gcloud auth login slava@inguro.com` may be needed). Stop and ask user.

---

### Step 10 — Update both DBs

Set `image_url` on both test and prod. Use service role key for writes.

```bash
IMG_URL="https://storage.googleapis.com/claritypledge-story-images/story-images/{STORY_ID}/{UUID}.jpg"

# Test DB
TEST_ANON=$(supabase projects api-keys --project-ref gfjctyxqlwexxwsmkakq 2>/dev/null | grep "anon" | awk '{print $NF}')
TEST_SERVICE=$(supabase projects api-keys --project-ref gfjctyxqlwexxwsmkakq 2>/dev/null | grep "service_role" | awk '{print $NF}')
curl -s -X PATCH "https://gfjctyxqlwexxwsmkakq.supabase.co/rest/v1/stories?id=eq.{STORY_ID}" \
  -H "apikey: $TEST_ANON" -H "Authorization: Bearer $TEST_SERVICE" \
  -H "Content-Type: application/json" -d "{\"image_url\": \"$IMG_URL\"}"

# Prod DB
PROD_ANON=$(supabase projects api-keys --project-ref besjtuodziykmjidubzw 2>/dev/null | grep "anon" | awk '{print $NF}')
PROD_SERVICE=$(supabase projects api-keys --project-ref besjtuodziykmjidubzw 2>/dev/null | grep "service_role" | awk '{print $NF}')
curl -s -X PATCH "https://besjtuodziykmjidubzw.supabase.co/rest/v1/stories?id=eq.{STORY_ID}" \
  -H "apikey: $PROD_ANON" -H "Authorization: Bearer $PROD_SERVICE" \
  -H "Content-Type: application/json" -d "{\"image_url\": \"$IMG_URL\"}"
```

Both must succeed before reporting done.

---

### Step 11 — Browser verify

Open the story detail page and take a screenshot:

```
https://claritypledge.com/story/{STORY_ID}
```

Use Claude in Chrome if available, otherwise ask user to verify.

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
