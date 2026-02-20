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
import { ArrowLeft, LockIcon, Pin, X, Loader2, Plus, Search, Link2, Unlink } from 'lucide-react';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { useVerificationGate } from '@/app/hooks/useVerificationGate';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { analytics } from '@/lib/mixpanel';
import { supabase } from '@/lib/supabase';
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
      {orphanPoint && (
        <p className="text-sm text-amber-600">
          Please retry linking "{orphanPoint.statement}" or cancel before adding new points.
        </p>
      )}
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
// P401: Linked Points Editor — lets story author search & link existing points
// ---------------------------------------------------------------------------

interface PointSearchResult {
  id: string;
  statement: string;
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

function LinkedPointsEditor({
  storyId,
  authorId,
  currentUserId,
  existingPoints,
  onPointLinked,
  onPointUnlinked,
}: {
  storyId: string;
  authorId: string;
  currentUserId: string;
  existingPoints: PointSummary[];
  onPointLinked: (point: PointSummary) => void;
  onPointUnlinked: (pointId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PointSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<PointSearchResult | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Don't show already-linked points in results
  const existingPointIds = new Set(existingPoints.map(p => p.id));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('points')
          .select('id, statement')
          .ilike('statement', `%${trimmed}%`)
          .limit(10);

        if (!error && data) {
          setResults((data as PointSearchResult[]).filter(p => !existingPointIds.has(p.id)));
        }
      } catch {
        // Ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, existingPointIds]);

  const handleSelectPoint = async (point: PointSearchResult) => {
    setSelectedPoint(point);
    setQuery('');
    setResults([]);

    // Pre-fill position if user already has one on this point
    try {
      const existing = await pointsService.getMyPosition(point.id, currentUserId);
      setSelectedPosition(existing?.position ?? null);
    } catch {
      setSelectedPosition(null);
    }
  };

  const handleSaveLink = async () => {
    if (!selectedPoint || !selectedPosition) return;
    setIsSaving(true);

    try {
      // 1. Link point to story
      const linked = await storiesService.linkPointToStory(storyId, selectedPoint.id);
      if (!linked) {
        toast.error('Failed to link point. Please try again.');
        setIsSaving(false);
        return;
      }

      // 2. Set position (required for P401 integrity: story-point link requires a position)
      await pointsService.setPosition(selectedPoint.id, currentUserId, selectedPosition);

      onPointLinked({
        id: selectedPoint.id,
        statement: selectedPoint.statement,
        tags: [],
      });

      analytics.track('point_linked_to_story', {
        story_id: storyId,
        point_id: selectedPoint.id,
        position: selectedPosition,
      });

      setSelectedPoint(null);
      setSelectedPosition(null);
      toast.success('Point linked');
    } catch {
      toast.error('Failed to link point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlink = async (point: PointSummary) => {
    onPointUnlinked(point.id);

    try {
      const success = await storiesService.unlinkPointFromStory(storyId, point.id);
      if (!success) {
        onPointLinked(point);
        toast.error('Failed to unlink point.');
        return;
      }
      toast('Point unlinked');
    } catch {
      onPointLinked(point);
      toast.error('Failed to unlink point.');
    }
  };

  // Only visible to story author
  if (authorId !== currentUserId) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Link2 size={14} />
        Link to an Existing Point
      </h3>

      {/* Currently linked points (with unlink) */}
      {existingPoints.length > 0 && (
        <div className="space-y-2 mb-4">
          {existingPoints.map(point => (
            <div key={point.id} className="flex items-start gap-2 group">
              <Pin size={14} className="text-blue-600 mt-1 shrink-0" />
              <p className="text-sm text-foreground flex-1 leading-snug">{point.statement}</p>
              <button
                type="button"
                onClick={() => handleUnlink(point)}
                className="shrink-0 w-[36px] h-[36px] flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Unlink: ${point.statement.slice(0, 30)}`}
              >
                <Unlink size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Point picker — shown when no point is selected */}
      {!selectedPoint && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search for a point to link..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {isSearching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
            )}
          </div>
          {results.length > 0 && (
            <div className="border border-border rounded-md divide-y divide-border bg-card">
              {results.map(point => (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => handleSelectPoint(point)}
                  className="w-full text-left px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
                >
                  {point.statement}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Position selector — shown after a point is selected */}
      {selectedPoint && (
        <div className="border border-border rounded-md p-3 space-y-3 bg-muted/40">
          <div className="flex items-start gap-2">
            <Pin size={14} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-foreground flex-1">{selectedPoint.statement}</p>
            <button
              type="button"
              onClick={() => { setSelectedPoint(null); setSelectedPosition(null); }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Cancel selection"
            >
              <X size={14} />
            </button>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Select your position to complete the link:</p>
            <PositionButtons
              userPosition={selectedPosition}
              counts={EMPTY_COUNTS}
              onPositionClick={(pos) => setSelectedPosition(prev => prev === pos ? null : pos)}
              compact
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSaveLink}
              disabled={!selectedPosition || isSaving}
              className="bg-blue-500 hover:bg-blue-600 text-white min-h-[36px] text-sm"
            >
              {isSaving ? (
                <><Loader2 size={14} className="animate-spin" /> Linking...</>
              ) : (
                <><Plus size={14} /> Link Point</>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setSelectedPoint(null); setSelectedPosition(null); }}
              className="min-h-[36px] text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
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

  // P132: Position recording handler
  const handlePositionClick = useCallback(async (pointId: string, position: PositionType) => {
    // P396: checkVerified handles both unauthenticated (toast) and authenticated paths
    if (!checkVerified('set a position on this point')) return;

    // Optimistic update
    setUserPositions(prev => {
      const updated = new Map(prev);
      const current = updated.get(pointId);

      // Toggle: if same position, remove it; otherwise set new position
      if (current?.position === position) {
        updated.delete(pointId);
      } else {
        updated.set(pointId, {
          id: current?.id || '',
          pointId,
          userId: user.id,
          position,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
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
      // (moved outside state setter to avoid race condition)
      if (user?.id) {
        try {
          const positions = await pointsService.getMyPositionsForPoints([pointId], user.id);
          setUserPositions(prev => new Map([...prev, ...positions]));
        } catch (fetchError) {
          console.error('Failed to revert position:', fetchError);
          // If re-fetch also fails, just clear this point's position
          setUserPositions(prev => {
            const updated = new Map(prev);
            updated.delete(pointId);
            return updated;
          });
        }
      }

      toast.error('Failed to save position. Please try again.');
    }
  }, [user?.id, checkVerified, story?.id, navigate, location.pathname]);

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

      {/* P131: Author-only points management section (below rich view) */}
      {isAuthor && (
        <KeyPointsSection
          storyId={story.id}
          points={story.points}
          isAuthor={isAuthor}
          justCreated={justCreated}
          isAuthenticated={!!user}
          onPointAdded={handlePointAdded}
          onPointUnlinked={handlePointUnlinked}
        />
      )}

      {/* P401: Author-only link-to-existing-point section */}
      {isAuthor && user?.id && (
        <LinkedPointsEditor
          storyId={story.id}
          authorId={story.authorId}
          currentUserId={user.id}
          existingPoints={story.points}
          onPointLinked={handlePointAdded}
          onPointUnlinked={handlePointUnlinked}
        />
      )}
    </div>
  );
}

export default StoryDetailPage;
