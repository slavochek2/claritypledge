/**
 * @file letter-preview-page.tsx
 * @description P665/P673: Preview route — /letter/:docId/preview
 * Composes the same /live components as the reading page with previewMode.
 * Ratings are interactive but write to local state only (no DB calls).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import type { StoryPhase } from '@/app/hooks/useLetterReadingState';
import { snapshotToStoryWithPoints, pointSummaryToProtoPoint } from '@/app/utils/letter-snapshot-mapper';
import { docsService } from '@/app/data/docs-service';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import type { DocStory, LetterStorySnapshot, PositionType } from '@/app/types';
import type { Position } from '@/app/components/shared/prototype-types';

/**
 * Convert DocStory to LetterStorySnapshot shape.
 * Builds the enriched point_config that the server normally creates at seal time.
 */
function docStoryToSnapshot(docStory: DocStory): LetterStorySnapshot {
  return {
    letter_id: '',
    story_id: docStory.story_id,
    version_id: '',
    position: docStory.position,
    point_config: {
      storyText: docStory.story.content,
      storyTitle: docStory.story.title ?? '',
      points: docStory.story.points.map((p) => ({
        id: p.id,
        text: p.statement,
        authorPosition: p.userPosition ?? null,
      })),
    },
    visibility: 'published',
  };
}

export function LetterPreviewPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [snapshots, setSnapshots] = useState<LetterStorySnapshot[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');

  useEffect(() => {
    if (!docId) return;
    (async () => {
      try {
        const result = await docsService.getDoc(docId);
        if (!result) {
          setFetchState('not-found');
          return;
        }

        // Fetch author positions so point-revealed phase shows the Agrees/Disagrees badge
        const allPointIds = result.stories.flatMap(s => s.story.points.map(p => p.id));
        const positionsMap = (allPointIds.length > 0 && currentUser?.id)
          ? await pointsService.getMyPositionsForPoints(allPointIds, currentUser.id)
          : new Map();

        // Inject positions into stories before building snapshots
        const enrichedStories = result.stories.map(s => ({
          ...s,
          story: {
            ...s.story,
            points: s.story.points.map(p => ({
              ...p,
              userPosition: positionsMap.get(p.id)?.position ?? null,
            })),
          },
        }));

        setSnapshots(enrichedStories.map(docStoryToSnapshot));
        setFetchState('done');
      } catch {
        setFetchState('not-found');
      }
    })();
  }, [docId, currentUser?.id]);

  if (fetchState === 'loading') return <ClarityPageLoader />;

  if (fetchState === 'not-found' || snapshots.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Doc not found or has no stories.</p>
          <Button variant="link" onClick={() => navigate('/letters')}>
            Back to Letters
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Preview banner */}
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800 font-medium">
          THIS IS A PREVIEW — The receiver will see this
        </p>
      </div>

      <CertificatePageShell className="min-h-screen py-6 space-y-6">
        <FocusHeader
          onBack={() => navigate(docId ? `/letter/${docId}/compose` : '/docs')}
          label="Back to composition"
        />

        <LetterPreviewFlow
          docId={docId ?? ''}
          snapshots={snapshots}
        />
      </CertificatePageShell>
    </>
  );
}

// ============================================================================
// PROGRESS — calculates sub-fill fraction for current story segment
// ============================================================================

function calculateStoryProgress(
  phase: StoryPhase,
  currentPointIndex: number,
  visiblePointCount: number
): number {
  if (visiblePointCount >= 2) {
    const total = 4 + 2 * (visiblePointCount - 1);
    let screen: number;
    switch (phase) {
      case 'point-engage':             screen = 0; break;
      case 'point-revealed':           screen = 1; break;
      case 'story-rate':               screen = 2; break;
      case 'story-revealed':           screen = 3; break;
      case 'remaining-point-engage':   screen = 4 + (currentPointIndex - 1) * 2; break;
      case 'remaining-point-revealed': screen = 5 + (currentPointIndex - 1) * 2; break;
      case 'transition':               screen = total; break;
      default:                         screen = 0;
    }
    return Math.min(screen / total, 1);
  }
  if (visiblePointCount === 1) {
    const total = 4;
    let screen: number;
    switch (phase) {
      case 'story-rate':     screen = 0; break;
      case 'story-revealed': screen = 1; break;
      case 'point-engage':   screen = 2; break;
      case 'point-revealed': screen = 3; break;
      case 'transition':     screen = total; break;
      default:               screen = 0;
    }
    return Math.min(screen / total, 1);
  }
  // 0 visible points: story-rate(0) → story-revealed(0.5) → transition(1)
  switch (phase) {
    case 'story-rate':     return 0;
    case 'story-revealed': return 0.5;
    case 'transition':     return 1;
    default:               return 0;
  }
}

// ============================================================================
// PREVIEW FLOW — same /live component composition as reading page (P673)
// ============================================================================

function LetterPreviewFlow({
  docId,
  snapshots,
}: {
  docId: string;
  snapshots: LetterStorySnapshot[];
}) {
  const navigate = useNavigate();

  // Read author's predictions from localStorage (written by compose page during prediction walk)
  const [previewPredictions] = useState<Map<string, number> | undefined>(() => {
    try {
      const raw = localStorage.getItem(`clarity-preview-predictions-${docId}`);
      if (!raw) return undefined;
      return new Map(JSON.parse(raw) as [string, number][]);
    } catch {
      return undefined;
    }
  });

  const {
    state,
    currentPhase,
    submitPointPosition,
    submitStoryRating,
    advanceFromPointReveal,
    advanceFromStoryReveal,
    advanceFromRemainingPointReveal,
    nextStory,
    isSubmitting,
  } = useLetterReadingState(
    `preview-${docId}`,
    '',
    snapshots,
    undefined,
    true,  // previewMode
    previewPredictions
  );

  const { user: currentUser } = useAuth();
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);

  // Bug 7: Auto-advance through transition interstitial — skip it entirely
  useEffect(() => {
    if (currentPhase === 'transition') {
      nextStory();
    }
  }, [currentPhase, nextStory]);

  // Clean up localStorage predictions when preview completes
  useEffect(() => {
    if (state.isComplete) {
      localStorage.removeItem(`clarity-preview-predictions-${docId}`);
    }
  }, [state.isComplete, docId]);

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  // When preview completes, show a return-to-composition button
  if (state.isComplete) {
    return (
      <div className="text-center space-y-4 py-6">
        <p className="text-lg font-medium text-[#1A1A1A]">
          End of preview &#10022;
        </p>
        <p className="text-sm text-[#1A1A1A]/60">
          This is what the receiver will experience.
        </p>
        <Button
          onClick={() => navigate(`/letter/${docId}/compose`)}
          className="bg-[#0044CC] hover:bg-[#0033AA] text-white"
        >
          Back to composition
        </Button>
      </div>
    );
  }

  // Preview simulates the receiver's view — show sender's actual name, not "You"
  const senderName = currentUser?.name ?? 'Someone';
  const senderProfileOwner: PointProfileOwner = {
    id: currentUser?.id ?? '',
    name: senderName,
    avatarUrl: currentUser?.avatarUrl ?? undefined,
    avatarColor: currentUser?.avatarColor ?? undefined,
    hasPledged: currentUser?.hasPledged ?? false,
  };
  const storyWithPoints = snapshotToStoryWithPoints(currentSnapshot, {
    name: senderName,
    avatarUrl: currentUser?.avatarUrl ?? undefined,
    avatarColor: currentUser?.avatarColor ?? undefined,
    hasPledged: currentUser?.hasPledged ?? false,
  });
  const visiblePoints = storyWithPoints.points;
  const currentPoint = visiblePoints[currentStory.currentPointIndex];
  const gap = currentStory.rating !== null && currentStory.prediction !== null
    ? Math.abs(currentStory.rating - currentStory.prediction)
    : 0;
  const isOverconfident = currentStory.rating !== null && currentStory.prediction !== null
    ? currentStory.prediction > currentStory.rating
    : false;

  const storyProgress = calculateStoryProgress(currentPhase, currentStory.currentPointIndex, visiblePoints.length);

  return (
    <div className="max-w-md mx-auto w-full space-y-6">
      <LetterProgressBar
        currentIndex={state.currentStoryIndex}
        totalStories={snapshots.length}
        storyProgress={storyProgress}
      />

      {/* PHASE: point-engage — sealed-bid: author position hidden until receiver picks */}
      {currentPhase === 'point-engage' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint)}
            profileOwner={senderProfileOwner}
            liveSessionMode
            disableNavigation
            currentUserId="__receiver__"
            onPositionSelect={(pos) => { setSelectedPosition(pos as PositionType | null); }}
            selectedPosition={selectedPosition as Position}
          />
          <Button
            onClick={() => { if (selectedPosition) { submitPointPosition(currentPoint.id, selectedPosition); setSelectedPosition(null); } }}
            disabled={!selectedPosition || isSubmitting}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: point-revealed — author's position now visible via quote pattern */}
      {currentPhase === 'point-revealed' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint, (currentStory.positions[currentPoint.id] as PositionType) ?? null)}
            profileOwner={{ ...senderProfileOwner, position: currentPoint.profileSubjectPosition ?? undefined }}
            liveSessionMode
            disableNavigation
            disablePositionButtons
            currentUserId="__receiver__"
            selectedPosition={(currentStory.positions[currentPoint.id] as Position) ?? null}
          />
          <Button
            onClick={advanceFromPointReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: story-rate */}
      {currentPhase === 'story-rate' && (
        <>
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />
          <Drawer open dismissible={false}>
            <DrawerContent overlayClassName="bg-transparent">
              <DrawerHeader className="sr-only">
                <DrawerTitle>Rate this story</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-8 pt-4 space-y-4">
                <ComprehensionRatingCard
                  question="How well do you believe you understand this story?"
                  onSelect={(rating) => submitStoryRating(rating)}
                  disabled={isSubmitting || currentStory.rating !== null}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {/* PHASE: story-revealed */}
      {currentPhase === 'story-revealed' && (
        <div className="space-y-4">
          <JourneyToUnderstanding
            checkerRating={currentStory.prediction ?? undefined}
            responderRating={currentStory.rating ?? undefined}
            explainBackRatings={[]}
            isChecker={false}
            displayPartnerName={senderName}
            checkerName={senderName}
            compact
            className="w-full max-w-sm"
          />
          <GapBanner
            gap={gap}
            senderName={senderName}
            isOverconfident={isOverconfident}
            className="-mt-3"
          />
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />
          <Button
            onClick={advanceFromStoryReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: remaining-point-engage */}
      {currentPhase === 'remaining-point-engage' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint)}
            profileOwner={senderProfileOwner}
            liveSessionMode
            disableNavigation
            currentUserId="__receiver__"
            onPositionSelect={(pos) => { setSelectedPosition(pos as PositionType | null); }}
            selectedPosition={selectedPosition as Position}
          />
          <Button
            onClick={() => { if (selectedPosition) { submitPointPosition(currentPoint.id, selectedPosition); setSelectedPosition(null); } }}
            disabled={!selectedPosition || isSubmitting}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

      {/* PHASE: remaining-point-revealed */}
      {currentPhase === 'remaining-point-revealed' && currentPoint && (
        <div className="space-y-4">
          <PointCardWithLinks
            point={pointSummaryToProtoPoint(currentPoint, (currentStory.positions[currentPoint.id] as PositionType) ?? null)}
            profileOwner={{ ...senderProfileOwner, position: currentPoint.profileSubjectPosition ?? undefined }}
            liveSessionMode
            disableNavigation
            disablePositionButtons
            currentUserId="__receiver__"
            selectedPosition={(currentStory.positions[currentPoint.id] as Position) ?? null}
          />
          <Button
            onClick={advanceFromRemainingPointReveal}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Continue
          </Button>
        </div>
      )}

    </div>
  );
}
