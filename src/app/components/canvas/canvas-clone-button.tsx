/**
 * @file canvas-clone-button.tsx
 * @description P1536 W3: "Clone" on the owner's PUBLISHED version (it replaces "New version"). A secondary pill with a copy icon.
 * Tapping writes nothing: the workspace around the page enters its pending state (ws=1 on this version, no draft) and the first
 * Send makes the draft. Shown only to the owner, only on a published version, only when the page sits in the owner's workspace route
 * (the context hands over `clone`; a reader's page, a page with no mirror chat or a fixture has none) and canvas drafting is on
 * (the server says; null while unknown is "not yet", never on). Absent, not disabled, while the owner is already editing (P955).
 * While drafting is UNKNOWN, or the route has not yet said whether this viewer gets the workspace (`cloneUnknown`), and everything else holds, Clone's
 * exact space is reserved by an invisible, aria-hidden placeholder that is not a button (nothing to focus, tap or hear), so Share does not move when the
 * answer is yes; on no, the space is simply given back.
 */
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanvasDraftAvailability } from '@/app/pages/chat/use-canvas-availability';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';
import { isViewingDraft, type CanvasReady } from './canvas-page-data';
import { useCanvasWorkspace } from './canvas-workspace-context';

/** Whether this page could offer Clone, drafting and the route's `clone` aside: the owner's published version, not editing. */
function cloneApplies(ready: CanvasReady, active: boolean): boolean {
  return !active && ready.isOwner && !ready.publishedNone && !isViewingDraft(ready) && !!ready.version;
}

export function CloneButton({ ready }: { ready: CanvasReady }) {
  const { clone, active, cloneUnknown } = useCanvasWorkspace();
  const available = useCanvasDraftAvailability(true);
  if (available === false || (!clone && !cloneUnknown) || !cloneApplies(ready, active)) return null;
  if (available === null || !clone) {
    return (
      <span aria-hidden="true" className={cn(CANVAS_SECONDARY_PILL, 'invisible')} data-testid="canvas-clone-reserve">
        <Copy className="h-4 w-4" aria-hidden />
        Clone
      </span>
    );
  }
  return (
    <button type="button" className={CANVAS_SECONDARY_PILL} onClick={clone} data-testid="canvas-clone">
      <Copy className="h-4 w-4" aria-hidden />
      Clone
    </button>
  );
}
