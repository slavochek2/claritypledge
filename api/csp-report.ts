import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Same-origin CSP violation report sink (P865).
 *
 * The enforcing CSP on the "/(.*)" route declares `report-uri /api/csp-report`
 * and `report-to csp-endpoint`. Browsers POST a violation report here whenever a
 * resource is blocked — e.g. a LogRocket CDN host that has rotated out of the
 * allowlist (the P865 root cause). This proxy forwards the report to Sentry's
 * Security Header endpoint so violations surface as alerts WITHOUT anyone opening
 * DevTools, and WITHOUT committing the Sentry DSN public key to this public repo.
 *
 * Configuration (Vercel project env — NOT committed):
 *   SENTRY_CSP_REPORT_URL = https://<org>.ingest.<region>.sentry.io/api/<project>/security/?sentry_key=<public_key>
 *
 * If the env var is unset the endpoint accepts and drops the report (204) so a
 * deploy never 500s before reporting is wired up. The active catch for this bug
 * class is the e2e/csp-smoke.spec.ts gate; this passive sink is the always-on
 * backstop for host rotations that happen between deploys.
 */

const SENTRY_CSP_REPORT_URL = process.env.SENTRY_CSP_REPORT_URL;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Browsers only ever POST reports. Anything else is noise.
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  // No sink configured yet — accept and drop so the browser does not retry-storm
  // and the deploy is not blocked on an env var.
  if (!SENTRY_CSP_REPORT_URL) {
    res.status(204).end();
    return;
  }

  try {
    // req.body is the parsed report (application/csp-report or application/reports+json).
    // Forward it verbatim; Sentry accepts both the legacy and Reporting-API shapes.
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    await fetch(SENTRY_CSP_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': req.headers['content-type'] || 'application/csp-report' },
      body,
    });
  } catch {
    // A reporting sink must never surface its own failure to the user's browser.
  }

  res.status(204).end();
}
