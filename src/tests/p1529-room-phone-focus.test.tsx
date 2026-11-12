/**
 * @file p1529-room-phone-focus.test.tsx
 * @description P1529: inside an event's room the phone tabs + Today's-event strip hide (focus route); a point's phone
 * view says "Box · n of m".
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { isBottomNavHiddenRoute } from '@/app/components/layout/bottom-nav-routes';
import { PointPanel } from '@/app/components/canvas/canvas-point-panel';

describe('room focus routes', () => {
  it('hides the bar on /room, /ready, /meet and the feedback view; the events list keeps it', () => {
    expect(isBottomNavHiddenRoute('/events/x/room', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/events/x/ready', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/events/x/meet', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/events/x/meet', '?view=feedback')).toBe(true);
    expect(isBottomNavHiddenRoute('/events', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/events/x', '')).toBe(false);
  });
});

describe('point position line', () => {
  it('names the box and the position within it', () => {
    render(
      <MemoryRouter>
        <PointPanel onClose={() => undefined} label="Point" viewKey="p2" step={{ box: 'Problem', boxTag: 'canvas:problem', position: { index: 2, total: 3 } }}>
          <p>body</p>
        </PointPanel>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('canvas-panel-position').textContent).toBe('2 of 3');
  });
});
