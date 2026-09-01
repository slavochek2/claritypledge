/**
 * CSP deploy smoke (P865) — cross-route, cross-feature.
 *
 * Catches the recurring class of bug where a third-party SDK (Mixpanel,
 * Mixpanel, Sentry) loads a resource from a host that is NOT in our CSP
 * allowlist, so the browser blocks it in production. This is invisible to
 * every static check we run on push:
 *   - The CSP lives in vercel.json response headers, not app code, and the
 *     local Vite dev server never applies it — so localhost smoke sees no CSP.
 *   - Which host the SDK picks is decided at runtime (a vendor may rotate CDN
 *     hosts to evade ad-blockers), so a build cannot know it.
 * The ONLY reliable catch is loading the DEPLOYED page in a real browser and
 * failing on CSP violations. That is what this spec does. History: P805
 * (connect-src GCS), P863 (worker-src + recorder fetch), P865 (a rotating vendor CDN
 * host rotation) — three instances of the same gap.
 *
 * Runs against a deployed URL (prod by default — that is where the headers
 * exist), NOT localhost:
 *   npm run smoke:csp                         # → https://claritypledge.com
 *   CSP_SMOKE_URL=https://<preview> npm run smoke:csp
 *
 * The canary (src/tests/p865-csp-directives.test.ts) locks the hosts we
 * already know about; this gate discovers hosts we do not.
 */
import { test, expect } from '@playwright/test';
import { PROD_HEALTH_ROUTES, pollUntilStable } from './helpers/prod-health';

const BASE_URL = (process.env.CSP_SMOKE_URL || 'https://claritypledge.com').replace(/\/$/, '');

// Routes that receive the strict "/(.*)" CSP. NOT /point/* or /story/*, which carry
// only `frame-ancestors *` (embeddable shares) and so cannot surface this class.
// Shared with the prod-health gate (e2e/helpers/prod-health.ts) — one source of truth.

// The securitypolicyviolation listener (registered below) captures any block regardless
// of console wording — the P838-recommended approach over console-scraping. The
// stabilization poll (pollUntilStable, shared from prod-health.ts) waits out late-init
// SDKs (Mixpanel/Sentry behind requestIdleCallback) so a late CSP block isn't missed.
const CSP_VIOLATION_RE = /violates the following Content Security Policy|Content Security Policy directive|Refused to (?:load|connect|create)/i;

test.describe('CSP deploy smoke', () => {
  for (const route of PROD_HEALTH_ROUTES) {
    test(`no CSP violations on ${route}`, async ({ page }) => {
      // goto + the stabilization poll need headroom beyond Playwright's 30s default.
      test.setTimeout(45_000);

      // Structural capture: registered before any document script runs, this catches every
      // CSP block regardless of timing or Chromium console wording. The console parse below
      // is a complement, not the primary signal.
      await page.addInitScript(() => {
        const w = window as unknown as { __cspViolations: string[] };
        w.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          w.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI || e.sourceFile || '(inline)'}`);
        });
      });

      const consoleViolations: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error' && CSP_VIOLATION_RE.test(msg.text())) consoleViolations.push(msg.text());
      });

      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });

      // Wait out late-init SDKs: poll the violation count until it settles. Shared
      // stabilization helper — same MIN/MAX/STABLE tuning as the prod-health gate.
      await pollUntilStable(page, () =>
        page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations?.length ?? 0),
      );

      const domViolations: string[] = await page.evaluate(
        () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
      );
      const all = [...new Set([...domViolations, ...consoleViolations])];

      // CSP-only gate: generic third-party pageerror noise is left to app-boot-smoke.spec.ts
      // (avoids flaky-fail); a CSP-caused failure surfaces as a violation here regardless.
      expect(
        all,
        `CSP blocked ${all.length} resource(s) on ${BASE_URL}${route}. A host is missing from the vercel.json allowlist (or a vendor rotated to a new host). Blocked:\n${all.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});
