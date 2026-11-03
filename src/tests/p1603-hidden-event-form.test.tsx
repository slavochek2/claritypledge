/**
 * P1603: the "Hidden event" checkbox on the create form and the Hidden mark.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateEvent } from '@/app/prototypes/events/components/CreateEvent';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import { EventRowCompact } from '@/app/components/shared/EventRowCompact';
import type { EventWithHost } from '@/app/types';
import { HiddenEventMark } from '@/app/prototypes/events/components/HiddenEventMark';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const createEvent = vi.fn();
vi.mock('@/app/data/events-service', () => ({ eventsService: { createEvent: (...a: unknown[]) => createEvent(...a) } }));
vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: { getOrganizationBySlug: vi.fn(), getMyMembership: vi.fn() },
}));
vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Host' },
    session: { user: { id: 'u1' } },
    isLoading: false,
    sessionChecked: true,
  }),
}));

function fillForm() {
  const tomorrow = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  fireEvent.change(document.getElementById('title') as HTMLInputElement, { target: { value: 'Friends test run' } });
  fireEvent.change(document.getElementById('date') as HTMLInputElement, { target: { value: tomorrow } });
  fireEvent.change(document.getElementById('location') as HTMLInputElement, { target: { value: 'Somewhere nice' } });
  fireEvent.change(document.getElementById('description') as HTMLTextAreaElement, { target: { value: 'A description that is long enough to pass.' } });
}

describe('CreateEvent — Hidden event checkbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEvent.mockResolvedValue({ slug: 'friends-test-run', id: 'e1' });
  });

  it('shows the label and the helper text, unticked by default', () => {
    render(<MemoryRouter><CreateEvent /></MemoryRouter>);
    expect(screen.getByLabelText(/Hidden event/)).toBeInTheDocument();
    expect(screen.getByText("Only people with the link can see it. It won't appear in event lists.")).toBeInTheDocument();
    expect(screen.getByTestId('hidden-event-checkbox')).toHaveAttribute('aria-checked', 'false');
  });

  it('submits isHidden: false when left alone (every existing behaviour stays public)', async () => {
    render(<MemoryRouter><CreateEvent /></MemoryRouter>);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /Publish Event/ }));
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    expect(createEvent.mock.calls[0][0]).toMatchObject({ isHidden: false });
  });

  it('submits isHidden: true once ticked', async () => {
    render(<MemoryRouter><CreateEvent /></MemoryRouter>);
    fillForm();
    fireEvent.click(screen.getByTestId('hidden-event-checkbox'));
    expect(screen.getByTestId('hidden-event-checkbox')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Publish Event/ }));
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    expect(createEvent.mock.calls[0][0]).toMatchObject({ isHidden: true });
  });
});

describe('HiddenEventMark', () => {
  it('reads "Hidden"', () => {
    render(<HiddenEventMark />);
    expect(screen.getByTestId('hidden-event-mark')).toHaveTextContent('Hidden');
  });
});

describe('the Hidden mark in the lists a hidden event can reach', () => {
  const base = {
    id: 'e1', slug: 'friends-aaaa', title: 'Friends', description: 'd', datetime: new Date(Date.now() + 86400000).toISOString(),
    durationMinutes: 90, timezone: 'UTC', location: 'Somewhere', hostId: 'someone-else', createdAt: '', status: 'upcoming',
    hostName: 'H', hostSlug: 'h', hostAvatarColor: '#000', hostHasPledged: false, attendees: [], attendeeCount: 0,
  } as unknown as EventWithHost;

  it('EventCard marks a hidden event, and a public event carries no mark (control)', () => {
    const { unmount } = render(<MemoryRouter><EventCard event={{ ...base, isHidden: true }} /></MemoryRouter>);
    expect(screen.getByTestId('hidden-event-mark')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter><EventCard event={base} /></MemoryRouter>);
    expect(screen.queryByTestId('hidden-event-mark')).not.toBeInTheDocument();
  });

  it('EventRowCompact marks a hidden event, and a public event carries no mark (control)', () => {
    const { unmount } = render(<MemoryRouter><EventRowCompact event={{ ...base, isHidden: true }} role="attending" /></MemoryRouter>);
    expect(screen.getByTestId('hidden-event-mark')).toBeInTheDocument();
    unmount();
    render(<MemoryRouter><EventRowCompact event={base} role="attending" /></MemoryRouter>);
    expect(screen.queryByTestId('hidden-event-mark')).not.toBeInTheDocument();
  });
});
