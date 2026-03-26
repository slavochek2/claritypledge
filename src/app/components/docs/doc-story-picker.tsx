/**
 * @file doc-story-picker.tsx
 * @description P551: Story selection dialog for adding existing stories to a Clarity Doc.
 * Opens as a centered modal, lists compatible (same or lower visibility) stories
 * with search, and lets the owner add them one by one.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { docsService } from '@/app/data/docs-service';
import type { ContentVisibility, StoryWithAuthor } from '@/app/types';

interface DocStoryPickerProps {
  docId: string;
  docVisibility: ContentVisibility;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStoryAdded: () => void;
}

export function DocStoryPicker({
  docId,
  docVisibility: _docVisibility,
  open,
  onOpenChange,
  onStoryAdded,
}: DocStoryPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [stories, setStories] = useState<StoryWithAuthor[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'error'>('loading');
  const [addingStoryId, setAddingStoryId] = useState<string | null>(null);
  const [hasAnyStories, setHasAnyStories] = useState<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input by 200ms
  useEffect(() => {
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(debounceTimerRef.current);
  }, [searchQuery]);

  // Fetch compatible stories when dialog opens or debounced query changes
  const fetchStories = useCallback(async () => {
    setFetchState('loading');
    try {
      const results = await docsService.getCompatibleStories(docId, debouncedQuery || undefined);
      setStories(results);
      // On first load with no search, record whether user has any stories at all
      if (hasAnyStories === null && !debouncedQuery) {
        setHasAnyStories(results.length > 0);
      }
      setFetchState('done');
    } catch {
      setFetchState('error');
    }
  }, [docId, debouncedQuery, hasAnyStories]);

  useEffect(() => {
    if (open) {
      fetchStories();
    }
  }, [open, fetchStories]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setDebouncedQuery('');
      setStories([]);
      setFetchState('loading');
      setHasAnyStories(null);
      setAddingStoryId(null);
    }
  }, [open]);

  const handleAddStory = async (storyId: string) => {
    setAddingStoryId(storyId);
    try {
      await docsService.addStoryToDoc(docId, storyId);
      // Optimistic: remove from list
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      onStoryAdded();
    } catch {
      toast.error('Failed to add story. Please try again.');
    } finally {
      setAddingStoryId(null);
    }
  };

  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trimEnd() + '\u2026';
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Determine empty state message
  const renderEmptyState = () => {
    if (fetchState === 'loading') return null;

    if (hasAnyStories === false && !debouncedQuery) {
      return (
        <p className="text-sm text-muted-foreground text-center py-8">
          You haven&apos;t created any stories yet.
        </p>
      );
    }

    if (stories.length === 0 && debouncedQuery) {
      return (
        <p className="text-sm text-muted-foreground text-center py-8">
          No stories match &apos;{debouncedQuery}&apos;
        </p>
      );
    }

    if (stories.length === 0 && hasAnyStories === true) {
      return (
        <p className="text-sm text-muted-foreground text-center py-8">
          All your stories are already in this doc.
        </p>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[80vh] flex flex-col"
        aria-label="Select your story"
      >
        <DialogHeader>
          <DialogTitle>Select your story</DialogTitle>
          <DialogDescription className="sr-only">
            Search and add your existing stories to this doc.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <Input
          type="search"
          placeholder="Search your stories..."
          aria-label="Search your stories"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Results area */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[50vh]">
          {fetchState === 'loading' ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {renderEmptyState()}
              {stories.length > 0 && (
                <div className="space-y-1">
                  {stories.map((story) => (
                    <div
                      key={story.id}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {truncate(story.content, 80)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{formatDate(story.createdAt)}</span>
                          <InlineVisibilityIcon visibility={story.visibility} />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={addingStoryId === story.id}
                        onClick={() => handleAddStory(story.id)}
                      >
                        {addingStoryId === story.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3 w-3" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with count */}
        {fetchState === 'done' && (
          <DialogFooter className="sm:justify-start">
            <p className="text-xs text-muted-foreground">
              {stories.length} {stories.length === 1 ? 'story matches' : 'stories match'}
            </p>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
