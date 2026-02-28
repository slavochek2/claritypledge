---
name: gen-image
description: Generate a post image using Imagen 4 (fast) and upload it to Postiz. Returns media ID + URL ready to attach to a post.
when_to_use: After drafting a LinkedIn or blog post, before posting via Postiz. Can also be run standalone to generate images for any topic.
version: 1.0.0
---

# Generate Post Image

Generate an AI image for a LinkedIn post using Google's Imagen 4 Fast, upload it to Postiz, and return the media object.

## Usage

```
/slava:gen-image                        # Generate image for current post in context
/slava:gen-image "AI behavioral drift"  # Generate image for specific topic
```

## Step 1 — Build Image Prompt

Use `gemini-2.0-flash` to craft an effective Imagen prompt from the post content or topic.

```bash
source .env.local
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Create a concise Imagen image generation prompt for a LinkedIn post about: {TOPIC}.\n\nRequirements:\n- Professional, modern aesthetic suitable for LinkedIn\n- Abstract or conceptual — not literal text or faces\n- Dark or neutral background, clean composition\n- Max 50 words\n- No text, logos, or watermarks\n- Style: editorial photography or digital art\n\nReturn ONLY the prompt, no explanation."}]}]
  }'
```

Extract the text from `candidates[0].content.parts[0].text`.

## Step 2 — Generate Image with Imagen 4

```bash
source .env.local
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{"prompt": "{IMAGEN_PROMPT}"}],
    "parameters": {
      "sampleCount": 1,
      "aspectRatio": "1:1",
      "safetySetting": "block_low_and_above"
    }
  }'
```

Response: `predictions[0].bytesBase64Encoded` — base64-encoded PNG.

Decode and save: `base64 -d <<< "$B64" > /tmp/post-image.png`

**Fallback:** If Imagen returns an error, fall back to Unsplash search:
```bash
source .env.local
curl -s "https://api.unsplash.com/search/photos?query={KEYWORDS}&per_page=1&orientation=squarish" \
  -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY"
# Download: urls.regular → /tmp/post-image.jpg
```

## Step 3 — Upload to Postiz

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
| `GEMINI_API_KEY` | Imagen 4 + Gemini prompt generation |
| `UNSPLASH_ACCESS_KEY` | Fallback stock photos |
| `POSTIZ_URL` | `https://postiz.claritypledge.com` |
| `POSTIZ_EMAIL` / `POSTIZ_PASSWORD` | Cookie-based session auth |

## Notes

- Imagen 4 Fast is cheap and fast — ~2 seconds, free tier has generous limits
- `safetySetting: "block_low_and_above"` is the only accepted value (not `block_only_high`)
- Cookie file `/tmp/postiz-cookies.txt` is reused across calls in the same session — no need to re-login
- Images land at `$POSTIZ_URL/uploads/YYYY/MM/DD/{hash}.png`
