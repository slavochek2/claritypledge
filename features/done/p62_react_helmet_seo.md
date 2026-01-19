---
status: done
completed_date: 2026-01-19
prepped_date: 2026-01-19
prepped_by: /prep-spec
reviews:
  ux: skipped  # No visible UI
  architect: passed
  tea: skipped
notes: |
  Feature complete. Implementation differs from spec in minor ways:
  - HelmetProvider in App.tsx (not main.tsx) - works the same
  - SEO component at src/app/components/seo.tsx (not seo/seo-head.tsx)
  - Includes JSON-LD structured data (was listed as "out of scope")
  - Uses 512x512 icon as default OG image (1200x630 og-default.png deferred)
---

# P62: React Helmet SEO Meta Tags

## Summary

Add `react-helmet-async` to set dynamic `<title>`, `<meta>`, and Open Graph tags per page. This improves SEO for Google (which renders JS) and enables proper social sharing previews on Twitter/LinkedIn/Facebook.

## Problem

Currently, all pages share the same static `<title>` and meta tags from `index.html`. This means:
- Google sees the same title for every page
- Social shares show generic preview instead of page-specific content
- No structured data for rich search results

## Solution

Add `react-helmet-async` to dynamically set meta tags per route.

## Pages & Their Meta Tags

| Route | Title | Description | OG Image |
|-------|-------|-------------|----------|
| `/` | Clarity Pledge — Understand Before You Respond | Landing page description | Default share image |
| `/about` | About — Clarity Pledge | Mission/manifesto summary | Default share image |
| `/manifesto` | Manifesto — Clarity Pledge | Core philosophy summary | Default share image |
| `/pledgers` | Pledgers — Clarity Pledge | Community of verified pledgers | Default share image |
| `/p/:slug` | {name} — Clarity Pledge | {bio} or default profile text | Profile avatar or default |
| `/events/:slug` | {event.name} — Clarity Pledge | {event.description} | Event banner or default |
| `/sign-pledge` | Sign the Pledge — Clarity Pledge | Join the community | Default share image |

## Technical Approach

### 1. Install dependency

```bash
npm install react-helmet-async
```

### 2. Add HelmetProvider to app root

```tsx
// src/App.tsx (actual location, not main.tsx as originally planned)
import { HelmetProvider } from 'react-helmet-async';

<HelmetProvider>
  {/* app content */}
</HelmetProvider>
```

### 3. Create SEO component

```tsx
// src/app/components/seo/seo-head.tsx
import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'profile' | 'article';
}

export function SEOHead({
  title,
  description = 'Understand before you respond. Join the Clarity Pledge community.',
  image = '/og-default.png',
  url,
  type = 'website'
}: SEOHeadProps) {
  const fullTitle = title.includes('Clarity Pledge') ? title : `${title} — Clarity Pledge`;
  const siteUrl = 'https://claritypledge.com';
  const fullUrl = url ? `${siteUrl}${url}` : siteUrl;
  const fullImage = image.startsWith('http') ? image : `${siteUrl}${image}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />

      {/* Canonical */}
      <link rel="canonical" href={fullUrl} />
    </Helmet>
  );
}
```

### 4. Add to each page

```tsx
// Example: Profile page
export function ProfilePage() {
  const { profile } = useProfile();

  return (
    <>
      <SEOHead
        title={profile.display_name}
        description={profile.bio || `${profile.display_name} has taken the Clarity Pledge.`}
        image={profile.avatar_url}
        url={`/p/${profile.slug}`}
        type="profile"
      />
      {/* ... rest of page */}
    </>
  );
}
```

## Default OG Image

Create a default sharing image at `public/og-default.png`:
- Dimensions: 1200x630px (Facebook/LinkedIn optimal)
- Content: Clarity Pledge logo + tagline
- Can be a simple branded image for v1

## Files Modified (Actual)

1. `package.json` — added react-helmet-async
2. `src/App.tsx` — wrapped with HelmetProvider
3. `src/app/components/seo.tsx` — SEO component with JSON-LD
4. `src/app/pages/clarity-pledge-landing.tsx` — SEO added
5. `src/app/pages/about-page.tsx` — SEO added
6. `src/app/pages/clarity-pledgers-page.tsx` — SEO added
7. `src/app/pages/profile-page.tsx` — SEO with dynamic data
8. `src/app/pages/sign-pledge-page.tsx` — SEO added
9. `src/app/pages/privacy-policy-page.tsx` — SEO added (bonus)
10. `src/app/pages/terms-of-service-page.tsx` — SEO added (bonus)
11. `src/app/pages/me-page.tsx` — SEO added (bonus)
12. `src/app/pages/full-article-page.tsx` — SEO with Article schema (bonus)
13. `public/og-default.png` — *deferred, using clarity-pledge-icon.png*

## Out of Scope

- Dynamic OG image generation (profile cards, event banners) — future enhancement
- ~~Structured data / JSON-LD~~ — *Actually implemented! Includes Organization, ProfilePage, Article, WebSite schemas*
- Event pages SEO — events feature not yet built
- Stories/Ideas SEO — features not yet built
- 1200x630 og-default.png — deferred, using 512x512 icon for now

## Acceptance Criteria

- [x] `npm install react-helmet-async` added to dependencies
- [x] HelmetProvider wraps app *(in App.tsx, not main.tsx)*
- [x] SEO component created with TypeScript types *(at src/app/components/seo.tsx)*
- [x] Landing page has unique title and meta tags
- [x] About page has unique title and meta tags
- [x] Pledgers page has unique title and meta tags
- [x] Profile pages have dynamic title/description from profile data
- [x] Sign pledge page has unique title and meta tags
- [ ] ~~Default OG image exists at `/og-default.png`~~ *DEFERRED - using 512x512 icon*
- [ ] All pages pass [Twitter Card Validator](https://cards-dev.twitter.com/validator) *(manual test)*
- [ ] All pages pass [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) *(manual test)*
- [x] Build passes with no TypeScript errors
- [x] Pre-commit checks pass

## Testing

1. Run dev server
2. Use browser devtools to inspect `<head>` — verify tags change per route
3. Use [metatags.io](https://metatags.io/) to preview social cards
4. After deploy, test with Twitter Card Validator and Facebook Debugger

## Effort Estimate

**Small** — 4-6 hours of focused work

## Dependencies

None — can be done independently.

## Future Enhancements

- P63: Dynamic OG images with Vercel OG or Satori
- P64: JSON-LD structured data for profiles and events
- P65: Sitemap.xml generation
