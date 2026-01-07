# P24: Social Media OG Tags via Edge Function

## Cloud Agent Instructions

**Branch:** `feature/og-edge-function`
**Model:** Claude Opus 4.5 (use `/c claude [task]`)
**Workflow:** Use `/loop` once at the end to verify
**Time Budget:** ~1 hour

### Autonomous Mode Rules

1. **DO NOT use AskUserQuestion** — make reasonable decisions
2. **Keep it simple** — this is ~50 lines of code total
3. **Test manually** — use curl to verify meta tags appear
4. **Commit when done** — single commit is fine

---

## Problem

Social media previews (LinkedIn, Twitter, Facebook) show blank/generic content for profile pages (`/p/[slug]`) because the Vite SPA renders client-side only. Crawlers don't execute JavaScript.

## Solution

**Edge function that intercepts social media crawlers** and returns HTML with proper OG meta tags. Regular users get the normal SPA.

This is 10x simpler than migrating the whole app to Next.js.

---

## How It Works

```
User visits /p/john-doe
    ↓
Vercel Edge Middleware checks User-Agent
    ↓
├── Social crawler (facebookexternalhit, Twitterbot, LinkedInBot, etc.)
│   → Edge function fetches profile from Supabase
│   → Returns minimal HTML with OG tags
│   → Crawler gets: <meta property="og:title" content="John Doe signed the Clarity Pledge">
│
└── Normal user
    → Pass through to Vite SPA (unchanged)
    → Full React app loads
```

---

## Implementation

### Step 1: Create Edge Middleware

Create `vercel.json` (if not exists) or update it:

```json
{
  "rewrites": [
    {
      "source": "/p/:slug",
      "has": [
        {
          "type": "header",
          "key": "user-agent",
          "value": "(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Pinterest|Slackbot|TelegramBot|WhatsApp|Discordbot)"
        }
      ],
      "destination": "/api/og-profile?slug=:slug"
    }
  ]
}
```

### Step 2: Create API Route for OG Tags

Create `api/og-profile.ts` (Vercel Serverless Function):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response('Not found', { status: 404 });
  }

  // Fetch profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('name, role, reason, slug')
    .eq('slug', slug)
    .single();

  if (error || !profile) {
    return new Response('Not found', { status: 404 });
  }

  const title = `${profile.name} signed the Clarity Pledge`;
  const description = profile.reason || `${profile.name} commits to clear, honest communication.`;
  const profileUrl = `https://claritypledge.com/p/${profile.slug}`;
  const imageUrl = `https://claritypledge.com/og-image.png`; // Static OG image for now

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="description" content="${description}">

  <!-- Open Graph -->
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${profileUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:site_name" content="Clarity Pledge">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">

  <!-- Redirect real users to SPA (fallback) -->
  <meta http-equiv="refresh" content="0;url=${profileUrl}">
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <a href="${profileUrl}">View profile</a>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}
```

### Step 3: Add Static OG Image

Create or use existing `public/og-image.png` (1200x630px recommended).

For now, use a generic Clarity Pledge branded image. Dynamic OG images per profile can be added later.

---

## Verification

### Manual Test with curl

```bash
# Simulate Facebook crawler
curl -H "User-Agent: facebookexternalhit/1.1" https://claritypledge.com/p/slava-kurilyak

# Should return HTML with OG tags, NOT the SPA

# Check specific tag
curl -H "User-Agent: facebookexternalhit/1.1" https://claritypledge.com/p/slava-kurilyak | grep "og:title"
```

### Test with Facebook Debugger

After deployment:
1. Go to https://developers.facebook.com/tools/debug/
2. Enter: `https://claritypledge.com/p/slava-kurilyak`
3. Click "Debug"
4. Should show proper title, description, and image

### Test with Twitter Card Validator

1. Go to https://cards-dev.twitter.com/validator
2. Enter profile URL
3. Should show preview card

---

## Environment Variables

The edge function needs these in Vercel:
- `VITE_SUPABASE_URL` (already set)
- `VITE_SUPABASE_ANON_KEY` (already set)

No new env vars needed.

---

## Success Criteria

- [ ] Edge function deployed to Vercel
- [ ] `curl -H "User-Agent: facebookexternalhit" /p/[slug]` returns HTML with OG tags
- [ ] Normal browser request to `/p/[slug]` still loads the SPA
- [ ] Facebook Debugger shows correct preview
- [ ] No changes to existing React code

---

## Future Enhancements (Not in Scope)

- Dynamic OG images with user's name/avatar (using @vercel/og)
- OG tags for other pages (landing, about, pledgers)
- Structured data (JSON-LD) for Google

---

## Why This is Better Than Next.js Migration

| Aspect | Edge Function | Next.js Migration |
|--------|---------------|-------------------|
| Lines of code | ~50 | ~5000+ changes |
| Risk | Minimal (additive) | High (rewrite) |
| Time | 1 hour | 4-6 hours (failed) |
| Existing code | Unchanged | Complete overhaul |
| Dev experience | Same (Vite) | Slower (Next.js) |
| Deployment | Same | More complex |

---

## Learnings from Failed Next.js Migration

1. **Don't run two bundlers** — Vite + Next.js hybrid caused "process is not defined" errors
2. **Don't rename core directories** — `src/app` → `src/features` created import chaos
3. **Solve the actual problem** — We only needed OG tags, not SSR for everything
4. **KISS** — 50 lines beats 5000 lines every time
