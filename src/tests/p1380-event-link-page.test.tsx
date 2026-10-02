/**
 * P1380: the page behind every event-email button. On load it only ASKS who the button is for
 * (peek — spends nothing) and shows "Continue as Anna" with her photo and the event; the press
 * redeems the ticket. Admin/host, used and expired buttons explain why and offer Sign in.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));

import { EventLinkPage } from '@/auth/EventLinkPage';
import { loginReasonText, safeAppPath } from '@/auth/event-link-path';

const TICKET = 'A'.repeat(43);
const ANNA = { mode: 'continue', name: 'Anna Lee', avatarUrl: null, avatarColor: '#3B82F6', hasPledged: false, eventTitle: 'Clarity Night #2' };
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
  it('on load only peeks (spends nothing), then shows Continue as {first name} with the event', async () => {
    invoke.mockResolvedValue({ data: ANNA, error: null });
    renderAt(`?ticket=${TICKET}`);
    expect(await screen.findByRole('button', { name: 'Continue as Anna' })).toBeTruthy();
    expect(screen.getByTestId('event-link-name').textContent).toBe('Anna Lee');
    expect(screen.getByTestId('event-link-event').textContent).toBe('Clarity Night #2');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('event-email-link', { body: { t: TICKET, peek: true } });
  });

  it('the press redeems the ticket and follows the reply', async () => {
    invoke
      .mockResolvedValueOnce({ data: ANNA, error: null })
      .mockResolvedValueOnce({ data: { mode: 'continue', to: '/auth/verify?token_hash=x&type=magiclink&redirect=%2Fevents%2Fcn%2Froom' }, error: null });
    renderAt(`?ticket=${TICKET}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue as Anna' }));
    await waitFor(() => expect(landed).toBe('/auth/verify?token_hash=x&type=magiclink&redirect=%2Fevents%2Fcn%2Froom'));
    expect(invoke).toHaveBeenLastCalledWith('event-email-link', { body: { t: TICKET } });
  });

  it('an admin/host account is told why and offered Sign in to the same page', async () => {
    invoke.mockResolvedValue({ data: { mode: 'login', to: '/login?redirect=%2Fevents%2Fcn%2Froom', reason: 'restricted' }, error: null });
    renderAt(`?ticket=${TICKET}`);
    expect((await screen.findByTestId('event-link-reason')).textContent).toBe(loginReasonText('restricted'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(landed).toBe('/login?redirect=%2Fevents%2Fcn%2Froom');
  });

  it('a used button says so', async () => {
    invoke.mockResolvedValue({ data: { mode: 'login', to: '/login?redirect=%2Fx', reason: 'used' }, error: null });
    renderAt(`?ticket=${TICKET}`);
    expect((await screen.findByTestId('event-link-reason')).textContent).toBe('This button has already been used. Sign in to continue.');
  });

  it('a network failure on the press keeps the page and says to press again', async () => {
    invoke
      .mockResolvedValueOnce({ data: ANNA, error: null })
      .mockResolvedValueOnce({ data: null, error: Object.assign(new Error('fetch failed'), { context: { status: 0 } }) });
    renderAt(`?ticket=${TICKET}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue as Anna' }));
    await waitFor(() => expect(screen.getByTestId('event-link-error')).toBeTruthy());
    expect(landed).toBe('');
  });

  it('no ticket: says the link is incomplete and offers sign-in (no dead button)', () => {
    renderAt('');
    expect(screen.getByTestId('event-link-missing')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
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
