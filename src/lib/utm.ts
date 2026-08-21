/**
 * @file utm.ts
 * @description Shared helper for tagging outbound links with UTM channel-attribution
 * params (P1134). Verified (2026-08-21): Mixpanel's web SDK auto-registers
 * utm_source/utm_medium/utm_campaign from the query string as super properties on
 * page load, which are then included on every event — no custom capture code needed.
 * Convention for source/medium/campaign values: docs/technical/analytics.md.
 */

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
}

export function withUtm(url: string, { source, medium, campaign }: UtmParams): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}
