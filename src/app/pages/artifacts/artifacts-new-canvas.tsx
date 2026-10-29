/**
 * @file artifacts-new-canvas.tsx
 * @description P1536: the blue "New canvas" button on the Artifacts Canvases tab. It starts a canvas thread with the owner's
 * mirror exactly as the mirror menu's "New canvas" does (useStartCanvas: the draft and its thread are made on the server, an
 * existing open draft is offered "continue or discard", then the chat opens the thread). Like that menu item it is offered only
 * while canvas drafting is on, and only where the chat is mounted. Same place, style and label rules as "New letter".
 */
import { useContext, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { NEW_CANVAS_LABEL } from '@/app/pages/chat/canvas-thread-copy';
import { useCanvasDraftAvailability } from '@/app/pages/chat/use-canvas-availability';
import { useStartCanvas } from '@/app/pages/chat/use-start-canvas';

export function NewCanvasButton({ searchOpen }: { searchOpen: boolean }) {
  // The chat provider is app-wide; without it (nothing signed in) there is no mirror to start a canvas with.
  return useContext(ChatContext) ? <NewCanvasAction searchOpen={searchOpen} /> : null;
}

function NewCanvasAction({ searchOpen }: { searchOpen: boolean }) {
  const available = useCanvasDraftAvailability() === true;
  const { start, dialog } = useStartCanvas();
  // A second tap while the first is starting must not start twice. The button stays enabled (no dead primary, P955) and says
  // it is busy instead.
  const inFlight = useRef(false);
  const [starting, setStarting] = useState(false);
  if (!available) return null;
  return (
    <>
      <Button
        aria-label={NEW_CANVAS_LABEL}
        aria-busy={starting}
        onClick={() => {
          if (inFlight.current) return;
          inFlight.current = true;
          setStarting(true);
          void start(null).finally(() => {
            inFlight.current = false;
            setStarting(false);
          });
        }}
        className="h-10 shrink-0 gap-1.5 px-2.5 sm:px-3"
        data-testid="artifacts-new-canvas"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {/* "New canvas" from 360px up, "New" below; with the search field open the long label waits for sm and the
            narrowest phones drop to the "+", so the field keeps its width (as New letter). */}
        <span className={searchOpen ? 'hidden sm:inline' : 'hidden min-[360px]:inline'}>{NEW_CANVAS_LABEL}</span>
        <span className={searchOpen ? 'sm:hidden max-[340px]:hidden' : 'min-[360px]:hidden'}>New</span>
      </Button>
      {dialog}
    </>
  );
}
