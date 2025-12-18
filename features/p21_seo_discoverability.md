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
2. No sitemap.xml or robots.txt (FIXED in initial SEO work)
3. Profile pages are dynamic and not in sitemap
4. No JSON-LD structured data for Google's Knowledge Graph
5. OpenGraph tags need optimization (title too short, missing image)

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

### Phase 2: Structured Data (IN PROGRESS)
- [x] JSON-LD Organization schema (site-wide)
- [x] JSON-LD ProfilePage schema (for `/p/:slug`)
- [x] JSON-LD Article schema (for `/manifesto`)
- [ ] Fix OpenGraph issues (image, title length)

### Phase 3: Dynamic Sitemap (FUTURE)
- [ ] Build-time sitemap generation including profile pages
- [ ] Or: Server-side sitemap API route listing all profiles
- [ ] Consider: Supabase Edge Function to serve dynamic sitemap

### Phase 4: Pre-rendering for AI Crawlers (FUTURE)
- [ ] Evaluate prerender.io or similar service
- [ ] Or: Move to Next.js/Remix for SSR
- [ ] Or: Vite SSR plugin

## Technical Approach

### JSON-LD Schemas

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

## Dependencies

- Google Search Console access (have it)
- Vercel deployment (have it)
- For dynamic sitemap: Build script or Edge Function

## Risks

- **SSR migration complexity** - If pre-rendering services don't work well, may need framework change
- **Profile page indexing delay** - Dynamic content takes longer for Google to discover
- **ChatGPT/AI access** - May require explicit allow rules or pre-rendering

## References

- [Google Structured Data Testing Tool](https://search.google.com/test/rich-results)
- [Schema.org ProfilePage](https://schema.org/ProfilePage)
- [React Helmet Async](https://github.com/staylor/react-helmet-async)
