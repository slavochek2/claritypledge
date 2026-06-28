/**
 * @file doc-detail-page.tsx
 * @description P551: Clarity Doc detail page — shows doc header, privacy banner,
 * linked stories with drag-and-drop reordering, and action buttons.
 * Route: /d/:docId
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText, Lock, Globe, ChevronDown, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DocStoryPicker } from '@/app/components/docs/doc-story-picker';
import { LetterReceiverModal, type ReceiverSetupResult } from '@/app/components/letters/letter-receiver-modal';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/auth';
import { analytics } from '@/lib/mixpanel';
import { docsService } from '@/app/data/docs-service';
import { resolveDocShortCode } from '@/app/data/short-links';
import { pointsService } from '@/app/data/points-service';
import { useVerificationGate } from '@/app/hooks/useVerificationGate';
import { DocHeader } from '@/app/components/docs/doc-header';
import { DocPrivacyBanner } from '@/app/components/docs/doc-privacy-banner';
import { DocBlockControls } from '@/app/components/docs/doc-block-controls';
import { isLeadPoint, toggleLead } from '@/app/utils/lead-toggle';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import type { ClarityDoc, DocStory, DocPointConfig, PointPosition, PositionType } from '@/app/types';

// ---------------------------------------------------------------------------
// SortableStoryCard — wraps a story card with dnd-kit sortable + block controls
// ---------------------------------------------------------------------------

interface SortableStoryCardProps {
  docStory: DocStory;
  docId: string;
  currentUserId?: string;
  isOwner: boolean;
  positionCounts: Map<string, Record<PositionType, number>>;
  userPositions: Map<string, PointPosition>;
  onPositionClick?: (pointId: string, position: PositionType) => Promise<void>;
  onClear?: (pointId: string) => void;
  onRemove: (storyId: string) => void;
  onNavigate: (storyId: string) => void;
}

function SortableStoryCard({
  docStory,
  docId,
  currentUserId,
  isOwner,
  positionCounts,
  userPositions,
  onPositionClick,
  onClear,
  onRemove,
  onNavigate,
}: SortableStoryCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `story-${docStory.story_id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Point-level hide/show — optimistic state with DB persist
  const [pointConfig, setPointConfig] = useState<DocPointConfig>(docStory.point_config || {});

  // P898: serialize config writes per story. Rapid toggles fire concurrent
  // UPDATEs that can land out of order (observed: unmark-unmark persisting the
  // FIRST write last, DB stuck at lead_count 1 while the UI showed 0). Chaining
  // on a ref guarantees DB write order matches click order. A failed write
  // reverts the optimistic state and does not poison the queue.
  const configWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const persistPointConfig = useCallback((config: DocPointConfig, errorMessage: string) => {
    configWriteQueue.current = configWriteQueue.current.then(() =>
      docsService.updatePointConfig(docId, docStory.story_id, config).catch(() => {
        setPointConfig(docStory.point_config || {}); // revert
        toast.error(errorMessage);
      }),
    );
    return configWriteQueue.current;
  }, [docId, docStory.story_id, docStory.point_config]);

  const handleTogglePointHidden = useCallback(async (pointId: string) => {
    const currentHidden = pointConfig.hidden || [];
    const isHidden = currentHidden.includes(pointId);
    const newHidden = isHidden
      ? currentHidden.filter(id => id !== pointId)
      : [...currentHidden, pointId];
    const newConfig = { ...pointConfig, hidden: newHidden };
    setPointConfig(newConfig); // optimistic
    await persistPointConfig(newConfig, 'Failed to update point visibility');
  }, [pointConfig, persistPointConfig]);

  // All linked points (including hidden) — needed for renderPointRow to show eye controls on all
  const allPoints = useMemo(() => docStory.story.points || [], [docStory.story.points]);

  // Ordered point IDs for up/down arrow controls
  const orderedPointIds = useMemo(() => {
    if (pointConfig.order?.length) {
      const orderMap = new Map(pointConfig.order.map((id: string, i: number) => [id, i]));
      return [...allPoints].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)).map(p => p.id);
    }
    return allPoints.map(p => p.id);
  }, [allPoints, pointConfig.order]);

  const handleMovePoint = useCallback(async (pointId: string, direction: 'up' | 'down') => {
    const currentOrder = [...orderedPointIds];
    const idx = currentOrder.indexOf(pointId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const newConfig = { ...pointConfig, order: newOrder };
    setPointConfig(newConfig);
    await persistPointConfig(newConfig, 'Failed to reorder points');
  }, [pointConfig, persistPointConfig, orderedPointIds]);

  // P898: Lead toggle — pre/post-story split. Marking moves the point to the end
  // of the lead group in `order` and bumps lead_count; unmarking moves it to the
  // front of the post group and decrements. Hidden points never show the toggle.
  const hiddenIdSet = useMemo(() => new Set(pointConfig.hidden || []), [pointConfig.hidden]);
  const visiblePointCount = useMemo(
    () => orderedPointIds.filter((id) => !hiddenIdSet.has(id)).length,
    [orderedPointIds, hiddenIdSet]
  );
  const showLeadToggle = visiblePointCount >= 2;

  const handleToggleLead = useCallback(async (pointId: string) => {
    const { order, lead_count } = toggleLead({
      orderedPointIds,
      hiddenIds: hiddenIdSet,
      leadCount: pointConfig.lead_count,
      pointId,
    });
    const newConfig = { ...pointConfig, order, lead_count };
    setPointConfig(newConfig); // optimistic
    await persistPointConfig(newConfig, 'Failed to update lead point');
  }, [pointConfig, persistPointConfig, orderedPointIds, hiddenIdSet]);

  return (
    <div ref={setNodeRef} style={style} className="group">
      {/* Block controls — visible on hover (desktop) or always (mobile) */}
      {isOwner && (
        <DocBlockControls
          variant="story"
          dragAttributes={attributes}
          dragListeners={listeners as Record<string, (...args: unknown[]) => void>}
          onRemove={() => onRemove(docStory.story_id)}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(docStory.story_id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate(docStory.story_id);
          }
        }}
        className="cursor-pointer"
      >
        <StoryCardDetail
          story={docStory.story}
          imageUrl={docStory.story.imageUrl}
          linkedPoints={allPoints}
          positionCounts={positionCounts}
          userPositions={userPositions}
          onPositionClick={onPositionClick}
          onClear={(pointId) => onClear?.(pointId)}
          currentUserId={currentUserId}
          isDetailView
          defaultCollapsed
          disableNavigation
          onAddPoint={() => onNavigate(docStory.story_id)}
          pointOrder={pointConfig.order}
          hiddenPointIds={isOwner ? undefined : pointConfig.hidden}
          renderPointRow={isOwner ? (point, quotedPointElement) => {
            const idx = orderedPointIds.indexOf(point.id);
            return (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- stopPropagation only, not interactive
              <div
                key={point.id}
                className="group/point"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div role="toolbar" className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover/point:opacity-100 transition-opacity duration-150">
                  <DocBlockControls
                    variant="point"
                    isHidden={(pointConfig.hidden || []).includes(point.id)}
                    onToggleHidden={() => handleTogglePointHidden(point.id)}
                    onMoveUp={() => handleMovePoint(point.id, 'up')}
                    onMoveDown={() => handleMovePoint(point.id, 'down')}
                    isFirst={idx === 0}
                    isLast={idx === orderedPointIds.length - 1}
                    showLeadToggle={showLeadToggle && !hiddenIdSet.has(point.id)}
                    isLead={isLeadPoint(orderedPointIds, hiddenIdSet, pointConfig.lead_count, point.id)}
                    onToggleLead={() => handleToggleLead(point.id)}
                  />
                </div>
                {quotedPointElement}
              </div>
            );
          } : undefined}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocDetailPage
// ---------------------------------------------------------------------------

export function DocDetailPage() {
  const { docId: rawDocId } = useParams<{ docId: string }>();
  const docId = rawDocId ? resolveDocShortCode(rawDocId) : undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { checkVerified } = useVerificationGate();

  const [doc, setDoc] = useState<ClarityDoc | null>(null);
  const [stories, setStories] = useState<DocStory[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  // P968 UAT: the recipient picker opens as a dialog OVER this draft page (not a
  // separate compose route) so the author keeps their letter in view while addressing it.
  const [receiverModalOpen, setReceiverModalOpen] = useState(false);

  // Position data for all points across all stories in this doc
  const [positionCounts, setPositionCounts] = useState<Map<string, Record<PositionType, number>>>(new Map());
  const [userPositions, setUserPositions] = useState<Map<string, PointPosition>>(new Map());

  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: user?.id ?? '',
    onAfterRemove: useCallback(async (pointId: string) => {
      setUserPositions(prev => {
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

  // DnD sensors: pointer (mouse) + touch with delay to avoid accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const fetchDoc = useCallback(async (showLoader = true) => {
    if (!docId) return;
    if (showLoader) setFetchState('loading');
    try {
      const result = await docsService.getDoc(docId);
      if (!result) {
        setFetchState('not-found');
        return;
      }
      setDoc(result.doc);
      setStories(result.stories);
      setFetchState('done');

      // Fetch position data for all points across all stories
      const allPointIds = result.stories.flatMap(
        ds => (ds.story.points || []).map(p => p.id)
      );
      if (allPointIds.length > 0) {
        try {
          const [counts, positions] = await Promise.all([
            pointsService.getPositionCountsForPoints(allPointIds),
            user?.id
              ? pointsService.getMyPositionsForPoints(allPointIds, user.id)
              : Promise.resolve(new Map<string, PointPosition>()),
          ]);
          setPositionCounts(counts);
          setUserPositions(positions);
        } catch (err) {
          console.error('Error loading position data for doc:', err);
        }
      }
    } catch {
      setFetchState('not-found');
    }
  }, [docId, user?.id]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const isOwner = Boolean(user?.id && doc?.owner_id === user.id);
  const handleDocUpdated = useCallback((updated: ClarityDoc) => {
    setDoc(updated);
  }, []);

  // -----------------------------------------------------------------------
  // Position click — optimistic update with rollback on error
  // -----------------------------------------------------------------------
  const handlePositionClick = useCallback(async (pointId: string, position: PositionType) => {
    if (!checkVerified('set a position on this point')) return;
    if (!user?.id) return;

    const isTogglingOff = userPositions.get(pointId)?.position === position;

    if (isTogglingOff) {
      await guardedRemovePosition(pointId);
      return;
    }

    // Optimistic update
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
      const counts = await pointsService.getPositionCountsForPoints([pointId]);
      setPositionCounts(prev => new Map([...prev, ...counts]));

      analytics.track('position_recorded', {
        doc_id: doc?.id,
        point_id: pointId,
        position,
      });
    } catch (error) {
      console.error('Failed to save position:', error);
      // Revert optimistic update
      if (user?.id) {
        try {
          const positions = await pointsService.getMyPositionsForPoints([pointId], user.id);
          setUserPositions(prev => new Map([...prev, ...positions]));
        } catch {
          setUserPositions(prev => {
            const updated = new Map(prev);
            updated.delete(pointId);
            return updated;
          });
        }
      }
      toast.error('Failed to save position. Please try again.');
    }
  }, [user?.id, checkVerified, userPositions, guardedRemovePosition, doc?.id]);

  // -----------------------------------------------------------------------
  // Story reorder — optimistic update with rollback on error
  // -----------------------------------------------------------------------
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !doc) return;

      const oldIndex = stories.findIndex(
        (s) => `story-${s.story_id}` === active.id
      );
      const newIndex = stories.findIndex(
        (s) => `story-${s.story_id}` === over.id
      );
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(stories, oldIndex, newIndex);
      const previousStories = stories;

      // Optimistic update
      setStories(reordered);

      try {
        await docsService.reorderStories(
          doc.id,
          reordered.map((s) => s.story_id)
        );
      } catch {
        // Revert on failure
        setStories(previousStories);
        toast.error('Failed to reorder stories');
      }
    },
    [stories, doc]
  );

  // -----------------------------------------------------------------------
  // Remove story from doc — optimistic
  // -----------------------------------------------------------------------
  const handleRemoveStory = useCallback(
    async (storyId: string) => {
      if (!doc) return;
      const previousStories = stories;
      setStories((prev) => prev.filter((s) => s.story_id !== storyId));

      try {
        await docsService.removeStoryFromDoc(doc.id, storyId);
      } catch {
        setStories(previousStories);
        toast.error('Failed to remove story');
      }
    },
    [stories, doc]
  );

  // -----------------------------------------------------------------------
  // Navigate to story detail
  // -----------------------------------------------------------------------
  const handleNavigateToStory = useCallback(
    (storyId: string) => {
      if (!doc) return;
      navigate(`/story/${storyId}`, {
        state: { docId: doc.id, docTitle: doc.title },
      });
    },
    [navigate, doc]
  );

  // Loading state
  if (fetchState === 'loading') {
    return <ClarityPageLoader />;
  }

  // Not found / unauthorized
  if (fetchState === 'not-found' || !doc) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            This doc doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Link
            to="/letters?tab=drafts"
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            Back to Letters
          </Link>
        </div>
      </main>
    );
  }

  const sortableIds = stories.map((s) => `story-${s.story_id}`);

  return (
    <main
      aria-label={`Clarity Doc: ${doc.title}`}
      className="min-h-screen bg-background"
    >
      {/* Privacy banner — full width, outside container */}
      <DocPrivacyBanner visibility={doc.visibility} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header with back link, title, and action buttons */}
        <DocHeader
          doc={doc}
          isOwner={isOwner}
          onDocUpdated={handleDocUpdated}
        >
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOwner && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Compose
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPickerOpen(true)}>
                      Select a story
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/create?docId=${doc.id}`}>
                        {doc.visibility === 'private' ? <Lock size={16} /> : <Globe size={16} />}
                        Share a story
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={() => {
                    if (stories.length === 0) {
                      toast.error('Add stories before composing a letter');
                      return;
                    }
                    // Public docs need no recipient — compose auto-skips to the prediction walk.
                    // Private docs pick recipients here, in a dialog over this draft.
                    if (doc.visibility === 'public') {
                      navigate(`/letter/${doc.id}/compose`);
                    } else {
                      setReceiverModalOpen(true);
                    }
                  }}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Prepare letter
                </Button>
              </>
            )}
          </div>
        </DocHeader>

        {/* Stories or empty state */}
        {stories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <FileText size={48} className="text-muted-foreground/40" />
            <p className="text-lg font-medium text-foreground">No stories yet</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {stories.map((docStory) => (
                  <SortableStoryCard
                    key={docStory.story_id}
                    docStory={docStory}
                    docId={doc.id}
                    currentUserId={user?.id}
                    isOwner={isOwner}
                    positionCounts={positionCounts}
                    userPositions={userPositions}
                    onPositionClick={handlePositionClick}
                    onClear={(pointId) => guardedRemovePosition(pointId)}
                    onRemove={handleRemoveStory}
                    onNavigate={handleNavigateToStory}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

      </div>

      {/* Story picker dialog */}
      {isOwner && (
        <DocStoryPicker
          docId={doc.id}
          docVisibility={doc.visibility}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onStoryAdded={() => fetchDoc(false)}
        />
      )}

      {/* P968 UAT: recipient picker — opens over this draft page. On submit, hand the
          chosen recipients to the compose route via location.state, which starts the
          prediction walk directly (skipping compose's own modal phase). */}
      {isOwner && (
        <LetterReceiverModal
          open={receiverModalOpen}
          onOpenChange={setReceiverModalOpen}
          isPrivateDoc={doc.visibility === 'private'}
          docId={doc.id}
          storyCount={stories.length}
          onSubmit={(result: ReceiverSetupResult) => {
            const derivedName = result.recipients.length === 1 ? result.recipients[0].name : '';
            navigate(`/letter/${doc.id}/compose`, {
              state: {
                mode: result.mode,
                emails: result.emails,
                receiverName: derivedName,
                recipients: result.recipients,
              },
            });
          }}
        />
      )}

      {/* Position removal confirmation dialog */}
      <RemovePositionDialog {...dialogProps} />
    </main>
  );
}
