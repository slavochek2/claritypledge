/**
 * P1529 D24: the confirmation for a person the host added from the waiting list (supabase/functions/_shared/host-add-recipient.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { HOST_ADD_EMAIL_WINDOW_MS, hostAddRecipient } from '../../supabase/functions/_shared/host-add-recipient';

const NOW = Date.parse('2026-11-06T12:00:00Z');

/** A fake client: each table answers with what the scenario gives it. */
function db(o: { host?: string; rsvpedAt?: string | null; sent?: number | null; failing?: string }) {
  const answers: Record<string, { data: unknown; count?: number; error: null }> = {
    events: { data: o.host === undefined ? null : { host_id: o.host }, error: null },
    event_rsvps: { data: o.rsvpedAt ? { rsvped_at: o.rsvpedAt } : null, error: null },
    email_send_log: { data: null, count: o.sent === undefined ? 0 : (o.sent as number), error: null },
  };
  return {
    from(table: string) {
      const answer = o.failing === table ? { data: null, count: null, error: { message: 'timeout' } } : answers[table];
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, gte: () => chain,
        single: () => Promise.resolve(answer), maybeSingle: () => Promise.resolve(answer),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer).then(ok, bad),
      };
      return chain;
    },
  };
}

describe('hostAddRecipient', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fresh = new Date(NOW - 60_000).toISOString();

  it('sends to the person the host just added', async () => {
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: fresh }), 'e', 'h', 'p', NOW)).toBe('p');
  });
  it('refuses a caller who is not the host', async () => {
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: fresh }), 'e', 'someone', 'p', NOW)).toBeNull();
    expect(await hostAddRecipient(db({ rsvpedAt: fresh }), 'e', 'someone', 'p', NOW)).toBeNull();
  });
  it('refuses a registration older than the window (no re-sending to attendees at will)', async () => {
    const old = new Date(NOW - HOST_ADD_EMAIL_WINDOW_MS - 1000).toISOString();
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: old }), 'e', 'h', 'p', NOW)).toBeNull();
  });
  it('refuses a person with no registration', async () => {
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: null }), 'e', 'h', 'p', NOW)).toBeNull();
  });
  it('fails closed: any failed lookup sends nothing', async () => {
    for (const failing of ['events', 'event_rsvps', 'email_send_log']) {
      expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: fresh, failing }), 'e', 'h', 'p', NOW), failing).toBeNull();
    }
  });
  it('refuses an unreadable or far-future registration time, and allows a small clock difference', async () => {
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: 'not a date' }), 'e', 'h', 'p', NOW)).toBeNull();
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: new Date(NOW + 5 * 60_000).toISOString() }), 'e', 'h', 'p', NOW)).toBeNull();
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: new Date(NOW + 5_000).toISOString() }), 'e', 'h', 'p', NOW)).toBe('p');
  });
  it('sends one confirmation per add: none when one is already logged since the registration', async () => {
    expect(await hostAddRecipient(db({ host: 'h', rsvpedAt: fresh, sent: 1 }), 'e', 'h', 'p', NOW)).toBeNull();
  });
});
