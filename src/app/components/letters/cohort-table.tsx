/**
 * @file cohort-table.tsx
 * @description P700: Per-story cohort table for the letter overview page.
 * Shows one row per delivery: Person · You → Them · per-point position · status link.
 */

import { Link } from 'react-router-dom';
import type { OverviewStory, OverviewDelivery, OverviewPrediction, OverviewRating, OverviewPointResponse } from '@/app/types';
import type { PositionType } from '@/app/types';
import { POSITION_SHORT_LABELS } from '@/app/utils/position-labels';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { analytics } from '@/lib/mixpanel';

function trackEntityLinkClick(linkType: 'recipient' | 'story_results') {
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
  letterId: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CohortTable({ story, deliveries, ratings, predictions, responses, letterId }: CohortTableProps) {
  // Build per-delivery lookup maps
  const ratingMap = new Map<string, number>();
  for (const r of ratings) {
    if (r.story_id === story.story_id) {
      ratingMap.set(r.delivery_id, r.listener_rating);
    }
  }

  // predictions may be delivery-specific (one-to-one) or null delivery_id (one-to-many shared)
  const predictionMap = new Map<string | null, number>();
  for (const p of predictions) {
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-3 pr-4 text-left font-medium text-muted-foreground">
              Recipient
            </th>
            <th scope="col" className="py-3 pr-4 text-left font-medium text-muted-foreground">
              You → Them
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
        <tbody>
          {deliveries.map((d) => {
            const prediction = getPrediction(d.delivery_id);
            const rating = getRating(d.delivery_id);
            const fullName = d.full_display_name || d.display_name;
            // responseMap keys are `${delivery_id}:${point_id}` across ALL stories,
            // but point IDs are globally unique UUIDs so cross-story collision is impossible.
            // TODO: if withdrawal state is ever added to letter_point_responses, filter it here.
            const hasAnyPositionInThisStory = story.points.some((p) =>
              responseMap.has(`${d.delivery_id}:${p.id}`)
            );
            return (
              <tr
                key={d.delivery_id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors sm:table-row block"
              >
                {/* Person — P843: avatar + full name (parity with rest of app) */}
                <td className="py-3 pr-4 sm:table-cell block" data-testid="cohort-recipient-cell">
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

                {/* You → Them */}
                <td className="py-3 pr-4 sm:table-cell block" data-label="You → Them">
                  {prediction !== undefined ? prediction : '?'}{' '}→{' '}
                  {rating !== undefined ? (
                    rating
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* Per-point positions */}
                {story.points.map((p) => {
                  const pos = getResponse(d.delivery_id, p.id);
                  return pos ? (
                    <td
                      key={p.id}
                      className="py-3 pr-4 sm:table-cell block"
                      data-label={p.text}
                    >
                      {POSITION_SHORT_LABELS[pos]}
                    </td>
                  ) : (
                    <td
                      key={p.id}
                      className="py-3 pr-4 sm:table-cell block text-muted-foreground"
                      data-label={p.text}
                      aria-label="No response"
                    >
                      <span aria-hidden="true">—</span>
                    </td>
                  );
                })}

                {/* End-of-row status */}
                {hasAnyPositionInThisStory ? (
                  <td className="py-3 sm:table-cell block">
                    <Link
                      to={`/letter/${letterId}/results?delivery=${d.delivery_id}&story=${story.story_id}`}
                      className="text-sm text-blue-500 hover:text-blue-600 whitespace-nowrap"
                      onClick={() => trackEntityLinkClick('story_results')}
                    >
                      [open results →]
                    </Link>
                  </td>
                ) : (
                  <td
                    className="py-3 sm:table-cell block text-muted-foreground whitespace-nowrap"
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
