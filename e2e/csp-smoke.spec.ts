/**
 * CSP deploy smoke (P865) — cross-route, cross-feature.
 *
 * Catches the recurring class of bug where a third-party SDK (LogRocket,
 * Mixpanel, Sentry) loads a resource from a host that is NOT in our CSP
 * allowlist, so the browser blocks it in production. This is invisible to
 * every static check we run on push:
 *   - The CSP lives in vercel.json response headers, not app code, and the
 *     local Vite dev server never applies it — so localhost smoke sees no CSP.
 *   - Which host the SDK picks is decided at runtime (LogRocket rotates CDN
 *     hosts to evade ad-blockers), so a build cannot know it.
 * The ONLY reliable catch is loading the DEPLOYED page in a real browser and
 * failing on CSP violations. That is what this spec does. History: P805
 * (connect-src GCS), P863 (worker-src + recorder fetch), P865 (LogRocket CDN
 * host rotation) — three instances of the same gap.
 *
 * Runs against a deployed URL (prod by default — that is where the headers
 * exist), NOT localhost:
 *   npm run smoke:csp                         # → https://claritypledge.com
 *   CSP_SMOKE_URL=https://<preview> npm run smoke:csp
 *
 * The canary (src/tests/p865-csp-logrocket-hosts.test.ts) locks the hosts we
 * already know about; this gate discovers hosts we do not.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.CSP_SMOKE_URL || 'https://claritypledge.com').replace(/\/$/, '');

// Routes that receive the strict "/(.*)" CSP. NOT /point/* or /story/*, which
// carry only `frame-ancestors *` (embeddable shares) and so cannot surface this class.
const STRICT_CSP_ROUTES = ['/', '/live', '/feed', '/manifesto', '/events'];

// Third-party SDKs (LogRocket, Mixpanel recorder) init behind requestIdleCallback /
// a 2s setTimeout (see src/main.tsx), so their resource loads — and any CSP block —
// fire well after first paint. Wait long enough to observe them.
const THIRD_PARTY_SETTLE_MS = 5000;

const CSP_VIOLATION_RE = /violates the following Content Security Policy|Content Security Policy directive|Refused to (?:load|connect|create)/i;

test.describe('CSP deploy smoke', () => {
  for (const route of STRICT_CSP_ROUTES) {
    test(`no CSP violations on ${route}`, async ({ page }) => {
      const cspViolations: string[] = [];
      const pageErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error' && CSP_VIOLATION_RE.test(msg.text())) {
          cspViolations.push(msg.text());
        }
      });
      // Uncaught runtime exceptions (real crashes), surfaced alongside CSP blocks.
      page.on('pageerror', (err) => pageErrors.push(err.message));

      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(THIRD_PARTY_SETTLE_MS);

      expect(
        cspViolations,
        `CSP blocked ${cspViolations.length} resource(s) on ${BASE_URL}${route}. A third-party host is missing from the vercel.json allowlist. Blocked:\n${cspViolations.join('\n')}`,
      ).toHaveLength(0);

      expect(
        pageErrors,
        `Uncaught exception(s) on ${BASE_URL}${route}:\n${pageErrors.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});
