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

// This is a public, unauthenticated POST endpoint. Cap the body and only forward genuine
// report payloads so it cannot be used to amplify traffic into our paid Sentry quota.
const MAX_REPORT_BYTES = 8192; // CSP violation reports are small
const REPORT_CONTENT_TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

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

  // Amplification guard: reject oversized or non-report payloads (accept-and-drop so a
  // browser never retry-storms on a 4xx).
  if (Number(req.headers['content-length'] ?? 0) > MAX_REPORT_BYTES) {
    res.status(204).end();
    return;
  }
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType && !REPORT_CONTENT_TYPES.includes(contentType)) {
    res.status(204).end();
    return;
  }

  try {
    // req.body is the parsed report (application/csp-report or application/reports+json).
    let body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (body.length > MAX_REPORT_BYTES) body = body.slice(0, MAX_REPORT_BYTES);
    await fetch(SENTRY_CSP_REPORT_URL, {
      method: 'POST',
      // Fixed content-type — do not reflect the caller's header into Sentry's parser.
      headers: { 'Content-Type': 'application/csp-report' },
      body,
      // Never let a slow/unreachable Sentry hang the function — which a real CSP break would
      // trigger en masse, since every affected browser POSTs a report.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // A reporting sink must never surface its own failure to the user's browser.
  }

  res.status(204).end();
}
