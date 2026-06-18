/**
 * @file letter-position-story-dialog.tsx
 * @description P904 plan addendum: in-place dialog for adding or viewing a
 * position-explanation story on a letter results point. Replaces the two-hop
 * /create?pointId= → /story/:id navigation with a modal that keeps the user
 * on the results page and triggers a refetch on save.
 *
 * Two modes:
 *   add  — Textarea + Save / Cancel. On save: createLetterPositionStory →
 *           onSaved() (parent refetch) → toast → close.
 *   view — Read-only content, author name, and close button.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createLetterPositionStory } from '@/app/data/letters-service';
import type { LetterPositionStory } from '@/app/data/letters-service';

// ============================================================================
// TYPES
// ============================================================================

interface AddMode {
  mode: 'add';
  pointId: string;
  pointTitle?: string;
}

interface ViewMode {
  mode: 'view';
  story: LetterPositionStory;
  pointTitle?: string;
}

export type PositionStoryDialogState = AddMode | ViewMode;

interface LetterPositionStoryDialogProps {
  state: PositionStoryDialogState | null;
  onClose: () => void;
  onSaved: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterPositionStoryDialog({
  state,
  onClose,
  onSaved,
}: LetterPositionStoryDialogProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const open = state !== null;

  async function handleSave() {
    if (state?.mode !== 'add') return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const result = await createLetterPositionStory(state.pointId, trimmed);
      if (!result) {
        toast.error('Failed to save story. Please try again.');
        return;
      }
      toast.success('Story added');
      setContent('');
      onSaved(); // parent closes dialog and refetches
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setContent('');
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        {state?.mode === 'add' && (
          <>
            <DialogHeader>
              <DialogTitle>Add a story</DialogTitle>
              {state.pointTitle && (
                <DialogDescription className="text-sm text-muted-foreground">
                  On: {state.pointTitle}
                </DialogDescription>
              )}
            </DialogHeader>
            <Textarea
              placeholder="Share your position or reasoning…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="resize-none"
              autoFocus
            />
            <DialogFooter className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => { setContent(''); onClose(); }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || content.trim().length === 0}
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </>
        )}

        {state?.mode === 'view' && (
          <>
            <DialogHeader>
              <DialogTitle>
                {state.story.isOwn ? 'Your story' : `${state.story.authorName}'s story`}
              </DialogTitle>
              {state.pointTitle && (
                <DialogDescription className="text-sm text-muted-foreground">
                  On: {state.pointTitle}
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-foreground whitespace-pre-wrap">
              {state.story.content}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
