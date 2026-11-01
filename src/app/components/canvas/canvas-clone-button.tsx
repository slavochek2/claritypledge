/**
 * @file canvas-clone-button.tsx
 * @description P1536 W3: "Clone" on the owner's PUBLISHED version (it replaces "New version"). A secondary pill with a copy icon.
 * Tapping writes nothing: the workspace around the page enters its pending state (ws=1 on this version, no draft) and the first
 * Send makes the draft. Shown only to the owner, only on a published version, only when the page sits in the owner's workspace route
 * (the context hands over `clone`; a reader's page, a page with no mirror chat or a fixture has none) and canvas drafting is on
 * (the server says; null while unknown is "not yet", never on). Absent, not disabled, while the owner is already editing (P955).
 */
import { Copy } from 'lucide-react';
import { useCanvasDraftAvailability } from '@/app/pages/chat/use-canvas-availability';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';
import { isViewingDraft, type CanvasReady } from './canvas-page-data';
import { useCanvasWorkspace } from './canvas-workspace-context';

export function CloneButton({ ready }: { ready: CanvasReady }) {
  const { clone, active } = useCanvasWorkspace();
  const on = useCanvasDraftAvailability(true) === true;
  if (!on || !clone || active || !ready.isOwner || ready.publishedNone || isViewingDraft(ready) || !ready.version) return null;
  return (
    <button type="button" className={`${CANVAS_SECONDARY_PILL} max-sm:order-3`} onClick={clone} data-testid="canvas-clone">
      <Copy className="h-4 w-4" aria-hidden />
      Clone
    </button>
  );
}
