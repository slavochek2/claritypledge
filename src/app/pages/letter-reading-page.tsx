/**
 * @file letter-reading-page.tsx
 * @description P581 Task 7: Letter reading page with token validation + reading flow.
 * Route: /letter/:id (id = deliveryId) with optional ?token=xxx for 1-to-1.
 *
 * PageState machine:
 * - loading: validating token / fetching data
 * - invalid: token expired/invalid or delivery not found
 * - unauthenticated: valid token but user not logged in (1-to-many)
 * - wrong_user: letter addressed to someone else
 * - expired: token or delivery expired
 * - ready: show cover → reading flow
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { LetterCover } from '@/app/components/letters/letter-cover';
import { LetterStoryReader } from '@/app/components/letters/letter-story-reader';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { LetterCompletionSummary } from '@/app/components/letters/letter-completion-summary';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import {
  getLetterForReading,
  getLetterForReadingByToken,
  claimLetterDelivery,
  updateDeliveryStatus,
  updateDeliveryStatusByToken,
} from '@/app/data/letters-service';
import { analytics } from '@/lib/mixpanel';
import type { ClarityLetter, LetterStorySnapshot, LetterDelivery } from '@/app/types';

// ============================================================================
// TYPES
// ============================================================================

type PageState = 'loading' | 'invalid' | 'unauthenticated' | 'wrong_user' | 'expired' | 'ready';

type ViewState = 'cover' | 'reading' | 'complete';

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterReadingPage() {
  const { id: deliveryId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { user: currentUser, sessionChecked } = useAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [viewState, setViewState] = useState<ViewState>('cover');

  const [letter, setLetter] = useState<ClarityLetter | null>(null);
  const [snapshots, setSnapshots] = useState<LetterStorySnapshot[]>([]);
  const [delivery, setDelivery] = useState<LetterDelivery | null>(null);
  const [senderName, setSenderName] = useState('Someone');

  // Load data on mount
  useEffect(() => {
    if (!sessionChecked || !deliveryId) return;

    const load = async () => {
      setPageState('loading');

      try {
        if (token) {
          // Token-based access (1-to-1) — single RPC bypasses RLS for anon
          const readData = await getLetterForReadingByToken(token);
          if (!readData) {
            setPageState('invalid');
            return;
          }

          // Check expiry
          if (readData.delivery?.access_token_expires_at) {
            const expiresAt = new Date(readData.delivery.access_token_expires_at);
            if (expiresAt < new Date()) {
              setPageState('expired');
              return;
            }
          }

          // Claim delivery if authenticated (sets receiver_profile_id for write RLS)
          if (currentUser) {
            await claimLetterDelivery(token).catch(() => {});
          }

          setLetter(readData.letter);
          setSnapshots(readData.snapshots);
          setDelivery(readData.delivery);
          setSenderName(readData.letter.sender_id); // Will be resolved by profile lookup
          setPageState('ready');
        } else {
          // Direct access (authenticated)
          if (!currentUser) {
            setPageState('unauthenticated');
            return;
          }

          const readData = await getLetterForReading(
            '', // No letter_id — look up by delivery
            deliveryId
          );

          if (!readData) {
            setPageState('invalid');
            return;
          }

          // Wrong user check
          if (
            readData.delivery?.receiver_profile_id &&
            readData.delivery.receiver_profile_id !== currentUser.id
          ) {
            setPageState('wrong_user');
            return;
          }

          setLetter(readData.letter);
          setSnapshots(readData.snapshots);
          setDelivery(readData.delivery);
          setSenderName(readData.letter.sender_id);
          setPageState('ready');
        }
      } catch (err) {
        console.error('[letter-reading] Load error:', err);
        toast.error('Failed to load letter. Please check your connection and try again.');
        setPageState('invalid');
      }
    };

    load();
  }, [sessionChecked, deliveryId, token, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Error states ----

  if (pageState === 'loading') {
    return <ClarityPageLoader />;
  }

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          Letter not found
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          This link may be invalid or the letter may no longer be available.
        </p>
        <Link
          to="/"
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Return home
        </Link>
      </div>
    );
  }

  if (pageState === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This letter has expired
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          This letter has expired. Contact {senderName !== 'Someone' ? senderName : 'the sender'} for a new one.
        </p>
        <Link
          to="/"
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Return home
        </Link>
      </div>
    );
  }

  if (pageState === 'wrong_user') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          This letter wasn&apos;t sent to you
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          This letter is addressed to a different person.
        </p>
        <Link
          to="/docs"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md mt-2 min-h-[40px]"
        >
          Back to docs
        </Link>
      </div>
    );
  }

  if (pageState === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-[#1A1A1A]">
          Sign in to read this letter
        </h1>
        <p className="text-sm text-[#1A1A1A]/60 max-w-sm">
          You need to be signed in to access this letter.
        </p>
        <Link
          to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
          className="text-sm text-[#0044CC] hover:underline mt-2"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // ---- Ready state ----

  if (!letter || !delivery || snapshots.length === 0) {
    return <ClarityPageLoader />;
  }

  return (
    <CertificatePageShell parchment className="py-6 space-y-6">
      {viewState === 'cover' && (
        <LetterCover
          senderName={senderName}
          receiverName={currentUser?.name ?? delivery.receiver_email ?? 'you'}
          storyCount={snapshots.length}
          estimatedMinutes={Math.max(1, Math.ceil(snapshots.length * 2))}
          mode={letter.mode}
          onOpen={() => {
            if (token) {
              updateDeliveryStatusByToken(token, 'opened').catch(() => {});
            } else {
              updateDeliveryStatus(delivery.id, 'opened').catch(() => {});
            }
            setViewState('reading');
            analytics.track('letter_opened', {
              delivery_id: delivery.id,
              letter_id: letter.id,
              mode: letter.mode,
              story_count: snapshots.length,
            });
          }}
        />
      )}

      {viewState === 'reading' && (
        <LetterReadingFlow
          letter={letter}
          snapshots={snapshots}
          delivery={delivery}
          senderName={senderName}
          token={token || undefined}
          isAuthenticated={!!currentUser}
          onComplete={() => setViewState('complete')}
        />
      )}

      {viewState === 'complete' && (
        <LetterCompletionSummary
          deliveryId={delivery.id}
          letterData={{
            snapshots,
            senderName,
            mode: letter.mode,
          }}
          isAuthenticated={!!currentUser}
          senderName={senderName}
        />
      )}
    </CertificatePageShell>
  );
}

// ============================================================================
// READING FLOW (inner component using the state machine hook)
// ============================================================================

function LetterReadingFlow({
  letter,
  snapshots,
  delivery,
  senderName,
  token,
  isAuthenticated,
  onComplete,
}: {
  letter: ClarityLetter;
  snapshots: LetterStorySnapshot[];
  delivery: LetterDelivery;
  senderName: string;
  token?: string;
  isAuthenticated: boolean;
  onComplete: () => void;
}) {
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
  } = useLetterReadingState(delivery.id, letter.sender_id, snapshots, token);

  // When the state machine reports complete, notify parent
  useEffect(() => {
    if (state.isComplete) {
      onComplete();
    }
  }, [state.isComplete, onComplete]);

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  return (
    <div className="space-y-6">
      <FocusHeader
        onBack={() => window.history.back()}
        label="Leave letter"
      />

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
        senderName={senderName}
        isAuthenticated={isAuthenticated}
        isSubmitting={isSubmitting}
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
