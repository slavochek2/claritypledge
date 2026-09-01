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
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { extractHashtags } from '@/lib/utils';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { LockIcon, Loader2, Pencil, Trash2, Globe, ImagePlus } from 'lucide-react';
import { VisibilityLine } from '@/app/components/shared/visibility-line';
import { FocusHeader } from '@/app/components/layout/focus-header';

import { StoryCardWithLinks, type StoryAuthor } from '@/app/components/social/story-card-with-links';
import type { Story as ProtoStory, Point as ProtoPoint } from '@/app/components/shared/prototype-types';
import { useAuth } from '@/auth';
import { storiesService } from '@/app/data/stories-service';
import { resolveStorySlug } from '@/app/data/stories-service-real';
import { pointsService } from '@/app/data/points-service';
import { useVerificationGate } from '@/app/hooks/useVerificationGate';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { SEO } from '@/app/components/seo';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { analytics } from '@/lib/mixpanel';
import { uploadStoryImage } from '@/app/data/story-image-service';
import { StoryImage } from '@/app/components/shared/story-image';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared';
import type { StoryWithPoints, StoryWithAuthor, PointSummary, PointPosition, PositionType, ContentVisibility } from '@/app/types';

/** Soft character marker — nudge to keep points concise */
const POINT_CHAR_SOFT = 140;
/** Hard character max */
const POINT_CHAR_MAX = 1000;

/** Story edit soft nudge */
const STORY_CHAR_SOFT = 2000;
/** Story edit hard max (mirrors DB CHECK constraint) */
const STORY_CHAR_MAX = 10000;

/** Display length: count only visible text, excluding URL portions of [text](url) links. */
const LINK_RE = /\[([^\]]*)\]\(https?:\/\/[^)]+\)/g;
function displayLength(text: string): number {
  // Replace each [label](url) with just the label, then measure
  return text.replace(LINK_RE, '$1').length;
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
// Inline add-point form
// ---------------------------------------------------------------------------

function AddPointForm({
  storyId,
  currentUserId,
  onPointAdded,
  autoFocus,
  onCancel,
  showCancel,
  docVisibility,
}: {
  storyId: string;
  currentUserId: string;
  onPointAdded: (point: PointSummary, position?: PositionType) => void;
  autoFocus?: boolean;
  onCancel?: () => void;
  showCancel?: boolean;
  /** P551/P590: Show privacy/public banner and contextual label based on doc visibility */
  docVisibility?: ContentVisibility;
}) {
  const [statement, setStatement] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [orphanPoint, setOrphanPoint] = useState<{ id: string; statement: string; context?: string; tags: string[]; visibility?: ContentVisibility } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (displayLength(val) <= POINT_CHAR_MAX) {
      setStatement(val);
    }
  };

  const handleRetryLink = async () => {
    if (!orphanPoint) return;

    setIsAdding(true);
    try {
      const linked = await storiesService.linkPointToStory(storyId, orphanPoint.id, currentUserId);
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
        visibility: orphanPoint.visibility,
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
      // Create point — P607: inherit story visibility
      const point = await pointsService.createPoint(trimmed, undefined, extractHashtags(trimmed), docVisibility);
      if (!point) {
        toast.error('Failed to create point. Please try again.');
        setIsAdding(false);
        return;
      }

      // Link to story
      const linked = await storiesService.linkPointToStory(storyId, point.id, currentUserId);
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
        visibility: point.visibility,
      };

      if (selectedPosition) {
        await pointsService.setPosition(point.id, currentUserId, selectedPosition);
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
    } catch (err: unknown) {
      // P551: Cross-visibility error — DB trigger rejects linking private point to public story
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('visibility')) {
        toast.error('This point is private and cannot be linked to a public story. To discuss this topic publicly, create a new public point.');
      } else {
        toast.error('Failed to add point. Please try again.');
      }
      setIsAdding(false);
    }
  };

  const canSubmit = statement.trim().length > 0 && !!selectedPosition && !isAdding;

  return (
    <div className="space-y-2">
      {/* P610: Visibility banner when adding points */}
      <VisibilityLine
        visibility={docVisibility ?? 'public'}
        source={docVisibility === 'private' ? 'Matches story visibility' : 'Visible on your profile'}
      />
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
          className="min-h-[100px] resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
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
        {statement.length > 0 && (() => {
          const dl = displayLength(statement);
          const hasLinks = dl < statement.length;
          return (
            <p className={`text-xs ${dl >= POINT_CHAR_MAX ? 'text-destructive font-medium' : dl >= POINT_CHAR_SOFT ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {dl >= POINT_CHAR_SOFT
                ? <>Under 140 is punchiest · {dl}/{POINT_CHAR_MAX}{hasLinks && ' (links excluded)'}</>
                : <>{dl}/{POINT_CHAR_MAX}{hasLinks && ' (links excluded)'}</>}
            </p>
          );
        })()}
        <p className="text-xs text-muted-foreground">
          Paste URLs or write <code className="text-xs bg-muted px-1 py-0.5 rounded">[click here](https://...)</code> for named links
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PositionButtons
            userPosition={selectedPosition}
            counts={EMPTY_COUNTS}
            onPositionClick={(pos) => setSelectedPosition(prev => prev === pos ? null : pos)}
            compact
          />
          <div className="flex items-center gap-2 ml-auto">
            {showCancel && onCancel && (
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
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
                      ) : docVisibility === 'private' ? (
                        <>
                          <LockIcon size={16} />
                          Add Private Point
                        </>
                      ) : docVisibility === 'public' ? (
                        <>
                          <Globe size={16} />
                          Add Public Point
                        </>
                      ) : (
                        <>
                          <Globe size={16} />
                          Add Public Point
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Author action row (author-only): read-only visibility badge
// Visibility is set at creation and cannot be changed (P586).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Key Points section
// ---------------------------------------------------------------------------

function KeyPointsSection({
  storyId,
  currentUserId,
  pointCount,
  justCreated,
  addPointRequested,
  showFormTrigger,
  onPointAdded,
  docVisibility,
}: {
  storyId: string;
  currentUserId: string;
  pointCount: number;
  justCreated: boolean;
  /** When true (from ?addPoint=true query param), auto-expand the form */
  addPointRequested: boolean;
  /** Incrementing counter — each bump opens the form (used by in-card CTA) */
  showFormTrigger: number;
  onPointAdded: (point: PointSummary, position?: PositionType) => void;
  /** P551/P590: Doc visibility context — controls banner and button label in add-point form */
  docVisibility?: ContentVisibility;
}) {
  const [showForm, setShowForm] = useState(false);

  // Open form when triggered from in-card CTA
  useEffect(() => {
    if (showFormTrigger > 0) setShowForm(true);
  }, [showFormTrigger]);

  // Auto-expand form on justCreated with 0 points
  const autoExpand = justCreated && pointCount === 0;

  return (
    <div className="mt-6">
      {/* P610: removed justCreated educational banner — VisibilityLine inside
         AddPointForm now provides the primary context; two stacked blue banners
         was visually noisy and the guidance was redundant for users who just
         created a story and clicked "Add Point". */}

      {/* Author: form (auto-expanded on justCreated or addPoint query param, or toggled) */}
      {(autoExpand || addPointRequested || showForm) && (
        <AddPointForm
          storyId={storyId}
          currentUserId={currentUserId}
          onPointAdded={(point, position) => {
            onPointAdded(point, position);
            // Keep form open for sequential adds
          }}
          autoFocus={autoExpand || addPointRequested}
          showCancel={showForm && !autoExpand}
          onCancel={() => setShowForm(false)}
          docVisibility={docVisibility}
        />
      )}

      {/* Expand button removed — CTA is now in the card footer via onAddPoint */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit story card (replaces StoryCardDetail in edit mode)
// ---------------------------------------------------------------------------

function EditStoryCard({
  content,
  onContentChange,
  isSaving,
  onSave,
  onCancel,
}: {
  content: string;
  onContentChange: (value: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canSave = content.trim().length > 0 && !isSaving;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSave) {
      onSave();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="bg-card border-2 border-blue-400 rounded-lg p-4 space-y-3">
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => {
          const val = e.target.value;
          onContentChange(val.length <= STORY_CHAR_MAX ? val : val.slice(0, STORY_CHAR_MAX));
        }}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className="min-h-[160px] resize-y"
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="Cancel editing"
          >
            Cancel
          </Button>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    onClick={onSave}
                    disabled={!canSave}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                    aria-label="Save story"
                    aria-busy={isSaving ? 'true' : 'false'}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin mr-1" />
                        Saving…
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {!content.trim() && (
                <TooltipContent side="top">Story can&apos;t be empty.</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        <span
          aria-live="polite"
          className={`text-xs ${content.length >= STORY_CHAR_MAX ? 'text-destructive font-medium' : content.length >= STORY_CHAR_SOFT ? 'text-amber-600' : 'text-muted-foreground'}`}
        >
          {content.length} / {STORY_CHAR_MAX}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete story dialog
// ---------------------------------------------------------------------------

function DeleteStoryDialog({
  open,
  linkedPointCount,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  open: boolean;
  linkedPointCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent hideCloseButton>
        <DialogHeader>
          <DialogTitle>Delete this story?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>This will permanently remove your story. Points linked to this story will not be deleted — others may still hold positions on them. Any previous versions of this story will also be permanently removed.</p>
              {linkedPointCount > 0 && (
                <p>This story has {linkedPointCount} linked point(s).</p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
            autoFocus
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-1" />
                Deleting…
              </>
            ) : (
              'Delete story'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, session, isLoading: authLoading } = useAuth();
  const { checkVerified } = useVerificationGate();

  // P551: Doc context — passed from doc detail or create-story page
  const locationState = location.state as { justCreated?: boolean; docId?: string; docTitle?: string } | null;
  const justCreated = !!locationState?.justCreated;
  const docContext = useMemo(() => locationState?.docId ? { docId: locationState.docId, docTitle: locationState.docTitle ?? 'Doc' } : null, [locationState?.docId, locationState?.docTitle]);
  // Counter — each bump opens the add-point form via KeyPointsSection
  const [addPointTrigger, setAddPointTrigger] = useState(0);

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
  // Other stories each linked point appears in (for linked-stories section in QuotedPoint)
  const [linkedStoriesForPoints, setLinkedStoriesForPoints] = useState<Map<string, StoryWithAuthor[]>>(new Map());

  // P427: Edit and Delete state
  const [isEditMode, setIsEditMode] = useState(() => searchParams.get('edit') === 'true');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // P616: Unlink point from story
  const [unlinkTargetPoint, setUnlinkTargetPoint] = useState<{ id: string; statement: string } | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const popstateHandlerRef = useRef<(() => void) | null>(null);
  // P591: Hidden file input for image change/add
  const imageInputRef = useRef<HTMLInputElement>(null);


  // Guard: reset edit mode if the loaded story is not owned by the current user
  // (prevents non-authors from opening edit mode via ?edit=true URL)
  // Also: populate editContent when story loads into an already-active edit mode
  // (covers the ?edit=true URL path where handleEditStart is never called)
  useEffect(() => {
    if (!story) return;
    if (story.authorId !== user?.id) {
      setIsEditMode(false);
    } else if (isEditMode && !editContent) {
      setEditContent(story.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omits isEditMode/editContent — only fires on story/user load
  }, [story, user?.id]);

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

      // Resolve slug (e.g. "st1", "st7") to UUID, or use id directly
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const storyId = isUuid ? id : await resolveStorySlug(id);

      if (!storyId) {
        setError('not_found');
        setLoading(false);
        return;
      }

      // If slug resolved to a different id, redirect to canonical UUID URL
      if (storyId !== id) {
        navigate(`/story/${storyId}${window.location.search}`, { replace: true });
        return;
      }

      // Wait for auth to settle before checking visibility
      if (authLoading) return;

      // Reset state for re-fetches (e.g., when user?.id changes)
      setError(null);
      setLoading(true);
      setStory(null);

      try {
        const data = await storiesService.getStoryWithPoints(storyId);

        if (!data) {
          setError('not_found');
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
            has_points: data.points.length > 0,
            viewer_authenticated: !!user?.id,
          });
        }

        // P132: Fetch position data and linked stories for linked points
        if (data.points.length > 0) {
          try {
            const pointIds = data.points.map(p => p.id);
            const viewerIsAuthor = user?.id === data.authorId;

            // Batch fetch position data + other stories for each point
            const [counts, positions, authorPositions, linkedStories] = await Promise.all([
              pointsService.getPositionCountsForPoints(pointIds),
              user?.id ? pointsService.getMyPositionsForPoints(pointIds, user.id) : Promise.resolve(new Map()),
              // Always fetch story author's positions for display badges (independent of viewer)
              pointsService.getMyPositionsForPoints(pointIds, data.authorId),
              // Fetch other public stories these points appear in (exclude current story)
              storiesService.getStoriesForPoints(pointIds, data.id),
            ]);

            setPositionCounts(counts);
            setUserPositions(positions);
            // If viewer is the author, reuse viewer positions to avoid redundant state
            setStoryAuthorPositions(viewerIsAuthor ? positions : authorPositions);
            setLinkedStoriesForPoints(linkedStories);
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
  }, [id, retryKey, user?.id, authLoading, navigate]);

  const pendingNavigateRef = useRef<string | null>(null);

  const handleBack = useCallback(() => {
    const isDirty = isEditMode && editContent !== (story?.content ?? '');
    // P551: If navigated from a doc, go back to that doc
    const target = docContext ? `/d/${docContext.docId}` : (story?.authorSlug ? `/p/${story.authorSlug}` : '/events');
    if (isDirty) {
      pendingNavigateRef.current = target;
      setShowUnsavedPrompt(true);
      return;
    }
    navigate(target);
  }, [isEditMode, editContent, story?.content, story?.authorSlug, navigate, docContext]);

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
        const current = prev.get(point.id) ?? { strongly_disagree: 0, disagree: 0, somewhat_disagree: 0, unsure: 0, somewhat_agree: 0, agree: 0, strongly_agree: 0 } as Record<PositionType, number>;
        return new Map([...prev, [point.id, { ...current, [position]: (current[position] ?? 0) + 1 }]]);
      });
    }
  }, [user?.id]);

  // P633: Unlink point click handler — opens confirmation dialog
  const handleUnlinkClick = useCallback((pointId: string, statement: string) => {
    setUnlinkTargetPoint({ id: pointId, statement });
  }, []);

  // P616: Unlink point confirm handler
  const handleUnlinkConfirm = useCallback(async () => {
    if (!story || !unlinkTargetPoint) return;
    setIsUnlinking(true);
    try {
      const ok = await storiesService.unlinkPointFromStory(story.id, unlinkTargetPoint.id);
      if (ok) {
        const removedId = unlinkTargetPoint.id;
        setStory(prev => {
          if (!prev) return prev;
          return { ...prev, points: prev.points.filter(p => p.id !== removedId) };
        });
        setPositionCounts(prev => { const m = new Map(prev); m.delete(removedId); return m; });
        setUserPositions(prev => { const m = new Map(prev); m.delete(removedId); return m; });
        setStoryAuthorPositions(prev => { const m = new Map(prev); m.delete(removedId); return m; });
        setLinkedStoriesForPoints(prev => { const m = new Map(prev); m.delete(removedId); return m; });
        toast.success('Point unlinked from story.');
      } else {
        toast.error('Failed to unlink point. Please try again.');
        setRetryKey(k => k + 1);
      }
    } catch {
      toast.error('Failed to unlink point. Please try again.');
      setRetryKey(k => k + 1);
    } finally {
      setIsUnlinking(false);
      setUnlinkTargetPoint(null);
    }
  }, [story, unlinkTargetPoint]);

  // P427: Edit handlers
  const handleEditStart = useCallback(() => {
    if (!story) return;
    setEditContent(story.content);
    setIsEditMode(true);
  }, [story]);

  const handleEditCancel = useCallback(() => {
    setIsEditMode(false);
    setEditContent('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!story || !editContent.trim()) return;
    setIsSaving(true);
    try {
      const updated = await storiesService.updateStory(story.id, { content: editContent, tags: extractHashtags(editContent) });
      if (updated) {
        setStory(prev => prev ? { ...prev, content: editContent } : prev);
        setIsEditMode(false);
        setEditContent('');
        toast.success('Story updated');
        analytics.track('story_edited', { story_id: story.id, char_count: editContent.length });
        setTimeout(() => editButtonRef.current?.focus(), 50);
      } else {
        toast.error('Failed to save. Try again.');
      }
    } catch {
      toast.error('Failed to save. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [story, editContent]);

  // P427: Delete handlers
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setTimeout(() => deleteButtonRef.current?.focus(), 0);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!story) return;
    setIsDeleting(true);
    const authorSlug = story.authorSlug;
    try {
      const success = await storiesService.deleteStory(story.id);
      if (success) {
        setDeleteDialogOpen(false);
        toast.success('Story deleted');
        analytics.track('story_deleted', { story_id: story.id, linked_point_count: story.points.length });
        navigate(`/p/${authorSlug}`);
      } else {
        toast.error('Failed to delete. Try again.');
      }
    } catch {
      toast.error('Failed to delete. Try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [story, navigate]);

  // P591: Image handlers (author only)
  const handleChangeImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleRemoveImage = useCallback(async () => {
    if (!story) return;
    const previousUrl = story.imageUrl;
    // Optimistic update
    setStory(prev => prev ? { ...prev, imageUrl: undefined } : prev);
    try {
      await storiesService.updateStory(story.id, { imageUrl: null });
      toast('Image removed', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            // Restore previous image URL
            setStory(prev => prev ? { ...prev, imageUrl: previousUrl } : prev);
            await storiesService.updateStory(story.id, { imageUrl: previousUrl });
          },
        },
      });
      analytics.track('story_image_removed', { story_id: story.id });
    } catch {
      // Revert optimistic update
      setStory(prev => prev ? { ...prev, imageUrl: previousUrl } : prev);
      toast.error('Failed to remove image. Please try again.');
    }
  }, [story]);

  const handleImageFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (!file || !story || !session?.access_token) return;

    try {
      const publicUrl = await uploadStoryImage(story.id, file, session.access_token);
      await storiesService.updateStory(story.id, { imageUrl: publicUrl });
      setStory(prev => prev ? { ...prev, imageUrl: publicUrl } : prev);
      toast.success('Image updated');
      analytics.track('story_image_changed', { story_id: story.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (message.includes('format') || message.includes('5MB')) {
        toast.error('Please use JPEG, PNG, or WebP format (max 5MB)');
      } else {
        toast.error('Failed to upload image. Please try again.');
      }
    }
  }, [story, session?.access_token]);

  // P427: Navigation guard — intercept browser back when edit mode is dirty.
  // BrowserRouter doesn't support useBlocker; use popstate + history.pushState instead.
  useEffect(() => {
    const isDirty = isEditMode && editContent !== (story?.content ?? '');

    // Remove any previously-registered handler
    if (popstateHandlerRef.current) {
      window.removeEventListener('popstate', popstateHandlerRef.current);
      popstateHandlerRef.current = null;
    }

    if (!isDirty) return;

    const handler = (e: PopStateEvent) => {
      // stopImmediatePropagation prevents React Router's own popstate listener
      // from processing this navigation (we registered with capture:true, so
      // we run before React Router's bubble-phase listener).
      e.stopImmediatePropagation();
      // Re-push the current URL to keep the browser on this page
      window.history.pushState(null, '', window.location.href);
      pendingNavigateRef.current = null; // will use fallback (profile page)
      setShowUnsavedPrompt(true);
    };

    popstateHandlerRef.current = handler;
    window.addEventListener('popstate', handler, { capture: true });

    return () => {
      window.removeEventListener('popstate', handler, { capture: true });
      popstateHandlerRef.current = null;
    };
  }, [isEditMode, editContent, story?.content]);

  // P427: Native beforeunload guard for hard refreshes / tab close
  useEffect(() => {
    const isDirty = isEditMode && editContent !== (story?.content ?? '');
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEditMode, editContent, story?.content]);

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
      <div className="max-w-2xl mx-auto px-4 py-8">
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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <FocusHeader onBack={handleBack} />
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
      <div className="max-w-2xl mx-auto px-4 py-8">
        <FocusHeader onBack={handleBack} />
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">
            {isNetworkError
              ? 'Failed to load story. Please check your connection.'
              : 'Story not found'}
          </p>
          {isNetworkError && (
            <Button onClick={handleRetry}>
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isEmbed = searchParams.get('embed') === 'true';
  const isAuthor = story.authorId === user?.id;

  // Embed mode: render StoryCardWithLinks as a compact card
  if (isEmbed) {
    const protoStory: ProtoStory = {
      id: story.id,
      authorId: story.authorId,
      text: story.content,
      createdAt: story.createdAt,
      visibility: story.visibility,
      linkedPointIds: story.points.map(p => p.id),
      understoodCount: story.understoodCount,
    };

    const embedAuthor: StoryAuthor = {
      id: story.authorId,
      name: story.authorName,
      role: story.authorRole,
      hasPledged: story.authorHasPledged,
      ear: story.authorEarsCount,
      avatarUrl: story.authorAvatarUrl,
      avatarColor: story.authorAvatarColor,
    };

    // Convert linked points for display — include story author's position so QuotedPoint shows their stance
    const embedPoints: ProtoPoint[] = story.points.map(p => {
      const authorPos = storyAuthorPositions.get(p.id);
      return {
        id: p.id,
        text: p.statement,
        createdAt: p.createdAt,
        positions: authorPos
          ? { [story.authorId]: { position: authorPos.position, timestamp: authorPos.createdAt } }
          : {},
        linkedStoryIds: [],
      };
    });

    return (
      <div className="max-w-[550px] mx-auto" style={{ overflow: 'hidden' }} ref={(el) => {
        if (el) {
          document.body.style.overflow = 'hidden';
          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.body.style.background = 'transparent';
          document.documentElement.style.background = 'transparent';
          const reportHeight = () => {
            let height = el.scrollHeight;
            // Include portal dropdowns (rendered on document.body, outside this wrapper)
            const portalDropdown = document.querySelector<HTMLElement>('[role="listbox"]');
            if (portalDropdown) {
              const dropdownBottom = portalDropdown.getBoundingClientRect().bottom + window.scrollY;
              height = Math.max(height, dropdownBottom);
            }
            height += 4;
            // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
            if (import.meta.env.DEV) console.log('[embed-resize]', height);
            window.parent.postMessage({ type: 'claritypledge-embed-resize', height }, '*');
          };
          const observer = new ResizeObserver(reportHeight);
          observer.observe(el);
          // Watch for portal elements added/removed on body (e.g., intensity dropdowns)
          const bodyObserver = new MutationObserver(reportHeight);
          bodyObserver.observe(document.body, { childList: true });
          reportHeight();
        }
      }}>
        <StoryCardWithLinks
          story={protoStory}
          author={embedAuthor}
          linkedPoints={embedPoints}
          isDetailView={false}
          currentUserId={user?.id}
          tags={story.tags}
        />
      </div>
    );
  }

  const storyExcerpt = story.content
    .replace(/[#*_~`>[\]]/g, '')
    .slice(0, 160)
    .replace(/\n/g, ' ')
    .trim();

  return (
    <div className="max-w-2xl mx-auto">
      {/* P504: SEO meta tags */}
      <SEO
        title={`Story by ${story.authorName}`}
        description={storyExcerpt || `A story shared on ClarityPledge by ${story.authorName}.`}
        url={`/story/${story.id}`}
        image={story.bannerUrl || undefined}
        type="article"
        article={{
          headline: `Story by ${story.authorName}`,
          author: story.authorName,
          authorUrl: story.authorSlug ? `/p/${story.authorSlug}` : undefined,
          datePublished: story.createdAt,
          dateModified: story.updatedAt,
        }}
      />

      <RemovePositionDialog {...dialogProps} />

      {/* P591: Hidden file input for image upload/change */}
      {isAuthor && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.heic,.HEIC"
          className="hidden"
          onChange={handleImageFileSelected}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {/* P427: Delete story dialog */}
      {isAuthor && (
        <DeleteStoryDialog
          open={deleteDialogOpen}
          linkedPointCount={story.points.length}
          onConfirm={handleDelete}
          onCancel={handleDeleteCancel}
          isDeleting={isDeleting}
        />
      )}

      {/* P616: Unlink point confirmation dialog */}
      {isAuthor && (
        <Dialog open={!!unlinkTargetPoint} onOpenChange={(open) => { if (!open) { setUnlinkTargetPoint(null); setIsUnlinking(false); } }}>
          <DialogContent hideCloseButton>
            <DialogHeader>
              <DialogTitle>Unlink point from story?</DialogTitle>
              <DialogDescription asChild>
                <div>
                  {unlinkTargetPoint && (
                    <p className="italic text-muted-foreground mb-2">
                      &ldquo;{unlinkTargetPoint.statement.length > 80
                        ? unlinkTargetPoint.statement.slice(0, 80) + '...'
                        : unlinkTargetPoint.statement}&rdquo;
                    </p>
                  )}
                  <p>The point will remain visible to others who have taken positions on it.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUnlinkTargetPoint(null)} disabled={isUnlinking}>Cancel</Button>
              <Button variant="destructive" onClick={handleUnlinkConfirm} disabled={isUnlinking}>
                {isUnlinking ? 'Unlinking...' : 'Unlink'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* P427: Unsaved-changes guard dialog */}
      <Dialog open={showUnsavedPrompt} onOpenChange={(open) => { if (!open) setShowUnsavedPrompt(false); }}>
        <DialogContent hideCloseButton>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>You have unsaved changes. Leave anyway?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button autoFocus onClick={() => setShowUnsavedPrompt(false)}>Stay</Button>
            <Button
              variant="outline"
              onClick={() => {
                // Remove popstate guard before navigating
                if (popstateHandlerRef.current) {
                  window.removeEventListener('popstate', popstateHandlerRef.current);
                  popstateHandlerRef.current = null;
                }
                setShowUnsavedPrompt(false);
                setIsEditMode(false);
                setEditContent('');
                navigate(pendingNavigateRef.current ?? (story?.authorSlug ? `/p/${story.authorSlug}` : '/events'));
              }}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Back button */}
      <div className="px-4 py-6">
      <FocusHeader onBack={handleBack} label={docContext ? 'Back' : undefined} />

      {/* P132: Rich story view / P427: swap for edit card in edit mode */}
      {isEditMode ? (
        <div className="space-y-3">
          {/* P591: Image controls in edit mode — changes are immediate, not part of text draft */}
          {story.imageUrl ? (
            <StoryImage
              src={story.imageUrl}
              authorName={story.authorName}
              onChangeImage={handleChangeImage}
              onRemoveImage={handleRemoveImage}
            />
          ) : (
            <button
              type="button"
              onClick={handleChangeImage}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ImagePlus size={18} />
              Add image
            </button>
          )}
          <EditStoryCard
            content={editContent}
            onContentChange={setEditContent}
            isSaving={isSaving}
            onSave={handleSave}
            onCancel={handleEditCancel}
          />
        </div>
      ) : (
        <div className="rounded-t-lg" style={{ borderTop: `3px solid ${story.authorAvatarColor || '#3b82f6'}` }}>
        <StoryCardDetail
          story={story}
          linkedPoints={story.points}
          positionCounts={positionCounts}
          userPositions={userPositions}
          profileOwnerPositions={storyAuthorPositions}
          onPositionClick={handlePositionClick}
          onClear={(pointId) => guardedRemovePosition(pointId)}
          isDetailView={true}
          context="story-detail"
          linkedStoriesForPoints={linkedStoriesForPoints}
          currentUserId={user?.id}
          footerActionsSlot={isAuthor ? (
            <>
              <button
                ref={editButtonRef}
                type="button"
                onClick={handleEditStart}
                aria-label="Edit story"
                disabled={isDeleting}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors disabled:opacity-50"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                ref={deleteButtonRef}
                type="button"
                onClick={() => setDeleteDialogOpen(true)}
                aria-label="Delete story"
                disabled={isDeleting}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted rounded-full transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : undefined}
          onAddPoint={isAuthor ? () => setAddPointTrigger(n => n + 1) : undefined}
          imageUrl={story.imageUrl}
          onChangeImage={isAuthor ? handleChangeImage : undefined}
          onRemoveImage={isAuthor ? handleRemoveImage : undefined}
          onUnlinkPoint={isAuthor ? handleUnlinkClick : undefined}
        />
        </div>
      )}

      {/* P131/P424/P427: Author-only section */}
      {isAuthor && (
        <>
          <KeyPointsSection
            storyId={story.id}
            currentUserId={user?.id ?? ''}
            pointCount={story.points.length}
            justCreated={justCreated}
            addPointRequested={searchParams.get('addPoint') === 'true'}
            showFormTrigger={addPointTrigger}
            onPointAdded={handlePointAdded}
            docVisibility={story.visibility}
          />
        </>
      )}
      </div>
    </div>
  );
}

export default StoryDetailPage;
