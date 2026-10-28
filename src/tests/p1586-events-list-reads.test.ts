/**
 * @file p1586-events-list-reads.test.ts
 * @description P1586 §3, service side: the list reads can be asked to FAIL loudly (opt-in) while the
 * default stays "swallow to []" for every other caller, and the viewer's RSVPs come from one request.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ from: [] as string[], result: null as unknown }));

// A thenable builder: every chained call returns the same builder, awaiting it yields `calls.result`.
vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'or', 'order']) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => resolve(calls.result);
  return {
    supabase: {
      from: (table: string) => {
        calls.from.push(table);
        return builder;
      },
    },
  };
});
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn(),
  fetchUnsplashBanner: vi.fn(),
  generateAIBanner: vi.fn(),
}));

const DB_ERROR = { message: 'permission denied', code: '42501', details: '', hint: '' };

describe('P1586 events list reads', () => {
  let svc: typeof import('@/app/data/events-service-real').realEventsService;

  beforeEach(async () => {
    calls.from = [];
    calls.result = { data: null, error: DB_ERROR };
    svc = (await import('@/app/data/events-service-real')).realEventsService;
  });

  it('getUpcomingEvents / getPastEvents: a database error still resolves to [] by default', async () => {
    await expect(svc.getUpcomingEvents()).resolves.toEqual([]);
    await expect(svc.getPastEvents()).resolves.toEqual([]);
  });

  it('getUpcomingEvents / getPastEvents: throwOnError turns the same error into a rejection', async () => {
    await expect(svc.getUpcomingEvents(undefined, { throwOnError: true })).rejects.toThrow();
    await expect(svc.getPastEvents(undefined, { throwOnError: true })).rejects.toThrow();
  });

  it('getUpcomingEventsByOrg keeps swallowing a database error', async () => {
    await expect(svc.getUpcomingEventsByOrg(['org-id-1'])).resolves.toEqual({ 'org-id-1': [] });
  });

  it('getViewerRsvps: one request for many events, and a database error rejects (never "not going")', async () => {
    calls.result = { data: [{ event_id: 'e1' }, { event_id: 'e3' }], error: null };
    await expect(svc.getViewerRsvps(['e1', 'e2', 'e3'], 'user-id-1')).resolves.toEqual(['e1', 'e3']);
    expect(calls.from).toEqual(['event_rsvps']);

    calls.result = { data: null, error: DB_ERROR };
    await expect(svc.getViewerRsvps(['e1'], 'user-id-1')).rejects.toThrow();
  });

  it('getViewerRsvps: no listed events means no request', async () => {
    await expect(svc.getViewerRsvps([], 'user-id-1')).resolves.toEqual([]);
    expect(calls.from).toEqual([]);
  });
});
