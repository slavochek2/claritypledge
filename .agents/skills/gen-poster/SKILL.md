---
name: gen-poster
description: Generate event promotion posters in 5 formats (A5 print, Facebook, WhatsApp, LinkedIn, Square), upload to ladischenski.com/temp/{slug}/ with zip bundle.
when_to_use: When promoting an event and need visual assets for print + social media distribution.
version: 1.0.0
---

# Generate Event Posters

Generate high-quality promotional posters for a ClarityPledge event in 5 platform-optimized formats, with self-review loop, and upload to public hosting.

## Usage

```
/slava:content:gen-poster                                    # Uses event from context
/slava:content:gen-poster clarity-lab-koh-phangan-2026-03-12  # By slug
/slava:content:gen-poster "abstract AI, tropical"             # With vibe keywords
```

## Input

- **Required**: Event slug or URL (to fetch title, date, location, audience, duration, price)
- **Optional**: Vibe/tone keywords for hero image generation (default: derive from event title)

## Pipeline

### Step 1 — Fetch Event Data

Query Supabase prod for the event:
```bash
source .env.local
curl -s "https://besjtuodziykmjidubzw.supabase.co/rest/v1/events?slug=eq.{SLUG}&select=*" \
  -H "apikey: $(supabase --project-ref besjtuodziykmjidubzw projects api-keys 2>/dev/null | grep 'anon' | awk '{print $NF}')" \
  -H "Authorization: Bearer $(supabase --project-ref besjtuodziykmjidubzw projects api-keys 2>/dev/null | grep 'anon' | awk '{print $NF}')"
```

Extract: `title`, `datetime`, `location`, `duration_minutes`, `price` (free if 0/null), audience from description.

### Step 2 — Shortlink + QR Code

**Check for existing shortlink** in `src/app/data/short-links.ts`. If none exists:
1. Pick a short code (e.g., event type abbreviation)
2. **Collision check**: verify the code doesn't already exist in `shortLinks` object
3. Add to `short-links.ts` AND `vercel.json` redirects
4. Note: shortlink won't work until cp is deployed — QR still points to it for future use

**Generate QR code:**
```bash
curl -s -o /tmp/qr-{code}.png \
  "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https://claritypledge.com/s/{CODE}"
```

### Step 3 — Generate Hero Images

Use `/slava:content:gen-image` approach — Nano Banana Pro with 3 separate calls for 3 aspect ratios:

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
        "aspectRatio": "{RATIO}"
      }
    }
  }'
```

**Three calls:**
| Hero | Aspect Ratio | Used by |
|------|-------------|---------|
| `hero-3x4.jpg` | `3:4` | A5 print, WhatsApp |
| `hero-16x9.jpg` | `16:9` | Facebook, LinkedIn |
| `hero-1x1.jpg` | `1:1` | Square |

**Prompt construction**: Based on event title + vibe keywords. Always include:
- "No text, no words, no letters, no watermarks"
- "Professional, high quality, photorealistic or abstract digital art"
- Vibe keywords from user or derived from event topic

Save heroes to `.private/` as base64-decoded JPGs.

**Fallback chain**: Nano Banana Pro → Nano Banana 2 (`gemini-3.1-flash-image-preview`) → Imagen 4

### Step 4 — Build HTML Templates

Generate 5 HTML files in `.private/`, each with base64-embedded hero + QR.

**Three layout patterns:**

**Portrait** (A5 print 1748×2480, WhatsApp 1080×1350):
- Hero image top ~46%, gradient fade to dark
- Text content bottom: label → title → subtitle → detail rows with icons → bottom (free tag + QR)

**Landscape split** (Facebook 1920×1005, LinkedIn 1200×628):
- Left ~55% dark panel with text, right ~45% hero image
- Gradient fade from left panel into image
- LinkedIn: drop subtitle (tight format), keep only title + details + QR

**Square** (1080×1080):
- Hero top ~44%, gradient fade
- Same text structure as portrait, slightly tighter spacing

**Sizing guidelines (at native resolution):**

| Element | A5 | Facebook | WhatsApp | LinkedIn | Square |
|---------|-----|----------|----------|----------|--------|
| Title | 88px | 58px | 54px | 42px | 48px |
| Detail text | 38px | 24px | 24px | 18px | 21px |
| Icons | 42px | 26px | 26px | 18px | 22px |
| QR | 360px | 200px | 240px | 140px | 190px |
| URL | 48px | 30px | 30px | 22px | 24px |

**Detail rows** (each with emoji icon):
- 📅 Date, time, duration
- 📍 Venue, area
- 👥 Target audience (highlighted in accent color)

**Design tokens:**
- Background: `#0a0f1e`
- Accent: `#38bdf8` (sky blue)
- Font: Inter (400/600/700/900)
- Free tag: pill with accent border + subtle fill

### Step 5 — Screenshot at 2x DPR

Start local server, then use Playwright with `deviceScaleFactor: 2`:

```bash
cd .private && python3 -m http.server 8765 &

node << 'EOF'
const { chromium } = require('playwright');
(async () => {
  const formats = [
    { name: 'a5-print', width: 1748, height: 2480 },
    { name: 'facebook', width: 1920, height: 1005 },
    { name: 'whatsapp', width: 1080, height: 1350 },
    { name: 'linkedin', width: 1200, height: 628 },
    { name: 'square', width: 1080, height: 1080 }
  ];
  const browser = await chromium.launch();
  for (const fmt of formats) {
    const ctx = await browser.newContext({
      viewport: { width: fmt.width, height: fmt.height },
      deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:8765/poster-${fmt.name}.html`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `.private/posters/poster-${fmt.name}.png`, fullPage: false });
    await ctx.close();
  }
  await browser.close();
})();
EOF
```

**Expected output sizes at 2x:**
| Format | Pixels | Typical size |
|--------|--------|-------------|
| A5 print | 3496×4960 | 5-8 MB |
| Facebook | 3840×2010 | 3-5 MB |
| WhatsApp | 2160×2700 | 2-4 MB |
| LinkedIn | 2400×1256 | 1-2 MB |
| Square | 2160×2160 | 2-3 MB |

### Step 6 — Self-Review Loop

**Read each PNG** (the Read tool can view images) and critique against this checklist:

1. ✅ Text never overlaps hero without strong gradient contrast
2. ✅ QR code large enough to scan at intended distance
3. ✅ All detail text readable at format's typical viewing size
4. ✅ Icons (📅📍👥) visible and properly aligned with text
5. ✅ "Free Event" / CTA prominent and obvious
6. ✅ No large empty wasted space
7. ✅ File size >1MB (confirms 2x DPR worked)
8. ✅ Hero image crisp, not pixelated or cropped awkwardly

**If any check fails**: fix the HTML template, re-screenshot, re-review. Max 3 iterations — if still failing after 3, show user and ask.

### Step 7 — Zip + Upload

**Create zip bundle:**
```bash
cd .private/posters
zip {slug}-posters.zip poster-*.png
```

**Copy to ladischenski.com hosting:**
```bash
mkdir -p ~/Projects/public/ladischenski-com/public/temp/{slug}/
rsync -av .private/posters/poster-*.png .private/posters/{slug}-posters.zip \
  ~/Projects/public/ladischenski-com/public/temp/{slug}/
```

**Deploy** (requires explicit user approval):
```bash
cd ~/Projects/public/ladischenski-com && git add public/temp/{slug}/ && git commit -m "deploy: {slug} posters" && git push origin main
```

**Verify all URLs return 200:**
```bash
for f in poster-a5-print.png poster-facebook.png poster-whatsapp.png poster-linkedin.png poster-square.png {slug}-posters.zip; do
  curl -s -o /dev/null -w "%{http_code}  " "https://ladischenski.com/temp/{slug}/$f"
  echo "https://ladischenski.com/temp/{slug}/$f"
done
```

## Output

```
Posters generated and uploaded:

📁 https://ladischenski.com/temp/{slug}/
  poster-a5-print.png    (3496×4960, ~7MB)
  poster-facebook.png    (3840×2010, ~4MB)
  poster-whatsapp.png    (2160×2700, ~3MB)
  poster-linkedin.png    (2400×1256, ~2MB)
  poster-square.png      (2160×2160, ~2MB)
  {slug}-posters.zip     (~18MB, all formats)
```

## Dependencies

- **Gemini API key**: `GEMINI_API_KEY` in `.env.local`
- **Playwright**: `npx playwright` (from cp's dev dependencies)
- **ladischenski-com repo**: `~/Projects/public/ladischenski-com` with `/temp/[...path]` catch-all route
- **QR API**: `api.qrserver.com` (free, no auth)

## Notes

- Hero images are generated per-aspect-ratio — never crop a portrait hero for landscape (quality loss)
- `imageConfig.imageSize: "4K"` is critical — without it Gemini defaults to ~1K
- Auth header is `x-goog-api-key` (not `?key=` query param) for generateContent endpoint
- PNGs are already compressed — zip adds ~0% compression but bundles for easy sharing
- The subfolder index at `ladischenski.com/temp/{slug}/` auto-renders via Next.js catch-all route
- Kill the python HTTP server after screenshotting: `lsof -ti:8765 | xargs kill`
