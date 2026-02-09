/**
 * @file story-detail-page.tsx
 * @description P126+P131: Story detail page with linked points management.
 * Route: /story/:id
 *
 * Visibility enforcement:
 * - public: visible to everyone
 * - shared/private: visible to author only (shared /live enforcement deferred)
 *
 * Points (P131):
 * - Author can add points (inline form) and unlink points (with undo toast)
 * - Non-author sees points read-only (hidden if 0 points)
 * - justCreated flow shows educational empty state with expanded form
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, LockIcon, Pin, X, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { VisibilityBadge } from '@/app/components/shared/visibility-badge';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { analytics } from '@/lib/mixpanel';
import type { StoryWithPoints, PointSummary, PersonRef } from '@/app/types';

/** Soft character marker — nudge to keep points concise */
const POINT_CHAR_SOFT = 140;
/** Hard character max */
const POINT_CHAR_MAX = 500;

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

// ---------------------------------------------------------------------------
// Point display card (read-only + optional unlink)
// ---------------------------------------------------------------------------

function PointCard({
  point,
  canUnlink,
  onUnlink,
}: {
  point: PointSummary;
  canUnlink: boolean;
  onUnlink?: (point: PointSummary) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-l-4 border-l-slate-400 pl-3 py-2 group">
      <Pin size={16} className="text-blue-600 mt-0.5 shrink-0" />
      <p className="text-sm text-foreground flex-1">{point.statement}</p>
      {canUnlink && onUnlink && (
        <button
          type="button"
          onClick={() => onUnlink(point)}
          className="shrink-0 w-[44px] h-[44px] -m-2 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={`Unlink point: ${point.statement.slice(0, 30)}`}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline add-point form
// ---------------------------------------------------------------------------

function AddPointForm({
  storyId,
  onPointAdded,
  autoFocus,
  onCancel,
  showCancel,
}: {
  storyId: string;
  onPointAdded: (point: PointSummary) => void;
  autoFocus?: boolean;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const [statement, setStatement] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [orphanPoint, setOrphanPoint] = useState<{ id: string; statement: string; context?: string; tags: string[] } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= POINT_CHAR_MAX) {
      setStatement(e.target.value);
    }
  };

  const handleRetryLink = async () => {
    if (!orphanPoint) return;

    setIsAdding(true);
    try {
      const linked = await storiesService.linkPointToStory(storyId, orphanPoint.id);
      if (!linked) {
        toast.error('Linking failed again. Please try later.');
        setIsAdding(false);
        return;
      }

      const summary: PointSummary = {
        id: orphanPoint.id,
        statement: orphanPoint.statement,
        context: orphanPoint.context,
        tags: orphanPoint.tags,
      };

      onPointAdded(summary);
      setOrphanPoint(null);
      setStatement('');
      setIsAdding(false);

      analytics.track('point_created', {
        point_id: orphanPoint.id,
        story_id: storyId,
        char_count: orphanPoint.statement.length,
      });

      textareaRef.current?.focus();
    } catch {
      toast.error('Failed to link point. Please try again.');
      setIsAdding(false);
    }
  };

  const handleAdd = async () => {
    const trimmed = statement.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    try {
      // Create point
      const point = await pointsService.createPoint(trimmed, undefined, []);
      if (!point) {
        toast.error('Failed to create point. Please try again.');
        setIsAdding(false);
        return;
      }

      // Link to story
      const linked = await storiesService.linkPointToStory(storyId, point.id);
      if (!linked) {
        // Save orphan point for retry
        setOrphanPoint(point);
        setIsAdding(false);
        return;
      }

      const summary: PointSummary = {
        id: point.id,
        statement: point.statement,
        context: point.context,
        tags: point.tags,
      };

      onPointAdded(summary);
      setStatement('');
      setIsAdding(false);

      analytics.track('point_created', {
        point_id: point.id,
        story_id: storyId,
        char_count: trimmed.length,
      });

      // Return focus to textarea for sequential adds
      textareaRef.current?.focus();
    } catch {
      toast.error('Failed to add point. Please try again.');
      setIsAdding(false);
    }
  };

  const canSubmit = statement.trim().length > 0 && !isAdding;

  return (
    <div className="space-y-2">
      {orphanPoint && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <p className="text-amber-900 mb-2">Point created but linking failed. Retry to link it to your story.</p>
          <Button
            type="button"
            onClick={handleRetryLink}
            disabled={isAdding}
            className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
          >
            {isAdding ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Retrying...
              </>
            ) : (
              'Retry Link'
            )}
          </Button>
        </div>
      )}
      <Textarea
        ref={textareaRef}
        value={statement}
        onChange={handleChange}
        placeholder="State your point..."
        disabled={isAdding || !!orphanPoint}
        className="min-h-[80px] resize-y"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
            handleAdd();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!canSubmit || !!orphanPoint}
            className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
          >
            {isAdding ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus size={16} />
                Add Point
              </>
            )}
          </Button>
          {showCancel && onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {statement.length >= POINT_CHAR_SOFT && statement.length <= 200 && (
            <span className="mr-2">Under 140 is punchiest</span>
          )}
          {statement.length}/{POINT_CHAR_MAX}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key Points section
// ---------------------------------------------------------------------------

function KeyPointsSection({
  storyId,
  points,
  isAuthor,
  justCreated,
  isAuthenticated,
  onPointAdded,
  onPointUnlinked,
}: {
  storyId: string;
  points: PointSummary[];
  isAuthor: boolean;
  justCreated: boolean;
  isAuthenticated: boolean;
  onPointAdded: (point: PointSummary) => void;
  onPointUnlinked: (pointId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [_unlinkingPointId, setUnlinkingPointId] = useState<string | null>(null);

  // Auto-expand form on justCreated with 0 points (only if authenticated)
  const autoExpand = justCreated && isAuthor && isAuthenticated && points.length === 0;

  // Non-author with 0 points — hide entire section
  if (!isAuthor && points.length === 0) {
    return null;
  }

  // Author view but not authenticated — hide entire section (shouldn't happen, but defensive)
  if (isAuthor && !isAuthenticated) {
    return null;
  }

  const handleUnlink = async (point: PointSummary) => {
    // Optimistic removal
    onPointUnlinked(point.id);
    setUnlinkingPointId(point.id);

    try {
      // Actually unlink on the backend (await before showing undo)
      const success = await storiesService.unlinkPointFromStory(storyId, point.id);

      if (!success) {
        // Unlink failed — re-add point to UI
        onPointAdded(point);
        setUnlinkingPointId(null);
        toast.error('Failed to unlink point.');
        return;
      }

      // Success — show undo toast
      setUnlinkingPointId(null);
      toast('Point unlinked', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const relinked = await storiesService.linkPointToStory(storyId, point.id);
            if (relinked) {
              onPointAdded(point);
            } else {
              toast.error('Failed to undo. Please re-add the point manually.');
            }
          },
        },
        duration: 5000,
      });
    } catch {
      // Network error — re-add point
      onPointAdded(point);
      setUnlinkingPointId(null);
      toast.error('Failed to unlink point.');
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        Key Points{points.length > 0 ? ` (${points.length})` : ''}
      </h3>

      {/* Educational empty state (justCreated only) */}
      {autoExpand && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            What claims does your story make?
          </p>
          <p className="text-sm text-muted-foreground">
            A Point is a statement others can agree or disagree with — the core of what you believe.
          </p>
          <p className="text-sm text-muted-foreground italic">
            e.g. &ldquo;Remote teams need trust more than tools&rdquo;
          </p>
        </div>
      )}

      {/* Point list */}
      {points.length > 0 && (
        <div className="space-y-2 mb-4">
          {points.map((point) => (
            <PointCard
              key={point.id}
              point={point}
              canUnlink={isAuthor}
              onUnlink={handleUnlink}
            />
          ))}
        </div>
      )}

      {/* Author: empty state (non-justCreated) */}
      {isAuthor && points.length === 0 && !autoExpand && !showForm && (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mb-4">
          <p className="text-sm text-muted-foreground mb-3">
            No points yet. Points are claims others can agree or disagree with.
          </p>
          <Button
            variant="outline"
            className="min-h-[44px] w-full"
            onClick={() => setShowForm(true)}
          >
            <Plus size={16} />
            Add a Point
          </Button>
        </div>
      )}

      {/* Author: form (auto-expanded on justCreated, or toggled) */}
      {isAuthor && (autoExpand || showForm) && (
        <AddPointForm
          storyId={storyId}
          onPointAdded={(point) => {
            onPointAdded(point);
            // Keep form open for sequential adds
          }}
          autoFocus={autoExpand}
          showCancel={showForm && !autoExpand}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Author: expand button (when there are already points and form is hidden) */}
      {isAuthor && points.length > 0 && !showForm && !autoExpand && (
        <Button
          variant="outline"
          className="min-h-[44px] w-full"
          onClick={() => setShowForm(true)}
        >
          <Plus size={16} />
          Add a Point
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const justCreated = !!(location.state as { justCreated?: boolean } | null)?.justCreated;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'private' | 'network_error' | null>(null);
  const [story, setStory] = useState<StoryWithPoints | null>(null);
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
        const data = await storiesService.getStoryWithPoints(id);

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

  const handlePointAdded = useCallback((point: PointSummary) => {
    setStory(prev => {
      if (!prev) return prev;
      // Avoid duplicates (e.g., from undo re-link)
      if (prev.points.some(p => p.id === point.id)) return prev;
      return { ...prev, points: [...prev.points, point] };
    });
  }, []);

  const handlePointUnlinked = useCallback((pointId: string) => {
    setStory(prev => {
      if (!prev) return prev;
      return { ...prev, points: prev.points.filter(p => p.id !== pointId) };
    });
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

  const isAuthor = story.authorId === user?.id;

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

      {/* Key Points section */}
      <KeyPointsSection
        storyId={story.id}
        points={story.points}
        isAuthor={isAuthor}
        justCreated={justCreated}
        isAuthenticated={!!user}
        onPointAdded={handlePointAdded}
        onPointUnlinked={handlePointUnlinked}
      />
    </div>
  );
}

export default StoryDetailPage;
