// @vitest-environment jsdom
/**
 * P1675 UAT round 1 R6: the RENDERED Edit event form. A hike shows the "Questions before the seat" settings and unticking
 * "Ask how they're coming" sends hikeAsksTransport:false to updateEvent; a Clarity Night shows none and sends neither key.
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
  hikeAsksTransport: true, hikeAsksHelp: true,
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

describe('P1675 R6: Edit event hike question settings', () => {
  it('a hike shows the settings, and unticking "how they are coming" sends hikeAsksTransport:false (help stays true)', async () => {
    svc.getEventBySlug.mockResolvedValue(hike);
    mount('walk');
    expect(await screen.findByTestId('hike-questions-settings')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Questions before the seat' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hike-asks-transport'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(svc.updateEvent).toHaveBeenCalledTimes(1));
    expect(lastUpdate().hikeAsksTransport).toBe(false);
    expect(lastUpdate().hikeAsksHelp).toBe(true);
  });

  it('a Clarity Night shows no settings and sends neither key', async () => {
    svc.getEventBySlug.mockResolvedValue(night);
    mount('night');
    await screen.findByRole('button', { name: 'Save Changes' });
    expect(screen.queryByTestId('hike-questions-settings')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(svc.updateEvent).toHaveBeenCalledTimes(1));
    expect(lastUpdate()).not.toHaveProperty('hikeAsksTransport');
    expect(lastUpdate()).not.toHaveProperty('hikeAsksHelp');
  });
});
