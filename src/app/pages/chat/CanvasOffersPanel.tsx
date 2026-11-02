/**
 * @file CanvasOffersPanel.tsx
 * @description P1536 S5: the offer rows wired to their actions. Drawn only when there is something to say (a live offer, or a failed read), so a thread with no offers needs no chat
 * provider and no router, and makes no navigation hook: the read lives one level up (use-canvas-offers), the actions one level down (use-canvas-offer-actions).
 */
import { liveOffers, type CanvasOffersView } from './use-canvas-offers';
import { useCanvasOfferActions } from './use-canvas-offer-actions';
import { CanvasOfferRows, type OfferRowsStatus } from './CanvasOfferRows';

interface PanelProps {
  view: CanvasOffersView;
  status: OfferRowsStatus;
  reload?: () => Promise<void>;
  placement: 'thread' | 'footer';
}

function WiredRows({ view, status, reload, placement }: PanelProps) {
  const actions = useCanvasOfferActions({ read: view.read, reread: view.reread, reload });
  return (
    <CanvasOfferRows
      read={view.read} failed={view.failed} onRetry={view.retry} status={status} pending={actions.pending} placement={placement}
      onSwitch={actions.switchTo} onStart={actions.start} onDismiss={actions.dismiss}
    />
  );
}

export function CanvasOffersPanel(p: PanelProps) {
  if (!liveOffers(p.view.read).length && !p.view.failed) return null;
  return <WiredRows {...p} />;
}
