/**
 * @file cohort-table.tsx
 * @description P700: Per-story breakdown for the letter overview page, grouped by WHAT WAS ASKED, not by
 * person, at every width (no matrix, so no truncated column headers and no point text repeated per person):
 *   1. the story rating first, one compact line per recipient (24px avatar, name, then
 *      "your guess 6 · their rating 8", or a plain "Waiting");
 *   2. then each point once, as a small subheading (full text, wrapping), with one line per recipient
 *      under it: name and Agree / Disagree / the position label, or "Waiting".
 * P1545: there is no per-row results link here; the person's row on the overview page opens their
 * whole-letter results, and the results walk reaches every story.
 * P1379: a one-to-many letter has no author prediction: the block is headed "Ratings", no "your guess"
 * anywhere, and above it sits a per-story summary (count · median · range). A story nobody has rated or
 * answered shows only its "No ratings yet" line.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { OverviewStory, OverviewDelivery, OverviewPrediction, OverviewRating, OverviewPointResponse } from '@/app/types';
import type { LetterMode, PositionType } from '@/app/types';
import { formatRatingSummary, letterUsesPredictions, summarizeRatings } from '@/app/utils/letter-prediction-policy';
import { POSITION_SHORT_LABELS } from '@/app/utils/position-labels';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { analytics } from '@/lib/mixpanel';

function trackEntityLinkClick(linkType: 'recipient') {
  analytics.track('letter_overview_entity_link_clicked', { link_type: linkType });
}

// ============================================================================
// TYPES
// ============================================================================

interface CohortTableProps {
  story: OverviewStory;
  deliveries: OverviewDelivery[];
  ratings: OverviewRating[];
  predictions: OverviewPrediction[];
  responses: OverviewPointResponse[];
  /** P1379: only 'one-to-one' shows predictions; omitted/null fails closed. */
  letterMode?: LetterMode | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CohortTable({ story, deliveries, ratings, predictions, responses, letterMode }: CohortTableProps) {
  const showsPredictions = letterUsesPredictions(letterMode);

  // Build per-delivery lookup maps
  const ratingMap = new Map<string, number>();
  for (const r of ratings) {
    if (r.story_id === story.story_id) {
      ratingMap.set(r.delivery_id, r.listener_rating);
    }
  }

  // predictions may be delivery-specific (one-to-one) or null delivery_id (one-to-many shared).
  // P1379: never read for one-to-many, even when an old letter still stores them.
  const predictionMap = new Map<string | null, number>();
  for (const p of showsPredictions ? predictions : []) {
    if (p.story_id === story.story_id) {
      predictionMap.set(p.delivery_id, p.prediction);
    }
  }

  // point_id + delivery_id → position
  const responseMap = new Map<string, PositionType>();
  for (const r of responses) {
    responseMap.set(`${r.delivery_id}:${r.point_id}`, r.position);
  }

  function getPrediction(deliveryId: string): number | undefined {
    // Delivery-specific first, then shared (null key)
    return predictionMap.get(deliveryId) ?? predictionMap.get(null) ?? undefined;
  }

  function getRating(deliveryId: string): number | undefined {
    return ratingMap.get(deliveryId);
  }

  function getResponse(deliveryId: string, pointId: string): PositionType | undefined {
    return responseMap.get(`${deliveryId}:${pointId}`);
  }

  // P1379: per-story aggregate over the rows this table renders.
  const summaryLine = showsPredictions
    ? null
    : formatRatingSummary(summarizeRatings(deliveries.map((d) => ratingMap.get(d.delivery_id))));

  // One-to-many with nothing in for this story: the summary line alone, no empty header or placeholder rows.
  const nothingIn = !showsPredictions && !deliveries.some(d =>
    ratingMap.has(d.delivery_id) || story.points.some(p => responseMap.has(`${d.delivery_id}:${p.id}`)));
  if (nothingIn && summaryLine !== null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="cohort-rating-summary">
        {summaryLine}
      </p>
    );
  }

  const isDone = (d: OverviewDelivery) => d.completed_at !== null;
  // A recipient who finished is never "Waiting" for a point they skipped; one who has not waits.
  const waitingOrNone = (d: OverviewDelivery) =>
    isDone(d)
      ? <span className="text-muted-foreground">No response</span>
      : <span className="text-muted-foreground">Waiting</span>;

  return (
    <div className="space-y-5" data-testid="cohort-breakdown">
      {summaryLine !== null && (
        <p className="text-sm text-muted-foreground -mb-2" data-testid="cohort-rating-summary">
          {summaryLine}
        </p>
      )}

      {/* 1. The story rating, one line per recipient. */}
      <section>
        <h3 className="text-sm font-medium text-foreground">{showsPredictions ? 'Story rating' : 'Ratings'}</h3>
        <ul className="mt-1">
          {deliveries.map((d) => {
            const rating = getRating(d.delivery_id);
            const fullName = d.full_display_name || d.display_name;
            // A recorded rating, a point answered, or a finished letter all mean they are no longer waiting;
            // a person who answered something but left no rating reads "No rating", not "Waiting".
            const hasAnyInThisStory =
              isDone(d) || rating !== undefined || story.points.some((p) => responseMap.has(`${d.delivery_id}:${p.id}`));
            let value: ReactNode;
            if (rating !== undefined) {
              if (showsPredictions) {
                const prediction = getPrediction(d.delivery_id);
                value = `your guess ${prediction !== undefined ? prediction : '?'} · their rating ${rating}`;
              } else {
                value = rating;
              }
            } else {
              value = <span className="text-muted-foreground">{hasAnyInThisStory ? 'No rating' : 'Waiting'}</span>;
            }
            return (
              <li key={d.delivery_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm">
                <div className="flex min-w-0 items-center gap-2 sm:w-48 sm:shrink-0" data-testid="cohort-recipient-cell">
                  {/* ml-1: the pledge ring draws outside the 24px photo. */}
                  <span className="ml-1 inline-flex shrink-0">
                    <PersonAvatar
                      person={{
                        name: fullName,
                        avatarUrl: d.avatar_url ?? undefined,
                        hasPledged: d.has_pledged,
                        slug: d.profile_slug ?? undefined,
                      }}
                      size="sm"
                      className="!h-6 !w-6 !text-[10px]"
                    />
                  </span>
                  {d.profile_slug ? (
                    <Link
                      to={`/p/${d.profile_slug}`}
                      className="min-w-0 truncate font-medium hover:underline"
                      title={fullName}
                      onClick={() => trackEntityLinkClick('recipient')}
                    >
                      {fullName}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate font-medium" title={fullName}>
                      {fullName}
                    </span>
                  )}
                </div>
                <span className="ml-auto text-right sm:ml-0 sm:text-left" data-testid="cohort-rating-cell">
                  {value}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 2. Each point once, then one line per recipient. */}
      {story.points.map((p) => (
        <section key={p.id}>
          <h3 className="text-sm font-medium text-foreground">
            <Link to={`/point/${p.id}`} className="hover:underline">
              {p.text}
            </Link>
            {p.hashtag && (
              <> <span aria-hidden="true" className="font-normal text-muted-foreground/70">#{p.hashtag}</span></>
            )}
          </h3>
          <ul className="mt-1">
            {deliveries.map((d) => {
              const pos = getResponse(d.delivery_id, p.id);
              const fullName = d.full_display_name || d.display_name;
              return (
                <li
                  key={d.delivery_id}
                  className="flex items-baseline justify-between gap-3 py-1 text-sm sm:justify-start"
                  data-testid="cohort-point-line"
                >
                  <span className="min-w-0 truncate sm:w-48 sm:shrink-0" title={fullName}>{fullName}</span>
                  <span className="shrink-0 text-right sm:text-left">
                    {pos ? POSITION_SHORT_LABELS[pos] : waitingOrNone(d)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
