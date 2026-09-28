/**
 * @file p1364-return-state.test.tsx
 * @description P1364 §5 — Back remembers which cards were open (founder: "if it comes back,
 * should it remember that a specific point was open, e.g.? or story open?").
 *
 * useReturnState keeps a card's open/expanded state per HISTORY ENTRY: restored on POP, fresh
 * on PUSH, kept across a REPLACE (same visit), never in the URL or the list cache. And it is in
 * the DOM before ScrollToTop restores the pixel position.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useReturnState } from '@/app/hooks/use-return-state';
import { ScrollToTop } from '@/app/components/scroll-to-top';
import { __returnStateForTest, readReturnState, writeReturnState } from '@/lib/return-state';
import { MAX_SAVED_POSITIONS } from '@/lib/scroll-positions';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
import type { Story } from '@/app/components/shared/prototype-types';

vi.mock('@/auth', () => ({ useAuth: () => ({ session: null, user: null, isLoading: false }) }));

function Card({ id }: { id: string }) {
  const [open, setOpen] = useReturnState(`test-card:${id}`, false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)}>toggle {id}</button>
      {open && <p data-testid={`open-${id}`}>{id} is open</p>}
    </div>
  );
}
function List() {
  return <><Card id="a" /><Card id="b" /></>;
}

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const go = (to: string | number, opts?: { replace?: boolean }) =>
  act(() => { if (typeof to === 'number') nav(to); else nav(to, opts); });
const isOpen = (id: string) => screen.queryByTestId(`open-${id}`) !== null;

function renderApp(entries = ['/list']) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <ScrollToTop />
      <NavGrab />
      <Where />
      <Routes>
        <Route path="/list" element={<List />} />
        <Route path="/item/:id" element={<p>an item</p>} />
      </Routes>
    </MemoryRouter>
  );
}

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(() => vi.restoreAllMocks());

describe('P1364 useReturnState — per history entry', () => {
  it('expand → PUSH away → POP → still expanded (and only that card)', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'toggle b' }));
    expect(isOpen('b')).toBe(true);
    go('/item/b');
    go(-1);
    expect(isOpen('b')).toBe(true);
    expect(isOpen('a')).toBe(false);
  });

  it('a PUSH to the same list starts collapsed', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'toggle a' }));
    go('/item/a');
    go('/list'); // a link, or the nav — not Back
    expect(isOpen('a')).toBe(false);
  });

  it('a PUSH to the same URL while the list is mounted resets it (the card sees a new entry)', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'toggle a' }));
    go('/list');
    expect(isOpen('a')).toBe(false);
    go(-1); // and Back to the first visit reopens it
    expect(isOpen('a')).toBe(true);
  });

  it('a REPLACE (a tab, the search box) is the same visit: the state survives it and a later Back', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'toggle a' }));
    go('/list?tab=stories', { replace: true });
    expect(isOpen('a')).toBe(true);
    go('/item/a');
    go(-1);
    expect(screen.getByTestId('where').textContent).toBe('/list?tab=stories');
    expect(isOpen('a')).toBe(true);
  });

  it('collapsing is remembered too', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'toggle a' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle a' }));
    go('/item/a');
    go(-1);
    expect(isOpen('a')).toBe(false);
  });

  it('a cold load (the first render is also a POP) with nothing stored opens collapsed — shared links never open expanded', () => {
    renderApp(['/list?tab=stories']);
    expect(isOpen('a')).toBe(false);
    expect(isOpen('b')).toBe(false);
  });
});

describe('P1364 useReturnState — ordering with the scroll restore', () => {
  it('the expanded card is already in the DOM when ScrollToTop restores the position', () => {
    let y = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    const seenOpenAtRestore: boolean[] = [];
    scrollTo.mockImplementation((_x: number, top: number) => {
      if (top > 0) seenOpenAtRestore.push(document.querySelector('[data-testid="open-b"]') !== null);
      y = top;
    });
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'toggle b' }));
    y = 900;
    window.dispatchEvent(new Event('scroll'));
    go('/item/b');
    go(-1);
    expect(seenOpenAtRestore.length).toBeGreaterThan(0);
    expect(seenOpenAtRestore[0]).toBe(true);
  });
});

describe('P1364 return-state store', () => {
  it('is capped like the scroll positions, oldest visit dropped first', () => {
    for (let i = 0; i < MAX_SAVED_POSITIONS + 5; i++) writeReturnState(`e${i}`, 'card', i);
    expect(__returnStateForTest().size).toBe(MAX_SAVED_POSITIONS);
    expect(readReturnState('e0', 'card')).toBeUndefined();
    expect(readReturnState(`e${MAX_SAVED_POSITIONS + 4}`, 'card')).toBe(MAX_SAVED_POSITIONS + 4);
  });
});

describe('P1364 useReturnState — a quoted story is keyed per point AND story', () => {
  const LONG = 'A long story. '.repeat(60); // over the 600-character cut, so "...more" shows
  const story: Story = {
    id: 's1', authorId: 'a1', text: LONG, createdAt: '2026-09-01T00:00:00Z',
    visibility: 'public', linkedPointIds: ['p1', 'p2'], understoodCount: 0,
  };
  function TwoPoints() {
    return (
      <>
        <div data-testid="under-p1"><QuotedStory story={story} scopeId="p1" onClick={() => {}} /></div>
        <div data-testid="under-p2"><QuotedStory story={story} scopeId="p2" onClick={() => {}} /></div>
      </>
    );
  }
  it('opening the story under one point → PUSH → POP: only that one is open', () => {
    render(
      <MemoryRouter initialEntries={['/list']}>
        <ScrollToTop />
        <NavGrab />
        <Routes>
          <Route path="/list" element={<TwoPoints />} />
          <Route path="/item/:id" element={<p>an item</p>} />
        </Routes>
      </MemoryRouter>
    );
    const more = (scope: string) => screen.getByTestId(`under-${scope}`).querySelector('[data-testid="more-link"]');
    expect(more('p1')).not.toBeNull();
    expect(more('p2')).not.toBeNull();
    fireEvent.click(more('p1')!);
    expect(more('p1')).toBeNull();
    go('/item/s1');
    go(-1);
    expect(more('p1')).toBeNull(); // still open
    expect(more('p2')).not.toBeNull(); // the same story under another point stays closed
  });
});

