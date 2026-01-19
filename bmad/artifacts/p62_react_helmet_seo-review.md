# P62: React Helmet SEO — Prep Review

**Spec:** features/p62_react_helmet_seo.md
**Date:** 2026-01-19
**Reviewed by:** /prep-spec

---

## Quick Analysis

| Metric | Value |
|--------|-------|
| Lines | 184 |
| Phases | 0 (single implementation block) |
| Has UI | No (meta tags in `<head>`) |
| Has DB | No |
| Dependencies | `react-helmet-async` (npm) |

---

## Agent Reviews

### UX Designer — skipped
No visible UI components — this feature only affects meta tags in the document head.

### Architect — passed (with critical finding)

**[BLOCKER] Spec is Outdated — Feature Already Substantially Implemented**

The codebase already has:
1. `react-helmet-async` installed (v2.0.5 in package.json)
2. `HelmetProvider` wrapping the app in `App.tsx`
3. A sophisticated `SEO` component at `src/app/components/seo.tsx` that exceeds the spec's proposal:
   - JSON-LD structured data (Organization, ProfilePage, Article, WebSite schemas)
   - noIndex support
   - Profile and article-specific props
   - Proper TypeScript types

**Pages already using SEO component (7):**
- `/` — clarity-pledge-landing.tsx
- `/about` — about-page.tsx
- `/pledgers` — clarity-pledgers-page.tsx
- `/manifesto` — full-article-page.tsx (with article schema)
- `/p/:slug` — profile-page.tsx (with profile schema)
- `/p/:slug/pledge` — pledge-page.tsx
- `/me` — me-page.tsx

**[WARNING] Pages Missing SEO Component**

Priority pages:
- `/sign-pledge` — sign-pledge-page.tsx **← Important conversion page**
- `/privacy-policy` — privacy-policy-page.tsx — Should have SEO
- `/terms-of-service` — terms-of-service-page.tsx — Should have SEO

Should have noIndex:
- `/settings` — settings-page.tsx
- `/login` — login-page.tsx
- `/signup` — signup-page.tsx
- `/sign-pledge/confirm` — pledge-confirmation-page.tsx

Experimental pages (lower priority):
- `/demo`, `/chat`, `/feed`, `/idea/:id`, `/live`, `/tree`

**[WARNING] Missing Optimal OG Image**

- Current default: `clarity-pledge-icon.png` (512x512)
- Optimal for social: 1200x630px

**[SUGGESTION] Cleanup Opportunity**

`index.html` contains static meta tags that are duplicated/overwritten by react-helmet-async. Could be cleaned up to only include minimal fallbacks.

### TEA — skipped
Not requested (use `--include-tea` to enable)

---

## Combined Findings

### Blockers (1)
1. **Spec is outdated** — Core feature already implemented. Spec needs revision to reflect remaining work only.

### Warnings (2)
1. **Pages missing SEO** — `/sign-pledge`, `/privacy-policy`, `/terms-of-service` need SEO; auth pages need noIndex
2. **OG image not optimal** — 512x512 instead of recommended 1200x630

### Suggestions (1)
1. **index.html cleanup** — Remove duplicate static meta tags

---

## Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | How to proceed with this spec? | A) Revise spec to only cover remaining work B) Mark spec as "done" and create new ticket for gaps C) Implement remaining gaps now | **A** — Revise spec. The existing implementation is solid; only need to add SEO to a few missing pages and create OG image. |
| 2 | Create 1200x630 OG image? | A) Yes, design proper branded image B) Keep 512x512 for now | **A** — Worth doing for better social sharing, but not blocking. |
| 3 | Which pages need SEO urgently? | A) All missing pages B) Only public pages C) Only conversion pages | **C** — Focus on `/sign-pledge` (conversion), `/privacy-policy`, `/terms-of-service` (legal). Auth pages can get noIndex later. |

---

## Execution Recommendation

**Recommendation:** BLOCKED — Spec needs revision
**Reason:** The spec describes work that is 80%+ complete. Before implementation:
1. Revise spec to reflect actual remaining work
2. Or: skip spec revision and just implement the 3-4 missing items directly

**If proceeding with remaining work only:**
- Lines of actual work: ~50 (add SEO to 3 pages + create OG image)
- Estimated scope: Small (/loop appropriate)
- No phases needed

---

## Remaining Implementation Checklist

If you want to complete the remaining 20%:

```
[ ] Add SEO to sign-pledge-page.tsx
    - title: "Sign the Pledge | Clarity Pledge"
    - description: "Join professionals worldwide in a public commitment to clear communication."

[ ] Add SEO to privacy-policy-page.tsx
    - title: "Privacy Policy | Clarity Pledge"

[ ] Add SEO to terms-of-service-page.tsx
    - title: "Terms of Service | Clarity Pledge"

[ ] (Optional) Add noIndex SEO to settings-page.tsx, login-page.tsx, signup-page.tsx

[ ] (Optional) Create 1200x630 og-default.png
```

---

## Next Steps

**Option A — Quick completion (recommended):**
```
Just implement the 3 priority pages directly. No spec revision needed.
Use: /loop
```

**Option B — Formal spec update:**
```
1. Archive current spec to features/done/
2. Create new minimal spec for remaining gaps
3. Then: /loop
```
