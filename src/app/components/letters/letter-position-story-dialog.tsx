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
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { stripHashtags } from '@/lib/utils';
import { createLetterPositionStory } from '@/app/data/letters-service';
import type { LetterPositionStory } from '@/app/data/letters-service';
import type { PositionType } from '@/app/types';
import { explainWhyLabel, explainPlaceholder } from '@/app/utils/position-helpers';

// ============================================================================
// TYPES
// ============================================================================

interface AddMode {
  mode: 'add';
  pointId: string;
  pointTitle?: string;
  position?: PositionType;
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
              <DialogTitle>
                {state.position ? explainWhyLabel(state.position) : 'Add a story'}
              </DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder={state.position ? explainPlaceholder(state.position) : 'Share your position or reasoning…'}
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
                className="bg-[#0044CC] hover:bg-[#0044CC]/90 text-white"
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
                {state.story.isOwn ? 'My story' : `${state.story.authorName}'s story`}
              </DialogTitle>
              {state.pointTitle && (
                <DialogDescription className="text-sm text-muted-foreground">
                  On: {state.pointTitle}
                </DialogDescription>
              )}
            </DialogHeader>
            {/* R7: proper story card (avatar + name + hashtag-stripped body),
                matching live-story-card-expanded, not a raw text box. */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GravatarAvatar
                  name={state.story.authorName}
                  photoUrl={state.story.authorAvatarUrl ?? undefined}
                  avatarColor={state.story.authorAvatarColor ?? undefined}
                  isPledger={state.story.authorHasPledged}
                  size="sm"
                />
                <span className="text-sm font-medium text-foreground">
                  {state.story.authorName}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {stripHashtags(state.story.content, state.story.tags)}
              </p>
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
