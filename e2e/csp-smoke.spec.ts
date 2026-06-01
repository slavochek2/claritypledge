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

// Third-party SDKs (LogRocket, Mixpanel) init behind requestIdleCallback / a ~2s setTimeout
// (see src/main.tsx), so a CSP block can fire well after networkidle. Rather than race a blind
// sleep OR a fragile vendor-specific readiness global (the npm SDK exposes no reliable one),
// we poll the structural violation count until it STOPS growing. MIN floor guarantees the SDKs
// have had time to init + fire before we can conclude "clean"; MAX caps the wait; STABLE is the
// quiet window that means "settled". The securitypolicyviolation listener captures any block
// regardless of console wording — the P838-recommended approach over console-scraping.
const THIRD_PARTY_MIN_WAIT_MS = 4000;
const THIRD_PARTY_MAX_WAIT_MS = 12000;
const STABLE_MS = 2500;

const CSP_VIOLATION_RE = /violates the following Content Security Policy|Content Security Policy directive|Refused to (?:load|connect|create)/i;

test.describe('CSP deploy smoke', () => {
  for (const route of STRICT_CSP_ROUTES) {
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

      // Poll the violation count until it settles: don't conclude before MIN (SDKs must have
      // inited), break once STABLE with no new violations, hard-stop at MAX.
      const start = Date.now();
      const deadline = start + THIRD_PARTY_MAX_WAIT_MS;
      let lastCount = -1;
      let stableSince = start;
      while (Date.now() < deadline) {
        const count = await page.evaluate(
          () => (window as unknown as { __cspViolations?: string[] }).__cspViolations?.length ?? 0,
        );
        if (count !== lastCount) {
          lastCount = count;
          stableSince = Date.now();
        } else if (Date.now() - start >= THIRD_PARTY_MIN_WAIT_MS && Date.now() - stableSince >= STABLE_MS) {
          break;
        }
        await page.waitForTimeout(500);
      }

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
