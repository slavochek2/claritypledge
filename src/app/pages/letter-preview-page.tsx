/**
 * @file letter-preview-page.tsx
 * @description P661: Preview route — /letter/:docId/preview
 * Renders the reading flow using doc stories (not snapshots) in non-persisting mode.
 * Ratings are interactive but write to local state only (no DB calls).
 * Shows "THIS IS A PREVIEW" banner.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatingButtons } from '@/app/components/partners/shared';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { docsService } from '@/app/data/docs-service';
import type { DocStory } from '@/app/types';

export function LetterPreviewPage() {
  const { docId } = useParams<{ docId: string }>();

  const [stories, setStories] = useState<DocStory[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!docId) return;
    (async () => {
      try {
        const result = await docsService.getDoc(docId);
        if (!result) {
          setFetchState('not-found');
          return;
        }
        setStories(result.stories);
        setFetchState('done');
      } catch {
        setFetchState('not-found');
      }
    })();
  }, [docId]);

  const handleRate = useCallback((storyId: string, value: number) => {
    setRatings((prev) => {
      const next = new Map(prev);
      next.set(storyId, value);
      return next;
    });
  }, []);

  if (fetchState === 'loading') return <ClarityPageLoader />;

  if (fetchState === 'not-found' || stories.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Doc not found or has no stories.</p>
          <Button variant="link" asChild>
            <Link to="/docs">Back to Docs</Link>
          </Button>
        </div>
      </main>
    );
  }

  const currentStory = stories[currentIndex];
  if (!currentStory) return null;

  const currentRating = ratings.get(currentStory.story_id) ?? null;
  const isLastStory = currentIndex === stories.length - 1;

  return (
    <main className="min-h-screen bg-background">
      {/* Preview banner */}
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800 font-medium">
          THIS IS A PREVIEW — The receiver will see this
        </p>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <LetterProgressBar currentIndex={currentIndex} totalStories={stories.length} />
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Story {currentIndex + 1} of {stories.length}
          </span>
        </div>
      </div>

      {/* Story content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <LiveStoryCardExpanded
          story={currentStory.story}
          readOnly
          defaultExpanded
        />

        {/* Rating (interactive but non-persistent) */}
        <div className="space-y-4">
          <p className="text-sm text-[#1A1A1A]/70">
            How well do you believe you understand this story?
          </p>
          <RatingButtons
            selectedValue={currentRating}
            onSelect={(value) => handleRate(currentStory.story_id, value)}
            fullWidth
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link
            to={docId ? `/letter/${docId}/compose` : '/docs'}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Back to composition
          </Link>
          {currentRating !== null && !isLastStory && (
            <Button
              onClick={() => setCurrentIndex((i) => i + 1)}
              className="bg-[#0044CC] hover:bg-[#0033AA] text-white"
            >
              Next Story
            </Button>
          )}
          {currentRating !== null && isLastStory && (
            <p className="text-sm text-muted-foreground">End of preview</p>
          )}
        </div>
      </div>
    </main>
  );
}
