/**
 * @file HikeSections.tsx
 * @description P1403 — the four Social Hike sections on the event detail page.
 * Each renders null when its data is absent, so every section hides independently
 * and an old hike with none of them renders today's page.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SeriesPhoto, SeriesReview } from '@/app/types';
import { safeLinkHref } from '../location-utils';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { PUBLIC_MEDIA_ORIGIN } from '@/lib/public-media';
import {
  HIKE_LABELS,
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

  // Founder 2026-10-04: AllTrails-style plain row under the photos — no box, no link, and no
  // "to trail" walk (the description already says it). Route type folds into the distance.
  const items: { key: string; label: string; value: string }[] = [];
  if (stats.distanceKm !== undefined) {
    items.push({ key: 'distance', label: stats.routeType ? `${L.distance} · ${stats.routeType.toLowerCase()}` : L.distance, value: formatDistanceKm(stats.distanceKm) });
  }
  if (stats.elevationGainM !== undefined) items.push({ key: 'elevation', label: L.elevation, value: `${Math.round(stats.elevationGainM)} m` });
  if (stats.walkTimeText) items.push({ key: 'walkTime', label: L.walkTime, value: stats.walkTimeText });
  if (stats.difficulty) items.push({ key: 'difficulty', label: L.difficulty, value: stats.difficulty });
  if (items.length === 0) return null;

  return (
    <dl data-testid="hike-stats" className="grid grid-cols-2 gap-y-2 mb-5 min-[360px]:flex min-[360px]:divide-x min-[360px]:divide-border">
      {items.map(({ key, label, value }) => (
        <div key={key} className="min-w-0 flex-1 min-[360px]:px-2 min-[360px]:first:pl-0 min-[360px]:last:pr-0" data-stat={key}>
          <dt className="text-xs text-muted-foreground whitespace-nowrap">{label}</dt>
          <dd className="text-sm sm:text-base leading-tight font-semibold text-foreground whitespace-nowrap">{value}</dd>
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
    <section data-testid="hike-photos" aria-label={HIKE_LABELS.photos} className="w-0 min-w-full mb-3">
      <h2 className="sr-only">{HIKE_LABELS.photos}</h2>
      <ul className="flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain pb-2">
        {shown.map(photo => (
          <li key={photo.id} className="snap-start flex-shrink-0 w-[62%] sm:w-56">
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
// Reviews — a swipeable row like the photos (founder 2026-10-04), never a growing list
// ---------------------------------------------------------------------------

export function SeriesReviews({ reviews }: { reviews: SeriesReview[] }) {
  if (reviews.length === 0) return null;
  const single = reviews.length === 1;
  return (
    <section data-testid="hike-reviews" aria-label={HIKE_LABELS.reviews} className="not-prose w-0 min-w-full mb-6">
      <h2 className="text-base font-semibold text-foreground mb-2">{HIKE_LABELS.reviews} <span className="font-normal text-muted-foreground">({reviews.length})</span></h2>
      <ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory overscroll-x-contain pb-2">
        {reviews.map(review => {
          // A linked profile wins over the legacy stored path; either must be a safe in-app path.
          const profilePath = safeInternalPath(
            review.author?.slug ? `/p/${review.author.slug}` : review.authorProfilePath,
          );
          const name = review.author?.name ?? review.authorName;
          return (
            <li
              key={review.id}
              data-testid="hike-review"
              className={`snap-start flex-shrink-0 flex flex-col justify-between rounded-lg border border-border p-3 ${single ? 'w-full' : 'w-[85%] sm:w-80'}`}
            >
              <blockquote className="text-sm text-foreground line-clamp-6">“{review.quote}”</blockquote>
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Route map — a pre-rendered terrain image (hike_details.route_map_url) when there is one;
// otherwise an SVG of the stored OSM geometry. No tiles load in the browser, no CSP change.
// ---------------------------------------------------------------------------

const MAP_W = 320;
const MAP_H = 200;

function osmLinkFor(geo: ReturnType<typeof extractRouteGeometry>): string | undefined {
  const p = geo?.start;
  return p ? `https://www.openstreetmap.org/?mlat=${p[1]}&mlon=${p[0]}#map=14/${p[1]}/${p[0]}` : undefined;
}

export function HikeRouteMap({ geojson, details, showHeading = true }: { geojson: unknown; details?: unknown; showHeading?: boolean }) {
  const geo = extractRouteGeometry(geojson);
  const stats = parseHikeDetails(details);
  const imageUrl = stats?.routeMapUrl && isAllowedPhotoUrl(stats.routeMapUrl) ? stats.routeMapUrl : undefined;
  if (!geo && !imageUrl) return null;
  const href = (stats?.routeMapLink && safeLinkHref(stats.routeMapLink)) || osmLinkFor(geo);

  let picture: ReactNode;
  if (imageUrl) {
    picture = <img src={imageUrl} alt="Map of the hike route" loading="lazy" decoding="async" className="!m-0 block w-full aspect-[16/9] object-cover" />;
  } else if (geo) {
    const projected = projectRoute(geo, MAP_W, MAP_H);
    picture = (
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full h-auto max-h-64 bg-muted/40" role="img" aria-label="Hike route line">
        {projected.paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#2563eb" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {projected.meet && (
          <g data-marker="meet">
            <circle cx={projected.meet.x} cy={projected.meet.y} r={5} fill="#ffffff" stroke="#1e293b" strokeWidth={2} />
            <text x={projected.meet.x + 9} y={projected.meet.y + 4} fontSize={13} fontWeight={600} fill="#1e293b" paintOrder="stroke" stroke="#ffffff" strokeWidth={3}>{HIKE_LABELS.mapMeet}</text>
          </g>
        )}
        {projected.start && (
          <g data-marker="start">
            <circle cx={projected.start.x} cy={projected.start.y} r={5} fill="#1e293b" />
            <text x={projected.start.x + 9} y={projected.start.y + 4} fontSize={13} fontWeight={600} fill="#1e293b" paintOrder="stroke" stroke="#ffffff" strokeWidth={3}>{HIKE_LABELS.mapStart}</text>
          </g>
        )}
      </svg>
    );
  }

  return (
    <section data-testid="hike-route" aria-label={HIKE_LABELS.route} className="not-prose mb-6">
      {showHeading && <h2 className="text-base font-semibold text-foreground mb-2">{HIKE_LABELS.route}</h2>}
      <figure className="!m-0 rounded-lg border border-border overflow-hidden">
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={HIKE_LABELS.openMap} className="block">{picture}</a>
          : picture}
        <figcaption className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border">
          <span>
            {imageUrl ? 'OpenTopoMap · ' : 'Route data '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline">
              {HIKE_LABELS.osmAttribution}
            </a>
          </span>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline whitespace-nowrap">
              {HIKE_LABELS.openMap}
            </a>
          )}
        </figcaption>
      </figure>
    </section>
  );
}
