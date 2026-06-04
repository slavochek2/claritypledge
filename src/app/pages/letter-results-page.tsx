/**
 * @file letter-results-page.tsx
 * @description P699: Letter results story walk — paginated per-story view showing
 * JourneyToUnderstanding, GapBanner, and full story card with position badges.
 * Serves both sender (/letter/:id/results) and receiver (/letter/:id/results?delivery=:id).
 *
 * Route: /letter/:id/results
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { useAuth } from '@/auth';
import { analytics } from '@/lib/mixpanel';
import { getLetterResults } from '@/app/data/letters-service';
import { pointsService } from '@/app/data/points-service';
import { StoryWalk } from '@/app/components/letters/story-walk';
import { LetterParticipantRow } from '@/app/components/letters/letter-participant-row';
import { FocusHeader } from '@/app/components/layout/focus-header';
import type { StoryWalkItem, LetterStorySnapshot, PositionType } from '@/app/types';
import type { LetterResultsData } from '@/app/data/letters-service';

// ============================================================================
// DATA MAPPER
// ============================================================================

function mapToStoryWalkItems(
  data: LetterResultsData,
  viewerPositions: Map<string, PositionType>
): StoryWalkItem[] {
  const predictionMap = new Map(data.predictions.map(p => [p.story_id, p.prediction]));
  const ratingMap = new Map(data.ratings.map(r => [r.story_id, r.listener_rating]));

  // Build per-story point-response maps: story_id → Map<point_id, PositionType>
  // letter_point_responses have point_id but not story_id directly — we get it from snapshot.point_config
  // Build point_id → story_id from snapshots
  const pointToStory = new Map<string, string>();
  for (const snap of data.snapshots) {
    const config = snap.point_config as { points?: Array<{ id: string }> };
    for (const pt of config.points ?? []) {
      pointToStory.set(pt.id, snap.story_id);
    }
  }

  // Group other-party responses by story (letter_point_responses = receiver answers for sender view,
  // or sender frozen answers for receiver view, per existing P699 logic)
  const positionsByStory = new Map<string, Map<string, PositionType>>();
  for (const resp of data.pointResponses) {
    const storyId = pointToStory.get(resp.point_id);
    if (!storyId) continue;
    if (!positionsByStory.has(storyId)) positionsByStory.set(storyId, new Map());
    positionsByStory.get(storyId)?.set(resp.point_id, resp.position);
  }

  // P705: Group viewer's own live positions by story (from point_positions)
  const viewerByStory = new Map<string, Map<string, PositionType>>();
  for (const [pointId, position] of viewerPositions) {
    const storyId = pointToStory.get(pointId);
    if (!storyId) continue;
    if (!viewerByStory.has(storyId)) viewerByStory.set(storyId, new Map());
    viewerByStory.get(storyId)?.set(pointId, position);
  }

  return data.snapshots
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(snap => {
      const prediction = predictionMap.get(snap.story_id);
      const rating = ratingMap.get(snap.story_id);
      const gap = prediction !== undefined && rating !== undefined
        ? Math.abs(prediction - rating)
        : undefined;
      const isOverconfident = prediction !== undefined && rating !== undefined
        ? prediction > rating
        : false;

      return {
        storyId: snap.story_id,
        position: snap.position,
        snapshot: snap as LetterStorySnapshot,
        prediction,
        rating,
        gap,
        isOverconfident,
        receiverPositions: positionsByStory.get(snap.story_id) ?? new Map(),
        viewerPositions: viewerByStory.get(snap.story_id) ?? new Map(),
      };
    });
}

// ============================================================================
// COMPONENT
// ============================================================================

type PageState = 'loading' | 'not-found' | 'ready';

export function LetterResultsPage() {
  const { id: letterId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const deliveryId = searchParams.get('delivery') ?? undefined;
  const storyId = searchParams.get('story') ?? undefined;
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [resultsData, setResultsData] = useState<LetterResultsData | null>(null);
  const [storyItems, setStoryItems] = useState<StoryWalkItem[]>([]);
  // P705: Viewer's live positions from point_positions (mutable on this page).
  // Only read via functional update (prev) in handleResultsPositionChange — hence _ prefix.
  const [_viewerPositions, setViewerPositions] = useState<Map<string, PositionType>>(new Map());

  // Auth gate
  useEffect(() => {
    if (sessionChecked && !isLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
    }
  }, [user, sessionChecked, isLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!letterId || !user) return;
    try {
      const result = await getLetterResults(letterId, deliveryId);
      if (!result) {
        setPageState('not-found');
        return;
      }

      // P705: Collect all point IDs in this letter for a single batched position fetch
      const allPointIds: string[] = [];
      for (const snap of result.snapshots) {
        const config = snap.point_config as { points?: Array<{ id: string }> };
        for (const pt of config.points ?? []) {
          allPointIds.push(pt.id);
        }
      }

      // Fetch viewer's live positions from point_positions (mirrors story-detail-page.tsx:728)
      const livePositionsMap = await pointsService.getMyPositionsForPoints(allPointIds, user.id);
      const livePositions = new Map<string, PositionType>(
        Array.from(livePositionsMap.entries()).map(([pid, pos]) => [pid, pos.position as PositionType])
      );

      setResultsData(result);
      setViewerPositions(livePositions);
      setStoryItems(mapToStoryWalkItems(result, livePositions));
      setPageState('ready');
      analytics.track('letter_results_viewed', {
        letter_id: letterId,
        perspective: result.perspective,
        story_count: result.snapshots.length,
      });
    } catch {
      setPageState('not-found');
    }
  }, [letterId, deliveryId, user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // P705: Refetch on visibilitychange — user may have updated their position in another tab
  useEffect(() => {
    if (!user) return;
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, fetchData]);

  // P705: Handle position changes on the results page — update point_positions and local state
  const handleResultsPositionChange = useCallback(async (pointId: string, position: PositionType | null) => {
    if (!user) return;
    try {
      if (position === null) {
        await pointsService.removePosition(pointId, user.id);
      } else {
        await pointsService.setPosition(pointId, user.id, position);
      }
      // Update local viewerPositions and rebuild storyItems so gap recomputes
      setViewerPositions(prev => {
        const next = new Map(prev);
        if (position === null) {
          next.delete(pointId);
        } else {
          next.set(pointId, position);
        }
        if (resultsData) {
          setStoryItems(mapToStoryWalkItems(resultsData, next));
        }
        return next;
      });
    } catch (err) {
      // Non-fatal: position update failed, UI stays in its current state
      console.error('[LetterResultsPage] position change failed:', err);
    }
  }, [user, resultsData]);

  if (!sessionChecked || pageState === 'loading') {
    return <ClarityPageLoader />;
  }

  if (pageState === 'not-found' || !resultsData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">Letter not found</h1>
        <p className="text-sm text-muted-foreground">
          This letter doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link to="/letters" className="text-sm text-[#0044CC] hover:underline">
          Back to Letters
        </Link>
      </div>
    );
  }

  if (storyItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">No stories found in this letter.</p>
        <Link to="/letters" className="text-sm text-[#0044CC] hover:underline">
          Back to Letters
        </Link>
      </div>
    );
  }

  // P725: identity row showing the OTHER participant in this letter exchange.
  // Sender viewing results → show receiver ("Letter to [Name]").
  // Receiver viewing results → show sender ("Letter from [Name]").
  // Public link letter with no deliveries (sender view) → placeholder.
  const otherParty = resultsData.perspective === 'sender'
    ? resultsData.receiverProfile
    : resultsData.senderProfile;
  const otherLabel = resultsData.perspective === 'sender' ? 'Letter to' : 'Letter from';

  return (
    <main aria-label="Letter Results" className="min-h-screen bg-background pt-4">
      <div className="max-w-sm mx-auto px-4 pb-3">
        {/* P888: persistent exit on every story of the walk — StoryWalk's own
            "Back to Letters" link renders only on the last story */}
        <FocusHeader
          onBack={() => navigate('/letters')}
          label="Back to Letters"
          aria-label="Back to Letters"
        />
        {otherParty ? (
          <LetterParticipantRow
            name={otherParty.name}
            slug={otherParty.slug}
            avatarUrl={otherParty.avatarUrl}
            avatarColor={otherParty.avatarColor}
            hasPledged={otherParty.hasPledged}
            roleLabel={otherLabel}
          />
        ) : (
          <div className="text-sm text-muted-foreground" aria-label="Public link letter">
            Public link letter
          </div>
        )}
      </div>
      <StoryWalk
        stories={storyItems}
        perspective={resultsData.perspective}
        senderProfile={resultsData.senderProfile}
        receiverProfile={resultsData.receiverProfile}
        senderName={resultsData.senderName}
        receiverName={resultsData.receiverName}
        onPositionSelect={handleResultsPositionChange}
        senderId={resultsData.senderProfile.id}
        receiverId={resultsData.receiverProfile?.id ?? null}
        deliveryId={deliveryId}
        initialIndex={
          storyId
            ? Math.max(0, storyItems.findIndex((s) => s.storyId === storyId))
            : undefined
        }
      />
    </main>
  );
}
