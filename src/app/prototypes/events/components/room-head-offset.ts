/**
 * @file room-head-offset.ts
 * @description P1429 A4: where the event room's pinned step bar sits below the fixed nav.
 *
 * Below the nav there may be the offline strip's push (the nav moves down 1.75rem while it shows —
 * simple-navigation.tsx). The running capture bar is drawn inside the room's sticky head itself
 * (RoomChrome), so its height is never added here.
 */

/** The extra offset below the nav row, as a CSS length for `calc()`. */
export function roomHeadOffset(offlineStrip: boolean): string {
  return offlineStrip ? '1.75rem' : '0px';
}
