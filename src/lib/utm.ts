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
/** P1669: where index.html keeps the first UTM set ever seen in this browser (values already cleaned). */
export const FIRST_TOUCH_UTM_KEY = 'cp_first_touch_utm';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/**
 * P1669: the first-touch UTM set for sign-up attribution, re-cleaned on read (a stored value is
 * untrusted). Empty when none was seen or storage is blocked. Limit: a sign-up finished in a
 * different browser from the one that opened the tagged link (a WhatsApp in-app browser, then the
 * email link in Safari) has no first touch here.
 */
export function readFirstTouchUtm(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_UTM_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
    for (const key of UTM_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value !== 'string') continue;
      const clean = value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
      if (clean) out[key] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

export function withUtm(url: string, { source, medium, campaign }: UtmParams): string | undefined {
  const safe = safeLinkHref(url);
  if (!safe) return undefined;
  const u = new URL(safe);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}
