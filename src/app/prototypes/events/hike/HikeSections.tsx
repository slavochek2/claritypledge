/**
 * @file HikeSections.tsx
 * @description P1403 — the four Social Hike sections on the event detail page.
 * Each renders null when its data is absent, so every section hides independently
 * and an old hike with none of them renders today's page.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, MoveHorizontal, Map as MapIcon } from 'lucide-react';
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

  // Founder 2026-10-04 ("nice!" on AllTrails): big number, small unit, label underneath; route
  // type as an icon. No box, no link, no "to trail" walk (the description already says it).
  const items: { key: string; label: string; value: ReactNode }[] = [];
  const num = (n: string, unit: string) => <>{n}<span className="ml-0.5 text-sm font-medium">{unit}</span></>;
  if (stats.distanceKm !== undefined) items.push({ key: 'distance', label: L.distance, value: num(formatDistanceKm(stats.distanceKm).replace(/ km$/, ''), 'km') });
  if (stats.elevationGainM !== undefined) items.push({ key: 'elevation', label: L.elevation, value: num(String(Math.round(stats.elevationGainM)), 'm') });
  if (stats.walkTimeText) {
    const m = stats.walkTimeText.match(/^(.*?)\s*(h|hr|hrs|hours?)$/i);
    items.push({ key: 'walkTime', label: L.walkTime, value: m?.[1] ? num(m[1], 'h') : stats.walkTimeText });
  }
  if (stats.routeType) {
    const Icon = /loop/i.test(stats.routeType) ? Repeat : MoveHorizontal;
    items.push({ key: 'routeType', label: stats.routeType, value: <Icon className="h-7 w-7" aria-hidden="true" /> });
  }
  // Difficulty sits on the line under the title (like AllTrails' "Hard · place"), not here.
  if (items.length === 0) return null;

  return (
    <dl data-testid="hike-stats" className="grid grid-cols-4 gap-x-3 mb-5 sm:flex sm:gap-x-10">
      {items.map(({ key, label, value }) => (
        <div key={key} className="min-w-0 flex flex-col-reverse" data-stat={key}>
          <dt className="text-xs text-muted-foreground whitespace-nowrap">{label}</dt>
          <dd className="h-8 flex items-end text-xl min-[400px]:text-2xl leading-none font-bold tracking-tight text-foreground whitespace-nowrap">{value}</dd>
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

export function PastHikePhotos({ photos, mapUrl, onOpenImage }: { photos: SeriesPhoto[]; mapUrl?: string; onOpenImage?: (src: string, alt: string) => void }) {
  const shown = photos.filter(p => isAllowedPhotoUrl(p.storageUrl));
  if (shown.length === 0) return null;
  return (
    // w-0 min-w-full: the section takes the column's width but contributes no
    // min-content, so the scroller can never widen the page (no horizontal page scroll).
    <section data-testid="hike-photos" aria-label={HIKE_LABELS.photos} className="w-0 min-w-full mb-3">
      <h2 className="sr-only">{HIKE_LABELS.photos}</h2>
      <ul className="flex gap-2 overflow-x-auto snap-x snap-mandatory overscroll-x-contain pb-2">
        {shown.map((photo, i) => [
          // Founder 2026-10-04: like AllTrails, the route map sits in the gallery, second tile.
          i === 1 && mapUrl && isAllowedPhotoUrl(mapUrl) && (
            <li key="route-map" className="snap-start flex-shrink-0 w-[62%] sm:w-56">
              <a href="#hike-route" className="relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
                <img src={mapUrl} alt="Route map" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm">
                  <MapIcon className="h-3.5 w-3.5" aria-hidden="true" /> {HIKE_LABELS.route}
                </span>
              </a>
            </li>
          ),
          <li key={photo.id} className="snap-start flex-shrink-0 w-[62%] sm:w-56">
            <figure>
              {/* aspect box reserves height before the image loads — no layout jump */}
              {/* Founder 2026-10-04: tap a photo to see it big. */}
              <button
                type="button"
                onClick={() => onOpenImage?.(photo.storageUrl, photo.alt)}
                aria-label={`View photo: ${photo.alt}`}
                className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted cursor-zoom-in"
              >
                <img src={photo.storageUrl} alt={photo.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </button>
              {photo.credit && (
                <figcaption className="mt-1 text-[11px] text-muted-foreground truncate">{photo.credit}</figcaption>
              )}
            </figure>
          </li>,
        ])}
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
              <figure>
                <span aria-hidden="true" className="block h-6 font-serif text-4xl leading-none text-blue-600/40">“</span>
                <blockquote className={`text-[15px] leading-relaxed text-foreground ${single ? "" : "line-clamp-6"}`}>{review.quote}</blockquote>
              </figure>
              {/* Founder 2026-10-04: the reviewer is a person — their photo (pledge ring when they
                  pledged) and a plain name link, never a button or chip. sm = 40px. */}
              <div className="mt-3 flex items-center gap-2" data-testid="hike-review-author">
                {review.author && <PersonAvatar person={review.author} size="sm" />}
                <span className="text-sm">
                  {profilePath
                    ? <Link to={profilePath} className="font-semibold text-foreground hover:underline underline-offset-2">{name}</Link>
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

export function HikeRouteMap({ geojson, details, showHeading = true, onOpenImage }: { geojson: unknown; details?: unknown; showHeading?: boolean; onOpenImage?: (src: string, alt: string) => void }) {
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
    <section id="hike-route" data-testid="hike-route" aria-label={HIKE_LABELS.route} className="not-prose mb-6">
      {showHeading && <h2 className="text-base font-semibold text-foreground mb-2">{HIKE_LABELS.route}</h2>}
      <figure className="!m-0 rounded-lg border border-border overflow-hidden">
        {imageUrl && onOpenImage
          ? <button type="button" onClick={() => onOpenImage(imageUrl, 'Map of the hike route')} aria-label="View the route map full size" className="block w-full cursor-zoom-in">{picture}</button>
          : href
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
