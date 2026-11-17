/**
 * P1700: the email to a person the host removed (supabase/functions/_shared/removal-notice.ts) and its copy (buildRemoval).
 * The database is a fake that keeps one event_removals row and applies the filters each update names, so a missing filter
 * (had_registration, notified_at IS NULL) changes the outcome instead of passing silently.
 */
import { describe, expect, it, vi } from 'vitest';
import { notifyRemoval, type RemovalDeps } from '../../supabase/functions/_shared/removal-notice';

vi.mock('https://deno.land/std@0.168.0/http/server.ts', () => ({}));

type Row = { event_id: string; user_id: string; had_registration: boolean; notified_at: string | null; scheduled_message_ids: Record<string, string> | null };

const EVENT = { id: 'ev', title: 'Sales Mastermind', datetime: '2026-11-20T18:00:00Z', timezone: 'UTC', host_id: 'host' };

function fakeDb(o: { row?: Row | null; host?: string; email?: string | null; failing?: string; releaseFails?: boolean }) {
  const state = { row: o.row ?? null };
  const db = {
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let values: Record<string, unknown> | null = null;
      const matches = (r: Row) => filters.every(([op, col, v]) => (op === 'is' ? (r as Record<string, unknown>)[col] === null : (r as Record<string, unknown>)[col] === v));
      const result = () => {
        if (o.failing === table) return { data: null, error: { message: 'down' } };
        if (table === 'events') return { data: o.host === undefined ? EVENT : { ...EVENT, host_id: o.host }, error: null };
        if (table === 'profiles') return { data: o.email === null ? { email: null, name: 'Ann Lee' } : { email: o.email ?? 'test@example.com', name: 'Ann Lee' }, error: null };
        // event_removals
        if (o.releaseFails && values && values.notified_at === null) return { data: null, error: { message: 'release down' } };
        if (values && state.row && matches(state.row)) {
          const before = { ...state.row };
          Object.assign(state.row, values);
          return { data: { scheduled_message_ids: before.scheduled_message_ids }, error: null };
        }
        return { data: null, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (v: Record<string, unknown>) => { values = v; return chain; },
        eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return chain; },
        is: (c: string) => { filters.push(['is', c, null]); return chain; },
        single: () => Promise.resolve(result()),
        maybeSingle: () => Promise.resolve(result()),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad),
      };
      return chain;
    },
  };
  return { db, state };
}

function deps(sendResult: string | null = 'msg-1'): RemovalDeps & { sent: unknown[]; cancelled: string[]; logged: unknown[] } {
  const sent: unknown[] = []; const cancelled: string[] = []; const logged: unknown[] = [];
  return {
    sent, cancelled, logged,
    cancel: async (id) => { cancelled.push(id); },
    send: async (to, email) => { sent.push({ to, email }); return sendResult; },
    build: (event) => ({ subject: `Your registration for ${event.title as string}`, html: '', text: '' }),
    log: async (x) => { logged.push(x); },
    now: () => '2026-11-17T10:00:00.000Z',
  };
}

const removed = (over: Partial<Row> = {}): Row => ({
  event_id: 'ev', user_id: 'ann', had_registration: true, notified_at: null,
  scheduled_message_ids: { reminder: 'r-1', feedback: 'f-1', starting_soon: 's-1', confirmation: 'c-1' }, ...over,
});

describe('notifyRemoval', () => {
  it('sends one email to a registered person the host removed, and cancels their scheduled emails', async () => {
    const { db, state } = fakeDb({ row: removed() });
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('sent');
    expect(d.sent).toHaveLength(1);
    expect(d.cancelled.sort()).toEqual(['f-1', 'r-1', 's-1']); // the confirmation already went; only scheduled ones
    expect(state.row?.notified_at).toBe('2026-11-17T10:00:00.000Z');
    expect(state.row?.scheduled_message_ids).toBeNull();
  });

  it('a second call sends nothing', async () => {
    const { db } = fakeDb({ row: removed() });
    const d = deps();
    await notifyRemoval(db, d, 'ev', 'host', 'ann');
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('nothing');
    expect(d.sent).toHaveLength(1);
  });

  it('a caller who is not the host is refused before anything is claimed', async () => {
    const { db, state } = fakeDb({ row: removed() });
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'someone-else', 'ann')).toBe('forbidden');
    expect(d.sent).toHaveLength(0);
    expect(state.row?.notified_at).toBeNull();
  });

  it('a removal that deleted no registration (waitlisted only) sends nothing', async () => {
    const { db } = fakeDb({ row: removed({ had_registration: false }) });
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('nothing');
    expect(d.sent).toHaveLength(0);
    expect(d.cancelled).toHaveLength(0);
  });

  it('a person with no removal record gets nothing', async () => {
    const { db } = fakeDb({ row: null });
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('nothing');
    expect(d.sent).toHaveLength(0);
  });

  it('a failed send releases the claim, so a retry sends', async () => {
    const { db, state } = fakeDb({ row: removed() });
    expect(await notifyRemoval(db, deps(null), 'ev', 'host', 'ann')).toBe('failed');
    expect(state.row?.notified_at).toBeNull();
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('sent');
    expect(d.sent).toHaveLength(1);
  });

  it('fails closed when the event lookup fails', async () => {
    const { db } = fakeDb({ row: removed(), failing: 'events' });
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('forbidden');
    expect(d.sent).toHaveLength(0);
  });

  it('a send that throws (network error) releases the claim, so a retry sends', async () => {
    const { db, state } = fakeDb({ row: removed() });
    const throwing = { ...deps(), send: async () => { throw new Error('fetch failed'); } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await notifyRemoval(db, throwing, 'ev', 'host', 'ann')).toBe('failed');
    expect(state.row?.notified_at).toBeNull();
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('sent');
  });

  it('a cancel that throws does not stop the removal email', async () => {
    const { db } = fakeDb({ row: removed() });
    const d = deps();
    const flaky = { ...d, cancel: async (id: string) => { if (id === 'r-1') throw new Error('mailgun down'); d.cancelled.push(id); } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await notifyRemoval(db, flaky, 'ev', 'host', 'ann')).toBe('sent');
    expect(d.sent).toHaveLength(1);
    expect(d.cancelled.sort()).toEqual(['f-1', 's-1']);
  });

  it('a log write that throws after a successful send keeps the claim: a retry sends nothing', async () => {
    const { db, state } = fakeDb({ row: removed() });
    const d = deps();
    const badLog = { ...d, log: async () => { throw new Error('log insert reset'); } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await notifyRemoval(db, badLog, 'ev', 'host', 'ann')).toBe('sent');
    expect(state.row?.notified_at).not.toBeNull();
    expect(await notifyRemoval(db, deps(), 'ev', 'host', 'ann')).toBe('nothing');
    expect(d.sent).toHaveLength(1);
  });

  it('a failed send keeps the scheduled ids, so the retry cancels them again', async () => {
    const { db, state } = fakeDb({ row: removed() });
    expect(await notifyRemoval(db, deps(null), 'ev', 'host', 'ann')).toBe('failed');
    expect(state.row?.scheduled_message_ids).not.toBeNull();
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('sent');
    expect(d.cancelled.sort()).toEqual(['f-1', 'r-1', 's-1']);
    expect(state.row?.scheduled_message_ids).toBeNull();
  });

  it('a database error on the claim is a failure (502), not "nothing to send"', async () => {
    const { db } = fakeDb({ row: removed(), failing: 'event_removals' });
    const d = deps();
    expect(await notifyRemoval(db, d, 'ev', 'host', 'ann')).toBe('failed');
    expect(d.sent).toHaveLength(0);
  });

  it('a release that the database refuses is logged once and not retried; the claim stays set', async () => {
    const { db, state } = fakeDb({ row: removed(), releaseFails: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await notifyRemoval(db, deps(null), 'ev', 'host', 'ann')).toBe('failed');
    expect(state.row?.notified_at).not.toBeNull();
    expect(err.mock.calls.filter(c => String(c[0]).includes('claim not released'))).toHaveLength(1);
  });

  it('a person with no email address releases the claim', async () => {
    const { db, state } = fakeDb({ row: removed(), email: null });
    expect(await notifyRemoval(db, deps(), 'ev', 'host', 'ann')).toBe('failed');
    expect(state.row?.notified_at).toBeNull();
  });
});
