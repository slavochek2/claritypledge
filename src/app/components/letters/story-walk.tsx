/**
 * @file story-walk.tsx
 * @description P699: Shared paginated story-by-story results view for letter exchange.
 * Used by both sender (/letter/:id/results) and receiver (same URL with ?delivery=).
 *
 * Per-story layout: counter → JourneyToUnderstanding → GapBanner → LiveStoryCardExpanded
 * Fixed bottom bar: Previous Story / Next Story or last-story /live CTA.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { JourneyToUnderstanding } from '@/app/components/partners/live-mode-view';
import { GapBanner } from '@/app/components/shared/gap-banner';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Button } from '@/components/ui/button';
import { snapshotToStoryWithPoints, injectReceiverPositions } from '@/app/utils/letter-snapshot-mapper';
import type { StoryWalkItem } from '@/app/types';

// ============================================================================
// TYPES
// ============================================================================

interface StoryWalkProps {
  stories: StoryWalkItem[];
  perspective: 'sender' | 'receiver';
  senderName: string;
  receiverName: string | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StoryWalk({ stories, perspective, senderName, receiverName }: StoryWalkProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const counterRef = useRef<HTMLParagraphElement>(null);

  const current = stories[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === stories.length - 1;

  // Any gap > 0 across all stories → show /live CTA on last story
  const hasAnyGap = stories.some(s => s.gap !== undefined && s.gap > 0);

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
  const baseStory = snapshotToStoryWithPoints(current.snapshot, senderName);

  // Inject the other party's positions into profileSubjectPosition
  // Sender sees receiver positions; receiver sees author (sender) positions (already in snapshot)
  const storyWithPoints = perspective === 'sender'
    ? injectReceiverPositions(baseStory, current.receiverPositions)
    : baseStory; // receiver: authorPosition already set in snapshotToStoryWithPoints

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
          Story {current.position + 1} of {stories.length}
        </p>

        {/* Journey */}
        <JourneyToUnderstanding
          {...journeyProps}
          explainBackRatings={[]}
          compact
          className="w-full max-w-sm mx-auto"
        />

        {/* Gap banner — only when story is complete */}
        {current.gap !== undefined && (
          <GapBanner
            gap={current.gap}
            senderName={senderName}
            isOverconfident={current.isOverconfident}
            className="-mt-3 mx-auto"
          />
        )}

        {/* Story card with points */}
        <LiveStoryCardExpanded
          story={storyWithPoints}
          readOnly
          defaultExpanded
          className="w-full max-w-sm mx-auto"
          badgePersonName={
            perspective === 'sender'
              ? (receiverName ?? 'Recipient')
              : senderName
          }
        />

        {/* Open Story link */}
        {current.snapshot.story_id && (
          <div className="flex justify-center">
            <Link
              to={`/story/${current.snapshot.story_id}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
              aria-label="Open story in full view"
            >
              <ExternalLink size={14} />
              Open Story
            </Link>
          </div>
        )}
      </div>

      {/* Fixed bottom navigation bar */}
      <FixedBottomBar>
        {isLast ? (
          /* Last story: /live CTA (when any gap > 0) + Back to Letters */
          <div
            className="w-full max-w-sm flex flex-col items-center gap-3"
            role="navigation"
            aria-label="Story navigation"
          >
            {hasAnyGap && (
              <Link
                to="/live"
                className="inline-flex items-center justify-center w-full max-w-[200px] bg-[#0044CC] hover:bg-[#0033AA] text-white rounded-md text-sm font-medium min-h-[44px] px-4 transition-colors"
              >
                Start /live conversation
              </Link>
            )}
            <div className="flex items-center gap-4">
              {!isFirst && (
                <Button
                  variant="ghost"
                  onClick={() => navigate('prev')}
                  className="min-h-[44px]"
                  aria-label="Previous story"
                >
                  ← Previous Story
                </Button>
              )}
              <Link
                to="/letters"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
              >
                Back to Letters
              </Link>
            </div>
          </div>
        ) : (
          /* Normal story: Previous + Next */
          <div
            className="w-full max-w-sm flex items-center justify-between"
            role="navigation"
            aria-label="Story navigation"
          >
            {!isFirst ? (
              <Button
                variant="ghost"
                onClick={() => navigate('prev')}
                className="min-h-[44px]"
                aria-label="Previous story"
              >
                ← Previous Story
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              onClick={() => navigate('next')}
              className="min-h-[44px]"
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
