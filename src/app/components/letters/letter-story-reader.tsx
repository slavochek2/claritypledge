/**
 * @file letter-story-reader.tsx
 * @description P581 Task 8: Story reader component for letter reading flow.
 * Renders the appropriate phase UI for the current story.
 */

import { RatingButtons } from '@/app/components/partners/shared';
import { LetterPointEngagement } from './letter-point-engagement';
import { LetterGapReveal } from './letter-gap-reveal';
import { Button } from '@/components/ui/button';
import type { StoryPhase } from '@/app/hooks/useLetterReadingState';
import type { LetterStorySnapshot, PositionType } from '@/app/types';

/** Map a 3-button simple position to PositionType for storage */
function toPositionType(simple: 'agree' | 'disagree' | 'unsure'): PositionType {
  return simple as PositionType;
}

// ============================================================================
// TYPES
// ============================================================================

interface PointConfig {
  id: string;
  text: string;
  authorPosition: PositionType | null;
}

interface StoryReaderProps {
  snapshot: LetterStorySnapshot;
  storyIndex: number;
  totalStories: number;
  phase: StoryPhase;
  rating: number | null;
  prediction: number | null;
  positions: Record<string, string>;
  remainingPointIndex: number;
  senderName: string;
  isSubmitting: boolean;
  onPositionSubmit: (pointId: string, position: string) => void;
  onRatingSubmit: (rating: number) => void;
  onAdvanceToStory: () => void;
  onAdvanceRemainingPoint: () => void;
  onNextStory: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function getPoints(snapshot: LetterStorySnapshot): PointConfig[] {
  const config = snapshot.point_config;
  if (config && typeof config === 'object' && 'points' in config && Array.isArray(config.points)) {
    return config.points.map((p: Record<string, unknown>) => ({
      id: (p.id as string) ?? '',
      text: (p.text as string) ?? '',
      authorPosition: (p.authorPosition as PositionType) ?? null,
    }));
  }
  return [];
}

function getStoryText(snapshot: LetterStorySnapshot): string {
  const config = snapshot.point_config;
  if (config && typeof config === 'object' && 'storyText' in config) {
    return (config.storyText as string) ?? '';
  }
  return '';
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterStoryReader({
  snapshot,
  storyIndex,
  totalStories,
  phase,
  rating,
  prediction,
  positions,
  remainingPointIndex,
  senderName,
  isSubmitting,
  onPositionSubmit,
  onRatingSubmit,
  onAdvanceToStory,
  onAdvanceRemainingPoint,
  onNextStory,
}: StoryReaderProps) {
  const points = getPoints(snapshot);
  const storyText = getStoryText(snapshot);
  const antiPoint = points[0]; // first point for anti-point lead
  const remainingPoints = points.slice(1);

  return (
    <div className="space-y-6">
      {/* Anti-point phase: show point + position buttons */}
      {phase === 'anti-point' && antiPoint && (
        <LetterPointEngagement
          pointText={antiPoint.text}
          pointId={antiPoint.id}
          authorPosition={antiPoint.authorPosition}
          authorName={senderName}
          onPosition={(pos) => onPositionSubmit(antiPoint.id, toPositionType(pos))}
          disabled={isSubmitting}
        />
      )}

      {/* Position revealed: show both positions + story fades in */}
      {phase === 'position-revealed' && (
        <div className="space-y-4">
          {antiPoint && (
            <div className="text-sm text-[#1A1A1A]/70">
              <p>
                You: <span className="font-medium">{positions[antiPoint.id] ?? 'N/A'}</span>
                {' \u2014 '}
                {senderName}: <span className="font-medium">
                  {antiPoint.authorPosition ?? 'N/A'}
                </span>
              </p>
            </div>
          )}
          <div className="animate-fade-in">
            <div className="prose prose-sm max-w-none">
              <p className="text-[#1A1A1A] whitespace-pre-wrap">{storyText}</p>
            </div>
          </div>
          <Button
            onClick={onAdvanceToStory}
            className="bg-[#0044CC] hover:bg-[#0033AA] text-white"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Story phase: show story text (for 1-point stories, this is the first phase) */}
      {phase === 'story' && (
        <div className="space-y-4">
          <div className="prose prose-sm max-w-none">
            <p className="text-[#1A1A1A] whitespace-pre-wrap">{storyText}</p>
          </div>
        </div>
      )}

      {/* Rate phase: understanding rating */}
      {phase === 'rate' && (
        <div className="space-y-4">
          <p className="text-sm text-[#1A1A1A]/70">
            How well do you believe you understand this story in the way {senderName} means it?
          </p>
          <RatingButtons
            selectedValue={rating}
            onSelect={onRatingSubmit}
            disabled={isSubmitting || rating !== null}
          />
        </div>
      )}

      {/* Gap reveal: dual numbers */}
      {phase === 'gap-reveal' && rating !== null && prediction !== null && (
        <div className="space-y-4">
          <LetterGapReveal
            receiverRating={rating}
            senderPrediction={prediction}
          />
          <Button
            onClick={onAdvanceRemainingPoint}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white"
          >
            Continue
          </Button>
        </div>
      )}

      {/* Single-point: point phase after gap */}
      {phase === 'point' && antiPoint && (
        <div className="space-y-4">
          <LetterPointEngagement
            pointText={antiPoint.text}
            pointId={antiPoint.id}
            authorPosition={antiPoint.authorPosition}
            authorName={senderName}
            onPosition={(pos) => {
              onPositionSubmit(antiPoint.id, toPositionType(pos));
              // After engaging with point, advance
              setTimeout(onAdvanceRemainingPoint, 800);
            }}
            disabled={isSubmitting || !!positions[antiPoint.id]}
          />
        </div>
      )}

      {/* Remaining points (multi-point stories) */}
      {phase === 'remaining-points' && remainingPoints[remainingPointIndex] && (
        <div className="space-y-4">
          <p className="text-xs text-[#1A1A1A]/40 uppercase tracking-wide">
            Point {remainingPointIndex + 2} of {points.length}
          </p>
          <LetterPointEngagement
            pointText={remainingPoints[remainingPointIndex].text}
            pointId={remainingPoints[remainingPointIndex].id}
            authorPosition={remainingPoints[remainingPointIndex].authorPosition}
            authorName={senderName}
            onPosition={(pos) => {
              onPositionSubmit(remainingPoints[remainingPointIndex].id, toPositionType(pos));
              // After positioning, advance to next remaining point
              setTimeout(onAdvanceRemainingPoint, 800);
            }}
            disabled={isSubmitting || !!positions[remainingPoints[remainingPointIndex].id]}
          />
        </div>
      )}

      {/* Transition: story complete */}
      {phase === 'transition' && (
        <div className="text-center space-y-4 py-6">
          <p className="text-lg font-medium text-[#1A1A1A]">
            Story {storyIndex + 1} complete &#10022;
          </p>
          {storyIndex + 1 < totalStories ? (
            <Button
              onClick={onNextStory}
              className="bg-[#0044CC] hover:bg-[#0033AA] text-white"
            >
              Next story
            </Button>
          ) : (
            <Button
              onClick={onNextStory}
              className="bg-[#0044CC] hover:bg-[#0033AA] text-white"
            >
              Complete letter
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
