/**
 * @file letter-completion-summary.tsx
 * @description P581 Task 10: Letter completion flow — celebration gate,
 * gap-sorted summary, /live CTA, and registration gate for unauthenticated receivers.
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { triggerConfetti } from '@/lib/confetti';
import { analytics } from '@/lib/mixpanel';
import { getCompletionSummary } from '@/app/data/letters-service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type {
  LetterStorySnapshot,
  LetterPrediction,
  LetterPointResponse,
} from '@/app/types';

// ============================================================================
// TYPES
// ============================================================================

interface LetterCompletionSummaryProps {
  deliveryId: string;
  letterData: {
    snapshots: LetterStorySnapshot[];
    senderName: string;
    mode: 'one-to-one' | 'one-to-many';
  };
  isAuthenticated: boolean;
  senderName: string;
}

interface StoryGapCard {
  storyId: string;
  position: number;
  receiverRating: number;
  senderPrediction: number;
  gap: number;
  pointComparisons: Array<{
    pointId: string;
    receiverPosition: string;
    // Author position is not available in the current data model;
    // shown as sender's predicted alignment
  }>;
}

type CompletionPhase = 'celebration' | 'summary';

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterCompletionSummary({
  deliveryId,
  letterData,
  isAuthenticated,
  senderName,
}: LetterCompletionSummaryProps) {
  const [phase, setPhase] = useState<CompletionPhase>('celebration');
  const [ratings, setRatings] = useState<Array<{ story_id: string; listener_rating: number }>>([]);
  const [predictions, setPredictions] = useState<LetterPrediction[]>([]);
  const [pointResponses, setPointResponses] = useState<LetterPointResponse[]>([]);
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Fire confetti + track completion on mount
  useEffect(() => {
    triggerConfetti();
    analytics.track('letter_completed', {
      delivery_id: deliveryId,
      mode: letterData.mode,
      story_count: letterData.snapshots.length,
      is_authenticated: isAuthenticated,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load completion data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getCompletionSummary(deliveryId);
        if (cancelled) return;
        setRatings(data.ratings);
        setPredictions(data.predictions);
        setPointResponses(data.pointResponses);
        setLoaded(true);
      } catch {
        // Silently fail — show celebration regardless
        setLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [deliveryId]);

  // Build gap-sorted story cards
  const storyCards = useMemo((): StoryGapCard[] => {
    if (!loaded) return [];

    const predictionMap = new Map(
      predictions.map(p => [p.story_id, p.prediction])
    );
    const ratingMap = new Map(
      ratings.map(r => [r.story_id, r.listener_rating])
    );
    const responsesByStory = new Map<string, LetterPointResponse[]>();
    for (const r of pointResponses) {
      const existing = responsesByStory.get(r.point_id) ?? [];
      existing.push(r);
      responsesByStory.set(r.point_id, existing);
    }

    return letterData.snapshots
      .map(snap => {
        const receiverRating = ratingMap.get(snap.story_id) ?? 0;
        const senderPrediction = predictionMap.get(snap.story_id) ?? 0;
        const gap = Math.abs(receiverRating - senderPrediction);

        // Gather point responses for this story
        const storyPointResponses = pointResponses.filter(pr =>
          // Point responses are keyed by point_id; we show all for now
          // since point_config links them to stories
          pr.delivery_id === deliveryId
        );

        return {
          storyId: snap.story_id,
          position: snap.position,
          receiverRating,
          senderPrediction,
          gap,
          pointComparisons: storyPointResponses.map(pr => ({
            pointId: pr.point_id,
            receiverPosition: pr.position,
          })),
        };
      })
      .sort((a, b) => b.gap - a.gap); // Largest gap first
  }, [loaded, letterData.snapshots, predictions, ratings, pointResponses, deliveryId]);

  const totalStoriesRead = letterData.snapshots.length;
  const totalPointsEngaged = pointResponses.length;
  const highestGapStory = storyCards[0];

  // ---- Celebration phase ----
  if (phase === 'celebration') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
        <p
          className="text-3xl font-serif text-[#1A1A1A]"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          &#10022; You&apos;ve completed it. &#10022;
        </p>
        <p className="text-sm text-[#1A1A1A]/60">
          {totalStoriesRead} {totalStoriesRead === 1 ? 'story' : 'stories'} read.{' '}
          {totalPointsEngaged} {totalPointsEngaged === 1 ? 'point' : 'points'} engaged.
        </p>
        <Button
          onClick={() => setPhase('summary')}
          className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
        >
          See Your Letter Summary
        </Button>
      </div>
    );
  }

  // ---- Summary phase ----
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h2
        className="text-xl font-serif text-[#1A1A1A] text-center"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        Letter Summary
      </h2>

      {/* Gap-sorted story cards */}
      <div className="space-y-4">
        {storyCards.map((card, idx) => (
          <div
            key={card.storyId}
            className={`rounded-lg border p-4 space-y-2 ${
              idx === 0 && card.gap > 0
                ? 'border-l-4 border-l-blue-500 bg-blue-50/30'
                : 'bg-card'
            }`}
          >
            <div className="flex items-center gap-2">
              {idx === 0 && card.gap > 0 && (
                <span className="text-sm" aria-label="Largest gap">&#9733;</span>
              )}
              <span className="text-sm font-medium text-foreground">
                Story {card.position + 1}
              </span>
            </div>

            <div className="text-sm text-muted-foreground">
              You: {card.receiverRating} &middot; {senderName}: {card.senderPrediction} &middot; Gap: {card.gap}
              {card.gap === 0 && (
                <span className="ml-1 text-green-600" aria-label="Perfect match">&#10003;</span>
              )}
            </div>

            {/* Per-point positions */}
            {card.pointComparisons.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                {card.pointComparisons.map((pc, pcIdx) => (
                  <div key={pc.pointId}>
                    Pt{pcIdx + 1}: You {pc.receiverPosition === 'agree' ? '✓' : '✗'}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* /live CTA */}
      {highestGapStory && highestGapStory.gap > 0 && (
        <div className="text-center pt-2">
          <Link
            to={`/live?storyId=${highestGapStory.storyId}`}
            className="inline-flex items-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors min-h-[44px]"
          >
            Ready for /live? Start Story {highestGapStory.position + 1}
          </Link>
        </div>
      )}

      {/* Registration gate — 1-to-many only, unauthenticated */}
      {letterData.mode === 'one-to-many' && !isAuthenticated && (
        <div className="border-t pt-6 mt-6 space-y-3">
          <p className="text-sm font-medium text-foreground text-center">
            Save your results?
          </p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 min-h-[44px]"
            />
            <Button
              asChild
              className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
              disabled={!email.trim()}
            >
              <Link
                to={`/signup?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              >
                Save &amp; Sign Up
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
