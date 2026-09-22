/**
 * @file p1179-nav-containment.test.tsx
 * @description P1179 DW-2 + P1323 R2 — where the Links trigger may and may not appear.
 *
 * DW-1 IS INVERTED BY P1323, DELIBERATELY. It used to read "the button does not leak
 * outside the room" and asserted an empty DOM on /feed, /stake/cmp7, /transcribe and the
 * marketing pages alike. That containment was the DEFECT, not the guarantee: the menu
 * indexes destinations that are entirely event-independent, so a room-shaped mount rule
 * meant a /stake/understanding link shared without ?event= opened with no menu at all.
 * Founder, 2026-09-16: "yes in /stake we will have LINKS!" and "yes LINKS menu will be in
 * other points too". P1179 Invariant 3's scoping clause is superseded on that sign-off.
 *
 * WHAT REPLACES IT, and why this file still has teeth. The rule is no longer a path
 * predicate at all — `ClarityLandingLayout` takes a required `surface: 'product' | 'public'`
 * prop and the provider mounts only for `product`. So the assertions below are written in
 * BOTH directions against that prop: a product surface renders the trigger, a public one
 * renders nothing. A test that only checked the positive would pass if `enabled` were
 * ignored entirely.
 *
 * DW-2 is UNCHANGED and still pins the centre slot's geometry: /terms portals into it, and
 * the slot is the placement P1179 rejected.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import userEvent from '@testing-library/user-event';
import { EventLinksMenu, EventLinksButton } from '@/app/components/layout/event-links-menu';
import { useContext } from 'react';
import { useLinksTriggerOverride, EventLinksContext } from '@/app/components/layout/event-links-context';

/** Test-only: subscribe to the MAIN menu context, as the control for the render-count test. */
function useLinksMenuOpenProbe() { return useContext(EventLinksContext)?.open; }
import { buildLinksMenu, STANDARD_STAKE_TAGS, STANDARD_TOOL_ENTRIES, STANDARD_LETTER_ENTRIES } from '@/app/data/event-links';

vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventBySlug: vi.fn(async () => ({ links: [] })) },
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const NAV_SRC = readFileSync(
  resolve(process.cwd(), 'src/app/components/layout/simple-navigation.tsx'),
  'utf8'
);

/**
 * Routes that were the OLD DW-1 "outside the room" list and are now PRODUCT surfaces —
 * i.e. the exact set whose emptiness P1179 asserted and P1323 reverses. Keeping the same
 * paths is deliberate: it makes the inversion visible in the diff rather than hiding it
 * behind a fresh list.
 */
const PRODUCT_PATHS = ['/feed', '/live', '/transcribe', '/stake/cmp7', '/events/cm-1/room', '/ready', '/meet'];

/** Routes that must still render NOTHING — reading ABOUT the thing. */
const PUBLIC_PATHS = ['/', '/pricing', '/about', '/manifesto', '/coach', '/hiring'];

describe('P1323 R2 — the trigger follows the SURFACE, not the route shape', () => {
  it.each(PRODUCT_PATHS)('renders on a product surface: %s', async (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <EventLinksMenu enabled><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    expect(await screen.findByTestId('event-links-button')).toBeInTheDocument();
  });

  it.each(PUBLIC_PATHS)('renders NOTHING on a public surface: %s', (path) => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <EventLinksMenu enabled={false}><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('event-links-button')).toBeNull();
  });

  /**
   * The assertion above is the one that can rot silently: it passes if `enabled` is
   * ignored and the component simply never renders. This is its control — the SAME path
   * with `enabled` flipped must produce the opposite result. Without it, "renders nothing
   * on /pricing" is satisfied by a component that renders nothing anywhere.
   */
  it.each(PUBLIC_PATHS)('...and the emptiness is caused by the surface, not by the path: %s', async (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <EventLinksMenu enabled><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    expect(await screen.findByTestId('event-links-button')).toBeInTheDocument();
  });
});

describe('P1323 R2 — a page with its own chrome adopts or declines the single trigger', () => {
  it('DECLINE removes the trigger even on a product surface', () => {
    function Decliner() { useLinksTriggerOverride('decline'); return null; }
    const { container } = render(
      <MemoryRouter initialEntries={['/live/ABCD']}>
        <EventLinksMenu enabled><Decliner /><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    expect(container.querySelector('[data-testid="event-links-button"]')).toBeNull();
  });

  it('ADOPT moves the trigger to the page — exactly ONE node, never two', async () => {
    function Adopter() { useLinksTriggerOverride('adopt'); return <EventLinksButton owner="page" />; }
    render(
      <MemoryRouter initialEntries={['/transcribe/ABCD']}>
        <EventLinksMenu enabled>
          <EventLinksButton />
          <Adopter />
        </EventLinksMenu>
      </MemoryRouter>
    );
    // Two mounted instances, one rendered node. Two identical data-testids is the
    // strict-mode locator violation that broke e2e/p1179-links-menu.spec.ts in 2026-08-28.
    expect(await screen.findAllByTestId('event-links-button')).toHaveLength(1);
  });

  it('with NO declaration the nav keeps it and the page instance stays silent', async () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <EventLinksMenu enabled>
          <EventLinksButton />
          <EventLinksButton owner="page" />
        </EventLinksMenu>
      </MemoryRouter>
    );
    expect(await screen.findAllByTestId('event-links-button')).toHaveLength(1);
  });
});

describe('2026-09-07 / P1323 — off-event the menu carries the standard entries, bare', () => {
  it('the Points tab is the standard tags and there is NO "This event" group anywhere', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ready']}>
        <EventLinksMenu enabled><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    await user.click(await screen.findByTestId('event-links-button'));
    // P1351: Tools is the default tab; select Points. Only its rows are in the DOM.
    await user.click(screen.getByTestId('event-links-tab-points'));
    const labels = (await screen.findAllByTestId('event-links-entry')).map(e => e.textContent);
    expect(labels).toEqual([...STANDARD_STAKE_TAGS]);
    // P1323 R5: the group is retired, so the heading must be gone on EVERY tab, not just
    // absent from the one that happens to be open.
    expect(screen.queryByText('This event')).toBeNull();
  });

  it('no event to carry, so no stake path carries a dangling ?event=', () => {
    // A dangling ?event= would point the stake surface at an event that is not in play.
    expect(buildLinksMenu(null).every(e => !e.to.includes('?event='))).toBe(true);
    // Control: WITH an event, the points entries DO carry it — otherwise this assertion
    // would pass on a build that had dropped event attribution altogether (which is what
    // wrongly removing eventSlugFromLocation with R5 would have done).
    const withEvent = buildLinksMenu('cm-1').filter(e => e.group === 'points');
    expect(withEvent.length).toBeGreaterThan(0);
    expect(withEvent.every(e => e.to.includes('?event=cm-1'))).toBe(true);
  });

  it('the three groups are exactly the three tabs, and every entry belongs to one', () => {
    const entries = buildLinksMenu(null);
    expect(entries.filter(e => e.group === 'points')).toHaveLength(STANDARD_STAKE_TAGS.length);
    expect(entries.filter(e => e.group === 'letters')).toHaveLength(STANDARD_LETTER_ENTRIES.length);
    expect(entries.filter(e => e.group === 'tools')).toHaveLength(STANDARD_TOOL_ENTRIES.length);
    expect(entries).toHaveLength(
      STANDARD_STAKE_TAGS.length + STANDARD_LETTER_ENTRIES.length + STANDARD_TOOL_ENTRIES.length
    );
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

  it('the nav mounts NO provider — P1323 moved it up to the layout', () => {
    // Two instances meant two open states and two event fetches (P1179). P1323 keeps that
    // "exactly one" property but moves the single provider to ClarityLandingLayoutInner, so
    // the page's own children sit inside it too and a bespoke-header page can adopt the
    // trigger without a portal. The nav must therefore mount NONE.
    expect(NAV_SRC.match(/<EventLinksMenu\b/g) ?? []).toHaveLength(0);

    const LAYOUT_SRC = readFileSync(
      resolve(process.cwd(), 'src/app/layouts/clarity-landing-layout.tsx'),
      'utf8'
    );
    expect(LAYOUT_SRC.match(/<EventLinksMenu\b/g) ?? []).toHaveLength(1);
    // And it is gated on the surface prop (plus, P1351, signed-in on any surface), not on a path.
    expect(LAYOUT_SRC).toMatch(/<EventLinksMenu enabled=\{surface === 'product' \|\| showUserMenu\}>/);
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

describe('P1323 — declaring adopt/decline does not re-render the page on every menu toggle', () => {
  /**
   * Adversarial review (Opus): the override setter used to live on the main menu context, whose
   * value changes on every open/close — so TranscribeRoomPage and ClarityLivePage (which call the
   * hook only to DECLARE) re-rendered on each tap. The setter now has its own stable context.
   * Control: a component that reads the MAIN context does re-render, so a zero delta below is not
   * a counter that never moves.
   */
  it('an override-only consumer renders the same number of times across open + close', async () => {
    const user = userEvent.setup();
    const renders = { declarer: 0, reader: 0 };
    function Declarer() { renders.declarer++; useLinksTriggerOverride(null); return null; }
    function MainContextReader() { renders.reader++; useLinksMenuOpenProbe(); return null; }
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <EventLinksMenu enabled>
          <Declarer />
          <MainContextReader />
          <EventLinksButton />
        </EventLinksMenu>
      </MemoryRouter>
    );
    const declarerBefore = renders.declarer;
    const readerBefore = renders.reader;
    await user.click(await screen.findByTestId('event-links-button'));
    expect(await screen.findByTestId('event-links-menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(renders.declarer - declarerBefore, 'override-only consumer re-rendered on a menu toggle').toBe(0);
    expect(renders.reader - readerBefore, 'control: a main-context consumer DOES re-render').toBeGreaterThan(0);
  });
});
