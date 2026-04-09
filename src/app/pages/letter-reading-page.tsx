/**
 * @file letter-reading-page.tsx
 * @description P581 Task 7 / P673: Letter reading page with token validation + reading flow.
 * Route: /letter/:id (id = deliveryId) with optional ?token=xxx for 1-to-1.
 *
 * P673/P676: LetterReadingFlow composes shared components:
 * - LiveStoryCardExpanded (hidePoints) for story display
 * - ComprehensionRatingCard in Drawer for rating
 * - JourneyToUnderstanding + GapBanner for gap reveal
 * - PointCardWithLinks (same as profile) for point engagement
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { LetterCover } from '@/app/components/letters/letter-cover';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { LetterCompletionSummary } from '@/app/components/letters/letter-completion-summary';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import type { StoryPhase } from '@/app/hooks/useLetterReadingState';
import { snapshotToStoryWithPoints, pointSummaryToProtoPoint } from '@/app/utils/letter-snapshot-mapper';
import {
  getLetterForReading,
  getLetterForReadingByToken,
  claimLetterDelivery,
  updateDeliveryStatus,
  updateDeliveryStatusByToken,
} from '@/app/data/letters-service';
import { analytics } from '@/lib/mixpanel';
import type { ClarityLetter, LetterStorySnapshot, LetterDelivery, PositionType } from '@/app/types';
import type { Position } from '@/app/components/shared/prototype-types';

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
  const [receiverDisplayName, setReceiverDisplayName] = useState('you');

  // 1-to-1 auth flow state
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authDelayed, setAuthDelayed] = useState(false);
  const authDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data on mount (skip re-load if already past cover — avoids flash after verifyOtp auth)
  useEffect(() => {
    if (!sessionChecked || !deliveryId) return;
    if (viewState !== 'cover') return;

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

          // Use sender_display_name from RPC (joined to profiles), not UUID
          setSenderName(readData.letter.sender_display_name || 'Someone');

          // Use receiver_name first name from delivery, fallback to user name or 'you'
          const deliveryReceiverName = readData.delivery?.receiver_name;
          if (deliveryReceiverName) {
            setReceiverDisplayName(deliveryReceiverName.split(' ')[0]);
          } else if (currentUser?.user_metadata?.name) {
            setReceiverDisplayName(currentUser.user_metadata.name);
          }

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
          setSenderName(readData.letter.sender_display_name || readData.letter.sender_id);
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

  // Cleanup auth delay timer
  useEffect(() => {
    return () => {
      if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
    };
  }, []);

  // 1-to-1 auth handler: calls create-and-open-letter edge function → verifyOtp
  const handleOneToOneOpen = useCallback(async () => {
    if (!token || !delivery) return;

    setIsAuthenticating(true);
    setAuthDelayed(false);

    // Start 5s delay timer for "Setting up your access..." message
    authDelayTimerRef.current = setTimeout(() => setAuthDelayed(true), 5000);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'create-and-open-letter',
        { body: { token } }
      );

      if (fnError || !result?.ok) {
        throw new Error(result?.message || fnError?.message || 'Edge function failed');
      }

      if (result.hashedToken) {
        // Instant auth via verifyOtp
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: result.hashedToken,
          type: 'magiclink',
        });

        if (otpError) {
          // Fallback: send magic link email using email from edge function response
          console.warn('[letter-reading] verifyOtp failed, falling back to signInWithOtp:', otpError.message);
          const receiverEmail = result.receiverEmail;
          if (receiverEmail) {
            await supabase.auth.signInWithOtp({
              email: receiverEmail,
              options: {
                shouldCreateUser: false,
                emailRedirectTo: `${window.location.origin}/letter/${deliveryId}?token=${token}`,
              },
            });
          }
          toast.info("We couldn't sign you in automatically. Check your email for a sign-in link.");
          setIsAuthenticating(false);
          setAuthDelayed(false);
          if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
          return;
        }

        // Auth succeeded
        if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
        setAuthDelayed(false);

        updateDeliveryStatusByToken(token, 'opened').catch(() => {});

        analytics.track('letter_opened', {
          delivery_id: delivery.id,
          letter_id: letter?.id,
          mode: letter?.mode,
          story_count: snapshots.length,
          auth_method: 'create-and-open-letter',
        });

        setIsAuthenticating(false);
        setViewState('reading');
      } else {
        // No hashedToken — delivery was already linked, just proceed
        if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
        updateDeliveryStatusByToken(token, 'opened').catch(() => {});
        setIsAuthenticating(false);
        setViewState('reading');
      }
    } catch (err) {
      console.error('[letter-reading] Auth flow error:', err);
      if (authDelayTimerRef.current) clearTimeout(authDelayTimerRef.current);
      setIsAuthenticating(false);
      setAuthDelayed(false);

      const message = err instanceof Error && err.message.includes('timed out')
        ? 'The connection timed out. Please check your internet and try again.'
        : 'Something went wrong. Please try again.';
      toast.error(message);
    }
  }, [token, delivery, deliveryId, letter, snapshots.length]);

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
    <CertificatePageShell className="min-h-screen py-6 space-y-6">
      {viewState === 'cover' && (
        <LetterCover
          senderName={senderName}
          receiverName={receiverDisplayName}
          storyCount={snapshots.length}
          estimatedMinutes={Math.max(1, Math.ceil(snapshots.length * 2))}
          mode={letter.mode}
          isAuthenticating={isAuthenticating}
          authDelayed={authDelayed}
          onOpen={() => {
            if (letter.mode === 'one-to-one' && token && !currentUser) {
              handleOneToOneOpen();
            } else {
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
            }
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
// READING FLOW — composes /live components (P673)
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
    submitPointPosition,
    submitStoryRating,
    advanceFromPointReveal,
    advanceFromStoryReveal,
    advanceFromRemainingPointReveal,
    nextStory,
    isSubmitting,
  } = useLetterReadingState(delivery.id, letter.sender_id, snapshots, token);

  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);

  // When the state machine reports complete, notify parent
  useEffect(() => {
    if (state.isComplete) {
      onComplete();
    }
  }, [state.isComplete, onComplete]);

  // Bug 7: Auto-advance through transition interstitial — skip it entirely
  useEffect(() => {
    if (currentPhase === 'transition') {
      nextStory();
    }
  }, [currentPhase, nextStory]);

  const currentSnapshot = snapshots[state.currentStoryIndex];
  const currentStory = state.stories[state.currentStoryIndex];

  if (!currentSnapshot || !currentStory) return null;

  // P676: Build profileOwner for PointCardWithLinks — sender data from letter record
  const senderProfileOwner: PointProfileOwner = {
    id: letter.sender_id,
    name: senderName,
  };

  const storyWithPoints = snapshotToStoryWithPoints(currentSnapshot, { name: senderName });
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
      <FocusHeader
        onBack={() => window.history.back()}
        label="Leave letter"
      />

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
          {!selectedPosition && !isSubmitting && (
            <p className="text-sm text-muted-foreground text-center">
              Select your position above to continue
            </p>
          )}
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

      {/* PHASE: story-rate — story card + rating Drawer */}
      {currentPhase === 'story-rate' && (
        <>
          <LiveStoryCardExpanded
            story={storyWithPoints}
            hidePoints
            readOnly
            className="w-full max-w-sm"
          />

          {!isAuthenticated ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-sm text-[#1A1A1A]/70">
                Sign in to rate how well you understood this story and see {senderName}&apos;s prediction.
              </p>
              <Link
                to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-[#0044CC] hover:bg-[#0033AA] rounded-md min-h-[44px]"
              >
                Sign in to continue
              </Link>
            </div>
          ) : (
            <Drawer open dismissible={false}>
              <DrawerContent overlayClassName="bg-transparent">
                <DrawerHeader className="sr-only">
                  <DrawerTitle>Rate this story</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 pb-8 pt-4 space-y-4">
                  <ComprehensionRatingCard
                    question="How well do you believe you understand this story?"
                    onSelect={(rating) => {
                      analytics.track('letter_story_rated', {
                        story_index: state.currentStoryIndex,
                        total_stories: snapshots.length,
                        rating,
                      });
                      submitStoryRating(rating);
                    }}
                    disabled={isSubmitting || currentStory.rating !== null}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </>
      )}

      {/* PHASE: story-revealed — JourneyToUnderstanding + GapBanner above story */}
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

      {/* PHASE: remaining-point-engage — remaining point cards after story */}
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
          {!selectedPosition && !isSubmitting && (
            <p className="text-sm text-muted-foreground text-center">
              Select your position above to continue
            </p>
          )}
        </div>
      )}

      {/* PHASE: remaining-point-revealed — sender position visible via quote pattern */}
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
