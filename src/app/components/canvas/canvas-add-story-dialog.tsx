/**
 * @file canvas-add-story-dialog.tsx
 * @description P1515: "+ Add a story" on someone else's canvas. The reader writes a NEW story that
 * only the canvas's audience can read: it is saved through the checked function (canvas_add_story),
 * never as an ordinary story link, so it shows nowhere else and nothing of the owner's travels with
 * it. The line above the box says who will read it. The owner's own composer is the letters
 * dialog (their story is an ordinary one); this one is for everyone else.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { explainPlaceholder, explainWhyLabel } from '@/app/utils/position-helpers';
import { SharedIcon } from '@/app/components/canvas/canvas-audience';
import type { PositionType } from '@/app/types';

export interface CanvasAddStoryState {
  pointId: string;
  position?: PositionType;
}

export function CanvasAddStoryDialog({ state, audienceNote, onSave, onClose, onSaved }: {
  state: CanvasAddStoryState | null;
  /** "Visible to you and …" */
  audienceNote: string;
  onSave: (pointId: string, content: string) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!state) setContent(''); }, [state]);

  async function handleSave() {
    const trimmed = content.trim();
    if (!state || !trimmed) return;
    setSaving(true);
    try {
      await onSave(state.pointId, trimmed);
      toast.success('Story added');
      setContent('');
      onSaved();
    } catch {
      toast.error('Failed to save story. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={open => { if (!open) { setContent(''); onClose(); } }}>
      <DialogContent className="max-w-sm" data-testid="canvas-add-story-dialog">
        <DialogHeader>
          <DialogTitle>{state?.position ? explainWhyLabel(state.position) : 'Add a story'}</DialogTitle>
        </DialogHeader>
        <div role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2.5 text-sm text-foreground" data-testid="canvas-composer-audience">
          <SharedIcon label={audienceNote} />
          <span>{audienceNote}</span>
        </div>
        <Textarea
          placeholder={state?.position ? explainPlaceholder(state.position) : 'Share your position or reasoning…'}
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          maxLength={10000}
          className="resize-none"
          autoFocus
          aria-label="Your story"
        />
        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={() => { setContent(''); onClose(); }} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || content.trim().length === 0}
            className="bg-blue-600 hover:bg-blue-700/90 text-white"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
