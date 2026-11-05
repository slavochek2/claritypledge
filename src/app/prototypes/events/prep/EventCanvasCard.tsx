/**
 * @file EventCanvasCard.tsx
 * @description P1529 §2 (D9, D17): "Your Clarity Canvas for this event". Pick a published canvas, or make one with
 * your mirror; sharing it with this event is its own visible tap. Change is gone once round 1 starts; a first canvas
 * can still arrive later, and the host may add that person at a coming round. Nothing is shared in the background.
 * Wording is DRAFT: [FOUNDER DECISION: copy].
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { canvasService, type MyCanvasRow } from '@/app/data/canvas-service';
import { getMyEventCanvas, setEventCanvas, type MyEventCanvas } from '@/app/data/event-mastermind-service';
import { useStartCanvas } from '@/app/pages/chat/use-start-canvas';
import { isNetworkBlip, NetworkBlipError } from '@/lib/network-blip';

const canvasLabel = (c: MyCanvasRow) => c.title || c.name;

function PickList({ canvases, busy, onPick }: { canvases: MyCanvasRow[]; busy: boolean; onPick: (name: string) => void }) {
  return (
    <ul className="space-y-2">
      {canvases.map(c => (
        // The name wraps rather than truncates, and the button drops under it when the row is narrow (320px).
        <li key={c.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
          <span className="min-w-[8rem] flex-1 break-words">{canvasLabel(c)}</span>
          <Button variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => onPick(c.name)} data-testid="event-canvas-share">
            Share with this event
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function EventCanvasCard({ eventId }: { eventId: string }) {
  const [mine, setMine] = useState<MyEventCanvas | null>(null);
  const [canvases, setCanvases] = useState<MyCanvasRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const { start, dialog } = useStartCanvas();

  // A failed read is an error with Retry: it must never look like "no canvas yet", which would tell the person they join as an observer.
  const read = useCallback(async () => {
    try {
      const [current, list] = await Promise.all([getMyEventCanvas(eventId), canvasService.listMyCanvases()]);
      setMine(current);
      setCanvases(list);
      setReadFailed(false);
    } catch {
      setReadFailed(true);
    }
    setLoaded(true);
  }, [eventId]);

  useEffect(() => {
    void read();
  }, [read]);

  const pick = async (name: string) => {
    setBusy(true);
    try {
      const result = await setEventCanvas(eventId, name);
      if (result.status === 'refused') toast.error('Your Clarity Canvas is fixed now that round 1 has started.');
      setChanging(false);
      await read();
    } catch (e) {
      // The server's refusal (nothing published to share) and a request that never got through are different things to do.
      toast.error(e instanceof NetworkBlipError || isNetworkBlip(e as Error) ? 'Could not reach the server. Check your connection and try again.' : 'Only a published Clarity Canvas of yours can be shared with this event.');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  if (readFailed) {
    return (
      <section className="w-full rounded-lg border border-border p-4 text-left" data-testid="event-canvas-error" role="alert">
        <p className="text-sm text-muted-foreground">Could not load your Clarity Canvas for this event.</p>
        <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => void read()} data-testid="event-canvas-retry">Retry</Button>
      </section>
    );
  }
  const chosen = mine?.shared ? mine : null;
  // The canvas's own title when it has one; the raw name (canvas_2) otherwise.
  const chosenLabel = chosen ? canvases.find(c => c.name === chosen.name)?.title || chosen.name : '';

  return (
    <section className="w-full rounded-lg border border-border p-4 text-left" data-testid="event-canvas-card">
      {chosen && !changing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span data-testid="event-canvas-chosen">Your Clarity Canvas for this event: <strong>{chosenLabel}</strong></span>
          {!chosen.fixed && (
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => setChanging(true)} data-testid="event-canvas-change">Change</Button>
          )}
          {chosen.fixed && <p className="w-full text-muted-foreground" data-testid="event-canvas-ready">You&apos;re ready. The host can add you to a coming round.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Your Clarity Canvas for this event</h2>
          {canvases.length > 0 && <PickList canvases={canvases} busy={busy} onPick={pick} />}
          <Button variant="outline" size="sm" className="min-h-11" onClick={() => void start()} data-testid="event-canvas-make">Make one with your mirror</Button>
          <p className="text-sm text-muted-foreground" data-testid="event-canvas-observer-line">
            Without one you join as an observer: you help the pair keep to the rules and give feedback at the end of the round.
          </p>
        </div>
      )}
      {dialog}
    </section>
  );
}
