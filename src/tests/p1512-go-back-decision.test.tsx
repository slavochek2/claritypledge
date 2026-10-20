/**
 * @file p1512-go-back-decision.test.tsx
 * @description P1512: the label of a Back control and its click read ONE decision (decideGoBack), so a control
 * that names its parent can never say "Groups" while popping to chat. Pins that useGoBackControl().willPop
 * agrees with what the click does, in both the popping and the cold-arrival case.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { decideGoBack, useGoBackControl } from '@/app/hooks/use-go-back';

function Probe() {
  const { goBack, willPop } = useGoBackControl('/parent');
  const loc = useLocation();
  return (
    <>
      <button onClick={goBack}>go</button>
      <p data-testid="willPop">{String(willPop)}</p>
      <p data-testid="path">{loc.pathname}</p>
    </>
  );
}

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('P1512 decideGoBack / useGoBackControl', () => {
  it('an earlier entry exists: willPop is true and the click pops', () => {
    renderAt(['/a', '/b']);
    expect(screen.getByTestId('willPop').textContent).toBe('true');
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('path').textContent).toBe('/a');
  });

  it('a cold arrival: willPop is false and the click takes the fallback', () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    renderAt(['/b']);
    expect(screen.getByTestId('willPop').textContent).toBe('false');
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('path').textContent).toBe('/parent');
  });

  it('the pure helper agrees: in-memory router, first entry, nothing before it in the tab = fallback', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    expect(decideGoBack({ key: 'default', pathname: '/__nowhere__' }, true)).toBe('fallback');
    expect(decideGoBack({ key: 'abc', pathname: '/__nowhere__' }, false)).toBe('pop');
  });
});
