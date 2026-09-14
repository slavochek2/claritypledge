/**
 * @file p1307-go-back.test.tsx
 * @description Founder request during P1307 testing: /transcribe needs "Go back" at the top and
 * the bottom, like /stake, and it must lead to wherever the person came from.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useGoBack } from '@/app/hooks/use-go-back';
import { BottomBackButton } from '@/app/components/layout/bottom-back-button';

function Here() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function BackPage() {
  const goBack = useGoBack('/');
  return (
    <>
      <Here />
      <BottomBackButton onBack={goBack} testId="bottom-back" />
    </>
  );
}

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/transcribe" element={<BackPage />} />
        <Route path="*" element={<Here />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useGoBack + BottomBackButton', () => {
  it('returns to the page the person came from', () => {
    renderAt(['/events/x/meet', '/transcribe']);
    fireEvent.click(screen.getByRole('button', { name: /go back from the end of the page/i }));
    expect(screen.getByTestId('path').textContent).toBe('/events/x/meet');
  });

  it('arriving cold (typed URL, bookmark, fresh tab) goes to the fallback, never out of the app', () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    renderAt(['/transcribe']);
    fireEvent.click(screen.getByRole('button', { name: /go back from the end of the page/i }));
    expect(screen.getByTestId('path').textContent).toBe('/');
  });

  it('first page in the app but not in the tab (came from an outside page) goes back, not to the fallback', () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    renderAt(['/transcribe']);
    fireEvent.click(screen.getByRole('button', { name: /go back from the end of the page/i }));
    // navigate(-1) at the first in-memory entry stays put; the point is it did NOT go to '/'.
    expect(screen.getByTestId('path').textContent).toBe('/transcribe');
  });

  it('the pill is a real 44px control labelled "Go back"', () => {
    renderAt(['/a', '/transcribe']);
    const btn = screen.getByRole('button', { name: /go back from the end of the page/i });
    expect(btn.textContent).toContain('Go back');
    expect(btn.className).toContain('min-h-11');
  });
});
