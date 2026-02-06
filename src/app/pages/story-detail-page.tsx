/**
 * @file story-detail-page.tsx
 * @description P126: Story detail page using real storiesService data.
 * Route: /story/:id
 *
 * Visibility enforcement:
 * - public: visible to everyone
 * - shared/private: visible to author only (shared /live enforcement deferred)
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, LockIcon } from 'lucide-react';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { VisibilityBadge } from '@/app/components/shared/visibility-badge';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/mixpanel';
import type { StoryWithAuthor, PersonRef } from '@/app/types';

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-[44px] px-3"
      aria-label="Go back"
    >
      <ArrowLeft size={16} />
      Back
    </Button>
  );
}

export function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'private' | 'network_error' | null>(null);
  const [story, setStory] = useState<StoryWithAuthor | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const hasTrackedView = useRef(false);

  useEffect(() => {
    async function loadStory() {
      if (!id) {
        setError('not_found');
        setLoading(false);
        return;
      }

      // Wait for auth to settle before checking visibility
      if (authLoading) return;

      // Reset state for re-fetches (e.g., when user?.id changes)
      setError(null);
      setLoading(true);
      setStory(null);

      try {
        const data = await storiesService.getStory(id);

        if (!data) {
          setError('not_found');
          setLoading(false);
          return;
        }

        // Visibility enforcement: private/shared stories only visible to author
        if (data.visibility !== 'public' && data.authorId !== user?.id) {
          setError('private');
          setLoading(false);
          return;
        }

        setStory(data);
        setLoading(false);

        // Track view
        if (!hasTrackedView.current) {
          hasTrackedView.current = true;
          analytics.track('story_viewed', {
            story_id: data.id,
            is_own_story: data.authorId === user?.id,
          });
        }
      } catch (err) {
        console.error('Error loading story:', err);
        setError('network_error');
        setLoading(false);
      }
    }

    loadStory();
  }, [id, retryKey, user?.id, authLoading]);

  const handleBack = useCallback(() => {
    const isInternalReferrer = document.referrer && document.referrer.includes(window.location.host);
    if (isInternalReferrer) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const handleRetry = useCallback(() => {
    setRetryKey(k => k + 1);
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="h-4 bg-muted rounded w-20 mb-6 animate-pulse" />
        <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-muted rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-muted rounded w-32 mb-2" />
                <div className="h-3 bg-muted rounded w-24" />
              </div>
            </div>
            <div className="h-6 bg-muted rounded w-3/4 mb-3" />
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Private story error
  if (error === 'private') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <BackButton onClick={handleBack} />
        <div className="text-center py-12 space-y-3">
          <LockIcon className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">This story is private</p>
        </div>
      </div>
    );
  }

  // Error or not found
  if (error || !story) {
    const isNetworkError = error === 'network_error';
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <BackButton onClick={handleBack} />
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">
            {isNetworkError
              ? 'Failed to load story. Please check your connection.'
              : 'Story not found'}
          </p>
          {isNetworkError && (
            <Button
              onClick={handleRetry}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const authorPerson: PersonRef = {
    name: story.authorName,
    slug: story.authorSlug,
    avatarColor: story.authorAvatarColor,
    avatarUrl: story.authorAvatarUrl,
    hasPledged: false, // We don't have pledge status from stories join — false is safe (no badge)
  };

  const formattedDate = new Date(story.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Back button */}
      <BackButton onClick={handleBack} />

      {/* Story card */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-6">
          {/* Author row */}
          <div className="flex items-center gap-3 mb-4">
            <Link to={`/p/${story.authorSlug}`}>
              <PersonAvatar person={authorPerson} size="md" />
            </Link>
            <div className="flex-1 min-w-0">
              <Link
                to={`/p/${story.authorSlug}`}
                className="font-medium text-sm hover:underline truncate block"
              >
                {story.authorName}
              </Link>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formattedDate}</span>
                <VisibilityBadge visibility={story.visibility} />
              </div>
            </div>
          </div>

          {/* Content */}
          <p className="text-foreground whitespace-pre-wrap leading-relaxed">
            {story.content}
          </p>

          {/* Footer stats */}
          {story.understoodCount > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {story.understoodCount} understood
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StoryDetailPage;
