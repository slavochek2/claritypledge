/**
 * @file utm.ts
 * @description Shared helper for tagging outbound links with UTM channel-attribution
 * params (P1134). Verified (2026-08-21): Mixpanel's web SDK auto-registers
 * utm_source/utm_medium/utm_campaign from the query string as super properties on
 * page load, which are then included on every event — no custom capture code needed.
 * Convention for source/medium/campaign values: docs/technical/analytics.md.
 */
import { safeLinkHref } from '@/app/prototypes/events/location-utils';

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
}

/**
 * Returns `undefined` (matching safeLinkHref's contract) for anything that isn't an
 * http(s) URL — relative paths, javascript:/data: schemes — so future callers passing
 * DB-derived URLs get the same safe-omission behavior as other href sinks in this repo.
 */
export function withUtm(url: string, { source, medium, campaign }: UtmParams): string | undefined {
  const safe = safeLinkHref(url);
  if (!safe) return undefined;
  const u = new URL(safe);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}
