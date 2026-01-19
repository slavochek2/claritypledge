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
// src/main.tsx
import { HelmetProvider } from 'react-helmet-async';

<HelmetProvider>
  <App />
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

## Files to Modify

1. `package.json` — add dependency
2. `src/main.tsx` — wrap with HelmetProvider
3. `src/app/components/seo/seo-head.tsx` — new component
4. `src/app/pages/landing-page.tsx` — add SEOHead
5. `src/app/pages/about-page.tsx` — add SEOHead
6. `src/app/pages/pledgers-page.tsx` — add SEOHead
7. `src/app/pages/profile-page.tsx` — add SEOHead with dynamic data
8. `src/app/pages/sign-pledge-page.tsx` — add SEOHead
9. `src/app/pages/settings-page.tsx` — add SEOHead (noindex?)
10. `public/og-default.png` — default share image

## Out of Scope

- Dynamic OG image generation (profile cards, event banners) — future enhancement
- Structured data / JSON-LD — future enhancement
- Event pages SEO — events feature not yet built
- Stories/Ideas SEO — features not yet built

## Acceptance Criteria

- [ ] `npm install react-helmet-async` added to dependencies
- [ ] HelmetProvider wraps app in main.tsx
- [ ] SEOHead component created with TypeScript types
- [ ] Landing page has unique title and meta tags
- [ ] About page has unique title and meta tags
- [ ] Pledgers page has unique title and meta tags
- [ ] Profile pages have dynamic title/description from profile data
- [ ] Sign pledge page has unique title and meta tags
- [ ] Default OG image exists at `/og-default.png`
- [ ] All pages pass [Twitter Card Validator](https://cards-dev.twitter.com/validator)
- [ ] All pages pass [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [ ] Build passes with no TypeScript errors
- [ ] Pre-commit checks pass

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
