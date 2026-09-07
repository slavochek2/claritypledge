/**
 * @file p1179-nav-containment.test.tsx
 * @description P1179 DW-1 / DW-2 — the blast radius of adding a sibling to the
 * nav's right-hand group is zero on the ~30 routes that also render it.
 *
 * DW-1 is written so it FAILS if the button leaks outside an event context —
 * that is the assertion the Done-When line asks for, not a render of the happy
 * path. DW-2 pins the centre slot's geometry, which this change must not touch:
 * /terms portals into it, and the slot is the placement this spec REJECTED.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import userEvent from '@testing-library/user-event';
import { EventLinksMenu, EventLinksButton } from '@/app/components/layout/event-links-menu';
import { buildLinksMenu, STANDARD_STAKE_TAGS, STANDARD_TOOL_ENTRIES } from '@/app/data/event-links';

vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventBySlug: vi.fn(async () => ({ links: [] })) },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const NAV_SRC = readFileSync(
  resolve(process.cwd(), 'src/app/components/layout/simple-navigation.tsx'),
  'utf8'
);

/** Routes outside /events/:slug/* that render the same right-hand group. */
const OUTSIDE = [
  '/', '/feed', '/live', '/transcribe', '/events', '/events/cm-1',
  '/pricing', '/terms', '/partners', '/stake/cmp7',
  '/events/cm-1/room/extra', '/eventsX/cm-1/room',
];

describe('P1179 DW-1 — the button does not leak outside the room', () => {
  it.each(OUTSIDE)('renders nothing on %s', (path) => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}><EventLinksMenu><EventLinksButton /></EventLinksMenu></MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('event-links-button')).toBeNull();
  });

  it.each(['/ready/extra', '/readyx', '/meet/extra', '/meetings'])(
    'the standalone widening is exact — %s still renders nothing',
    (path) => {
      const { container } = render(
        <MemoryRouter initialEntries={[path]}><EventLinksMenu><EventLinksButton /></EventLinksMenu></MemoryRouter>
      );
      expect(container).toBeEmptyDOMElement();
    }
  );

  it('the assertion has teeth — the SAME component does render inside the room', async () => {
    render(<MemoryRouter initialEntries={['/events/cm-1/room']}><EventLinksMenu><EventLinksButton /></EventLinksMenu></MemoryRouter>);
    expect(await screen.findByTestId('event-links-button')).toBeInTheDocument();
  });
});

describe('2026-09-07 — the standalone /ready and /meet carry the same menu', () => {
  it.each(['/ready', '/ready/', '/meet', '/meet/'])('renders the trigger on %s', async (path) => {
    render(
      <MemoryRouter initialEntries={[path]}><EventLinksMenu><EventLinksButton /></EventLinksMenu></MemoryRouter>
    );
    expect(await screen.findByTestId('event-links-button')).toBeInTheDocument();
  });

  it('off-event the menu carries the standard entries with NO event group and NO ?event=', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ready']}><EventLinksMenu><EventLinksButton /></EventLinksMenu></MemoryRouter>
    );
    await user.click(await screen.findByTestId('event-links-button'));
    const labels = (await screen.findAllByTestId('event-links-entry')).map(e => e.textContent);
    expect(labels).toEqual([...STANDARD_STAKE_TAGS, ...STANDARD_TOOL_ENTRIES.map(t => t.label)]);
    expect(screen.queryByText('This event')).toBeNull();
    // No event to carry, so the stake paths must be bare — a dangling `?event=`
    // would point the stake surface at an event that is not in play.
    expect(buildLinksMenu(null, null).every(e => !e.to.includes('?event='))).toBe(true);
  });
});

describe('P1179 DW-2 — the nav centre slot is untouched', () => {
  it('the slot still exists and is still ABSOLUTELY positioned', () => {
    expect(NAV_SRC).toContain('NAV_CENTER_SLOT_ID');
    const slot = NAV_SRC.slice(NAV_SRC.indexOf('id={NAV_CENTER_SLOT_ID}') - 600, NAV_SRC.indexOf('id={NAV_CENTER_SLOT_ID}') + 300);
    expect(slot).toMatch(/absolute/);
  });

  it('this change put NOTHING in the centre slot — placement B was chosen precisely because the slot fails at 320px', () => {
    const before = NAV_SRC.indexOf('id={NAV_CENTER_SLOT_ID}');
    const slotBlock = NAV_SRC.slice(before, before + 400);
    expect(slotBlock).not.toContain('EventLinksButton');
    expect(slotBlock).not.toContain('EventLinksMenu');
  });

  it('the TRIGGER is mounted in BOTH right-hand groups, so it holds one position at every width', () => {
    // The mounts are no longer identical: since 2026-08-31 the desktop group
    // passes variant="dropdown" (the sheet stays the phone shape). The invariant
    // being guarded is the PLACEMENT — one trigger per group — not the props, so
    // the pattern matches any prop list rather than a bare self-closing tag.
    //
    // The DESKTOP group is one slot rendered by one of three mutually exclusive
    // auth/compact branches (logged in / compact+logged out / logged out), so the
    // source carries one mount per branch that needs the button while only ever
    // rendering one of them. Counting source occurrences therefore cannot be
    // pinned to 2; what must hold is that the mobile group has exactly one and
    // every desktop mount is a dropdown — asserted below.
    const mounts = NAV_SRC.match(/<EventLinksButton\b[^>]*\/>/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(2);
  });

  it('exactly one mount is the phone sheet; every other mount is the desktop dropdown', () => {
    // A sheet on a monitor is the defect the founder reported; a top-anchored
    // dropdown on a phone puts the control out of thumb reach, which is the case
    // it was built for. So: one sheet (the single `lg:hidden` group) and nothing
    // but dropdowns in the desktop branches.
    const mounts = NAV_SRC.match(/<EventLinksButton\b[^>]*\/>/g) ?? [];
    const dropdowns = mounts.filter(m => m.includes('variant="dropdown"'));
    expect(mounts.length - dropdowns.length).toBe(1);
    expect(dropdowns.length).toBeGreaterThanOrEqual(1);
  });

  it('the PROVIDER is mounted exactly ONCE — two instances meant two states and two fetches', () => {
    const providers = NAV_SRC.match(/<EventLinksMenu>/g) ?? [];
    expect(providers).toHaveLength(1);
  });

  it('the button is not hidden at a breakpoint — the one fix the invariant forbids', () => {
    // Checked at BOTH mounts. Checking only the first would leave the other free
    // to acquire a breakpoint hide — and the invariant is that the control is in
    // the same place on every phone in the room, which one mount cannot carry.
    for (const m of NAV_SRC.match(/<EventLinksButton\b[^>]*\/>/g) ?? []) {
      const idx = NAV_SRC.indexOf(m);
      const around = NAV_SRC.slice(idx - 200, idx + m.length);
      expect(around, `breakpoint hide around ${m}`).not.toMatch(/hidden\s+(sm|md|lg):/);
    }
  });
});
