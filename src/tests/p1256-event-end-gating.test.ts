/**
 * @file p1256-event-end-gating.test.ts
 * @description P1256 — the event page has TWO end-of-event predicates, and binding a
 * control to the wrong one is the defect this pins.
 *
 *   isPast   = start + EVENT_GRACE_HOURS (12h)  — generous. RSVP, "Event Ended".
 *   hasEnded = start + durationMinutes          — actual. Host Edit / Cancel / Uncancel.
 *
 * WHY IT EXISTS. P1256 widened the grace window 5h -> 12h so a long hike stops closing
 * RSVP while the group is still walking. A first cut routed EVERY gate through the
 * widened flag. Hostile review caught what that does to the other end of the range: at
 * the shortest real duration on prod (90 min; the observed range is 90–480) it leaves the
 * host's Cancel button live for ten and a half hours after the event finishes — and
 * Cancel is not cosmetic, it mails every attendee a cancellation for an event they have
 * already attended.
 *
 * Nothing else covers this. The existing grace-period suite tests the LIST QUERY cutoffs
 * only, so both the widening and the mis-binding pass it clean.
 *
 * Source-text assertions, per the p1194/p1149 convention in this repo: EventDetail needs
 * a router, an auth context and a live events service to render, and the property under
 * test is which flag guards which block — which the source states directly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';

const DETAIL = readFileSync(
  join(process.cwd(), 'src/app/prototypes/events/components/EventDetail.tsx'),
  'utf-8',
);

describe('P1256 — the two predicates are defined, and defined differently', () => {
  it('isPast measures the widened grace window from the event START', () => {
    expect(DETAIL).toContain(
      'const isPast = Date.now() >= eventDate.getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000;',
    );
  });

  it('hasEnded measures the events ACTUAL end, from its duration', () => {
    expect(DETAIL).toContain('const hasEnded = Date.now() >= endDate.getTime();');
    // endDate is what the page displays and exports to calendar — the real end.
    expect(DETAIL).toContain(
      'const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);',
    );
  });

  it('they are not aliases — a future refactor collapsing them fails here', () => {
    expect(DETAIL).not.toContain('const hasEnded = isPast');
    expect(DETAIL).not.toContain('const isPast = hasEnded');
  });
});

describe('P1256 — host destructive controls bind to hasEnded, never to isPast', () => {
  /**
   * The exact regression: `isHost && !isPast`. If it reappears, a host can Edit,
   * Cancel or Uncancel an event that finished hours ago.
   */
  it('no host-gated block is guarded by isPast', () => {
    const offenders = DETAIL.split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /isHost\s*&&\s*!isPast/.test(line));
    expect(
      offenders,
      `host control(s) gated on the 12h window instead of the real end: ${offenders
        .map(([n, l]) => `L${n}: ${l.trim()}`)
        .join(' | ')}`,
    ).toEqual([]);
  });

  it('both host blocks are present and gated on hasEnded', () => {
    // Edit/Cancel panel, and the Uncancel affordance on a cancelled event.
    const matches = DETAIL.match(/isHost && !hasEnded/g) ?? [];
    expect(matches).toHaveLength(2);
  });
});

describe('P1256 — the widened window is the one the founder asked for', () => {
  it('is 12 hours, and long enough for a full-day hike', () => {
    expect(EVENT_GRACE_HOURS).toBe(12);
    // The 2026-09-06 hike: 09:00 start, 240min duration. It must still be open at
    // 20:00 local — the case that prompted P1256 (RSVP closed at 13:00, mid-walk).
    const start = new Date('2026-09-06T09:00:00Z').getTime();
    const closes = start + EVENT_GRACE_HOURS * 3600_000;
    expect(closes).toBeGreaterThan(new Date('2026-09-06T20:00:00Z').getTime());
  });

  it('but a 90-minute event still ENDS at 90 minutes, whatever the window says', () => {
    // The other end of the range. hasEnded must not inherit the 12h window.
    const start = new Date('2026-09-06T19:00:00Z').getTime();
    const ends = start + 90 * 60_000;
    const rsvpCloses = start + EVENT_GRACE_HOURS * 3600_000;
    expect(ends).toBeLessThan(rsvpCloses);
    // ~10.5h during which RSVP is open but the host must NOT be able to cancel.
    expect((rsvpCloses - ends) / 3600_000).toBeCloseTo(10.5, 1);
  });
});
