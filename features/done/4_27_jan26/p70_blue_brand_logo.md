# P70: Blue Brand Logo

**Status:** Completed
**Priority:** Low (polish)
**Effort:** Small (1-2 hours)

---

## Problem

The Clarity Pledge logo/icon uses inconsistent colors:
- **Favicon** (`public/clarity-favicon.svg`): Black background with white "C"
- **PWA icons** (`public/icons/*.png`): Unknown, need to verify
- **In-app logo** (`ClarityLogo` component): Uses `text-foreground` (black in light mode)
- **Prototype header**: Hardcoded `bg-blue-500` (blue)
- **Social sharing image** (`public/clarity-pledge-icon.png`): Unknown

This inconsistency is confusing and doesn't align with our brand identity.

---

## Decision: Blue Logo

**Why blue (`#3b82f6` / Tailwind blue-500):**

1. **Trust signal** — Blue universally communicates trustworthiness. Our product is a certification system for verified understanding.

2. **Professional credential aesthetic** — Blue dominates professional networks (LinkedIn, Twitter verification, Zoom). "Verified Listener" should feel like a professional badge.

3. **Approachability** — Our theory of change requires vulnerability ("I was wrong"). Blue feels safe/inviting vs. black which feels authoritative/cold.

4. **Design system alignment** — Our design system uses blue for interactive/trustworthy elements. Logo should match.

5. **Differentiation** — Blue signals cooperation, not combat. We're about understanding, not winning debates.

**Reference:** See [design-system.md](../docs/design-system.md) for color tokens.

---

## Scope

### Files to Update

| File | Current | Target |
|------|---------|--------|
| `public/clarity-favicon.svg` | `#000000` (black) | `#3b82f6` (blue-500) |
| `public/clarity-pledge-icon.png` | Black | Regenerate with blue |
| `public/icons/icon-192.png` | Black | Regenerate with blue |
| `public/icons/icon-512.png` | Black | Regenerate with blue |
| `public/icons/apple-touch-icon-180.png` | Black | Regenerate with blue |
| `public/icons/icon-maskable-192.png` | Black | Regenerate with blue |
| `public/icons/icon-maskable-512.png` | Black | Regenerate with blue |
| `src/components/ui/clarity-logo.tsx` | `text-foreground` | `fill="#3b82f6"` (both `ClarityLogo` and `ClarityLogoMark`) |
| `vite.config.ts` (manifest) | `theme_color: '#000000'` | `theme_color: '#3b82f6'` |
| `public/understanding-favicon.svg` | Exists (old brand) | **Delete** | |

### Design Decision: Wordmark Color

The **icon/mark** (the "C" in rounded square) should be blue.

The **wordmark** ("Clarity Pledge" text) should remain adaptive:
- Light mode: Dark text
- Dark mode: Light text

This matches industry standard (Facebook, LinkedIn, Zoom all have colored icons with adaptive wordmarks).

### ClarityLogo Component

**Decision:** Blue icon, adaptive wordmark.

```tsx
// Both ClarityLogo and ClarityLogoMark components:
<rect ... fill="#3b82f6" />  // or <circle ... fill="#3b82f6" />
// Wordmark stays as-is (inherits text color)
```

Blue-500 (`#3b82f6`) in both light and dark modes — the white "C" provides sufficient contrast.

---

## Acceptance Criteria

- [x] Favicon displays blue background with white "C" in browser tab
- [x] PWA icons are blue when installed on mobile home screen
- [x] Apple touch icon is blue
- [x] Social sharing preview (`og:image`) shows blue icon
- [x] `ClarityLogo` component renders blue icon mark
- [x] `ClarityLogoMark` component renders blue icon mark (certificates/seals)
- [x] Wordmark text remains readable in both light and dark modes
- [x] All icons pass visual inspection at their target sizes
- [x] PWA `theme_color` is blue (browser toolbar matches)
- [x] `understanding-favicon.svg` deleted
- [ ] Social preview tested on Twitter Card Validator and LinkedIn Post Inspector *(deferred — test before major launch)*

---

## Technical Notes

### Generating PNG Icons

Run the icon generation script:
```bash
node scripts/generate-icons.mjs
```

This script uses Sharp to generate all PWA icons from `public/clarity-favicon.svg`.

Alternatively, use [realfavicongenerator.net](https://realfavicongenerator.net) — upload the updated SVG, download the icon pack.

### Deployment: Cache Busting

Favicons are heavily cached. After deployment:
1. Consider renaming file (e.g., `clarity-favicon-v2.svg`) to force cache bust
2. Or add version query: `<link rel="icon" href="/clarity-favicon.svg?v=2">`
3. Update `index.html` link tag accordingly

### Testing Checklist

1. Clear browser cache, verify favicon in tab
2. Install PWA on iOS — check home screen icon
3. Install PWA on Android — check home screen icon
4. Test social previews:
   - [Twitter Card Validator](https://cards-dev.twitter.com/validator)
   - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

---

## Files Changed

- `public/clarity-favicon.svg` — Updated fill to `#3b82f6`
- `public/clarity-pledge-icon.png` — Regenerated with blue
- `public/icons/*.png` — All 5 icons regenerated with blue
- `public/understanding-favicon.svg` — Deleted (old brand)
- `src/components/ui/clarity-logo.tsx` — Blue fill for both components
- `src/app/components/profile/export-certificate.tsx` — Blue logo in certificate seal
- `vite.config.ts` — `theme_color: '#3b82f6'`
- `index.html` — `theme-color` meta tag updated to blue
- `scripts/generate-icons.mjs` — New script for icon generation

---

## Out of Scope

- Logo redesign (keeping the "C" shape)
- Adding new logo variants
- Marketing materials outside the app

---

## Related

- [design-system.md](../docs/design-system.md) — Color tokens
- [lean-canvas.md](../docs/lean-canvas.md) — Brand positioning ("certification for good-faith dialogue")
