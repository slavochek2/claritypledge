import { describe, it, expect } from 'vitest';
import {
  resolveOrg,
  coordsFromLocation,
  distanceKm,
  CHIANG_MAI,
  CM_RADIUS_KM,
} from '@/app/prototypes/events/org-defaults';

/**
 * Real coordinates, read from the venues of events that actually ran. The Ko Phangan
 * pair is the point of the radius test: free geocoding returned NO RESULT for both
 * venue names (measured 2026-09-07), so the rule cannot be built on the name.
 */
const DOI_PUI_TRAILHEAD = { lat: 18.8159, lng: 98.8851 }; // Hmong Doi Pui Family Coffee
const FERNPRESSO = { lat: 18.7616, lng: 98.9349 };
const MON_CHAM = { lat: 18.8836, lng: 98.8175 };
const KO_PHANGAN = { lat: 9.7319, lng: 100.0136 }; // Inner Space Coworking / Zoo Cafe
const BANGKOK = { lat: 13.7563, lng: 100.5018 };

describe('resolveOrg — online is decided by the venue, never by geography', () => {
  it.each([
    'https://meet.google.com/rdi-qdab-qca',
    'https://zoom.us/j/123456',
    'Online — Google Meet', // docs/events/series/lost-cofounders.md — prose, not a URL
    'Online',
  ])('files %s under the online community', (location) => {
    expect(resolveOrg({ location })).toMatchObject({ kind: 'org', slug: 'online' });
  });

  it('files an online event online even when coordinates are supplied', () => {
    // A hybrid recorded from Chiang Mai must not become an in-person Chiang Mai event.
    expect(resolveOrg({ location: 'Online — Google Meet', coords: DOI_PUI_TRAILHEAD }))
      .toMatchObject({ kind: 'org', slug: 'online' });
  });
});

describe('resolveOrg — in person, inside the radius, silent', () => {
  it.each([
    ['Doi Pui trailhead', DOI_PUI_TRAILHEAD],
    ['Fernpresso at Lake', FERNPRESSO],
    ['Mon Cham / Ban Mai viewpoint', MON_CHAM],
  ])('files %s under cm without asking', (_name, coords) => {
    expect(resolveOrg({ location: 'https://www.google.com/maps/search/?api=1&query=X', coords }))
      .toMatchObject({ kind: 'org', slug: 'cm' });
  });

  it('reads coordinates straight out of a location that carries them', () => {
    // The real 2026-06-21 hike stored this directions URL as its location.
    const res = resolveOrg({
      location: 'https://www.google.com/maps/dir/Current+Location/18.82555,98.89449',
    });
    expect(res).toMatchObject({ kind: 'org', slug: 'cm' });
  });
});

describe('resolveOrg — in person, outside the radius, ASKS', () => {
  it('refuses to file a Ko Phangan event automatically', () => {
    const res = resolveOrg({ location: 'Inner Space Coworking, Ko Phangan, Thailand', coords: KO_PHANGAN });
    expect(res.kind).toBe('ask');
    expect(res.why).toMatch(/beyond the 150 km radius/);
  });

  it('refuses to file a Bangkok event automatically', () => {
    expect(resolveOrg({ location: 'Some venue, Bangkok', coords: BANGKOK }).kind).toBe('ask');
  });

  it('asks rather than guessing when an in-person event has no coordinates', () => {
    // This is the /publish-run pin shape. The place name is NOT geocoded — measured
    // unreliable on this very data — so the absence of coordinates is a stop.
    const res = resolveOrg({
      location: 'https://www.google.com/maps/search/?api=1&query=Inner+Space+Coworking',
    });
    expect(res.kind).toBe('ask');
    expect(res.why).toMatch(/no coordinates/);
  });
});

describe('resolveOrg — an explicit choice always wins', () => {
  it('honours an explicit org over the radius verdict', () => {
    expect(resolveOrg({ location: 'Somewhere', orgSlug: 'cm', coords: KO_PHANGAN }))
      .toMatchObject({ kind: 'org', slug: 'cm' });
  });

  it('honours a deliberate decision to stay unaffiliated', () => {
    expect(resolveOrg({ location: 'Somewhere', orgSlug: null }).kind).toBe('loose');
  });

  it('does not silently accept an unknown slug', () => {
    expect(resolveOrg({ location: 'Somewhere', orgSlug: 'kophangan' }).kind).toBe('ask');
  });
});

describe('coordsFromLocation — only literal coordinates, never a guess', () => {
  it('returns null for a place-name pin', () => {
    expect(coordsFromLocation('https://www.google.com/maps/search/?api=1&query=YODDOI+Coffee')).toBeNull();
  });

  it('returns null for a street address with house numbers', () => {
    expect(coordsFromLocation('431 ถนน เจริญราษฎร์ Fa Ham, Mueang Chiang Mai District, Chiang Mai 50000')).toBeNull();
  });

  it('rejects an out-of-range pair', () => {
    expect(coordsFromLocation('99.1234,200.5678')).toBeNull();
  });

  it('extracts an embedded pair', () => {
    expect(coordsFromLocation('.../18.82555,98.89449')).toEqual({ lat: 18.82555, lng: 98.89449 });
  });
});

describe('distanceKm', () => {
  it('is zero at the origin', () => {
    expect(distanceKm(CHIANG_MAI, CHIANG_MAI)).toBeCloseTo(0, 5);
  });

  it('puts every Chiang Mai venue well inside the radius and Ko Phangan well outside', () => {
    for (const v of [DOI_PUI_TRAILHEAD, FERNPRESSO, MON_CHAM]) {
      expect(distanceKm(CHIANG_MAI, v)).toBeLessThan(30);
    }
    expect(distanceKm(CHIANG_MAI, KO_PHANGAN)).toBeGreaterThan(900);
    expect(CM_RADIUS_KM).toBeGreaterThan(30);
  });
});
