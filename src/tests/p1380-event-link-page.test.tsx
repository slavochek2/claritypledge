/**
 * P1380: the "Continue" page behind every event-email button. Nothing happens on load (a link
 * scanner opening the page spends nothing); one press redeems the ticket and follows the reply;
 * a reply that is not an app path is never followed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));

import { EventLinkPage } from '@/auth/EventLinkPage';
import { safeAppPath } from '@/auth/event-link-path';

const TICKET = 'A'.repeat(43);
let landed = '';
function Spy() {
  const l = useLocation();
  landed = l.pathname + l.search;
  return <p>landed</p>;
}

function renderAt(search: string) {
  window.history.replaceState(null, '', `/auth/event-link${search}`);
  render(
    <MemoryRouter initialEntries={[`/auth/event-link${search}`]}>
      <Routes>
        <Route path="/auth/event-link" element={<EventLinkPage />} />
        <Route path="*" element={<Spy />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invoke.mockReset();
  landed = '';
});

describe('EventLinkPage', () => {
  it('does nothing on load — only the press redeems the ticket', () => {
    renderAt(`?ticket=${TICKET}`);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a press sends the ticket and follows the reply', async () => {
    invoke.mockResolvedValue({ data: { to: '/auth/verify?token_hash=x&type=magiclink&redirect=%2Fevents%2Fcn%2Froom' }, error: null });
    renderAt(`?ticket=${TICKET}`);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(landed).toBe('/auth/verify?token_hash=x&type=magiclink&redirect=%2Fevents%2Fcn%2Froom'));
    expect(invoke).toHaveBeenCalledWith('event-email-link', { body: { t: TICKET } });
  });

  it('a used ticket lands on normal sign-in for the same page', async () => {
    invoke.mockResolvedValue({ data: { to: '/login?redirect=%2Fevents%2Fcn%2Froom' }, error: null });
    renderAt(`?ticket=${TICKET}`);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(landed).toBe('/login?redirect=%2Fevents%2Fcn%2Froom'));
  });

  it('a network failure keeps the page and says to press again', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('fetch failed'), { context: { status: 0 } }) });
    renderAt(`?ticket=${TICKET}`);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('event-link-error')).toBeTruthy());
    expect(landed).toBe('');
  });

  it('no ticket: says the link is incomplete and offers sign-in (no dead button)', () => {
    renderAt('');
    expect(screen.getByTestId('event-link-missing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});

describe('safeAppPath', () => {
  it('accepts app paths only', () => {
    expect(safeAppPath('/events')).toBe('/events');
    expect(safeAppPath('//evil.example')).toBeNull();
    expect(safeAppPath('https://evil.example')).toBeNull();
    expect(safeAppPath('/\\evil')).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });
});
