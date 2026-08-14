---
status: backlog
type: task
rank: 29
workstream: foundation
tags: []
created_date: 2026-01-16
---
# P119: Bundle Size Optimization

## Problem

Vite build produces a warning:

```
Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit
```

This indicates JavaScript bundles exceed Vite's recommended threshold. While not blocking, large bundles impact initial page load time.

## Current State

- Warning appears during `npm run build`
- Pre-commit checks have a 20MB threshold (very permissive)
- No code-splitting currently implemented
- All routes load in a single bundle

## Impact

- **User Impact:** Slower initial page load, especially on mobile/slow connections
- **SEO Impact:** Core Web Vitals (LCP) may be affected
- **Priority:** Low — monitor, act when noticeable

## Solution Options

### Option 1: Route-based Code Splitting (Recommended First Step)

Use `React.lazy()` + `Suspense` for route components:

```tsx
// Before
import { ProfilePage } from '@/app/pages/ProfilePage';

// After
const ProfilePage = React.lazy(() => import('@/app/pages/ProfilePage'));

// In router
<Suspense fallback={<Loading />}>
  <ProfilePage />
</Suspense>
```

**Candidates for lazy loading:**
- `/settings` — authenticated users only
- `/about` — secondary page
- `/pledgers` — directory page
- Legal pages (`/terms`, `/privacy`)

### Option 2: Vendor Chunk Splitting

Configure `vite.config.ts` to separate large dependencies:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-radix': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', ...],
        'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge'],
      }
    }
  }
}
```

### Option 3: Analyze and Remove Unused Code

Run bundle analyzer to identify bloat:

```bash
npx vite-bundle-visualizer
```

## When to Act

- Page load exceeds 3s on 3G simulation
- Lighthouse performance score drops below 80
- Bundle exceeds 1MB total

## Acceptance Criteria

- [ ] Build warning resolved (chunks under 500kB)
- [ ] Lighthouse performance score maintained or improved
- [ ] No visible loading jank from code splitting

## References

- [Vite Code Splitting](https://vitejs.dev/guide/build.html#chunking-strategy)
- [React.lazy Documentation](https://react.dev/reference/react/lazy)
