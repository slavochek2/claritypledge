// @vitest-environment jsdom
/**
 * P1675 sections 3b and 6, the host's side: each registrant's hike answers as one plain-text line, the data readers, the 30 s
 * count poll (stops on unmount) and the host groups gate for a hike whose preparation_enabled is false. EventDetail is pinned by
 * source shape, as p1403 and p1194 do for that page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ counts: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/app/data/event-room-counts', () => ({ getEventRoomCounts: (...a: unknown[]) => h.counts(...a) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a), from: (...a: unknown[]) => h.from(...a) } }));

import { hikeHostLine } from '@/app/prototypes/events/components/hike-host-line';
import { useEventRoomCounts } from '@/app/prototypes/events/components/use-event-room-counts';
import { getHikeAnswersForHost, type HikeAnswerRow } from '@/app/data/hike-answers-host';

const base: HikeAnswerRow = { profileId: 'p1', when: 'later', transport: 'car', freeSeats: 2, help: 'sweep', helpOther: null };

describe('hikeHostLine R6', () => {
  it('a transport answer not stored reads as a dash', () => {
    expect(hikeHostLine({ ...base, transport: null, freeSeats: null, help: 'sweep' })).toBe('Later · — · Sweep');
  });
  it('help null is "Participant" when the row says help was asked and a dash when it was not', () => {
    expect(hikeHostLine({ ...base, help: null })).toBe('Later · Car, 2 free seats · Participant');
    expect(hikeHostLine({ ...base, help: null, askedHelp: true })).toBe('Later · Car, 2 free seats · Participant');
    expect(hikeHostLine({ ...base, help: null, askedHelp: false })).toBe('Later · Car, 2 free seats · —');
  });
});

describe('hikeHostLine', () => {
  it('formats each transport and help combination', () => {
    expect(hikeHostLine(base)).toBe('Later · Car, 2 free seats · Sweep');
    expect(hikeHostLine({ ...base, freeSeats: 1, transport: 'motorbike', help: 'lead' })).toBe('Later · Motorbike, 1 free seat · Lead');
    expect(hikeHostLine({ ...base, when: 'now', transport: 'bike_or_foot', freeSeats: null, help: 'welcomer' })).toBe('Now · Bicycle or on foot · Welcomer');
    expect(hikeHostLine({ ...base, when: 'now', transport: 'need_ride', freeSeats: null, help: 'transport_lead' })).toBe('Now · Needs a ride · Transport lead');
    expect(hikeHostLine({ ...base, transport: 'need_ride', freeSeats: null, help: null })).toBe('Later · Needs a ride · Participant'); // UAT round 1 R6: "Just attend" on an event that asks help
    expect(hikeHostLine({ ...base, freeSeats: 0, help: null })).toBe('Later · Car, 0 free seats · Participant'); // UAT round 1 R6
    expect(hikeHostLine({ ...base, when: 'now', transport: 'need_ride', freeSeats: null, help: 'other', helpOther: 'dog food' })).toBe('Now · Needs a ride · Other: dog food');
  });

  it('renders the Other text as a text node, never as HTML', () => {
    const evil = '<img src=x onerror=alert(1)><b>bold</b>';
    render(<p data-testid="line">{hikeHostLine({ ...base, help: 'other', helpOther: evil })}</p>);
    const el = screen.getByTestId('line');
    expect(el.querySelector('img, b')).toBeNull();
    expect(el.textContent).toContain(evil);
  });
});

describe('getHikeAnswersForHost', () => {
  it('maps rows, and returns [] (never throws) on an error or a thrown client', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{ profile_id: 'p9', when_choice: 'now', transport: 'car', free_seats: 3, help: 'other', help_other: 'x' }, { profile_id: 'p8', when_choice: 'now', transport: null, free_seats: null, help: null, help_other: null, asked_help: false }],
      error: null,
    });
    const select = vi.fn(() => ({ eq }));
    h.from.mockReturnValue({ select });
    expect(await getHikeAnswersForHost('e1')).toEqual([
      { profileId: 'p9', when: 'now', transport: 'car', freeSeats: 3, help: 'other', helpOther: 'x', askedHelp: true }, // absent asked_help means asked
      { profileId: 'p8', when: 'now', transport: null, freeSeats: null, help: null, helpOther: null, askedHelp: false },
    ]);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('asked_help'));
    expect(h.from).toHaveBeenCalledWith('event_hike_answers');
    expect(eq).toHaveBeenCalledWith('event_id', 'e1');
    eq.mockResolvedValue({ data: null, error: { message: 'denied', code: '42501' } });
    expect(await getHikeAnswersForHost('e1')).toEqual([]);
    h.from.mockImplementation(() => { throw new Error('boom'); });
    expect(await getHikeAnswersForHost('e1')).toEqual([]);
  });
});

describe('useEventRoomCounts', () => {
  beforeEach(() => { vi.useFakeTimers(); h.counts.mockReset(); h.counts.mockResolvedValue({ notHere: 3 }); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads on open and every 30 s, and stops when unmounted', async () => {
    const { result, unmount } = renderHook(() => useEventRoomCounts('e1', true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(h.counts).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ notHere: 3 });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(h.counts).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(h.counts).toHaveBeenCalledTimes(2);
  });

  it('does not read when disabled, and keeps the last value when a read fails', async () => {
    renderHook(() => useEventRoomCounts('e1', false));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(h.counts).not.toHaveBeenCalled();
    const { result } = renderHook(() => useEventRoomCounts('e1', true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    h.counts.mockResolvedValue(null);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current).toEqual({ notHere: 3 });
  });
});

describe('host page wiring (EventDetail source shape)', () => {
  const DETAIL = readFileSync(join(process.cwd(), 'src/app/prototypes/events/components/EventDetail.tsx'), 'utf-8');

  it('the host groups are on for a hike even when preparation_enabled is false, and unchanged for other events', () => {
    expect(DETAIL).toMatch(/const isHikeEvent = recipeForEvent\(event\)\.registration === 'hike'/);
    expect(DETAIL).toMatch(/const hostGroupsOn = !!isHost && \(!!event\?\.preparationEnabled \|\| isHikeEvent\)/);
    expect(DETAIL).toMatch(/useHostPrepMarks\(event\?\.id, hostGroupsOn\)/);
    expect(DETAIL).toMatch(/useHostOptIns\(event\?\.id, hostGroupsOn\)/);
    expect(DETAIL).toMatch(/if \(!hostGroupsOn\) \{/);
  });

  it('answers and merged count are read for the host of a hike only; the answers line never uses innerHTML', () => {
    expect(DETAIL).toMatch(/useEventRoomCounts\(event\?\.id, !!isHost && isHikeEvent\)/);
    expect(DETAIL).toMatch(/useHikeAnswersForHost\(event\?\.id, !!isHost && isHikeEvent/);
    expect(DETAIL).not.toMatch(/dangerouslySetInnerHTML[^\n]*hikeHostLine/);
    // Every heading (In, Out, Undecided) reads the merged server number on a hike (spec section 6, review 2026-11-17).
    expect(DETAIL).toMatch(/isHikeEvent \? hostRoomCounts\?\.\[g\.key\]/);
  });
});
