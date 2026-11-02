/**
 * P1429 A4: the room's pinned step bar sat at "nav + 49px", so it slid under the offline strip
 * (which pushes the nav down 1.75rem). It now offsets from the offline strip; the capture bar is drawn
 * inside the head itself, so nothing measures it.
 */
import { describe, it, expect } from 'vitest';
import { roomHeadOffset } from '@/app/prototypes/events/components/room-head-offset';

describe('roomHeadOffset', () => {
  it('online: nothing below the nav', () => {
    expect(roomHeadOffset(false)).toBe('0px');
  });
  it('the offline strip pushes the head down 1.75rem', () => {
    expect(roomHeadOffset(true)).toBe('1.75rem');
  });
});
