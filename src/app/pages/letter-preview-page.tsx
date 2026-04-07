/**
 * @file letter-preview-page.tsx
 * @description P665: Preview route — /letter/:docId/preview
 * Reuses LetterStoryReader + useLetterReadingState in preview mode
 * so the sender sees the exact same components, layout, and pacing the receiver will see.
 * Ratings are interactive but write to local state only (no DB calls).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterStoryReader } from '@/app/components/letters/letter-story-reader';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import { docsService } from '@/app/data/docs-service';
import type { DocStory, LetterStorySnapshot } from '@/app/types';

/**
 * Convert DocStory to LetterStorySnapshot shape for LetterStoryReader.
 * Builds the enriched point_config that the server normally creates at seal time
 * (P642: storyText, storyTitle, points[{id, text, authorPosition}]).
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
        setSnapshots(result.stories.map(docStoryToSnapshot));
        setFetchState('done');
      } catch {
        setFetchState('not-found');
      }
    })();
  }, [docId]);

  if (fetchState === 'loading') return <ClarityPageLoader />;

  if (fetchState === 'not-found' || snapshots.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Doc not found or has no stories.</p>
          <Button variant="link" onClick={() => navigate('/docs')}>
            Back to Docs
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

      <CertificatePageShell parchment className="py-6 space-y-6">
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
// PREVIEW FLOW (inner component using the state machine hook in preview mode)
// ============================================================================

function LetterPreviewFlow({
  docId,
  snapshots,
}: {
  docId: string;
  snapshots: LetterStorySnapshot[];
}) {
  const navigate = useNavigate();

  const {
    state,
    currentPhase,
    submitPosition,
    submitStoryRating,
    advanceToStory,
    advanceToRate,
    advanceRemainingPoint,
    nextStory,
    isSubmitting,
  } = useLetterReadingState(
    `preview-${docId}`, // synthetic delivery ID for sessionStorage isolation
    '',                  // no sender ID needed in preview
    snapshots,
    undefined,           // no token
    true                 // previewMode
  );

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  // When preview completes, show a return-to-composition button
  if (state.isComplete) {
    return (
      <div className="text-center space-y-4 py-6">
        <p className="text-lg font-medium text-[#1A1A1A]">
          End of preview ✦
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

  return (
    <div className="space-y-6">
      <LetterProgressBar
        currentIndex={state.currentStoryIndex}
        totalStories={snapshots.length}
      />

      <p className="text-xs text-[#1A1A1A]/40 uppercase tracking-wide">
        Story {state.currentStoryIndex + 1} of {snapshots.length}
      </p>

      <LetterStoryReader
        snapshot={currentSnapshot}
        storyIndex={state.currentStoryIndex}
        totalStories={snapshots.length}
        phase={currentPhase}
        rating={currentStory.rating}
        prediction={currentStory.prediction}
        positions={currentStory.positions}
        remainingPointIndex={currentStory.remainingPointIndex}
        senderName="You"
        isAuthenticated={true}
        isSubmitting={isSubmitting}
        previewMode
        onPositionSubmit={(pointId, position) => submitPosition(pointId, position)}
        onRatingSubmit={(rating) => submitStoryRating(rating)}
        onAdvanceToStory={advanceToStory}
        onAdvanceToRate={advanceToRate}
        onAdvanceRemainingPoint={advanceRemainingPoint}
        onNextStory={nextStory}
      />
    </div>
  );
}
