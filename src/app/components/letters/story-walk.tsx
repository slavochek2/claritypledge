/**
 * @file story-walk.tsx
 * @description P699: Shared paginated story-by-story results view for letter exchange.
 * Used by both sender (/letter/:id/results) and receiver (same URL with ?delivery=).
 *
 * Per-story layout: counter → JourneyToUnderstanding → gap caption → LiveStoryCardExpanded
 * Fixed bottom bar: Previous Story / Next Story or last-story Back to Letters.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Button } from '@/components/ui/button';
import { snapshotToStoryWithPoints, injectReceiverPositions, injectUserPositions } from '@/app/utils/letter-snapshot-mapper';
import type { StoryWalkItem, PositionType } from '@/app/types';
import { explainWhyLabel } from '@/app/utils/position-helpers';
import type { ResultsProfileData, LetterPositionStory } from '@/app/data/letters-service';
import { StartClaritySessionButton } from './start-clarity-session-button';
import { ExplainBackCapture, type ExplainBackSubmitPayload } from './explain-back-capture';
import { LetterPositionStoryDialog, type PositionStoryDialogState } from './letter-position-story-dialog';

// ============================================================================
// TYPES
// ============================================================================

interface StoryWalkProps {
  stories: StoryWalkItem[];
  perspective: 'sender' | 'receiver';
  senderProfile: ResultsProfileData;
  receiverProfile: ResultsProfileData | null;
  /** Kept for convenience — callers may pass directly; derived from senderProfile.name */
  senderName: string;
  /** Kept for convenience — callers may pass directly; derived from receiverProfile.name */
  receiverName: string | null;
  /** P705: Handler for viewer position changes on the results page */
  onPositionSelect?: (pointId: string, position: PositionType | null) => void;
  /** P703: Sender profile id — enables "Start a clarity session" button */
  senderId?: string;
  /** P703: Receiver profile id — target for the live invite */
  receiverId?: string | null;
  /** P745: Delivery id — enables mid-letter "Start Clarity Live now" mode */
  deliveryId?: string;
  /** P700: Initial story index to seek to on mount (0-based). Defaults to 0. */
  initialIndex?: number;
  /** P847: Clear viewer's persisted position for the given point. Wire onClear once at page level. Do not instantiate a per-row guard. */
  onClear?: (pointId: string) => void;
  /** P904: True when the viewer is the AUTHENTICATED receiver of this delivery.
   * Derived at page level (user.id === delivery.receiver) — never inside an affordance row
   * (the reading flow allows anonymous token readers; the capture affordance must be gated). */
  isAuthenticatedReceiver?: boolean;
  /** P904: Persist an explain-back for one story. The page owns persistence + refetch. */
  onExplainBackSubmit?: (storyId: string, letterId: string, payload: ExplainBackSubmitPayload) => Promise<void>;
  /** R3b / P904 plan: Position stories for this delivery, keyed by point_id (both parties). */
  positionStoriesMap?: Map<string, LetterPositionStory>;
  /** P904 plan: Called after a position story is saved so the parent can refetch. */
  onPositionStorySaved?: () => void;
  /** P952: 'off' removes all response affordances; 'invite' shows them; defaults to 'invite'. */
  responsesMode?: 'off' | 'invite' | 'push';
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StoryWalk({ stories, perspective, senderProfile, receiverProfile, senderName, receiverName, onPositionSelect, senderId, receiverId, deliveryId, initialIndex, onClear, isAuthenticatedReceiver, onExplainBackSubmit, positionStoriesMap, onPositionStorySaved, responsesMode = 'invite' }: StoryWalkProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);
  const counterRef = useRef<HTMLParagraphElement>(null);
  // P904: explain-back capture panel open state (per-story; reset on navigation).
  const [captureOpen, setCaptureOpen] = useState(false);
  // P904 plan: position-story dialog (add or view mode).
  const [positionDialogState, setPositionDialogState] = useState<PositionStoryDialogState | null>(null);

  const current = stories[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === stories.length - 1;

  function navigate(direction: 'prev' | 'next') {
    const next = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    setCurrentIndex(next);
    setCaptureOpen(false); // P904: don't carry an open capture panel across stories
    // Scroll to top + move focus to counter for screen reader announcement
    window.scrollTo(0, 0);
    setTimeout(() => counterRef.current?.focus(), 50);
  }

  // Animate on initial mount only (not on story navigation)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!current) return null;

  // Build the StoryWithPoints for the current story
  // Author of the story = sender (sender wrote the stories)
  const baseStory = snapshotToStoryWithPoints(current.snapshot, senderProfile);

  // Inject the other party's positions into profileSubjectPosition
  // Sender sees receiver positions; receiver sees author (sender) positions (already in snapshot)
  const storyWithOtherParty = perspective === 'sender'
    ? injectReceiverPositions(baseStory, current.receiverPositions)
    : baseStory; // receiver: authorPosition already set in snapshotToStoryWithPoints

  // P705: Inject viewer's own live positions from point_positions into userPosition.
  // When onPositionSelect is present (results page), positions are interactive.
  const storyWithPoints = current.viewerPositions
    ? injectUserPositions(storyWithOtherParty, current.viewerPositions)
    : storyWithOtherParty;

  // Badge profile: the other party whose positions appear above each point
  const badgeProfile = perspective === 'sender' ? receiverProfile : senderProfile;

  // P904 R8: the sender sees a primary "Start a Clarity Live" CTA pinned above
  // the nav. When it's present, Prev/Next are demoted to ghost buttons so the
  // CTA leads the eye (no two equal-weight blue buttons). For the receiver
  // (no CTA) the nav stays solid — it's the primary action on the bar.
  const hasPrimaryCta = perspective === 'sender' && !!senderId && !!receiverId;

  // JourneyToUnderstanding props differ by perspective:
  // - sender (isChecker=true): "Your belief" = prediction, "{receiverName}'s confidence" = rating
  // - receiver (isChecker=false): "{senderName}'s belief" = prediction, "Your confidence" = rating
  const journeyProps = perspective === 'sender'
    ? {
        isChecker: true as const,
        checkerRating: current.prediction,
        responderRating: current.rating,
        displayPartnerName: receiverName ?? 'Recipient',
        checkerName: senderName,
      }
    : {
        isChecker: false as const,
        checkerRating: current.prediction,
        responderRating: current.rating,
        displayPartnerName: senderName,
        checkerName: senderName,
      };

  // P904: story title for the capture panel + view-link context.
  const storyTitle = (current.snapshot.point_config as { storyTitle?: string })?.storyTitle ?? '';

  async function handleCaptureSubmit(payload: ExplainBackSubmitPayload) {
    if (!onExplainBackSubmit) return;
    await onExplainBackSubmit(current.storyId, current.snapshot.letter_id, payload);
    setCaptureOpen(false); // parent refetch flips this story to the filled state
  }

  function renderExplainBackAffordance() {
    if (responsesMode === 'off') return null;
    const eb = current.explainBack;
    if (isAuthenticatedReceiver) {
      if (eb) {
        return (
          <Link
            to={`/explain-back/${eb.id}`}
            className="inline-flex items-center text-sm text-blue-600 hover:underline min-h-11"
          >
            View your explanation →
          </Link>
        );
      }
      if (!captureOpen) {
        return (
          <Button
            variant="default"
            className="min-h-11 bg-blue-500 hover:bg-blue-600 text-white text-sm"
            onClick={() => setCaptureOpen(true)}
          >
            Explain back what you understood
          </Button>
        );
      }
      return null; // capture panel is open
    }
    // Author (sender) side — read-only link.
    if (eb) {
      const unread = !!current.explainBackUnread;
      return (
        <Link
          to={`/explain-back/${eb.id}`}
          data-unread={unread ? 'true' : 'false'}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline min-h-11"
        >
          {unread && <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />}
          View {eb.recorderName ?? receiverName ?? 'their'} explanation →
        </Link>
      );
    }
    return null;
  }

  function renderPositionStoryAffordance(pointId: string) {
    if (responsesMode === 'off') return null;
    const story = positionStoriesMap?.get(pointId);
    if (story) {
      return (
        <button
          type="button"
          onClick={() => setPositionDialogState({ mode: 'view', story })}
          className="inline-flex items-center text-sm text-blue-600 hover:underline min-h-11"
        >
          {story.isOwn ? 'View my story →' : `View ${story.authorName}'s story →`}
        </button>
      );
    }
    if (isAuthenticatedReceiver) {
      const viewerPos = current.viewerPositions?.get(pointId);
      return (
        <button
          type="button"
          onClick={() => setPositionDialogState({ mode: 'add', pointId, position: viewerPos ?? undefined })}
          className="inline-flex items-center text-sm text-blue-600 hover:underline min-h-11"
        >
          {viewerPos ? explainWhyLabel(viewerPos) : 'Add a story'}
        </button>
      );
    }
    return null;
  }

  return (
    <div className={`${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
      {/* Main content with bottom padding for fixed bar. P904 R9: when the
          sender's CTA stacks above the nav, the bar is taller than pb-28 (the
          last point card was hidden behind it) — reserve pb-44 in that case. */}
      <div className={`px-4 space-y-6 ${hasPrimaryCta ? 'pb-44' : 'pb-28'}`}>

        {/* Story counter */}
        <p
          ref={counterRef}
          tabIndex={-1}
          className="text-sm text-muted-foreground text-center outline-none"
          aria-live="polite"
        >
          Story {currentIndex + 1} of {stories.length}
        </p>

        {/* Journey */}
        <JourneyToUnderstanding
          {...journeyProps}
          explainBackRatings={[]}
          compact
          className="w-full max-w-sm mx-auto"
        />

        {/* P904 R10: gap insight as a one-line caption under the numbers, not a
            boxed banner. The JourneyToUnderstanding dots already show the gap
            magnitude; only the directional read ("more/less than you think") is
            non-redundant, so we keep that and drop the quantified badge + box. */}
        {current.rating != null && current.gap !== undefined && (
          <p className="text-sm text-muted-foreground text-center w-full max-w-sm mx-auto -mt-4">
            {perspective === 'sender' ? (
              // Author viewing their own letter: the partner is the receiver.
              current.gap === 0 ? (
                <>You believe {receiverName ?? 'they'} understand{' '}
                  <span className="font-semibold text-foreground">exactly as much</span> as they think</>
              ) : (
                <>You think {receiverName ?? 'they'} understand{' '}
                  <span className="font-semibold text-foreground">
                    {current.isOverconfident ? 'less' : 'more'}
                  </span> than they think</>
              )
            ) : (
              // Receiver viewing: the sender holds the belief about "you".
              current.gap === 0 ? (
                <>{senderName} believes you understand{' '}
                  <span className="font-semibold text-foreground">exactly as much</span> as you think</>
              ) : (
                <>{senderName} thinks you understand{' '}
                  <span className="font-semibold text-foreground">
                    {current.isOverconfident ? 'less' : 'more'}
                  </span> than you think</>
              )
            )}
          </p>
        )}

        {/* Story card with points + "Open Story" link inside card footer */}
        {/* P705: readOnly removed — positions are now interactive on results page.
            defaultExpanded=true shows points immediately (no expand tap needed).
            onPositionSelect wires position buttons to the results-page handler. */}
        <LiveStoryCardExpanded
          key={currentIndex}
          story={storyWithPoints}
          defaultExpanded={true}
          defaultStoryExpanded={true}
          onPositionSelect={onPositionSelect}
          onClear={onClear}
          className="w-full max-w-2xl mx-auto"
          badgePersonName={badgeProfile?.name}
          badgePersonAvatarUrl={badgeProfile?.avatarUrl}
          badgePersonAvatarColor={badgeProfile?.avatarColor}
          badgePersonHasPledged={badgeProfile?.hasPledged}
          badgePersonEarsCount={badgeProfile?.earsCount}
          footerSlot={
            <div className="flex items-center justify-center gap-3">
              {renderExplainBackAffordance()}
              {current.snapshot.story_id && (
                <Link
                  to={`/story/${current.snapshot.story_id}`}
                  className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Open story"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
              )}
            </div>
          }
          renderPointChildren={(pointId) => renderPositionStoryAffordance(pointId)}
        />
      </div>

      {/* P904: capture panel replaces the nav bar while recording (both are fixed-bottom) */}
      {captureOpen && isAuthenticatedReceiver ? (
        <ExplainBackCapture
          storyTitle={storyTitle}
          authorName={senderName}
          onSubmit={handleCaptureSubmit}
          onCancel={() => setCaptureOpen(false)}
        />
      ) : (
      /* Fixed bottom navigation bar */
      <FixedBottomBar>
        {/* P703/P745: Start a clarity session — letter author only, pinned above nav */}
        {perspective === 'sender' && senderId && receiverId && (
          <div className="w-full max-w-sm flex justify-center mb-3">
            <StartClaritySessionButton
              senderId={senderId}
              receiverId={receiverId}
              letterId={current.snapshot.letter_id}
              storyId={current.snapshot.story_id}
              senderName={senderName}
              deliveryId={deliveryId}
            />
          </div>
        )}
        <div
          className="w-full max-w-sm flex items-center justify-center gap-4"
          role="navigation"
          aria-label="Story navigation"
        >
          {!isFirst && (
            <Button
              variant={hasPrimaryCta ? 'ghost' : 'default'}
              onClick={() => navigate('prev')}
              className={hasPrimaryCta
                ? 'min-h-11 text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                : 'min-h-11 bg-blue-500 hover:bg-blue-600 text-white'}
              aria-label="Previous story"
            >
              ← Previous Story
            </Button>
          )}
          {!isLast && (
            <Button
              variant={hasPrimaryCta ? 'ghost' : 'default'}
              onClick={() => navigate('next')}
              className={hasPrimaryCta
                ? 'min-h-11 text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                : 'min-h-11 bg-blue-500 hover:bg-blue-600 text-white'}
              aria-label="Next story"
            >
              Next Story →
            </Button>
          )}
        </div>
      </FixedBottomBar>
      )}

      {/* P904 plan: position-story dialog (add or view) */}
      <LetterPositionStoryDialog
        state={positionDialogState}
        onClose={() => setPositionDialogState(null)}
        onSaved={() => { onPositionStorySaved?.(); setPositionDialogState(null); }}
      />
    </div>
  );
}
