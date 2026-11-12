/**
 * P1529 review fixes, batch 2: the limit field's validation, the thank-you line's time zone, the repeat Register button and the
 * waiting list's Add button.
 */
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ waitlist: vi.fn(), add: vi.fn() }));
vi.mock('@/app/data/event-waitlist', () => ({
  getWaitlistPublic: (...a: unknown[]) => h.waitlist(...a),
  hostAddFromWaitlist: (...a: unknown[]) => h.add(...a),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/components/shared/PersonRow', () => ({
  PersonRow: ({ name, trailing }: { name: string; trailing?: React.ReactNode }) => <div data-testid="row">{name}{trailing}</div>,
}));

import { LIMIT_INVALID_LINE, limitError } from '@/app/prototypes/events/event-limit';
import { RsvpButton } from '@/app/prototypes/events/components/RsvpButton';
import { EventWaitlistList } from '@/app/prototypes/events/components/EventWaitlistList';

describe('the limit field validation', () => {
  it('only an empty field means no limit; 0, negatives, decimals and words are refused with the line', () => {
    expect(limitError('')).toBeNull();
    expect(limitError('   ')).toBeNull();
    expect(limitError('12')).toBeNull();
    for (const bad of ['0', '-2', '2.5', 'abc']) expect(limitError(bad)).toBe(LIMIT_INVALID_LINE);
    expect(LIMIT_INVALID_LINE).toBe('Enter a whole number of 1 or more, or leave it empty for no limit.');
  });
  it('both forms validate it before submit', () => {
    for (const f of ['EditEvent', 'CreateEvent']) {
      const src = readFileSync(`src/app/prototypes/events/components/${f}.tsx`, 'utf8');
      expect(src).toContain('limitError(maxAttendees)');
      expect(src).toContain('errors.maxAttendees');
    }
  });
});

describe('the thank-you line uses the event time zone', () => {
  it('EventPrepPage passes event.timezone to ownTimeLine', () => {
    const src = readFileSync('src/app/prototypes/events/prep/EventPrepPage.tsx', 'utf8');
    expect(src).toContain('ownTimeLine(event.datetime, state.arrival.atDoors, event.timezone, arrivalLeadMinutes(event))');
  });
});

describe('RsvpButton in the asking flow: the repeat matches the top button', () => {
  const base = { isPast: false, onRsvp: vi.fn(), asksBeforeSeat: true, placesLeft: 5, placesLimit: 8 };
  const classes = (id: string) => screen.getByTestId(id).className;

  it('same classes (from the Button variant, no hand-typed colours), same label, same loading text', () => {
    const { rerender } = render(<><RsvpButton {...base} trigger="card" isFull={false} loading={false} /><RsvpButton {...base} trigger="card_bottom" isFull={false} loading={false} /></>);
    expect(classes('rsvp-button-repeat')).toBe(classes('rsvp-button'));
    expect(classes('rsvp-button-repeat')).not.toContain('bg-blue-500'); // the variant's own bg-blue-600 is fine; the hand-typed 500 is not
    expect(screen.getByTestId('rsvp-button-repeat').textContent).toBe(screen.getByTestId('rsvp-button').textContent);
    rerender(<><RsvpButton {...base} trigger="card" isFull={false} loading /><RsvpButton {...base} trigger="card_bottom" isFull={false} loading /></>);
    expect(screen.getByTestId('rsvp-button-repeat').textContent).toBe('Registering...');
    expect(screen.getByTestId('rsvp-button').textContent).toBe('Registering...');
  });

  it('when full: "Join the waiting list" at the bottom too, and nothing once the person is on the list', () => {
    const { rerender } = render(<RsvpButton {...base} trigger="card_bottom" isFull loading={false} />);
    expect(screen.getByTestId('rsvp-button-repeat').textContent).toBe('Join the waiting list');
    rerender(<RsvpButton {...base} trigger="card_bottom" isFull loading={false} waitlist={{ onList: true, filled: false, leaving: false, onLeave: vi.fn() }} />);
    expect(screen.queryByTestId('rsvp-button-repeat')).toBeNull();
  });

  it('Clarity Night and Social Hike (no asking) keep their repeat button as it was', () => {
    render(<RsvpButton {...base} asksBeforeSeat={false} trigger="card_bottom" isFull={false} loading={false} />);
    expect(classes('rsvp-button-repeat')).toContain('bg-blue-500');
  });
});

describe('the waiting list Add button', () => {
  const entry = { profileId: 'p1', slug: 's', name: 'Eva F.', avatarColor: 'x', avatarUrl: null, hasPledged: false, position: 1 };
  beforeEach(() => { h.waitlist.mockReset(); h.add.mockReset(); });

  it('takes its colour from the variant and shows a spinner while adding', async () => {
    h.waitlist.mockResolvedValue([entry]);
    h.add.mockReturnValue(new Promise(() => {}));
    render(<EventWaitlistList eventId="e1" isHost />);
    const btn = await screen.findByTestId('event-waitlist-add');
    expect(btn.className).not.toMatch(/text-slate|hover:text-blue/);
    expect(screen.queryByTestId('event-waitlist-adding')).toBeNull();
    fireEvent.click(btn);
    expect(await screen.findByTestId('event-waitlist-adding')).toBeTruthy();
  });

  it('a poll that gives the same key does not read the list again; a changed key does', async () => {
    h.waitlist.mockResolvedValue([entry]);
    const { rerender } = render(<EventWaitlistList eventId="e1" isHost refreshKey="p1" />);
    await waitFor(() => expect(h.waitlist).toHaveBeenCalledTimes(1));
    rerender(<EventWaitlistList eventId="e1" isHost refreshKey="p1" />);
    rerender(<EventWaitlistList eventId="e1" isHost refreshKey={'p1'.slice()} />);
    await new Promise(r => setTimeout(r, 20));
    expect(h.waitlist).toHaveBeenCalledTimes(1);
    rerender(<EventWaitlistList eventId="e1" isHost refreshKey="p1,p2" />);
    await waitFor(() => expect(h.waitlist).toHaveBeenCalledTimes(2));
  });
});
