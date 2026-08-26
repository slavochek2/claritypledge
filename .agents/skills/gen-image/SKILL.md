---
name: gen-image
description: Generate an AI image using Gemini native image generation (Nano Banana Pro) and upload it to Postiz. Returns media ID + URL ready to attach to a post.
when_to_use: After drafting a LinkedIn or blog post, before posting via Postiz. Can also be run standalone to generate images for any topic.
version: 2.0.0
---

# Generate Post Image

Generate an AI image using Google's Gemini native image generation (Nano Banana), upload it to Postiz, and return the media object.

## Usage

```
/slava:gen-image                        # Generate image for current post in context
/slava:gen-image "AI behavioral drift"  # Generate image for specific topic
```

## Step 1 — Generate Image with Gemini Native Image Generation

**Model choice (Nano Banana family):**
| Nickname | Model ID | Speed | Use when |
|----------|----------|-------|----------|
| Nano Banana Pro | `gemini-3-pro-image-preview` | ~5-10s | **Default.** Best quality — posters, print, hero images |
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | ~2-3s | Quick iterations, social posts |
| Nano Banana (original) | `gemini-2.5-flash-image` | ~2s | Fallback if newer models unavailable |

Default to **Pro** for best quality. Use **3.1 Flash** when iterating quickly.

**How it works:** Unlike Imagen (separate model), Nano Banana generates images natively within Gemini's `generateContent` endpoint using `responseModalities: ["IMAGE"]`. No separate prompt-crafting step needed — just describe what you want directly.

**Resolution & aspect ratio:** Control via `imageConfig` in `generationConfig`:

| Parameter | Values | Default |
|-----------|--------|---------|
| `imageSize` | `"512px"`, `"1K"`, `"2K"`, `"4K"` | ~1K |
| `aspectRatio` | `"1:1"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"` | `"1:1"` |

**Always specify `imageSize: "4K"`** for production use — default ~1K looks pixelated at print or 2x screen sizes.

```bash
source .env.local
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "{PROMPT}"}]}],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "imageSize": "4K",
        "aspectRatio": "3:4"
      }
    }
  }'
```

Response: `candidates[0].content.parts[].inlineData.data` — base64-encoded image.
Mime type: `candidates[0].content.parts[].inlineData.mimeType` (usually `image/jpeg` or `image/png`).

**Extract and save:**
```python
import json, base64, sys
r = json.load(sys.stdin)
for p in r['candidates'][0]['content']['parts']:
    if 'inlineData' in p:
        ext = 'jpg' if 'jpeg' in p['inlineData']['mimeType'] else 'png'
        with open(f'/tmp/post-image.{ext}', 'wb') as f:
            f.write(base64.b64decode(p['inlineData']['data']))
        break
```

**Fallback chain:** If Gemini native fails → try Imagen 4 (`imagen-4.0-generate-001` via `:predict` endpoint) → Unsplash search:
```bash
source .env.local
# Imagen 4 fallback
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{"prompt": "{PROMPT}"}],
    "parameters": {"sampleCount": 1, "aspectRatio": "1:1", "safetySetting": "block_low_and_above"}
  }'
# Response: predictions[0].bytesBase64Encoded

# Unsplash fallback
curl -s "https://api.unsplash.com/search/photos?query={KEYWORDS}&per_page=1&orientation=squarish" \
  -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY"
```

## Step 2 — Upload to Postiz

Postiz auth uses cookies. If `/tmp/postiz-cookies.txt` already exists (from this session), skip login.

**Login (if needed):**
```bash
source .env.local
curl -s -c /tmp/postiz-cookies.txt -X POST "$POSTIZ_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"'"$POSTIZ_EMAIL"'","password":"'"$POSTIZ_PASSWORD"'","provider":"LOCAL"}'
# → {"login":true}
```

**Upload:**
```bash
curl -s -b /tmp/postiz-cookies.txt \
  -X POST "$POSTIZ_URL/api/media/upload-simple" \
  -H "organization: {ORG_ID}" \
  -F "file=@/tmp/post-image.png;type=image/png"
# → {"id":"...","path":"https://postiz.claritypledge.com/uploads/..."}
```

Get `ORG_ID` if unknown:
```bash
curl -s -b /tmp/postiz-cookies.txt "$POSTIZ_URL/api/user/organizations" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])"
```

## Output

Return the media object for use in post creation:
```
Image generated and uploaded:
  ID:   {media.id}
  URL:  {media.path}

Use in post payload:
  "image": [{"id": "{media.id}", "path": "{media.path}"}]
```

## Credentials (from `.env.local`)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Gemini native image gen + Imagen fallback |
| `UNSPLASH_ACCESS_KEY` | Fallback stock photos |
| `POSTIZ_URL` | `https://postiz.claritypledge.com` |
| `POSTIZ_EMAIL` / `POSTIZ_PASSWORD` | Cookie-based session auth |

## Notes

- Gemini native image gen (Nano Banana) produces higher quality than Imagen 4 for most use cases
- Auth header is `x-goog-api-key` (not `key=` query param) for `generateContent` endpoint
- `responseModalities: ["IMAGE"]` for image-only output; use `["TEXT", "IMAGE"]` to get both
- Preview models (`-preview` suffix) may change — check [Google AI docs](https://ai.google.dev/gemini-api/docs/image-generation) if errors occur
- Cookie file `/tmp/postiz-cookies.txt` is reused across calls in the same session — no need to re-login
- Images land at `$POSTIZ_URL/uploads/YYYY/MM/DD/{hash}.png`
