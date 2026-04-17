/**
 * @file story-walk.tsx
 * @description P699: Shared paginated story-by-story results view for letter exchange.
 * Used by both sender (/letter/:id/results) and receiver (same URL with ?delivery=).
 *
 * Per-story layout: counter → JourneyToUnderstanding → GapBanner → LiveStoryCardExpanded
 * Fixed bottom bar: Previous Story / Next Story or last-story Back to Letters.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Button } from '@/components/ui/button';
import { snapshotToStoryWithPoints, injectReceiverPositions, injectUserPositions } from '@/app/utils/letter-snapshot-mapper';
import type { StoryWalkItem, PositionType } from '@/app/types';
import type { ResultsProfileData } from '@/app/data/letters-service';
import { StartClaritySessionButton } from './start-clarity-session-button';

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
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StoryWalk({ stories, perspective, senderProfile, receiverProfile, senderName, receiverName, onPositionSelect, senderId, receiverId }: StoryWalkProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const counterRef = useRef<HTMLParagraphElement>(null);

  const current = stories[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === stories.length - 1;

  function navigate(direction: 'prev' | 'next') {
    const next = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    setCurrentIndex(next);
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

  return (
    <div className={`${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
      {/* Main content with bottom padding for fixed bar */}
      <div className="px-4 pb-28 space-y-6">

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

        {/* Gap banner — only when story is complete (rating present) */}
        {current.rating != null && current.gap !== undefined && (
          <GapBanner
            gap={current.gap}
            senderName={senderName}
            isOverconfident={current.isOverconfident}
            className="-mt-3 mx-auto"
          />
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
          className="w-full max-w-sm mx-auto"
          badgePersonName={badgeProfile?.name}
          badgePersonAvatarUrl={badgeProfile?.avatarUrl}
          badgePersonAvatarColor={badgeProfile?.avatarColor}
          badgePersonHasPledged={badgeProfile?.hasPledged}
          badgePersonEarsCount={badgeProfile?.earsCount}
          footerSlot={current.snapshot.story_id ? (
            <Link
              to={`/story/${current.snapshot.story_id}`}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Open story"
            >
              <ExternalLink size={16} />
            </Link>
          ) : undefined}
        />

        {/* P703: Start a clarity session — letter author only */}
        {perspective === 'sender' && senderId && receiverId && (
          <StartClaritySessionButton
            senderId={senderId}
            receiverId={receiverId}
            letterId={current.snapshot.letter_id}
            storyId={current.snapshot.story_id}
            senderName={senderName}
          />
        )}
      </div>

      {/* Fixed bottom navigation bar */}
      <FixedBottomBar>
        {isLast ? (
          /* Last story: Previous Story (if not first) + Back to Letters */
          <div
            className="w-full max-w-sm flex items-center justify-center gap-4"
            role="navigation"
            aria-label="Story navigation"
          >
            {!isFirst && (
              <Button
                onClick={() => navigate('prev')}
                className="min-h-[44px] bg-blue-500 hover:bg-blue-600 text-white"
                aria-label="Previous story"
              >
                ← Previous Story
              </Button>
            )}
            <Link
              to="/letters"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors min-h-[44px] flex items-center"
            >
              Back to Letters
            </Link>
          </div>
        ) : (
          /* Normal story: Previous + Next */
          <div
            className="w-full max-w-sm flex items-center justify-center gap-4"
            role="navigation"
            aria-label="Story navigation"
          >
            {!isFirst && (
              <Button
                onClick={() => navigate('prev')}
                className="min-h-[44px] bg-blue-500 hover:bg-blue-600 text-white"
                aria-label="Previous story"
              >
                ← Previous Story
              </Button>
            )}
            <Button
              onClick={() => navigate('next')}
              className="min-h-[44px] bg-blue-500 hover:bg-blue-600 text-white"
              aria-label="Next story"
            >
              Next Story →
            </Button>
          </div>
        )}
      </FixedBottomBar>
    </div>
  );
}
