/**
 * @file letter-preview-page.tsx
 * @description P665/P673: Preview route — /letter/:docId/preview
 * Composes the same /live components as the reading page with previewMode.
 * Ratings are interactive but write to local state only (no DB calls).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, type NavigateFunction } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { LetterCover } from '@/app/components/letters/letter-cover';
import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import { countTotalPoints, estimateReadingMinutes } from '@/app/utils/letter-reading-utils';
import { docsService } from '@/app/data/docs-service';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import type { DocStory, LetterStorySnapshot } from '@/app/types';

function closePreview(navigate: NavigateFunction): void {
  if (window.history.length <= 1) window.close();
  else navigate(-1);
}

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
        visibility: p.visibility,
      })),
    },
    visibility: docStory.story.visibility ?? 'public',
  };
}

export function LetterPreviewPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [snapshots, setSnapshots] = useState<LetterStorySnapshot[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');
  const [viewState, setViewState] = useState<'cover' | 'reading'>('cover');

  // Purge any legacy preview reading state on every preview load (pre-fix hygiene).
  // Preview is ephemeral — stale entries from prior sessions must never resurface.
  // Key derivation: useLetterReadingState is called with deliveryId='preview-${docId}',
  // and the hook prefixes with 'clarity-letter-reading-' → 'clarity-letter-reading-preview-${docId}'.
  // If the hook's key prefix changes, update this key to match.
  useEffect(() => {
    if (!docId) return;
    try {
      const key = `clarity-letter-reading-preview-${docId}`;
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch { /* storage unavailable */ }
  }, [docId]);

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
        <Button
          size="sm"
          className="ml-auto gap-1 bg-blue-500 hover:bg-blue-600 text-white"
          onClick={() => closePreview(navigate)}
        >
          <X className="h-3.5 w-3.5" />
          Close preview
        </Button>
      </div>

      <CertificatePageShell className="min-h-screen py-6 space-y-6">

        {viewState === 'cover' ? (
          <LetterCover
            senderName={currentUser?.name ?? 'You'}
            receiverName="your recipient"
            storyCount={snapshots.length}
            pointCount={countTotalPoints(snapshots)}
            estimatedMinutes={estimateReadingMinutes(snapshots.length, countTotalPoints(snapshots))}
            mode="one-to-one"
            isAuthenticated
            onOpen={() => setViewState('reading')}
          />
        ) : (
          <LetterPreviewFlow
            docId={docId ?? ''}
            snapshots={snapshots}
          />
        )}
      </CertificatePageShell>
    </>
  );
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

  const readingState = useLetterReadingState(
    `preview-${docId}`,
    '',
    snapshots,
    undefined,
    true,  // previewMode
    previewPredictions
  );

  const { state, currentPhase, nextStory } = readingState;
  const { user: currentUser } = useAuth();

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

  // When preview completes, show a close-preview button
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
          onClick={() => closePreview(navigate)}
          className="bg-[#0044CC] hover:bg-[#0033AA] text-white"
        >
          Close preview
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

  return (
    <LetterFlowContent
      snapshots={snapshots}
      senderName={senderName}
      senderProfileOwner={senderProfileOwner}
      readingState={readingState}
      showFocusHeader={false}
      renderCompletion={() => null}
    />
  );
}
