// @vitest-environment jsdom
/**
 * P1675 UAT round 3 R18: the RENDERED Edit event form. A hike shows the four-way "Before the seat" choice with the stored one
 * selected, and saving sends the chosen preset; a Clarity Night shows none and sends no hikeRegistration key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const svc = vi.hoisted(() => ({
  getEventBySlug: vi.fn(),
  getEventGroupChatUrl: vi.fn(),
  updateEvent: vi.fn(),
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: svc }));

import { EditEvent } from '@/app/prototypes/events/components/EditEvent';

const base = {
  id: 'ev-1', slug: 'walk', title: 'Doi Suthep walk', description: 'A long enough description for the form to accept it.',
  datetime: '2099-01-01T11:00:00Z', timezone: 'Asia/Bangkok', durationMinutes: 60, location: 'Somewhere',
  hostId: 'host-1', hasGroupChat: false, preparationEnabled: false, statementTag: null,
  hikeRegistration: 'when_transport',
};
const hike = { ...base, seriesSlug: 'social-hike', flow: 'social-hike' };
const night = { ...base, slug: 'night', seriesSlug: 'clarity-night', flow: 'clarity-night' };

function mount(slug: string) {
  render(
    <MemoryRouter initialEntries={[`/events/${slug}/edit`]}>
      <Routes><Route path="/events/:slug/edit" element={<EditEvent />} /></Routes>
    </MemoryRouter>,
  );
}

const lastUpdate = (): Record<string, unknown> => (svc.updateEvent.mock.calls[0] as unknown[])[1] as Record<string, unknown>;

beforeEach(() => {
  auth.value = { user: { id: 'host-1' }, session: { user: { id: 'host-1' } }, isLoading: false, sessionChecked: true };
  svc.getEventGroupChatUrl.mockResolvedValue(null);
  svc.updateEvent.mockResolvedValue(true);
  svc.updateEvent.mockClear();
});
afterEach(cleanup);

describe('P1675 R18: Edit event before-the-seat choice', () => {
  it('a hike shows four choices, the stored one selected, and saving sends the chosen preset', async () => {
    svc.getEventBySlug.mockResolvedValue(hike);
    mount('walk');
    expect(await screen.findByTestId('hike-questions-settings')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Before the seat' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect((screen.getByTestId('hike-registration-when_transport') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('hike-registration-optional'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(svc.updateEvent).toHaveBeenCalledTimes(1));
    expect(lastUpdate().hikeRegistration).toBe('optional');
  });

  it('a Clarity Night shows no settings and sends neither key', async () => {
    svc.getEventBySlug.mockResolvedValue(night);
    mount('night');
    await screen.findByRole('button', { name: 'Save Changes' });
    expect(screen.queryByTestId('hike-questions-settings')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(svc.updateEvent).toHaveBeenCalledTimes(1));
    expect(lastUpdate()).not.toHaveProperty('hikeRegistration');
  });
});
