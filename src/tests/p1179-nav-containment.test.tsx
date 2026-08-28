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
import { EventLinksMenu, EventLinksButton } from '@/app/components/layout/event-links-menu';

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

  it('the assertion has teeth — the SAME component does render inside the room', async () => {
    render(<MemoryRouter initialEntries={['/events/cm-1/room']}><EventLinksMenu><EventLinksButton /></EventLinksMenu></MemoryRouter>);
    expect(await screen.findByTestId('event-links-button')).toBeInTheDocument();
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
    const mounts = NAV_SRC.match(/<EventLinksButton\s*\/>/g) ?? [];
    expect(mounts).toHaveLength(2);
  });

  it('the PROVIDER is mounted exactly ONCE — two instances meant two states and two fetches', () => {
    const providers = NAV_SRC.match(/<EventLinksMenu>/g) ?? [];
    expect(providers).toHaveLength(1);
  });

  it('the button is not hidden at a breakpoint — the one fix the invariant forbids', () => {
    const idx = NAV_SRC.indexOf('<EventLinksButton />');
    const around = NAV_SRC.slice(idx - 200, idx + 60);
    expect(around).not.toMatch(/hidden\s+(sm|md|lg):/);
  });
});
