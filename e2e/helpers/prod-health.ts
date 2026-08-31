/**
 * Prod-health smoke substrate (P866) — shared by the broadened CSP gate and the
 * console/HTTP gate.
 *
 * This module is the single source of truth for:
 *   - PROD_HEALTH_ROUTES   — the public routes both gates load
 *   - the stabilization poll (pollUntilStable + its MIN/MAX/STABLE constants)
 *   - PROD_HEALTH_ALLOWLIST — the known-benign console/URL patterns
 *   - isAllowlisted()      — narrow substring match against the allowlist
 *   - redactUrl()          — strips tokens before any captured text reaches a
 *                            PUBLIC GitHub issue body or the inline /ship report
 *
 * Why a shared module (not two parallel specs): the stabilization poll is
 * non-trivial and was duplicated risk. csp-smoke.spec.ts imports the routes +
 * poll from here; prod-health-smoke.spec.ts imports everything. One substrate —
 * if the poll tuning changes, both gates benefit automatically (P865 lesson:
 * copies rot).
 */
import type { Page } from '@playwright/test';

// ── Routes ──────────────────────────────────────────────────────────────────
// Public routes that receive the strict "/(.*)" CSP and make the SDK / Supabase
// calls these gates watch. NOT /point/* or /story/* (embeddable shares carry only
// `frame-ancestors *`). Identical set to the former csp-smoke STRICT_CSP_ROUTES —
// csp-smoke.spec.ts now imports this, so there is one list, not two.
// /cm added by P906: its Google Calendar iframe shipped CSP-blocked because no
// gate loaded the route on prod — frame-src violations only surface live.
// /coach added by P916: the coach landing moved off "/" to its own route — without it
// here, the coach page (CTAs, agreement-certificate surface) has no prod health coverage.
// P1193: '/groups' replaces '/org' as the canonical directory route. '/org' is NOT
// listed here — it is a redirect, not a page, so a health check that followed it would
// pass on the strength of the destination and tell us nothing about either. The
// redirect has its own coverage in e2e/p1193-groups-rename.spec.ts.
export const PROD_HEALTH_ROUTES = ['/', '/coach', '/live', '/feed', '/manifesto', '/events', '/cm', '/groups'];

// ── Stabilization poll ──────────────────────────────────────────────────────
// Third-party SDKs (LogRocket, Mixpanel) init behind requestIdleCallback / a ~2s
// setTimeout (see src/main.tsx), so an error/violation can fire well after
// networkidle. Rather than race a blind sleep, poll the captured-count until it
// STOPS growing. MIN floor guarantees the SDKs had time to init + fire before we
// can conclude "clean"; MAX caps the wait; STABLE is the quiet window that means
// "settled".
export const THIRD_PARTY_MIN_WAIT_MS = 4000;
export const THIRD_PARTY_MAX_WAIT_MS = 12000;
export const STABLE_MS = 2500;

export interface PollOptions {
  minWaitMs?: number;
  maxWaitMs?: number;
  stableMs?: number;
}

/**
 * Poll `getCount` until it settles: don't conclude before MIN (SDKs must have
 * inited), break once STABLE elapses with no new count, hard-stop at MAX.
 *
 * `getCount` is the only thing that differs between the two gates: the CSP gate
 * reads a count out of the page (`page.evaluate`), the console/HTTP gate reads the
 * length of its node-side capture arrays. Both ask the same question — "has the
 * count stopped growing?".
 */
export async function pollUntilStable(
  page: Page,
  getCount: () => number | Promise<number>,
  opts: PollOptions = {},
): Promise<void> {
  const minWaitMs = opts.minWaitMs ?? THIRD_PARTY_MIN_WAIT_MS;
  const maxWaitMs = opts.maxWaitMs ?? THIRD_PARTY_MAX_WAIT_MS;
  const stableMs = opts.stableMs ?? STABLE_MS;

  const start = Date.now();
  const deadline = start + maxWaitMs;
  let lastCount = -1;
  let stableSince = start;

  while (Date.now() < deadline) {
    const count = await getCount();
    if (count !== lastCount) {
      lastCount = count;
      stableSince = Date.now();
    } else if (Date.now() - start >= minWaitMs && Date.now() - stableSince >= stableMs) {
      break;
    }
    await page.waitForTimeout(500);
  }
}

// ── Allowlist ───────────────────────────────────────────────────────────────
// THE load-bearing choice. Existing gates filter WHAT they observe (CSP-only) to
// stay green; this gate observes EVERYTHING and filters WHAT is known-benign, so a
// novel error fails by default. Each entry is an exact substring (narrow,
// auditable) with a comment on the line above on WHY it is benign — the P865
// canary model. Reviewed like a code change. NEVER widen a pattern without a
// security review (a too-broad pattern silently swallows a real regression).
export const PROD_HEALTH_ALLOWLIST: {
  consolePatterns: string[];
  urlPatterns: string[];
} = {
  // Console error-text substrings that are known-benign vendor noise.
  consolePatterns: [
    // LogRocket SDK chatter (e.g. "LR-SDK ... session recording blocked"): the
    // recorder being suppressed/blocked for a session is not an app error.
    'LR-SDK',
    'LogRocket',
  ],
  // HTTP response-URL substrings whose >=400 responses are known-benign.
  urlPatterns: [
    // Supabase API is cross-origin; public-route pages make anon Supabase calls
    // that can legitimately 4xx (RLS-denied probes, optional resources). Host-level
    // allow for v1 — narrowing to specific endpoints is a future allowlist-tightening
    // review (P866 does NOT chase the motivating 406). See AD-2.
    '.supabase.co',
    // Mixpanel EU ingest: occasional 429 (rate limit) on the ingest endpoint.
    'api-eu.mixpanel.com',
    // Sentry store endpoint: 429 during event bursts.
    '.sentry.io',
  ],
};

/** Narrow substring match — `text` is benign if it contains ANY listed pattern. */
export function isAllowlisted(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

// ── Redaction (security — AD-7 / Security Review HIGH) ───────────────────────
// Captured URLs and console text can reach a PUBLIC GitHub issue body (the cron
// path) and the inline /ship report. Tokens live in query strings (`?token=...`),
// and apikey/Authorization values can leak into console text. Strip both, then cap
// length so a pathological entry can't bloat the issue body. The query string is
// stripped per-URL (not at the first '?' in the whole string) so prose containing a
// '?' is preserved while every embedded URL's token is removed.
// NEVER change this without a security review.
const URL_QUERY_RE = /(https?:\/\/[^\s?]+)\?[^\s]*/gi;
// `.+` (not `\S+`) so a multi-token value like "Bearer <token>" is consumed whole —
// `\S+` would stop at the first space and leave the token exposed. `.` excludes
// newlines, so redaction stops at end of line. Over-redacting a line's tail is the
// safe direction; under-redacting a token is not.
const HEADER_SECRET_RE = /(authorization|apikey)\s*[:=]\s*.+/gi;
// Defense-in-depth: a secret logged as a bare `key=value` in prose (NOT inside a URL
// query string — those are already gone via URL_QUERY_RE) still gets stripped. Covers
// the "no raw token may reach the reporter" guarantee for non-URL console text.
const KV_SECRET_RE = /\b(access_token|refresh_token|token|apikey|api_key|secret|password)=[^\s&]+/gi;
const MAX_LEN = 200;

export function redactUrl(raw: string): string {
  let out = raw.replace(URL_QUERY_RE, '$1?[REDACTED]');
  out = out.replace(HEADER_SECRET_RE, '$1: [REDACTED]');
  out = out.replace(KV_SECRET_RE, '$1=[REDACTED]');
  return out.length > MAX_LEN ? out.slice(0, MAX_LEN) + '…' : out;
}
