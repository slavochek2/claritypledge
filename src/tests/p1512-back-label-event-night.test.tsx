/**
 * @file p1512-back-label-event-night.test.tsx
 * @description P1512 review: a Back control names its parent ("← Groups") ONLY when the click will take the
 * page's own fallback. During an event night useGoBack swaps that fallback for the event room
 * (eventNightBackFallback), so on a cold arrival the click goes to the room, not the parent — and the
 * label must then say just "Back", or it lies.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { TonightsEvent } from '@/app/hooks/useTonightsEvent';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ShellBarContext } from '@/app/components/layout/app-shell/shell-top-bar-context';

const tonight = vi.hoisted(() => ({ current: null as null | TonightsEvent }));
vi.mock('@/app/hooks/useTonightsEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/hooks/useTonightsEvent')>()),
  useTonightsEvent: () => tonight.current,
}));

// A Clarity Night: 2026-10-06 18:00 ICT (11:00Z), 3 hours, preparation on — the window is 10:00Z to 17:00Z.
const night: TonightsEvent = {
  slug: 'night-2', title: 'Clarity Night', datetime: '2026-10-06T11:00:00Z', durationMinutes: 180, preparationEnabled: true,
};

function Here() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function coldArrival() {
  vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
  vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/groups/cm']}>
      <Routes>
        <Route path="/groups/cm" element={<><FocusHeader fallback="/groups" parentName="Groups" /><Here /></>} />
        <Route path="*" element={<Here />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T12:00:00Z')); // inside the window
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  tonight.current = null;
});

describe('P1512 Back label: event-night fallback', () => {
  it('no event night: a cold arrival still names the parent and goes there', () => {
    coldArrival();
    renderHeader();
    const back = screen.getByRole('button', { name: 'Back to Groups' });
    expect(back.textContent).toBe('Groups');
    fireEvent.click(back);
    expect(screen.getByTestId('path').textContent).toBe('/groups');
  });

  it('event night: a cold arrival goes to the ROOM, so the label says just "Back"', () => {
    tonight.current = night;
    coldArrival();
    renderHeader();
    const back = screen.getByRole('button', { name: 'Go back' });
    expect(back.textContent).toBe('Back');
    fireEvent.click(back);
    // What it says and what it does agree: the room, not /groups.
    expect(screen.getByTestId('path').textContent).toBe('/events/night-2/room');
  });

  it('event night, but the page IS that event: the fallback is not swapped, so the parent is named', () => {
    tonight.current = night;
    coldArrival();
    render(
      <MemoryRouter initialEntries={['/events/night-2']}>
        <Routes>
          <Route path="/events/night-2" element={<><FocusHeader fallback="/events" parentName="Events" /><Here /></>} />
          <Route path="*" element={<Here />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Back to Events' }).textContent).toBe('Events');
  });

  it('the same rule holds in the shell bar', () => {
    tonight.current = night;
    coldArrival();
    const left = document.createElement('div');
    document.body.appendChild(left);
    render(
      <ShellBarContext.Provider value={{ left, right: null, setLeft: () => {}, setRight: () => {} }}>
        <MemoryRouter initialEntries={['/groups/cm']}>
          <FocusHeader fallback="/groups" parentName="Groups" />
        </MemoryRouter>
      </ShellBarContext.Provider>,
    );
    expect(left.querySelector('button')?.textContent).toBe('Back');
  });
});
