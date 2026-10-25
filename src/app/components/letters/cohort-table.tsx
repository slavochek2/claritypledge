/**
 * @file cohort-table.tsx
 * @description P700: Per-story cohort table for the letter overview page.
 * Shows one row per delivery: Person · You → Them · per-point position · "Waiting" while nothing is in.
 * P1545: there is no per-row results link here; the person's row on the overview page opens their
 * whole-letter results, and the results walk reaches every story.
 * P1379: a one-to-many letter drops the "You → Them" prediction column. Above the rows
 * it shows a per-story summary (count · median · range), and each row shows the
 * reader's own rating under "Their rating". No gap anywhere.
 * Phones (< 640px): the matrix becomes a stacked list. Same markup, restyled: per recipient one block
 * (name, then one full-width "label ... value" line per column, the label read from each cell's
 * data-label); the header row is hidden. A story nobody has rated or answered shows only its
 * "No ratings yet" line.
 */

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

/**
 * A value cell. Phones: a full-width "label ... value" line, the label drawn from the cell's data-label;
 * from 640px: an ordinary table cell with no label (the header row carries it).
 */
const LINE_CELL =
  'flex items-baseline justify-between gap-4 py-1.5 text-right before:min-w-0 before:text-left before:text-muted-foreground before:content-[attr(data-label)] sm:table-cell sm:py-3 sm:pr-4 sm:text-left sm:before:content-none';

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

  return (
    <div className="sm:overflow-x-auto">
      {summaryLine !== null && (
        <p className="text-sm text-muted-foreground mb-2" data-testid="cohort-rating-summary">
          {summaryLine}
        </p>
      )}
      <table className="block w-full text-sm sm:table">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-border">
            <th scope="col" className="py-3 pr-4 text-left font-medium text-muted-foreground">
              Recipient
            </th>
            <th scope="col" className="py-3 pr-4 text-left font-medium text-muted-foreground">
              {showsPredictions ? 'You → Them' : 'Their rating'}
            </th>
            {story.points.map((p) => (
              <th
                key={p.id}
                scope="col"
                className="py-3 pr-4 text-left font-medium text-muted-foreground max-w-[120px] truncate"
                title={p.hashtag ? `${p.text} #${p.hashtag}` : p.text}
              >
                <Link to={`/point/${p.id}`} className="hover:underline">
                  {p.text}
                </Link>{p.hashtag && (
                  <> <span aria-hidden="true" className="text-muted-foreground/70">#{p.hashtag}</span></>
                )}
              </th>
            ))}
            <th scope="col" className="py-3 text-left font-medium text-muted-foreground">
              {/* status column — no header text */}
            </th>
          </tr>
        </thead>
        <tbody className="block sm:table-row-group">
          {deliveries.map((d) => {
            const prediction = getPrediction(d.delivery_id);
            const rating = getRating(d.delivery_id);
            const fullName = d.full_display_name || d.display_name;
            // responseMap keys are `${delivery_id}:${point_id}` across ALL stories,
            // but point IDs are globally unique UUIDs so cross-story collision is impossible.
            // TODO: if withdrawal state is ever added to letter_point_responses, filter it here.
            // A recipient who finished is never "Waiting", even when this story has no points
            // (nothing to position, so there is no position to find). A recorded rating for the story
            // is a response too: the row never reads "Waiting" beside a rating.
            const hasAnyPositionInThisStory =
              d.completed_at !== null ||
              rating !== undefined ||
              story.points.some((p) => responseMap.has(`${d.delivery_id}:${p.id}`));
            return (
              <tr
                key={d.delivery_id}
                className="block border-b border-border/50 py-2 transition-colors hover:bg-muted/30 sm:table-row sm:py-0"
              >
                {/* Person — P843: avatar + full name (parity with rest of app) */}
                <td className="block py-1.5 sm:table-cell sm:py-3 sm:pr-4" data-testid="cohort-recipient-cell">
                  <div className="flex items-center gap-2 min-w-0">
                    <PersonAvatar
                      person={{
                        name: fullName,
                        avatarUrl: d.avatar_url ?? undefined,
                        hasPledged: d.has_pledged,
                        slug: d.profile_slug ?? undefined,
                      }}
                      size="sm"
                    />
                    {d.profile_slug ? (
                      <Link
                        to={`/p/${d.profile_slug}`}
                        className="font-medium hover:underline truncate"
                        title={fullName}
                        onClick={() => trackEntityLinkClick('recipient')}
                      >
                        {fullName}
                      </Link>
                    ) : (
                      <span className="font-medium truncate" title={fullName}>
                        {fullName}
                      </span>
                    )}
                  </div>
                </td>

                {/* You → Them (one-to-one) / Their rating (one-to-many, P1379) */}
                {showsPredictions ? (
                  <td className={LINE_CELL} data-label="You → Them">
                    {/* One element, so the phone line's flex layout keeps "6 → —" together on the right. */}
                    <span>
                      {prediction !== undefined ? prediction : '?'}{' '}→{' '}
                      {rating !== undefined ? (
                        rating
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </td>
                ) : (
                  <td className={LINE_CELL} data-label="Their rating" data-testid="cohort-rating-cell">
                    {rating !== undefined ? rating : <span className="text-muted-foreground">—</span>}
                  </td>
                )}

                {/* Per-point positions */}
                {story.points.map((p) => {
                  const pos = getResponse(d.delivery_id, p.id);
                  return pos ? (
                    <td
                      key={p.id}
                      className={LINE_CELL}
                      data-label={p.text}
                    >
                      {POSITION_SHORT_LABELS[pos]}
                    </td>
                  ) : (
                    <td
                      key={p.id}
                      className={`${LINE_CELL} text-muted-foreground`}
                      data-label={p.text}
                      aria-label="No response"
                    >
                      <span aria-hidden="true">—</span>
                    </td>
                  );
                })}

                {/* End-of-row status: only while nothing is in. */}
                {!hasAnyPositionInThisStory && (
                  <td
                    className="block py-1.5 text-muted-foreground sm:table-cell sm:whitespace-nowrap sm:py-3"
                    aria-label="Waiting for response"
                  >
                    · Waiting
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
