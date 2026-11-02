/**
 * @file RoomChrome.tsx
 * @description P1562: room pieces kept out of EventRoomMeet.tsx (over the size limit) — the room's sticky head, shared by /meet and /ready so the step bar sits at the same y
 * on every room view, at scroll 0 and after scrolling (§1).
 */
import { useLayoutEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { RoomCaptureBar } from '@/app/components/session/room-capture-bar';
import { claimRoomBar } from '@/app/components/session/room-bar-owner';
import { BACK_LABEL, BACK_TO_EVENT } from './use-room-back';
import { useOfflineStripShown } from '@/app/contexts/offline-status-context';
import { roomHeadOffset } from './room-head-offset';

/**
 * The room's sticky head: pinned under the fixed nav (inside the shell, under the screen's top edge — index.css, P1512),
 * below the offline strip's push. The running capture bar is drawn INSIDE this head (RoomHeadCapture claims the shell's
 * slot), so it needs no offset of its own.
 */
export function RoomStickyHead({ className, children }: { className?: string; children: ReactNode }) {
  const offlineStrip = useOfflineStripShown();
  return (
    <div
      className={cn(
        'sticky z-20 bg-background top-[calc(4rem+var(--room-head-offset)+env(safe-area-inset-top))] lg:top-[calc(5rem+var(--room-head-offset)+env(safe-area-inset-top))]',
        className,
      )}
      style={{ '--room-head-offset': roomHeadOffset(offlineStrip) } as CSSProperties}
      data-testid="room-sticky-head"
    >
      {children}
    </div>
  );
}

/**
 * Founder, solo test 2026-11-02: "← Event" on the tabs row (the arrow alone below 360px), always to the event. One grid for
 * phones and desktop: Back in the first column, the tabs in the second; from lg the tabs are a centred 32rem column with
 * an equal first column, so they stay centred whatever the Back says.
 */
export function RoomHeadRow({ onBack, tabs, className }: { onBack: () => void; tabs: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-end gap-1 lg:grid-cols-[1fr_minmax(0,32rem)_1fr]', className)} data-testid="room-head-row">
      <div className="min-w-0 self-center lg:justify-self-start">
        <FocusHeader inPlace arrowOnlyBelow360 onBack={onBack} label={BACK_LABEL} aria-label={BACK_TO_EVENT} />
      </div>
      <div className="min-w-0 max-lg:w-full">{tabs}</div>
    </div>
  );
}

/**
 * The transcription bar of the room, directly under the tabs row, in the sticky head: the running bar (the room takes the
 * shell's slot, so it is drawn once, here) or, while nothing is running, the page's own idle bar. The idle bar hides itself
 * while any capture is running, so there is never more than one bar on screen.
 */
export function RoomHeadCapture({ idle }: { idle?: ReactNode }) {
  useLayoutEffect(() => claimRoomBar(), []);
  return (
    <>
      <RoomCaptureBar short />
      {idle}
    </>
  );
}
