/**
 * @file HikeSections.tsx
 * @description P1403 — the four Social Hike sections on the event detail page.
 * Each renders null when its data is absent, so every section hides independently
 * and an old hike with none of them renders today's page.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Route, Mountain, Repeat, Clock, Gauge, Footprints } from 'lucide-react';
import type { SeriesPhoto, SeriesReview } from '@/app/types';
import { safeLinkHref } from '../location-utils';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { PUBLIC_MEDIA_ORIGIN } from '@/lib/public-media';
import {
  HIKE_LABELS,
  REVIEWS_COLLAPSED_COUNT,
  extractRouteGeometry,
  formatDistanceKm,
  parseHikeDetails,
  projectRoute,
  safeInternalPath,
} from './hike-utils';

// ---------------------------------------------------------------------------
// Stats strip
// ---------------------------------------------------------------------------

export function HikeStatsStrip({ details }: { details: unknown }) {
  const stats = parseHikeDetails(details);
  if (!stats) return null;
  const L = HIKE_LABELS.stats;
  const meetHref = stats.meetWalkUrl ? safeLinkHref(stats.meetWalkUrl) : undefined;

  const items: { key: string; icon: typeof Route; label: string; value: ReactNode }[] = [];
  if (stats.distanceKm !== undefined) items.push({ key: 'distance', icon: Route, label: L.distance, value: formatDistanceKm(stats.distanceKm) });
  if (stats.elevationGainM !== undefined) items.push({ key: 'elevation', icon: Mountain, label: L.elevation, value: `${Math.round(stats.elevationGainM)} m` });
  if (stats.routeType) items.push({ key: 'routeType', icon: Repeat, label: L.routeType, value: stats.routeType });
  if (stats.walkTimeText) items.push({ key: 'walkTime', icon: Clock, label: L.walkTime, value: stats.walkTimeText });
  if (stats.difficulty) items.push({ key: 'difficulty', icon: Gauge, label: L.difficulty, value: stats.difficulty });
  if (stats.meetWalkMinutes !== undefined) {
    const text = `${Math.round(stats.meetWalkMinutes)} min walk`;
    items.push({
      key: 'meetWalk',
      icon: Footprints,
      label: L.meetWalk,
      value: meetHref
        ? <a href={meetHref} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{text}</a>
        : text,
    });
  }

  return (
    <dl
      data-testid="hike-stats"
      className="grid grid-cols-3 gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-1 mb-4 md:grid-cols-6 md:py-2"
    >
      {items.map(({ key, icon: Icon, label, value }) => (
        <div key={key} className="min-w-0" data-stat={key}>
          <dt className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground whitespace-nowrap">
            <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </dt>
          <dd className="text-sm leading-tight font-semibold text-foreground whitespace-nowrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// "From past hikes" photo strip
// ---------------------------------------------------------------------------

/** Only the public media host (P1385) — the one image host prod CSP allows for curated media. */
function isAllowedPhotoUrl(url: string): boolean {
  return url.startsWith(`${PUBLIC_MEDIA_ORIGIN}/`);
}

export function PastHikePhotos({ photos }: { photos: SeriesPhoto[] }) {
  const shown = photos.filter(p => isAllowedPhotoUrl(p.storageUrl));
  if (shown.length === 0) return null;
  return (
    // w-0 min-w-full: the section takes the column's width but contributes no
    // min-content, so the scroller can never widen the page (no horizontal page scroll).
    <section data-testid="hike-photos" aria-label={HIKE_LABELS.photos} className="w-0 min-w-full mb-6">
      <h2 className="text-sm font-semibold text-foreground mb-2">{HIKE_LABELS.photos}</h2>
      <ul className="flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain pb-2">
        {shown.map(photo => (
          <li key={photo.id} className="snap-start flex-shrink-0 w-[72%] sm:w-56">
            <figure>
              {/* aspect box reserves height before the image loads — no layout jump */}
              <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
                <img src={photo.storageUrl} alt={photo.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </div>
              {photo.credit && (
                <figcaption className="mt-1 text-[11px] text-muted-foreground truncate">{photo.credit}</figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reviews — compact: first REVIEWS_COLLAPSED_COUNT, then "Show more"
// ---------------------------------------------------------------------------

export function SeriesReviews({ reviews }: { reviews: SeriesReview[] }) {
  const [expanded, setExpanded] = useState(false);
  if (reviews.length === 0) return null;
  const hidden = Math.max(0, reviews.length - REVIEWS_COLLAPSED_COUNT);
  const shown = expanded ? reviews : reviews.slice(0, REVIEWS_COLLAPSED_COUNT);

  return (
    <section data-testid="hike-reviews" aria-label={HIKE_LABELS.reviews} className="mb-6">
      <h2 className="text-sm font-semibold text-foreground mb-2">{HIKE_LABELS.reviews} <span className="font-normal text-muted-foreground">({reviews.length})</span></h2>
      <ul className="space-y-3">
        {shown.map(review => {
          // A linked profile wins over the legacy stored path; either must be a safe in-app path.
          const profilePath = safeInternalPath(
            review.author?.slug ? `/p/${review.author.slug}` : review.authorProfilePath,
          );
          const name = review.author?.name ?? review.authorName;
          return (
            <li key={review.id} data-testid="hike-review" className="rounded-lg border border-border p-3">
              <blockquote className={`text-sm text-foreground ${expanded ? '' : 'line-clamp-4'}`}>
                “{review.quote}”
              </blockquote>
              {/* Founder 2026-10-04: the reviewer is a person — their photo (pledge ring when they
                  pledged) and a plain name link, never a button or chip. sm = 40px. */}
              <div className="mt-2 flex items-center gap-2" data-testid="hike-review-author">
                {review.author && <PersonAvatar person={review.author} size="sm" />}
                <span className="text-sm text-muted-foreground">
                  {profilePath
                    ? <Link to={profilePath} className="font-medium text-foreground underline underline-offset-2">{name}</Link>
                    : name}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="mt-2 min-h-10 text-sm font-medium text-blue-600 hover:underline"
        >
          {expanded ? HIKE_LABELS.showFewerReviews : HIKE_LABELS.showMoreReviews(hidden)}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Route map — SVG from stored OSM geometry. No tiles, no map library, no CSP change.
// ---------------------------------------------------------------------------

const MAP_W = 320;
const MAP_H = 200;

export function HikeRouteMap({ geojson }: { geojson: unknown }) {
  const geo = extractRouteGeometry(geojson);
  if (!geo) return null;
  const projected = projectRoute(geo, MAP_W, MAP_H);

  return (
    <section data-testid="hike-route" aria-label={HIKE_LABELS.route} className="mb-6">
      <h2 className="text-sm font-semibold text-foreground mb-2">{HIKE_LABELS.route}</h2>
      <figure className="rounded-lg border border-border bg-muted/40 overflow-hidden">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="block w-full h-auto max-h-64"
          role="img"
          aria-label="Hike route line"
        >
          {projected.paths.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#2563eb" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {projected.meet && (
            <g data-marker="meet">
              <circle cx={projected.meet.x} cy={projected.meet.y} r={5} fill="#ffffff" stroke="#1e293b" strokeWidth={2} />
              <text x={projected.meet.x + 9} y={projected.meet.y + 4} fontSize={13} fontWeight={600} fill="#1e293b" paintOrder="stroke" stroke="#ffffff" strokeWidth={3}>{HIKE_LABELS.mapMeet}</text>
              <title>Meeting point</title>
            </g>
          )}
          {projected.start && (
            <g data-marker="start">
              <circle cx={projected.start.x} cy={projected.start.y} r={5} fill="#1e293b" />
              <text x={projected.start.x + 9} y={projected.start.y + 4} fontSize={13} fontWeight={600} fill="#1e293b" paintOrder="stroke" stroke="#ffffff" strokeWidth={3}>{HIKE_LABELS.mapStart}</text>
              <title>Trail start</title>
            </g>
          )}
        </svg>
        <figcaption className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border">
          Route data{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline">
            {HIKE_LABELS.osmAttribution}
          </a>
        </figcaption>
      </figure>
    </section>
  );
}
