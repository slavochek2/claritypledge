/**
 * P1529 D24: the waiting list under Participants. The host adds a person with one tap; attendees only read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ get: vi.fn(), add: vi.fn(), rpc: vi.fn(), emails: vi.fn(), toastError: vi.fn(), toastOk: vi.fn() }));
vi.mock('@/app/data/event-waitlist', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-waitlist')>()),
  getWaitlistPublic: (...a: unknown[]) => h.get(...a),
  hostAddFromWaitlist: (...a: unknown[]) => h.add(...a),
}));
vi.mock('sonner', () => ({ toast: { error: (m: string) => h.toastError(m), success: (m: string) => h.toastOk(m) } }));

import { EventWaitlistList } from '@/app/prototypes/events/components/EventWaitlistList';

const ENTRIES = [
  { profileId: 'a', name: 'Test Alma', slug: 'alma', avatarColor: '#123456', avatarUrl: null, hasPledged: false, position: 1 },
  { profileId: 'b', name: 'Test Boris', slug: 'boris', avatarColor: '#654321', avatarUrl: null, hasPledged: false, position: 2 },
];
const mount = (isHost: boolean, onAdded = vi.fn()) =>
  render(<MemoryRouter><EventWaitlistList eventId="e1" isHost={isHost} onAdded={onAdded} /></MemoryRouter>);

beforeEach(() => { h.get.mockReset(); h.add.mockReset(); h.toastError.mockReset(); h.toastOk.mockReset(); });

describe('EventWaitlistList', () => {
  it('renders nothing for an empty list (an outsider gets an empty list)', async () => {
    h.get.mockResolvedValue([]);
    const { container } = mount(false);
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('e1'));
    expect(container.textContent).toBe('');
  });

  it('shows the heading and the names in order, without an Add control, to an attendee', async () => {
    h.get.mockResolvedValue(ENTRIES);
    mount(false);
    expect(await screen.findByText('Waiting list (2)')).toBeTruthy();
    const names = screen.getAllByText(/^Test /).map((n) => n.textContent);
    expect(names).toEqual(['Test Alma', 'Test Boris']);
    expect(screen.queryByTestId('event-waitlist-add')).toBeNull();
  });

  it('the host adds with one tap: no dialog, the row goes, the page is told', async () => {
    h.get.mockResolvedValueOnce(ENTRIES).mockResolvedValue([ENTRIES[1]]);
    h.add.mockResolvedValue('ok');
    const onAdded = vi.fn();
    mount(true, onAdded);
    const buttons = await screen.findAllByTestId('event-waitlist-add');
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(h.add).toHaveBeenCalledWith('e1', 'a'));
    await waitFor(() => expect(screen.queryByText('Test Alma')).toBeNull());
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(h.toastOk).toHaveBeenCalled();
    expect(screen.getByText('Test Boris')).toBeTruthy();
  });

  it('shows a pending state and disables the Add buttons while one add runs', async () => {
    h.get.mockResolvedValue(ENTRIES);
    let done!: (v: string) => void;
    h.add.mockReturnValue(new Promise((r) => { done = r; }));
    mount(true);
    const buttons = await screen.findAllByTestId('event-waitlist-add');
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(screen.getByText('Adding…')).toBeTruthy());
    screen.getAllByTestId('event-waitlist-add').forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
    done('ok');
    await waitFor(() => expect(screen.queryByText('Adding…')).toBeNull());
  });

  it('a failed add keeps the row, shows the error as a toast and a line', async () => {
    h.get.mockResolvedValue(ENTRIES);
    h.add.mockRejectedValue(new Error('Could not add this person'));
    const onAdded = vi.fn();
    mount(true, onAdded);
    fireEvent.click((await screen.findAllByTestId('event-waitlist-add'))[0]!);
    expect((await screen.findByTestId('event-waitlist-error')).textContent).toBe('Could not add this person');
    expect(h.toastError).toHaveBeenCalledWith('Could not add this person');
    expect(screen.getByText('Test Alma')).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe('hostAddFromWaitlist (service)', () => {
  it('sends the normal confirmation email for the added person, only for a new registration', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));
    vi.doMock('@/lib/event-emails', () => ({ invokeEventEmails: (...a: unknown[]) => h.emails(...a) }));
    vi.doMock('@/lib/session-guard', () => ({ guardSeatWrite: async () => true, isAnonymousRlsDenial: () => false, SessionMismatchError: class extends Error {} }));
    vi.doMock('@/app/data/db-error-logger', () => ({ logDbError: vi.fn(), throwDbError: (_c: string, _e: unknown, m: string) => { throw new Error(m); } }));
    const real = await vi.importActual<typeof import('@/app/data/event-waitlist')>('@/app/data/event-waitlist');
    h.rpc.mockResolvedValueOnce({ data: 'ok', error: null });
    await real.hostAddFromWaitlist('e1', 'u1');
    expect(h.rpc).toHaveBeenCalledWith('host_add_from_waitlist', { p_event: 'e1', p_user: 'u1' });
    expect(h.emails).toHaveBeenCalledWith('rsvp', 'e1', 'u1');
    h.emails.mockClear();
    h.rpc.mockResolvedValueOnce({ data: 'already', error: null });
    expect(await real.hostAddFromWaitlist('e1', 'u1')).toBe('already');
    expect(h.emails).not.toHaveBeenCalled();
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(real.hostAddFromWaitlist('e1', 'u1')).rejects.toThrow('Could not add this person');
    expect(h.emails).not.toHaveBeenCalled();
  });
});
