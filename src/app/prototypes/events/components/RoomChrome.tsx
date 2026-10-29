/**
 * @file RoomChrome.tsx
 * @description P1562: room pieces kept out of EventRoomMeet.tsx (over the size limit) — the room's sticky head, shared by /meet and /ready so the step bar sits at the same y
 * on every room view, at scroll 0 and after scrolling (§1).
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useOfflineStripShown } from '@/app/contexts/offline-status-context';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { roomHeadOffset, useMeasuredHeight } from './room-head-offset';

/**
 * The room's sticky head: pinned under the fixed nav (inside the shell, under the screen's top edge — index.css, P1512),
 * below the offline strip's push and the running capture bar at its measured height (P1429 A4, room-head-offset.ts).
 */
export function RoomStickyHead({ className, children }: { className?: string; children: ReactNode }) {
  const { barVisible } = useRoomCapture();
  const offlineStrip = useOfflineStripShown();
  const captureBarPx = useMeasuredHeight('[data-testid="room-capture-slot"]', barVisible);
  return (
    <div
      className={cn(
        'sticky z-20 bg-background top-[calc(4rem+var(--room-head-offset)+env(safe-area-inset-top))] lg:top-[calc(5rem+var(--room-head-offset)+env(safe-area-inset-top))]',
        className,
      )}
      style={{ '--room-head-offset': roomHeadOffset(offlineStrip, captureBarPx) } as CSSProperties}
      data-testid="room-sticky-head"
    >
      {children}
    </div>
  );
}
