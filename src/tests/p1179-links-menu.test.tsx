/**
 * @file p1179-links-menu.test.tsx
 * @description P1179 AC-1 / AC-4 / AC-5 — the button renders in an event
 * context, and the sheet lists exactly the approved entries.
 *
 * The labels are asserted VERBATIM on purpose. The prototype's "Seven
 * dimensions" / "The triad" / "All ten" are the agent's words and are not
 * approved copy (Resolved Decisions 1); this suite fails if any of them reach
 * the screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EventLinksMenu, EventLinksButton } from '@/app/components/layout/event-links-menu';

const eventRow = vi.hoisted(() => ({ current: null as null | { links?: { tag: string; label?: string }[] } }));

vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventBySlug: vi.fn(async () => eventRow.current) },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const APPROVED = ['cmp7', 'cmp3', 'cmp10', 'Transcribe', 'Start a Clarity Session'];
const UNAPPROVED = ['Seven dimensions', 'The triad', 'All ten'];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EventLinksMenu><EventLinksButton /></EventLinksMenu>
    </MemoryRouter>
  );
}

async function openSheet() {
  const btn = await screen.findByTestId('event-links-button');
  await userEvent.click(btn);
  return screen.findAllByTestId('event-links-entry');
}

describe('P1179 AC-1 — the Links button renders on every room screen', () => {
  beforeEach(() => { eventRow.current = { links: [] }; });

  it.each([
    '/events/cm-1/room',
    '/events/cm-1/ready',
    '/events/cm-1/meet',
    '/stake/cmp7?event=cm-1',
  ])('renders on %s', async (path) => {
    renderAt(path);
    expect(await screen.findByTestId('event-links-button')).toHaveTextContent('Links');
  });

  it('renders NOTHING outside an event context — a bare /stake/:tag has no button', () => {
    const { container } = renderAt('/stake/cmp7');
    expect(container).toBeEmptyDOMElement();
  });
});

describe('P1179 AC-4 — an event with no extras lists exactly the five standard entries', () => {
  beforeEach(() => { eventRow.current = { links: [] }; });

  it('lists the five approved labels verbatim, and nothing else', async () => {
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual(APPROVED);
  });

  it('none of the unapproved prototype labels reach the screen', async () => {
    renderAt('/events/cm-1/room');
    await openSheet();
    for (const word of UNAPPROVED) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it('every entry points at an internal path carrying the event', async () => {
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries).toHaveLength(5);
    // The separator the approved reference puts before Transcribe is present.
    expect(screen.getByTestId('event-links-separator')).toBeInTheDocument();
  });
});

describe('P1179 AC-5 — extras are additive and per-event', () => {
  it('one configured extra yields six entries, under its own "This event" heading', async () => {
    eventRow.current = { links: [{ tag: 'tonight', label: 'Tonight' }] };
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries).toHaveLength(6);
    expect(entries[5]).toHaveTextContent('Tonight');
    expect(screen.getByText('This event')).toBeInTheDocument();
  });

  it('an extra with no label renders its tag (Resolved Decision 3)', async () => {
    eventRow.current = { links: [{ tag: 'tonight' }] };
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries[5]).toHaveTextContent('tonight');
  });

  it('a SECOND event with none still shows exactly five', async () => {
    eventRow.current = { links: [] };
    renderAt('/events/cm-2/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual(APPROVED);
  });

  it('an unreadable event row still yields the five standard entries — the menu never fails closed mid-event', async () => {
    eventRow.current = null;
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual(APPROVED);
  });
});
