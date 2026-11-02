/**
 * @file CanvasPlusMenu.tsx
 * @description P1536 3c X3: "+ means create, the paperclip means attach". The + on the owner's mirror chat's MAIN composer, beside the paperclip,
 * while canvas drafting is on. Its menu: "New canvas" (today's opener with no base) and "Clone a version" (pick a published version, navigate to it,
 * and the canvas page then runs the same clone() decision as its Clone button, once the version has loaded: use-clone-canvas). Picking writes nothing.
 * No other composer gets one (the conversation pane passes it only for the mirror, and not in a private ask, where the paperclip is hidden too).
 * Letters and points join this menu in their own specs.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Copy, LayoutGrid, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { CanvasVersionOption } from '@/app/data/canvas-draft-service';
import { CLONE_INTENT_KEY } from '@/lib/canvas-hrefs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SHEET, SHEET_HEAD } from './ChatDialogs';
import { CanvasVersionPicker } from './CanvasVersionPicker';
import { canvasStartErrorText } from './canvas-start';
import { CLONE_VERSION_LABEL, CREATE_LABEL, NEW_CANVAS_LABEL } from './canvas-thread-copy';
import { publishedViewHref } from './canvas-links';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import { useChat } from './chat-state';
import { useCanvasDraftAvailability } from './use-canvas-availability';
import { useStartCanvas } from './use-start-canvas';

/** The pick: a dialog over the published versions. Its title is the menu item's label. */
function CloneVersionDialog({ onPick, onClose }: { onPick: (v: CanvasVersionOption) => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(SHEET, 'sm:max-w-md')}>
        <DialogHeader className={SHEET_HEAD}>
          <DialogTitle className="text-base">{CLONE_VERSION_LABEL}</DialogTitle>
          <DialogDescription className="sr-only">Pick one of your published canvas versions. Nothing changes for readers until you publish.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CanvasVersionPicker onPick={onPick} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CanvasPlusMenu() {
  const chat = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const { start, dialog } = useStartCanvas();
  const [picking, setPicking] = useState(false);
  const slug = chat.authors[chat.userId]?.slug ?? null;
  const here = `${location.pathname}${location.search}`;
  const drafting = useCanvasDraftAvailability(true) === true;

  if (!drafting) return null;
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={CREATE_LABEL} title={CREATE_LABEL} data-testid="composer-plus" className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem className="min-h-10" data-testid="plus-new-canvas" onSelect={() => void start(null)}>
            <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" />
            {NEW_CANVAS_LABEL}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" data-testid="plus-clone-version" onSelect={() => setPicking(true)}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            {CLONE_VERSION_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {picking && (
        <CloneVersionDialog
          onClose={() => setPicking(false)}
          onPick={(v) => {
            setPicking(false);
            // No slug, no address: say so (the sentence a failed start uses) instead of closing the dialog and doing nothing.
            if (!slug) toast.error(canvasStartErrorText(null));
            else navigate(publishedViewHref(slug, v.canvasName, v.name), { state: { from: here, [CLONE_INTENT_KEY]: true } });
          }}
        />
      )}
      {dialog}
    </>
  );
}
