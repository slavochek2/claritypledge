/**
 * P1562 round 4 (C2): the real getUpcomingEvents / getPastEvents turn a DB error into [] — so the events list showed
 * "no events" when it could not load. `{ throwOnError: true }` makes a failed read throw; every other caller (no
 * option) still gets [] exactly as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null),
  fetchUnsplashBanner: vi.fn().mockResolvedValue(null),
  generateAIBanner: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: vi.fn() }));

const answer = vi.hoisted(() => ({
  value: { data: null as unknown, error: null as unknown },
  rsvps: { data: [] as unknown, error: null as unknown },
  tables: [] as string[],
}));
/** A PostgREST-like builder: every filter returns itself; awaiting it yields `answer.value` (the events read) or
 *  `answer.rsvps` (the follow-up RSVP-count read). `answer.tables` records each table read, in order. */
function builder(table: string): Record<string, unknown> {
  answer.tables.push(table);
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'in', 'eq', 'or', 'order']) b[m] = () => b;
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(table === 'event_rsvps' ? answer.rsvps : answer.value).then(resolve);
  return b;
}
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => builder(t), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } },
}));

import { realEventsService } from '@/app/data/events-service-real';
import { untilVisible } from '@/app/data/event-list-reads';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const row = (id: string) => ({
  id, slug: id, title: id, description: '', datetime: '2099-01-01T11:00:00Z', timezone: 'UTC', duration_minutes: 60,
  location: 'x', host_id: 'h', status: 'upcoming', org_id: 'org-1', host: { id: 'h', full_name: 'H', slug: 'h' },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

const dbError = { message: 'statement timeout', code: '57014', details: null, hint: null };

beforeEach(() => {
  answer.value = { data: null, error: dbError };
  answer.rsvps = { data: [], error: null };
  answer.tables = [];
  setVisibility('visible');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the event lists report a failed read only when asked', () => {
  it.each([
    ['getUpcomingEvents', () => realEventsService.getUpcomingEvents('org-1', { throwOnError: true })],
    ['getPastEvents', () => realEventsService.getPastEvents('org-1', { throwOnError: true })],
  ])('%s with throwOnError: a DB error throws', async (_name, call) => {
    await expect(call()).rejects.toThrow();
  });

  it.each([
    ['getUpcomingEvents', () => realEventsService.getUpcomingEvents('org-1')],
    ['getPastEvents', () => realEventsService.getPastEvents('org-1')],
  ])('%s without the option: unchanged, a DB error is []', async (_name, call) => {
    await expect(call()).resolves.toEqual([]);
  });

  it('a successful empty read is [] either way, never a throw', async () => {
    answer.value = { data: [], error: null };
    await expect(realEventsService.getUpcomingEvents('org-1', { throwOnError: true })).resolves.toEqual([]);
    await expect(realEventsService.getPastEvents('org-1', { throwOnError: true })).resolves.toEqual([]);
  });
});

describe('round 5: the RSVP-count follow-up read', () => {
  it('C2: the tab went hidden while the list read was out — no count request until it is shown', async () => {
    answer.value = { data: [row('a')], error: null };
    setVisibility('hidden');
    const read = realEventsService.getUpcomingEvents('org-1', { throwOnError: true });
    await flush();
    expect(answer.tables).toEqual(['events']); // the list read only
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    const events = await read;
    expect(answer.tables).toEqual(['events', 'event_rsvps']);
    expect(events.map((e) => e.id)).toEqual(['a']);
  });

  it('C2: the caller gave up while the tab was hidden — the count request is never sent', async () => {
    answer.value = { data: [row('a')], error: null };
    setVisibility('hidden');
    const abort = new AbortController();
    const read = realEventsService.getPastEvents('org-1', { throwOnError: true, signal: abort.signal });
    await flush();
    abort.abort();
    await read;
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(answer.tables).toEqual(['events']);
  });

  it('G1: a failed count read rejects with throwOnError', async () => {
    answer.value = { data: [row('a')], error: null };
    answer.rsvps = { data: null, error: dbError };
    await expect(realEventsService.getUpcomingEvents('org-1', { throwOnError: true })).rejects.toThrow();
  });

  it('G1: without the option a failed count read is as before — the events, no counts', async () => {
    answer.value = { data: [row('a')], error: null };
    answer.rsvps = { data: null, error: dbError };
    const events = await realEventsService.getUpcomingEvents('org-1');
    expect(events.map((e) => e.id)).toEqual(['a']);
  });
});

describe('round 6 (R2): an already-aborted caller never permits the count read', () => {
  it('aborted before the call, while hidden: resolves false at once, and stays false when the tab is shown', async () => {
    setVisibility('hidden');
    const abort = new AbortController();
    abort.abort();
    const permitted = untilVisible(abort.signal);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await expect(permitted).resolves.toBe(false);
  });

  it('aborted before the call, while visible: false', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(untilVisible(abort.signal)).resolves.toBe(false);
  });

  it('the list read finished after the caller gave up (hidden): the count read is never sent', async () => {
    answer.value = { data: [row('a')], error: null };
    setVisibility('hidden');
    const abort = new AbortController();
    abort.abort(); // the caller cleaned up while the list read was out
    await realEventsService.getUpcomingEvents('org-1', { throwOnError: true, signal: abort.signal });
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(answer.tables).toEqual(['events']);
  });
});

