/**
 * @file canvas-new-version-button.tsx
 * @description P1536: "New version" on the owner's published canvas. It opens a new thread with the mirror, with the version
 * on screen attached (the same start the paperclip's Canvases tab makes). A secondary action, never a primary one; absent
 * unless canvas drafting is on (the server says; null while unknown is "not yet", never on).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { listMyCanvasVersions } from '@/app/data/canvas-draft-service';
import { useCanvasDraftAvailability } from '@/app/pages/chat/use-canvas-availability';
import { useStartCanvas } from '@/app/pages/chat/use-start-canvas';

const PILL_BUTTON =
  'inline-flex h-10 min-w-0 max-w-full items-center rounded-full border border-foreground/40 bg-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 max-sm:order-3';

/** `version`: the open version's name, the key `list_my_canvas_versions` knows it by. */
export function NewVersionButton({ version }: { version: string | null }) {
  const on = useCanvasDraftAvailability(true) === true;
  return on && version ? <NewVersionAction version={version} /> : null;
}

/** Only mounted while drafting is on: it needs the chat (the new thread is a chat thread), which a signed-out page has none of. */
function NewVersionAction({ version }: { version: string }) {
  const { start, dialog } = useStartCanvas();
  const [busy, setBusy] = useState(false);
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const mine = (await listMyCanvasVersions()).find(v => v.name === version);
      if (mine) await start(mine.id);
      else toast.error('Could not find this version to start from.');
    } catch {
      toast.error('Could not start a new version. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={PILL_BUTTON} aria-busy={busy} onClick={() => void click()} data-testid="canvas-new-version">
        New version
      </button>
      {dialog}
    </>
  );
}
