/**
 * @file doc-detail-page.tsx
 * @description P551: Clarity Doc detail page — shows doc header, privacy banner,
 * linked stories with drag-and-drop reordering, and action buttons.
 * Route: /d/:docId
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText, Lock, Globe } from 'lucide-react';
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
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth';
import { docsService } from '@/app/data/docs-service';
import { DocHeader } from '@/app/components/docs/doc-header';
import { DocPrivacyBanner } from '@/app/components/docs/doc-privacy-banner';
import { DocBlockControls } from '@/app/components/docs/doc-block-controls';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import type { ClarityDoc, DocStory, DocPointConfig } from '@/app/types';

// ---------------------------------------------------------------------------
// SortableStoryCard — wraps a story card with dnd-kit sortable + block controls
// ---------------------------------------------------------------------------

interface SortableStoryCardProps {
  docStory: DocStory;
  docId: string;
  currentUserId?: string;
  isOwner: boolean;
  onRemove: (storyId: string) => void;
  onNavigate: (storyId: string) => void;
}

function SortableStoryCard({
  docStory,
  docId,
  currentUserId,
  isOwner,
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

  const handleTogglePointHidden = useCallback(async (pointId: string) => {
    const currentHidden = pointConfig.hidden || [];
    const isHidden = currentHidden.includes(pointId);
    const newHidden = isHidden
      ? currentHidden.filter(id => id !== pointId)
      : [...currentHidden, pointId];
    const newConfig = { ...pointConfig, hidden: newHidden };
    setPointConfig(newConfig); // optimistic
    try {
      await docsService.updatePointConfig(docId, docStory.story_id, newConfig);
    } catch {
      setPointConfig(docStory.point_config || {}); // revert
      toast.error('Failed to update point visibility');
    }
  }, [pointConfig, docId, docStory.story_id, docStory.point_config]);

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
    const currentOrder = pointConfig.order?.length
      ? pointConfig.order
      : allPoints.map(p => p.id);
    const idx = currentOrder.indexOf(pointId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const newConfig = { ...pointConfig, order: newOrder };
    setPointConfig(newConfig);
    try {
      await docsService.updatePointConfig(docId, docStory.story_id, newConfig);
    } catch {
      setPointConfig(docStory.point_config || {});
      toast.error('Failed to reorder points');
    }
  }, [pointConfig, docId, docStory.story_id, docStory.point_config, allPoints]);

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
          linkedPoints={allPoints}
          positionCounts={new Map()}
          userPositions={new Map()}
          currentUserId={currentUserId}
          disableNavigation
          onAddPoint={() => onNavigate(docStory.story_id)}
          pointOrder={pointConfig.order}
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
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState<ClarityDoc | null>(null);
  const [stories, setStories] = useState<DocStory[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'not-found'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);

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
    } catch {
      setFetchState('not-found');
    }
  }, [docId]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  const isOwner = Boolean(user?.id && doc?.owner_id === user.id);
  const handleDocUpdated = useCallback((updated: ClarityDoc) => {
    setDoc(updated);
  }, []);

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
            to="/docs"
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            Back to Docs
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
          {isOwner && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                Select your story
              </Button>
              <Button asChild size="sm" className="bg-blue-500 hover:bg-blue-600 text-white">
                <Link to={`/create?docId=${doc.id}`}>
                  {doc.visibility === 'private' ? <Lock size={16} /> : <Globe size={16} />}
                  Write a story
                </Link>
              </Button>
            </div>
          )}
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
    </main>
  );
}
