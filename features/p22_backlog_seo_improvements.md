# SEO Improvements (Backlog)

## Summary

Address SEO issues identified in code review. Main concern: social media previews don't work for dynamic profile pages because crawlers don't execute JavaScript.

## Issues to Address

### Critical: Social Preview for Profile Pages

**Problem:** When someone shares `/p/john-doe` on LinkedIn/Twitter, crawlers see static `index.html` meta tags (homepage content) instead of the dynamic profile data. React Helmet only works client-side.

**Options:**
1. Vercel Edge Functions - Inject meta tags server-side for `/p/*` routes
2. Prerender service (Prerender.io, Rendertron)
3. Migrate to Next.js with SSR (big lift)

### Medium: Hardcoded Production URL

**File:** `src/app/components/seo.tsx`

```typescript
const BASE_URL = "https://claritypledge.com";
```

**Fix:** Use `VITE_SITE_URL` environment variable for preview/staging deployments.

### Medium: Conflicting Robots Tags

**Problem:** Static `<meta name="robots" content="index, follow" />` in `index.html` conflicts with dynamic `noIndex` prop in SEO component. React Helmet doesn't remove static tags.

**Fix:** Remove static robots tag from `index.html`, let SEO component manage it with a default.

### Easy: Remove Dead Keywords Meta Tag

**File:** `index.html`

```html
<meta name="keywords" content="clarity pledge, clear communication..." />
```

Google hasn't used this since 2009. Delete it.

## Out of Scope

- Extracting fallback description to helper function (premature abstraction)
- Dynamic sitemap generation for profile pages (separate feature)
- Dynamic OG image generation (separate feature)

## Acceptance Criteria

- [ ] Keywords meta tag removed from index.html
- [ ] Static robots tag removed from index.html
- [ ] SEO component handles default robots directive
- [ ] BASE_URL uses environment variable with production fallback
- [ ] Decision made on social preview solution (or documented as accepted limitation)
