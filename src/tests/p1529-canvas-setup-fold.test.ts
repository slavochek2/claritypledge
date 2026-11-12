/**
 * P1529 E5: the canvas setup's end rides the rounds read: one extra select in the same tick, only when asked for and only while no round
 * exists; a failed setup read never fails the rounds read and is reported, never mapped to "not started".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rounds: [] as unknown[],
  setup: { data: null as unknown, error: null as unknown },
  calls: [] as string[],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      h.calls.push(table);
      const result = table === 'event_canvas_setups' ? h.setup : { data: table === 'event_rounds' ? h.rounds : [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'in']) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve(result);
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return chain;
    },
  },
}));

import { getEventRoundsState } from '@/app/data/event-rounds-service';

beforeEach(() => { h.rounds = []; h.calls = []; h.setup = { data: null, error: null }; });

describe('the canvas setup rides the rounds read', () => {
  it('not asked for: no setup select', async () => {
    await getEventRoundsState('ev');
    expect(h.calls).not.toContain('event_canvas_setups');
  });
  it('asked for, no round yet: one setup select, its end returned (null = never started)', async () => {
    expect((await getEventRoundsState('ev', { withCanvasSetup: true })).canvasSetupEnd).toBeNull();
    h.setup = { data: { ends_at: '2026-11-12T20:00:00Z' }, error: null };
    expect((await getEventRoundsState('ev', { withCanvasSetup: true })).canvasSetupEnd).toBe(Date.parse('2026-11-12T20:00:00Z'));
  });
  it('a failed setup read does not fail the rounds read and says so', async () => {
    h.setup = { data: null, error: new Error('down') };
    const state = await getEventRoundsState('ev', { withCanvasSetup: true });
    expect(state.canvasSetupEnd).toBeUndefined();
    expect(state.canvasSetupReadFailed).toBe(true);
  });

  it('a round exists: no setup select at all', async () => {
    h.rounds = [{ id: 'r1', round_no: 1, group_size: 4, started_at: '2026-11-12T20:00:00Z', ended_at: null, seating_s: 1, reading_s: 0, first_s: 1, second_s: 1, observer_s: 1, split_speakers: false, match_tag: null, showcase: false }];
    await getEventRoundsState('ev', { withCanvasSetup: true });
    expect(h.calls).not.toContain('event_canvas_setups');
  });
  it('a hidden tab makes no setup select and reports no end', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      const state = await getEventRoundsState('ev', { withCanvasSetup: true });
      expect(h.calls).not.toContain('event_canvas_setups');
      expect(state.canvasSetupEnd).toBeUndefined();
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    }
  });
});
