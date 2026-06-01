/**
 * Prod health smoke (P866) — console errors + HTTP >=400 on the public routes.
 *
 * Generalizes the CSP-smoke harness. Instead of watching ONLY CSP violations, it
 * loads each deployed public route and fails on ANY console `error` or ANY HTTP
 * response >=400, minus a curated allowlist of known-benign vendor noise
 * (e2e/helpers/prod-health.ts). The inversion vs csp-smoke: that gate filters
 * WHAT it observes (CSP-only) to stay green; this gate observes EVERYTHING and
 * filters WHAT is known-benign, so a novel error fails by default.
 *
 * Motivated by a 406 on /letter that reached prod unnoticed — not a CSP violation
 * (csp-smoke ignored it), not a fatal React crash (app-boot-smoke ignored it), and
 * the route was unsmoked. This gate catches that CLASS on the public routes going
 * forward. (/letter itself is auth/token-gated and out of scope — public only.)
 *
 * Runs against a deployed URL (prod by default — that is where the real headers and
 * vendor SDKs are), NOT localhost:
 *   npm run smoke:prod                          # → https://claritypledge.com
 *   PROD_SMOKE_URL=https://<preview> npm run smoke:prod
 *
 * Day one is ALERT-ONLY: the CI workflow opens a GitHub issue on failure but does
 * NOT block (the allowlist is unproven). Promotion to hard-blocking happens once the
 * allowlist is proven against real deploys. Captured text is redacted before it can
 * reach the failure message (no token may surface in a public issue body).
 */
import { test, expect } from '@playwright/test';
import {
  PROD_HEALTH_ROUTES,
  PROD_HEALTH_ALLOWLIST,
  isAllowlisted,
  redactUrl,
  pollUntilStable,
} from './helpers/prod-health';

const BASE_URL = (process.env.PROD_SMOKE_URL || 'https://claritypledge.com').replace(/\/$/, '');

test.describe('Prod health smoke', () => {
  for (const route of PROD_HEALTH_ROUTES) {
    test(`no console errors or HTTP>=400 on ${route}`, async ({ page }) => {
      // goto + the stabilization poll need headroom beyond Playwright's 30s default.
      test.setTimeout(45_000);

      // Console capture — ALL errors, not just CSP patterns. Allowlisted vendor
      // chatter is dropped; everything else is redacted and recorded.
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (!isAllowlisted(text, PROD_HEALTH_ALLOWLIST.consolePatterns)) {
          consoleErrors.push(redactUrl(text));
        }
      });

      // HTTP capture — ALL responses >=400 (cross-origin included: the motivating
      // 406 was a cross-origin Supabase call). Allowlisted hosts are dropped.
      const httpErrors: string[] = [];
      page.on('response', (response) => {
        const status = response.status();
        if (status < 400) return;
        const url = response.url();
        if (!isAllowlisted(url, PROD_HEALTH_ALLOWLIST.urlPatterns)) {
          httpErrors.push(`HTTP ${status} ${redactUrl(url)}`);
        }
      });

      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });

      // Wait out late-init SDKs: poll the captured-error count until it settles.
      await pollUntilStable(page, () => consoleErrors.length + httpErrors.length);

      const all = [...consoleErrors, ...httpErrors];
      expect(
        all,
        `Prod health smoke found ${all.length} non-allowlisted error(s) on ${BASE_URL}${route}.\n` +
          `If this is benign vendor noise, add the pattern to PROD_HEALTH_ALLOWLIST in ` +
          `e2e/helpers/prod-health.ts (with a comment on why). Captured (redacted):\n${all.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});
