/**
 * @file clone-draft-sheet.tsx
 * @description P1536 J4: the sheet shown when the owner clones a version while a draft of ANOTHER base (with at least one message) is
 * open. Below 640px it sits at the bottom of the screen. "Add to my draft" opens that draft; "Start over from vN" (destructive) goes
 * pending and the first Send discards it. Tapping outside closes it and changes nothing.
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CloneSheetState } from './use-clone-canvas';

const fromLabel = (seq: number | null): string => (seq ? `v${seq}` : 'this version');

export function CloneDraftSheet({ sheet, onAdd, onStartOver, onClose }: { sheet: CloneSheetState | null; onAdd: () => void; onStartOver: () => void; onClose: () => void }) {
  if (!sheet) return null;
  const draftFrom = sheet.draft.baseSeq ? `a draft from v${sheet.draft.baseSeq}` : 'an open draft';
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-lg max-sm:bottom-2 max-sm:top-auto max-sm:translate-y-0 sm:max-w-sm" data-testid="clone-draft-sheet">
        <DialogHeader className="text-left">
          <DialogTitle>You have {draftFrom}</DialogTitle>
          <DialogDescription>
            You have {draftFrom}. Add this to it, or start over from {fromLabel(sheet.fromSeq)}? Starting over discards that draft.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11 text-destructive hover:text-destructive" onClick={onStartOver} data-testid="clone-start-over">
            Start over from {fromLabel(sheet.fromSeq)}
          </Button>
          <Button type="button" className="min-h-11" onClick={onAdd} data-testid="clone-add-to-draft">
            Add to my draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
