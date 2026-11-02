/**
 * P1596 review: the room draws its running bar INSIDE the sticky head, and the shell's slot (which the room claims)
 * draws nothing. The head therefore offsets only for the offline strip: it must not measure the shell's slot, whose
 * height would be counted a second time if anything ever drew there.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const strip = vi.hoisted(() => ({ on: false }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => ({ barVisible: true }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useOfflineStripShown: () => strip.on }));
vi.mock('@/app/components/session/room-capture-bar', () => ({ RoomCaptureBar: () => null }));

import { RoomStickyHead } from '@/app/prototypes/events/components/RoomChrome';

afterEach(() => { document.body.innerHTML = ''; strip.on = false; });

describe('RoomStickyHead offset', () => {
  it('ignores a leftover shell slot: the offset is 0 when no offline strip shows', () => {
    const slot = document.createElement('div');
    slot.setAttribute('data-testid', 'room-capture-slot');
    slot.getBoundingClientRect = () => ({ height: 49 } as DOMRect);
    document.body.appendChild(slot);
    render(<RoomStickyHead>x</RoomStickyHead>);
    expect(screen.getByTestId('room-sticky-head').style.getPropertyValue('--room-head-offset')).toBe('0px');
  });

  it('is pushed down by the offline strip alone', () => {
    strip.on = true;
    render(<RoomStickyHead>x</RoomStickyHead>);
    expect(screen.getByTestId('room-sticky-head').style.getPropertyValue('--room-head-offset')).toBe('1.75rem');
  });
});
