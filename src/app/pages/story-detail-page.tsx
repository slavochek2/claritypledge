/**
 * @file story-detail-page.tsx
 * @description P132: Story detail page with rich view and position recording.
 * Route: /story/:id
 *
 * Features:
 * - Rich story view using StoryCardDetail component
 * - Position recording on linked points
 * - Batch fetching for position data
 * - Visibility enforcement (public visible to all, shared/private to author only)
 *
 * P131 points management (author only):
 * - Author can add points (inline form) and unlink points (with undo toast)
 * - justCreated flow shows educational empty state with expanded form
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LockIcon, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { useVerificationGate } from '@/app/hooks/useVerificationGate';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { analytics } from '@/lib/mixpanel';
import { PositionButtons, type SevenPointCounts } from '@/app/prototypes/linkedin-like/components/shared';
import type { StoryWithPoints, PointSummary, PointPosition, PositionType } from '@/app/types';

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
// Inline add-point form
// ---------------------------------------------------------------------------

function AddPointForm({
  storyId,
  currentUserId,
  onPointAdded,
  autoFocus,
  onCancel,
  showCancel,
}: {
  storyId: string;
  currentUserId: string;
  onPointAdded: (point: PointSummary, position?: PositionType) => void;
  autoFocus?: boolean;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const [statement, setStatement] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);
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

      if (selectedPosition) {
        await pointsService.setPosition(orphanPoint.id, currentUserId, selectedPosition);
      }

      onPointAdded(summary, selectedPosition ?? undefined);
      setOrphanPoint(null);
      setStatement('');
      setSelectedPosition(null);
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

      if (selectedPosition) {
        const positioned = await pointsService.setPosition(point.id, currentUserId, selectedPosition);
        if (!positioned) {
          toast.error('Point added but position could not be saved.');
        }
      }

      onPointAdded(summary, selectedPosition ?? undefined);
      setStatement('');
      setSelectedPosition(null);
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

  const canSubmit = statement.trim().length > 0 && !!selectedPosition && !isAdding;

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
      <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
        <Textarea
          ref={textareaRef}
          value={statement}
          onChange={handleChange}
          placeholder="State your point..."
          disabled={isAdding || !!orphanPoint}
          className="min-h-[80px] resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
              handleAdd();
            }
          }}
        />
        {orphanPoint && (
          <p className="text-sm text-amber-600">
            Please retry linking "{orphanPoint.statement}" or cancel before adding new points.
          </p>
        )}
        <div className="flex items-center justify-between">
          <PositionButtons
            userPosition={selectedPosition}
            counts={EMPTY_COUNTS}
            onPositionClick={(pos) => setSelectedPosition(prev => prev === pos ? null : pos)}
            compact
          />
          <span className="text-xs text-muted-foreground">
            {statement.length >= POINT_CHAR_SOFT
              ? <span>Under 140 is punchiest · {statement.length}/{POINT_CHAR_MAX}</span>
              : statement.length > 0
                ? `${statement.length}/${POINT_CHAR_MAX}`
                : null}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span />
        <div className="flex items-center gap-2">
          {showCancel && onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
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
                </span>
              </TooltipTrigger>
              {(!statement.trim() || !selectedPosition) && (
                <TooltipContent side="top">
                  {!statement.trim() && !selectedPosition
                    ? 'Write a point and pick your position first'
                    : !selectedPosition
                      ? 'Pick your position first'
                      : 'Write your point first'}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

const EMPTY_COUNTS: SevenPointCounts = {
  strongly_agree: 0,
  agree: 0,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

// ---------------------------------------------------------------------------
// Key Points section
// ---------------------------------------------------------------------------

function KeyPointsSection({
  storyId,
  currentUserId,
  pointCount,
  justCreated,
  onPointAdded,
}: {
  storyId: string;
  currentUserId: string;
  pointCount: number;
  justCreated: boolean;
  onPointAdded: (point: PointSummary, position?: PositionType) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  // Auto-expand form on justCreated with 0 points
  const autoExpand = justCreated && pointCount === 0;

  return (
    <div className="mt-6">
      {/* justCreated banner */}
      {justCreated && pointCount === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
          Story saved. Now add key points — claims others can agree or disagree with.
        </div>
      )}

      {/* Author: empty state (non-justCreated) */}
      {pointCount === 0 && !autoExpand && !showForm && (
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
      {(autoExpand || showForm) && (
        <AddPointForm
          storyId={storyId}
          currentUserId={currentUserId}
          onPointAdded={(point, position) => {
            onPointAdded(point, position);
            // Keep form open for sequential adds
          }}
          autoFocus={autoExpand}
          showCancel={showForm && !autoExpand}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Author: expand button (when there are already points and form is hidden) */}
      {pointCount > 0 && !showForm && !autoExpand && (
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
  const { checkVerified } = useVerificationGate();

  const justCreated = !!(location.state as { justCreated?: boolean } | null)?.justCreated;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'private' | 'network_error' | null>(null);
  const [story, setStory] = useState<StoryWithPoints | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const hasTrackedView = useRef(false);

  // P132: Position data state
  const [positionCounts, setPositionCounts] = useState<Map<string, Record<PositionType, number>>>(new Map());
  const [userPositions, setUserPositions] = useState<Map<string, PointPosition>>(new Map());
  // Positions of the story author on their own points (for display badges, independent of viewer)
  const [storyAuthorPositions, setStoryAuthorPositions] = useState<Map<string, PointPosition>>(new Map());

  // P132: Guard for position removal — shows confirmation dialog with linked-story count
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: user?.id ?? '',
    onAfterRemove: useCallback(async (pointId: string) => {
      setUserPositions(prev => {
        const updated = new Map(prev);
        updated.delete(pointId);
        return updated;
      });
      // If viewer is author, storyAuthorPositions mirrors userPositions
      setStoryAuthorPositions(prev => {
        const updated = new Map(prev);
        updated.delete(pointId);
        return updated;
      });
      try {
        const counts = await pointsService.getPositionCountsForPoints([pointId]);
        setPositionCounts(prev => new Map([...prev, ...counts]));
      } catch (err) {
        console.error('Failed to refresh position counts after removal:', err);
      }
    }, []),
  });

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

        // P132: Fetch position data for linked points
        if (data.points.length > 0) {
          try {
            const pointIds = data.points.map(p => p.id);
            const viewerIsAuthor = user?.id === data.authorId;

            // Batch fetch position data
            const [counts, positions, authorPositions] = await Promise.all([
              pointsService.getPositionCountsForPoints(pointIds),
              user?.id ? pointsService.getMyPositionsForPoints(pointIds, user.id) : Promise.resolve(new Map()),
              // Always fetch story author's positions for display badges (independent of viewer)
              pointsService.getMyPositionsForPoints(pointIds, data.authorId),
            ]);

            setPositionCounts(counts);
            setUserPositions(positions);
            // If viewer is the author, reuse viewer positions to avoid redundant state
            setStoryAuthorPositions(viewerIsAuthor ? positions : authorPositions);
          } catch (err) {
            console.error('Error loading position data:', err);
            // Non-fatal - show story without position data
          }
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

  const handlePointAdded = useCallback((point: PointSummary, position?: PositionType) => {
    setStory(prev => {
      if (!prev) return prev;
      // Avoid duplicates (e.g., from undo re-link)
      if (prev.points.some(p => p.id === point.id)) return prev;
      return { ...prev, points: [...prev.points, point] };
    });
    if (position && user?.id) {
      const entry: PointPosition = {
        id: '',
        pointId: point.id,
        userId: user.id,
        position,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setUserPositions(prev => new Map([...prev, [point.id, entry]]));
      setStoryAuthorPositions(prev => new Map([...prev, [point.id, entry]]));
      setPositionCounts(prev => {
        const current = prev.get(point.id) ?? { agree: 0, disagree: 0, unsure: 0 } as Record<PositionType, number>;
        return new Map([...prev, [point.id, { ...current, [position]: (current[position] ?? 0) + 1 }]]);
      });
    }
  }, [user?.id]);

  // P132: Position recording handler
  const handlePositionClick = useCallback(async (pointId: string, position: PositionType) => {
    // P396: checkVerified handles both unauthenticated (toast) and authenticated paths
    if (!checkVerified('set a position on this point')) return;
    if (!user?.id) return;

    const isTogglingOff = userPositions.get(pointId)?.position === position;

    if (isTogglingOff) {
      // Guard shows confirmation dialog — actual removal + state refresh handled in onAfterRemove
      await guardedRemovePosition(pointId);
      return;
    }

    // Optimistic update for setting a new position
    setUserPositions(prev => {
      const updated = new Map(prev);
      const current = updated.get(pointId);
      updated.set(pointId, {
        id: current?.id || '',
        pointId,
        userId: user.id,
        position,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return updated;
    });

    try {
      await pointsService.setPosition(pointId, user.id, position);

      // Refresh position counts
      const counts = await pointsService.getPositionCountsForPoints([pointId]);
      setPositionCounts(prev => new Map([...prev, ...counts]));

      analytics.track('position_recorded', {
        story_id: story?.id,
        point_id: pointId,
        position,
      });
    } catch (error) {
      console.error('Failed to save position:', error);

      // Revert optimistic update by re-fetching the correct state
      if (user?.id) {
        try {
          const positions = await pointsService.getMyPositionsForPoints([pointId], user.id);
          setUserPositions(prev => new Map([...prev, ...positions]));
        } catch (fetchError) {
          console.error('Failed to revert position:', fetchError);
          setUserPositions(prev => {
            const updated = new Map(prev);
            updated.delete(pointId);
            return updated;
          });
        }
      }

      toast.error('Failed to save position. Please try again.');
    }
  }, [user?.id, checkVerified, story?.id, userPositions, guardedRemovePosition]);

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

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <RemovePositionDialog {...dialogProps} />

      {/* Back button */}
      <BackButton onClick={handleBack} />

      {/* P132: Rich story view with position recording */}
      <StoryCardDetail
        story={story}
        linkedPoints={story.points}
        positionCounts={positionCounts}
        userPositions={userPositions}
        profileOwnerPositions={storyAuthorPositions}
        onPositionClick={handlePositionClick}
        isDetailView={true}
        context="story-detail"
      />

      {/* P131: Author-only add-point form (below rich view) */}
      {isAuthor && (
        <KeyPointsSection
          storyId={story.id}
          currentUserId={user?.id ?? ''}
          pointCount={story.points.length}
          justCreated={justCreated}
          onPointAdded={handlePointAdded}
        />
      )}
    </div>
  );
}

export default StoryDetailPage;
