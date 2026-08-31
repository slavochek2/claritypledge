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

/**
 * The auto-hide probe (2026-08-31). A configured event link is only rendered
 * once the stake surface confirms it has something behind it, so every test
 * touching extras has to say what that surface returns.
 *
 * `tagContent` maps tag -> how many rows the feed hands back. A tag absent from
 * the map is EMPTY, which is the case the founder reported: "Tonight" was
 * configured on the event and opened nothing.
 */
const tagContent = vi.hoisted(() => ({ current: {} as Record<string, number> }));
const probeThrows = vi.hoisted(() => ({ current: false }));
const rows = (tag: string) => {
  if (probeThrows.current) throw new Error('probe failed');
  return Array.from({ length: tagContent.current[tag] ?? 0 }, (_, i) => ({ id: `${tag}-${i}` }));
};

vi.mock('@/app/data/points-service', () => ({
  pointsService: { getPublicPointsFeed: vi.fn(async (_l: number, _o: number, tag: string) => rows(tag)) },
}));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getPublicStoriesFeed: vi.fn(async () => []) },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const APPROVED = ['cmp7', 'cmp3', 'cmp10', 'Transcribe', 'Start a Clarity Session'];
const UNAPPROVED = ['Seven dimensions', 'The triad', 'All ten'];

function renderAt(path: string, variant?: 'sheet' | 'dropdown') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EventLinksMenu><EventLinksButton variant={variant} /></EventLinksMenu>
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
  beforeEach(() => { tagContent.current = { tonight: 3 }; probeThrows.current = false; });

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


/**
 * AUTO-HIDE (2026-08-31, founder). "I don't think we need to include the link to
 * tonight or whatever if ... we don't have points with tags that ... need to
 * appear in a given event." He had opened the menu during an event, tapped
 * "Tonight", and landed on an empty surface — the tag was configured, nothing
 * had been staked under it yet.
 */
describe('P1179 — a configured event link with nothing behind it is not shown', () => {
  beforeEach(() => { probeThrows.current = false; });

  it('drops the entry when the tag has no points and no stories', async () => {
    eventRow.current = { links: [{ tag: 'tonight', label: 'Tonight' }] };
    tagContent.current = {};
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual(APPROVED);
    // The heading goes with it — an empty "This event" group is its own dead end.
    expect(screen.queryByText('This event')).toBeNull();
  });

  it('keeps the entry when the tag HAS content — the control, so the test above has teeth', async () => {
    eventRow.current = { links: [{ tag: 'tonight', label: 'Tonight' }] };
    tagContent.current = { tonight: 1 };
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual([...APPROVED, 'Tonight']);
  });

  it('hides only the empty one when several are configured', async () => {
    eventRow.current = { links: [{ tag: 'tonight', label: 'Tonight' }, { tag: 'empty', label: 'Empty' }] };
    tagContent.current = { tonight: 2 };
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual([...APPROVED, 'Tonight']);
  });

  it('NEVER hides the three standard stake entries, however empty they are', async () => {
    // Scoped deliberately: a room where nobody has staked yet must not render a
    // menu containing only Transcribe and Start a Clarity Session, which reads
    // as broken rather than as empty.
    eventRow.current = { links: [] };
    tagContent.current = {};
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual(APPROVED);
  });

  it('keeps the entry when the PROBE ITSELF fails — an outage must not empty the menu', async () => {
    // Fail-open. A failed probe is not evidence the tag is empty, and silently
    // deleting the host's link mid-event is indistinguishable to the attendee
    // from the host never having configured it.
    eventRow.current = { links: [{ tag: 'tonight', label: 'Tonight' }] };
    tagContent.current = {};
    probeThrows.current = true;
    renderAt('/events/cm-1/room');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual([...APPROVED, 'Tonight']);
  });
});


/**
 * THE DESKTOP SHAPE (2026-08-31). Founder, on a monitor: "it's really weird on
 * desktop it just like slides up ... it should be like we have the use cases you
 * know at the top and then I click". Below `lg` nothing changes — the bottom
 * sheet is the phone-in-a-room shape and every test above still exercises it.
 */
describe('P1179 — the desktop variant opens an anchored dropdown, not the sheet', () => {
  beforeEach(() => { tagContent.current = {}; probeThrows.current = false; eventRow.current = { links: [] }; });

  it('lists the same entries as the sheet', async () => {
    renderAt('/events/cm-1/room', 'dropdown');
    const entries = await openSheet();
    expect(entries.map(e => e.textContent)).toEqual(APPROVED);
  });

  it('does NOT mount the bottom sheet — a drawer overlay would swallow its clicks', async () => {
    // The two shapes deliberately hold SEPARATE open state. Sharing it mounted
    // the sheet underneath the dropdown, and the overlay took the pointer events
    // the dropdown was waiting for.
    renderAt('/events/cm-1/room', 'dropdown');
    await openSheet();
    expect(screen.getByTestId('event-links-menu')).toHaveAttribute('data-shape', 'dropdown');
  });

  it('the sheet variant still opens the sheet — so the assertion above has teeth', async () => {
    renderAt('/events/cm-1/room', 'sheet');
    await openSheet();
    expect(screen.getByTestId('event-links-menu')).toHaveAttribute('data-shape', 'sheet');
  });
});
