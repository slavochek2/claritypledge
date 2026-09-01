/**
 * @file p553-performance.spec.ts
 * @description Performance optimization tests for P553: defer eager JS and optimize loading.
 *
 * Tests verify:
 * 1. Lazy-loaded routes render without blank pages (no bad lazy boundaries)
 * 2. Analytics (Mixpanel) are not in the critical evaluation path
 * 3. Preconnect hints exist in HTML head
 * 4. Service worker registration script is deferred
 * 5. Cache headers for hashed assets (vercel.json config)
 * 6. KaTeX CSS only loads when /manifesto route is visited
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Route lazy-loading: each public route renders without blank page or crash
// ─────────────────────────────────────────────────────────────────────────────

const LAZY_ROUTES = [
  { path: '/about', label: 'About' },
  { path: '/manifesto', label: 'Manifesto' },
  { path: '/privacy-policy', label: 'Privacy Policy' },
  { path: '/terms-of-service', label: 'Terms of Service' },
  { path: '/demo', label: 'Demo' },
  { path: '/feed', label: 'Feed' },
  { path: '/co-create', label: 'Co-Create' },
  { path: '/partner-template', label: 'Partner Template' },
  { path: '/create', label: 'Create Story' },
  { path: '/live', label: 'Live' },
] as const;

test.describe('P553 — Route lazy-loading', () => {
  for (const { path: routePath, label } of LAZY_ROUTES) {
    test(`${label} (${routePath}) loads without crash or blank page`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', err => pageErrors.push(err.message));

      await page.goto(routePath);
      // Wait for Suspense fallback to resolve — domcontentloaded is not enough for lazy routes
      await page.waitForLoadState('networkidle');

      // No uncaught JS errors
      expect(pageErrors, `JS errors on ${routePath}: ${pageErrors.join('; ')}`).toHaveLength(0);

      // Page is not blank (Suspense resolved to actual content)
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${label} page appears blank after lazy load`).toBeGreaterThan(10);

      // No chunk loading error fallback visible
      const chunkErrorVisible = await page.locator('text=New version available').isVisible().catch(() => false);
      expect(chunkErrorVisible, `Chunk error boundary triggered on ${routePath}`).toBe(false);

      const moduleErrorVisible = await page.locator('text=Module load failed').isVisible().catch(() => false);
      expect(moduleErrorVisible, `Module load error on ${routePath}`).toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Analytics deferred loading: Mixpanel not in initial JS evaluation
// (P1216: the LogRocket assertion was removed with the vendor — it could only
//  have passed vacuously once window.LogRocket no longer exists.)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P553 — Analytics deferred loading', () => {
  test('Mixpanel snippet in index.html does not block rendering', async ({ page }) => {
    // The Mixpanel snippet uses async script loading (k.async = true in the snippet).
    // Verify the external Mixpanel library script tag has async attribute.
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check that the Mixpanel CDN script was inserted with async=true
    const mixpanelScriptAsync = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[src*="mxpnl.com"]');
      if (scripts.length === 0) return 'not-found'; // Not on localhost — expected
      return (scripts[0] as HTMLScriptElement).async ? 'async' : 'sync';
    });

    // On localhost, Mixpanel snippet is gated by hostname check — 'not-found' is acceptable
    if (mixpanelScriptAsync !== 'not-found') {
      expect(mixpanelScriptAsync, 'Mixpanel CDN script should be async').toBe('async');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Preconnect hints in HTML head
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P553 — Preconnect hints', () => {
  test('index.html contains preconnect links for critical origins', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const preconnectHrefs = await page.evaluate(() => {
      const links = document.querySelectorAll('link[rel="preconnect"]');
      return Array.from(links).map(l => (l as HTMLLinkElement).href);
    });

    // After P553: preconnect for Supabase should exist
    // P555: Google Fonts preconnects removed (fonts self-hosted)
    const hasSupabase = preconnectHrefs.some(h => h.includes('supabase.co'));

    expect(hasSupabase, 'Missing preconnect for Supabase').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Service worker registration script deferred
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P553 — Service worker registration', () => {
  test('registerSW.js script tag has defer attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // vite-plugin-pwa injects registerSW.js — check its script tag attributes
    const swScriptInfo = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.src.includes('registerSW') || s.textContent?.includes('registerSW')) {
          return {
            found: true,
            defer: s.defer,
            async: s.async,
            type: s.type,
            src: s.src,
          };
        }
      }
      return { found: false, defer: false, async: false, type: '', src: '' };
    });

    if (swScriptInfo.found) {
      // After P553: registerSW should have defer or be type="module" (which is deferred by default)
      const isDeferred = swScriptInfo.defer || swScriptInfo.async || swScriptInfo.type === 'module';
      expect(isDeferred, `registerSW.js is render-blocking (no defer/async/module). src=${swScriptInfo.src}`).toBe(true);
    }
    // In dev mode, SW may not be present — that's fine
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cache headers — vercel.json has immutable config for hashed assets
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P553 — Cache headers (vercel.json)', () => {
  test('vercel.json has immutable cache-control for hashed assets', async () => {
    const vercelJsonPath = path.resolve(__dirname, '..', 'vercel.json');
    const content = fs.readFileSync(vercelJsonPath, 'utf-8');
    const config = JSON.parse(content);

    const headers = config.headers || [];

    // Look for a header rule targeting hashed assets (e.g., /assets/*)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hashedAssetRule = headers.find((h: any) => {
      const source = h.source || '';
      // Common patterns: /assets/(.*), /_next/static/(.*), or files with hash patterns
      return source.includes('assets') || source.includes('static');
    });

    // After P553 implementation: there should be an immutable cache rule
    // This test will fail until the vercel.json change is made — documenting the requirement
    expect(hashedAssetRule, 'No cache header rule found for hashed assets in vercel.json').toBeDefined();

    if (hashedAssetRule) {
      const cacheHeader = hashedAssetRule.headers?.find(
        (h: any) => h.key.toLowerCase() === 'cache-control' // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      expect(cacheHeader, 'Cache-Control header missing from hashed asset rule').toBeDefined();
      expect(cacheHeader?.value).toContain('immutable');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. KaTeX CSS lazy loading — only loads when /manifesto is visited
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P553 — KaTeX lazy loading', () => {
  test('KaTeX CSS is NOT loaded on the landing page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasKatexCss = await page.evaluate(() => {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      for (const link of links) {
        if ((link as HTMLLinkElement).href.includes('katex')) return true;
      }
      // Also check inline style tags
      const styles = document.querySelectorAll('style');
      for (const style of styles) {
        if (style.textContent?.includes('.katex')) return true;
      }
      return false;
    });

    expect(hasKatexCss, 'KaTeX CSS loaded on landing page — should only load on /manifesto').toBe(false);
  });

  test('KaTeX CSS IS loaded on /manifesto', async ({ page }) => {
    await page.goto('/manifesto');
    await page.waitForLoadState('networkidle');

    const hasKatexCss = await page.evaluate(() => {
      // Check link tags
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      for (const link of links) {
        if ((link as HTMLLinkElement).href.includes('katex')) return true;
      }
      // Vite may inline the CSS in dev mode — check for .katex class in any style
      const styles = document.querySelectorAll('style');
      for (const style of styles) {
        if (style.textContent?.includes('.katex')) return true;
      }
      return false;
    });

    expect(hasKatexCss, 'KaTeX CSS not found on /manifesto — should be loaded with the lazy chunk').toBe(true);
  });
});
