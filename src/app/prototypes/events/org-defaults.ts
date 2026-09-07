/**
 * Which Clarity Organization does a new event belong to?
 *
 * Rule and rationale: docs/events/org-defaults.md. This module is the single
 * implementation — scripts/create-event.ts calls it, and the event skills follow it.
 *
 * An event created with no organization is "loose": it appears on no group's Events
 * tab and counts toward no community. That happened to the 2026-09-13 hike because
 * no creation path set it at all, which is what this exists to prevent.
 */

import { classifyLocation } from './location-utils';

/** Chiang Mai city centre. The origin for the radius test below. */
export const CHIANG_MAI = { lat: 18.7883, lng: 98.9853 };

/**
 * How far from Chiang Mai an in-person event may be before a human has to say which
 * community it belongs to. 150 km comfortably contains every trailhead, café and
 * venue in the Chiang Mai orbit (the furthest hike used so far is ~15 km out) while
 * excluding the other places events have actually run — Ko Phangan is ~1,000 km.
 */
export const CM_RADIUS_KM = 150;

/**
 * Locations that name a meeting *link* are matched by classifyLocation (the same
 * classifier the event page renders with). Locations that describe one in words are
 * not: docs/events/series/lost-cofounders.md stores `"Online — Google Meet"`, which
 * classifies as an ADDRESS and would otherwise file into Chiang Mai.
 */
const ONLINE_WORDS =
  /(^|[^a-z])(online|virtual|remote|zoom|google meet|meet\.google|ms teams|discord)([^a-z]|$)/i;

export function isOnlineLocation(location: string): boolean {
  return classifyLocation(location).type === 'virtual' || ONLINE_WORDS.test(location);
}

/**
 * Pull coordinates out of a location string when it carries them literally.
 *
 * ONLY literal coordinates. A Google Maps URL of the `?query=<place name>` form — the
 * shape /publish-run writes — carries no coordinates, and this returns null for it
 * rather than guessing. That is deliberate: geocoding the place name was measured
 * unreliable on exactly this data (2026-09-07 — "Inner Space Coworking Ko Phangan"
 * and "Ban Pa Nok Nook trailhead" returned no result, and "YODDOI Coffee" returned a
 * café in Chiang RAI, 137 km out, which would have passed the radius test on a wrong
 * fact). The caller supplies coordinates instead; it has them.
 */
export function coordsFromLocation(
  location: string,
): { lat: number; lng: number } | null {
  // A bare or embedded "lat,lng" pair. Latitude −90..90, longitude −180..180, and at
  // least three decimals on both so a house number or a date cannot match.
  const m = location.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type OrgResolution =
  | { kind: 'org'; slug: 'cm' | 'online'; why: string }
  | { kind: 'loose'; why: string }
  /** The creator must say which community. Never resolved by guessing. */
  | { kind: 'ask'; why: string };

export interface ResolveOrgInput {
  location: string;
  /** Explicit override. `null` means deliberately unaffiliated. */
  orgSlug?: string | null;
  /** Real coordinates for the venue, when the creator has them. */
  coords?: { lat: number; lng: number } | null;
}

export function resolveOrg(input: ResolveOrgInput): OrgResolution {
  // 1. An explicit choice always wins, including the explicit choice to stay loose.
  if (input.orgSlug !== undefined) {
    if (input.orgSlug === null) return { kind: 'loose', why: 'org_slug: null — deliberately unaffiliated' };
    if (input.orgSlug === 'cm' || input.orgSlug === 'online') {
      return { kind: 'org', slug: input.orgSlug, why: `org_slug: "${input.orgSlug}" (explicit)` };
    }
    // An unknown slug is not this module's to validate — the caller resolves it
    // against the database and fails there if it names nothing.
    return { kind: 'ask', why: `org_slug: "${input.orgSlug}" is not a known default — resolve it against the database` };
  }

  // 2. Online is decided by the venue, not by geography.
  if (isOnlineLocation(input.location)) {
    return { kind: 'org', slug: 'online', why: 'location is a meeting link or says online' };
  }

  // 3. In person: inside the Chiang Mai radius is the ordinary case and is silent.
  const coords = input.coords ?? coordsFromLocation(input.location);
  if (!coords) {
    return {
      kind: 'ask',
      why: 'in-person event with no coordinates — cannot tell whether it is near Chiang Mai',
    };
  }
  const km = distanceKm(CHIANG_MAI, coords);
  if (km <= CM_RADIUS_KM) {
    return { kind: 'org', slug: 'cm', why: `${km.toFixed(0)} km from Chiang Mai (within ${CM_RADIUS_KM} km)` };
  }
  return {
    kind: 'ask',
    why: `${km.toFixed(0)} km from Chiang Mai — beyond the ${CM_RADIUS_KM} km radius, so the community is not obvious`,
  };
}
