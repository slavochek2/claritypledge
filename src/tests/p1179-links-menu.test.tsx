/**
 * @file p1179-links-menu.test.tsx
 * @description P1179 AC-1/AC-4 as REWRITTEN by P1323 — the trigger renders on any product
 * surface, and the panel lists exactly the approved entries under three tabs.
 *
 * Labels are asserted VERBATIM on purpose, and that is the one thing P1323 does not change.
 * The prototype's "Seven dimensions" / "The triad" / "All ten" are agent words and are not
 * approved copy (P1179 Resolved Decisions 1); this suite fails if any of them reach the
 * screen. P1323 adds nine letter labels to the same discipline — they ARE founder-approved
 * (2026-09-16), and the prototype's longer draft of `st5` is explicitly not.
 *
 * WHAT WAS DELETED HERE AND WHY — do not restore it without reading P1323 R5.
 * Three describe blocks are gone: "extras are additive and per-event", "a configured event
 * link with nothing behind it is not shown" (the auto-hide probe), and the AC-1 case
 * "renders NOTHING outside an event context — a bare /stake/:tag has no button".
 *
 * They tested the per-event "This event" group, which is RETIRED. The group carried a TAG —
 * the same thing a Points entry carries — and no UI to populate `events.links` ever existed,
 * so 0 of 14 prod events had one. With no extras there is no auto-hide probe to test, and
 * the bare-/stake/ assertion is inverted by the founder's explicit sign-off ("yes in /stake
 * we will have LINKS!"). The events-service, points-service and stories-service mocks went
 * with them: the menu now performs NO network call to render at all.
 *
 * The per-event capability is restorable (column and type kept, not migrated). If it comes
 * back, so do those blocks.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EventLinksMenu, EventLinksButton } from '@/app/components/layout/event-links-menu';
import {
  STANDARD_STAKE_TAGS,
  STANDARD_LETTER_ENTRIES,
  STANDARD_TOOL_ENTRIES,
  buildLinksMenu,
} from '@/app/data/event-links';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

/** Founder-approved, in order. The Points tab. */
const POINTS = [...STANDARD_STAKE_TAGS];
/** Founder-approved 2026-09-16. `st5` is the SHORTENED form; the long draft is unapproved. */
const LETTERS = STANDARD_LETTER_ENTRIES.map(l => l.label);
const TOOLS = STANDARD_TOOL_ENTRIES.map(t => t.label);

const UNAPPROVED = [
  'Seven dimensions',
  'The triad',
  'All ten',
  // P1323: the prototype's st5 draft, 38 chars, cut on both phone widths.
  'You cannot grade your own understanding',
];

function renderAt(path: string, variant?: 'sheet' | 'dropdown') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EventLinksMenu enabled><EventLinksButton variant={variant} /></EventLinksMenu>
    </MemoryRouter>
  );
}

async function open() {
  await userEvent.click(await screen.findByTestId('event-links-button'));
}

/** P1351: Tools is the default tab now; most tests below start from Points. */
async function openAtPoints() {
  await open();
  await selectTab('points');
}

/** Row text for whichever tab is currently selected. */
function visibleEntries() {
  return screen.getAllByTestId('event-links-entry').map(e => e.textContent ?? '');
}

async function selectTab(tab: 'points' | 'letters' | 'tools') {
  await userEvent.click(screen.getByTestId(`event-links-tab-${tab}`));
}

describe('P1323 AC-1 — the trigger renders on any product surface, event or not', () => {
  it.each([
    '/events/cm-1/room',
    '/events/cm-1/ready',
    '/events/cm-1/meet',
    '/stake/cmp7?event=cm-1',
    // The reversal. P1179 asserted this rendered NOTHING; decisions.md 2026-08-28 recorded
    // it as a property. Superseded on the founder's sign-off, 2026-09-16.
    '/stake/understanding',
    '/feed',
    '/transcribe',
  ])('renders on %s', async (path) => {
    renderAt(path);
    expect(await screen.findByTestId('event-links-button')).toHaveTextContent('Tools');
  });

  it('a bare /stake/:tag opens the SAME panel as inside a room (AC-1)', async () => {
    renderAt('/stake/understanding');
    await openAtPoints();
    expect(visibleEntries()).toEqual(POINTS);
    await selectTab('letters');
    expect(visibleEntries()).toEqual(LETTERS.map((l, i) => `${l} ${STANDARD_LETTER_ENTRIES[i]!.code}`));
  });
});

describe('P1351 — Tools is first and open by default', () => {
  it.each(['sheet', 'dropdown'] as const)('%s opens on Tools, tabs ordered Tools / Points / Letters', async (variant) => {
    renderAt('/events/cm-1/room', variant);
    await open();
    expect(visibleEntries()).toEqual(TOOLS);
    const order = Array.from(screen.getByTestId('event-links-tabs').querySelectorAll('[data-testid^="event-links-tab-"]'))
      .map(el => el.getAttribute('data-testid'));
    expect(order).toEqual(['event-links-tab-tools', 'event-links-tab-points', 'event-links-tab-letters']);
  });

  it('Tools: Ready, meeting principles, Transcribe, Slides, the CM calendar, then the featured session last', () => {
    const tools = buildLinksMenu().filter(e => e.group === 'tools');
    expect(tools.map(e => [e.label, e.to])).toEqual([
      ['Ready', '/ready'],
      ['Clarity meeting principle', '/meet'],
      ['Transcribe', '/transcribe'],
      ['Slides', '/presi'],
      ['Chiang Mai event calendar', '/cm'],
      ['Start a Clarity Session', '/live'],
    ]);
    expect(tools.filter(e => e.featured).map(e => e.label)).toEqual(['Start a Clarity Session']);
    expect(tools.find(e => e.to === '/cm')?.newTab).toBe(true);
  });
});

describe('P1323 AC-3/AC-4/AC-5 — three tabs, exact contents', () => {
  it('the panel body is a segmented control labelled Points / Letters / Tools', async () => {
    renderAt('/events/cm-1/room');
    await open();
    expect(screen.getByTestId('event-links-tabs')).toBeInTheDocument();
    for (const t of ['points', 'letters', 'tools'] as const) {
      expect(screen.getByTestId(`event-links-tab-${t}`)).toBeInTheDocument();
    }
  });

  it('AC-4: the Points tab is exactly the six standing collections, including aisafety1', async () => {
    renderAt('/events/cm-1/room');
    await openAtPoints();
    expect(visibleEntries()).toEqual(POINTS);
    expect(POINTS).toContain('aisafety1');
    // Labels are the tags VERBATIM — P1179 Resolved Decision 1 survives P1323: the spoken
    // word and the rendered label are the same token, `aisafety1` included (founder,
    // 2026-09-16: "leave it as aisafety1").
    expect(visibleEntries()).toEqual([...STANDARD_STAKE_TAGS]);
  });

  it('AC-5: the Letters tab is ten entries (CK, then st1–st9), each with its code as a quiet suffix', async () => {
    renderAt('/events/cm-1/room');
    await open();
    await selectTab('letters');
    const rows = visibleEntries();
    expect(rows).toHaveLength(10); // P1351: CK first, then st1–st9
    for (const [i, l] of STANDARD_LETTER_ENTRIES.entries()) {
      // A real space before the code, so assistive tech does not read "...understandingst6".
      expect(rows[i]).toBe(`${l.label} ${l.code}`);
    }
  });

  it('the Tools tab is unchanged from P1310', async () => {
    renderAt('/events/cm-1/room');
    await open();
    await selectTab('tools');
    expect(visibleEntries()).toEqual(TOOLS);
  });

  it('no unapproved label reaches the screen, on ANY tab', async () => {
    renderAt('/events/cm-1/room');
    await open();
    for (const tab of ['points', 'letters', 'tools'] as const) {
      await selectTab(tab);
      for (const word of UNAPPROVED) {
        expect(screen.queryByText(word), `${word} on ${tab}`).toBeNull();
      }
    }
  });

  it('AC-6 (inverted): an event CONFIGURED with an extra renders no "This event" group', async () => {
    // The group is retired. This is asserted against a configured event on purpose — the
    // old behaviour was driven by `events.links`, so a test that only used an UNconfigured
    // event would pass merely because prod data is empty, which is what made the original
    // defect invisible for 14 events.
    renderAt('/events/cm-1/room');
    await open();
    expect(screen.queryByText('This event')).toBeNull();
    expect(screen.queryByTestId('event-links-separator')).toBeNull();
  });
});

describe('P1323 — the tabs partition the entries; nothing is in two places', () => {
  it('each tab shows only its own group, and together they are the whole list', async () => {
    renderAt('/events/cm-1/room');
    await open();

    const seen: string[] = [];
    for (const tab of ['points', 'letters', 'tools'] as const) {
      await selectTab(tab);
      seen.push(...visibleEntries());
    }
    expect(seen).toHaveLength(POINTS.length + LETTERS.length + TOOLS.length);
    // No duplicates across tabs.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('switching tabs REPLACES the rows rather than appending them', async () => {
    // The panel is one body with three states, not a stack. If TabsContent ever rendered
    // all three at once the counts above would still pass while the sheet grew to 18 rows
    // at 320px — the exact overflow P1310 capped this sheet for.
    renderAt('/events/cm-1/room');
    await openAtPoints();
    expect(visibleEntries()).toHaveLength(POINTS.length);
    await selectTab('letters');
    expect(visibleEntries()).toHaveLength(LETTERS.length);
  });
});

/**
 * THE DESKTOP SHAPE (2026-08-31). Founder, on a monitor: "it's really weird on desktop it
 * just like slides up ... it should be like we have the use cases you know at the top and
 * then I click". Below `lg` nothing changes — the bottom sheet is the phone-in-a-room shape
 * and every test above exercises it. P1323 keeps the chrome split and makes the BODY
 * identical across it.
 */
describe('P1179 — the desktop variant opens an anchored dropdown, not the sheet', () => {
  it('lists the same entries as the sheet, tab for tab', async () => {
    renderAt('/events/cm-1/room', 'dropdown');
    await openAtPoints();
    expect(visibleEntries()).toEqual(POINTS);
    await selectTab('tools');
    expect(visibleEntries()).toEqual(TOOLS);
  });

  it('does NOT mount the bottom sheet — a drawer overlay would swallow its clicks', async () => {
    // The two shapes deliberately hold SEPARATE open state. Sharing it mounted the sheet
    // underneath the dropdown, and the overlay took the pointer events the dropdown wanted.
    renderAt('/events/cm-1/room', 'dropdown');
    await open();
    expect(screen.getByTestId('event-links-menu')).toHaveAttribute('data-shape', 'dropdown');
  });

  it('the sheet variant still opens the sheet — so the assertion above has teeth', async () => {
    renderAt('/events/cm-1/room', 'sheet');
    await open();
    expect(screen.getByTestId('event-links-menu')).toHaveAttribute('data-shape', 'sheet');
  });
});
