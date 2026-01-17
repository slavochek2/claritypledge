# P21: SEO & Discoverability

## Summary

Make profile pages and the manifesto discoverable by search engines (Google) and AI assistants (ChatGPT, Perplexity). Currently the site is invisible to both due to SPA architecture and missing SEO signals.

## Problem Statement

**Current State:**
- Google hasn't indexed claritypledge.com
- ChatGPT/AI assistants can't read page content (JavaScript-rendered SPA)
- Profile pages (`/p/john-doe`) don't appear in search results
- Manifesto's long-form content provides zero SEO value
- No structured data for rich snippets in search results

**Root Causes:**
1. SPA renders empty HTML shell - crawlers see `<div id="root"></div>`
2. No sitemap.xml or robots.txt (FIXED)
3. Profile pages are dynamic and not in sitemap
4. No JSON-LD structured data for Google's Knowledge Graph (FIXED)
5. OpenGraph tags need optimization (FIXED)

## Goal

- Get indexed by Google within 2-4 weeks
- Profile pages appear in search results for "[Name] clarity pledge"
- Manifesto ranks for "clarity tax" and related terms
- Rich snippets appear in search results (profile cards, article info)

## Solution Components

### Phase 1: Foundation (DONE)
- [x] robots.txt allowing all crawlers
- [x] sitemap.xml with static pages
- [x] Meta tags (description, OG, Twitter) in index.html
- [x] react-helmet-async for dynamic page titles
- [x] SEO component for per-page meta tags

### Phase 2: Structured Data (DONE)
- [x] JSON-LD Organization schema (site-wide)
- [x] JSON-LD ProfilePage schema (for `/p/:slug`)
- [x] JSON-LD Article schema (for `/manifesto`)
- [x] Fix OpenGraph issues (image dimensions, longer titles)

### Phase 3: Code Cleanup (BACKLOG)
- [ ] Remove dead `keywords` meta tag from index.html (Google ignores since 2009)
- [ ] Remove static robots tag from index.html (conflicts with SEO component)
- [ ] Add default robots directive in SEO component
- [ ] Use `VITE_SITE_URL` env variable instead of hardcoded BASE_URL

### Phase 4: Dynamic Sitemap (BACKLOG)
- [ ] Build-time sitemap generation including profile pages
- [ ] Or: Server-side sitemap API route listing all profiles
- [ ] Consider: Supabase Edge Function to serve dynamic sitemap

### Phase 5: Social Previews for Profile Pages (BACKLOG - CRITICAL)
**Problem:** When someone shares `/p/john-doe` on LinkedIn/Twitter, crawlers see static `index.html` meta tags (homepage content) instead of the dynamic profile data. React Helmet only works client-side.

**Options:**
1. Vercel Edge Functions - Inject meta tags server-side for `/p/*` routes
2. Prerender service (Prerender.io, Rendertron)
3. Migrate to Next.js with SSR (big lift)

### Phase 6: Pre-rendering for AI Crawlers (BACKLOG)
- [ ] Evaluate prerender.io or similar service
- [ ] Or: Move to Next.js/Remix for SSR
- [ ] Or: Vite SSR plugin

## Technical Details

### JSON-LD Schemas (Implemented)

**Organization (site-wide):**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Clarity Pledge",
  "url": "https://claritypledge.com",
  "logo": "https://claritypledge.com/clarity-pledge-icon.png",
  "description": "A public commitment to clear, honest communication"
}
```

**ProfilePage (per profile):**
```json
{
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "mainEntity": {
    "@type": "Person",
    "name": "John Doe",
    "jobTitle": "Software Engineer",
    "url": "https://claritypledge.com/p/john-doe"
  }
}
```

**Article (manifesto):**
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The Clarity Pledge Manifesto",
  "author": {
    "@type": "Person",
    "name": "Vyacheslav Ladischenski"
  },
  "datePublished": "2025-01-01",
  "description": "Stop paying the hidden cost of miscommunication"
}
```

### Dynamic Sitemap Options

1. **Build-time generation** - Fetch all profiles at build, generate sitemap.xml
   - Pro: Simple, works with static hosting
   - Con: Stale until next deploy

2. **Edge Function** - Supabase Edge Function at `/sitemap.xml`
   - Pro: Always fresh
   - Con: Adds complexity, Vercel rewrites needed

3. **Hybrid** - Static pages + periodic rebuild trigger
   - Pro: Balance of freshness and simplicity
   - Con: Still has staleness window

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Google indexed pages | 0 | 10+ static pages |
| Profile pages indexed | 0 | 50%+ of verified profiles |
| Search impressions/week | 0 | 100+ |
| Rich snippets appearing | No | Yes |

## Known Limitations (Accepted)

- **Profile social previews don't work** - Sharing `/p/john-doe` on LinkedIn shows generic homepage meta tags because crawlers don't execute JavaScript. Fix requires server-side rendering (Phase 5).
- **Hardcoded production URL** - `BASE_URL` in seo.tsx is hardcoded. Preview deployments show production URLs in meta tags.

## References

- [Google Structured Data Testing Tool](https://search.google.com/test/rich-results)
- [Schema.org ProfilePage](https://schema.org/ProfilePage)
- [React Helmet Async](https://github.com/staylor/react-helmet-async)
