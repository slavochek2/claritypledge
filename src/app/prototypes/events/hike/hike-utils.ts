/**
 * @file hike-utils.ts
 * @description P1403 — pure helpers for the Social Hike event layout: series selection,
 * validation of the `hike_details` snapshot, and projection of OSM route GeoJSON to SVG.
 *
 * Every parser here is defensive: the columns are jsonb written by a skill, so a malformed
 * value must make its section hide, never throw inside EventDetail.
 */
import type { Event } from '@/app/types';

/** The series key the hike layout is selected by. Never the title prefix (Resolved Decision 1). */
export const SOCIAL_HIKE_SERIES = 'social-hike';

/**
 * Section labels in one place.
 * [FOUNDER DECISION pending: section labels] — defaults until decided.
 */
export const HIKE_LABELS = {
  photos: 'Photos from past hikes',
  reviews: 'Reviews',
  route: 'Route',
  openMap: 'Open map',
  organizedBy: 'Organized by',
  learnMore: 'Learn more',
  osmAttribution: '© OpenStreetMap contributors',
  mapStart: 'Start',
  mapMeet: 'Cafe',
  stats: {
    distance: 'Distance',
    elevation: 'Climb',
    routeType: 'Route',
    walkTime: 'Time',
    difficulty: 'Level',
  },
} as const;

/** Founder 2026-10-04: "learn more" about the organiser. Only orgs with a public page get the link. */
export const ORG_LEARN_MORE_PATH: Record<string, string> = { cm: '/cm' };

export function isHikeLayout(event: Pick<Event, 'seriesSlug'> | null | undefined): boolean {
  return event?.seriesSlug === SOCIAL_HIKE_SERIES;
}

export interface HikeStats {
  distanceKm?: number;
  elevationGainM?: number;
  routeType?: string;
  walkTimeText?: string;
  difficulty?: string;
  meetWalkMinutes?: number;
  meetWalkUrl?: string;
  /** Pre-rendered terrain map (scripts/hike-route-map.mjs) on the public media host. */
  routeMapUrl?: string;
  /** Where "Open in OpenStreetMap" goes from the map. */
  routeMapLink?: string;
  /** Meeting place name, so the location row says where we meet instead of "View on Maps". */
  meetName?: string;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function str(v: unknown, max = 60): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : undefined;
}

/** Validates the raw `events.hike_details` object. Null when nothing displayable is present. */
export function parseHikeDetails(raw: unknown): HikeStats | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const stats: HikeStats = {
    distanceKm: num(r.distance_km),
    elevationGainM: num(r.elevation_gain_m),
    routeType: str(r.route_type),
    walkTimeText: str(r.walk_time_text),
    difficulty: str(r.difficulty),
    meetWalkMinutes: num(r.meet_walk_minutes),
    meetWalkUrl: str(r.meet_walk_url, 2000),
    routeMapUrl: str(r.route_map_url, 2000),
    routeMapLink: str(r.route_map_link, 2000),
    meetName: str(r.meet_name, 80),
  };
  // Any field counts: a details object holding only the map or the cafe name still drives
  // those sections (the stats row hides itself when it has no stat to show).
  const displayable = Object.values(stats).some(v => v !== undefined);
  return displayable ? stats : null;
}

export function formatDistanceKm(km: number): string {
  return `${km.toFixed(1).replace(/\.0$/, '')} km`;
}

// ---------------------------------------------------------------------------
// Route geometry
// ---------------------------------------------------------------------------

type Position = [number, number]; // [lon, lat]

export interface RouteGeometry {
  lines: Position[][];
  /** Optional named points: Point features with properties.kind = 'start' | 'meet'. */
  start?: Position;
  meet?: Position;
}

function isPosition(p: unknown): p is Position {
  return Array.isArray(p) && p.length >= 2
    && typeof p[0] === 'number' && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180
    && typeof p[1] === 'number' && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90;
}

function toLine(coords: unknown): Position[] | null {
  if (!Array.isArray(coords)) return null;
  const line = coords.filter(isPosition).map(p => [p[0], p[1]] as Position);
  return line.length >= 2 ? line : null;
}

/**
 * Extracts drawable lines from a GeoJSON object (Feature, FeatureCollection, LineString,
 * MultiLineString). Returns null when there is nothing to draw — the map section hides.
 */
export function extractRouteGeometry(geojson: unknown): RouteGeometry | null {
  const out: RouteGeometry = { lines: [] };

  const visitGeometry = (g: unknown, kind?: unknown) => {
    if (!g || typeof g !== 'object') return;
    const geom = g as { type?: unknown; coordinates?: unknown; geometries?: unknown };
    if (geom.type === 'LineString') {
      const l = toLine(geom.coordinates);
      if (l) out.lines.push(l);
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates) {
        const l = toLine(c);
        if (l) out.lines.push(l);
      }
    } else if (geom.type === 'Point' && isPosition(geom.coordinates)) {
      if (kind === 'start') out.start = [geom.coordinates[0], geom.coordinates[1]];
      if (kind === 'meet') out.meet = [geom.coordinates[0], geom.coordinates[1]];
    } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const sub of geom.geometries) visitGeometry(sub);
    }
  };

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: unknown; features?: unknown; geometry?: unknown; properties?: unknown };
    if (n.type === 'FeatureCollection' && Array.isArray(n.features)) {
      n.features.forEach(visit);
    } else if (n.type === 'Feature') {
      const props = (n.properties && typeof n.properties === 'object') ? n.properties as Record<string, unknown> : {};
      visitGeometry(n.geometry, props.kind);
    } else {
      visitGeometry(n);
    }
  };

  visit(geojson);
  if (out.lines.length === 0) return null;
  if (!out.start) out.start = out.lines[0]?.[0];
  return out;
}

export interface ProjectedRoute {
  paths: string[];
  start?: { x: number; y: number };
  meet?: { x: number; y: number };
}

/**
 * Equirectangular projection scaled by cos(mid-latitude) — accurate enough for a few-km
 * hike and needs no map library. Fits the route into width×height with `pad` margin,
 * preserving aspect ratio and centring the result.
 */
export function projectRoute(geo: RouteGeometry, width: number, height: number, pad = 12): ProjectedRoute {
  const all = [...geo.lines.flat(), ...(geo.meet ? [geo.meet] : []), ...(geo.start ? [geo.start] : [])];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of all) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;

  const pt = ([lon, lat]: Position) => ({
    x: Math.round((offX + (lon - minLon) * kx * scale) * 10) / 10,
    y: Math.round((offY + (maxLat - lat) * scale) * 10) / 10,
  });

  return {
    paths: geo.lines.map(line =>
      line.map((p, i) => {
        const { x, y } = pt(p);
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
      }).join(' ')
    ),
    start: geo.start ? pt(geo.start) : undefined,
    meet: geo.meet ? pt(geo.meet) : undefined,
  };
}

/** An in-app profile path ("/p/slug"). Rejects protocol-relative ("//host") and absolute URLs. */
export function safeInternalPath(path: string | undefined): string | undefined {
  return path && /^\/[^/\\]/.test(path) ? path : undefined;
}

/** P1403 amendment (founder 2026-10-04): the default event banner (h-48 md:h-64) is too short
 * for a real trail photo on desktop. Hike-layout events only; mobile keeps the default h-48
 * (~2:1 at 375px already reads as a photo). Non-hike events pass nothing → default height. */
export const HIKE_BANNER_HEIGHT_CLASS = 'h-48 md:h-[22rem] lg:h-[26rem]';

/**
 * Founder 2026-10-04: the map belongs inside the description's own route section, and reviews
 * right after it — not a second "Route" heading under the description. Splits the rendered
 * description HTML at the end of the first <h2> section whose heading mentions "route".
 * No such heading → matched: false, and the caller places map + reviews after the description.
 */
export function splitAfterRouteSection(html: string): { before: string; after: string; matched: boolean } {
  const heads = [...html.matchAll(/<h2[\s>]/g)].map(m => m.index ?? 0);
  for (let i = 0; i < heads.length; i++) {
    const close = html.indexOf('</h2>', heads[i]);
    const text = html.slice(heads[i], close).replace(/<[^>]*>/g, '');
    if (/route/i.test(text)) {
      const end = i + 1 < heads.length ? heads[i + 1] : html.length;
      return { before: html.slice(0, end), after: html.slice(end), matched: true };
    }
  }
  return { before: html, after: '', matched: false };
}
