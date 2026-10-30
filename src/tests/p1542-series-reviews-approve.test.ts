/**
 * The founder's approve (scripts/lib/series-reviews-core.mjs) against a client whose data changes BETWEEN the consent
 * check and the write — the race Opus and Codex found. The write is conditional on the status and the exact quote that
 * were checked, so an edit (new words, still pending) or a clear (rejected) in that window publishes nothing: the write
 * matches 0 rows and the approve refuses with code 4. Deterministic: the change is made inside the client, right after
 * the consent read answers.
 */
import { describe, it, expect } from 'vitest';
import { moderate } from '../../scripts/lib/series-reviews-core.mjs';

type Row = Record<string, unknown>;
/** A tiny in-memory stand-in for the supabase-js query builder: eq filters, update, select, maybeSingle, order, limit. */
function fakeDb(tables: Record<string, Row[]>, afterConsentRead: () => void) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
      const rows = () => tables[table]!.filter((r) => filters.every(([k, v]) => r[k] === v));
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        order: () => q,
        limit: () => q,
        update: (p: Row) => { patch = p; return q; },
        maybeSingle: async () => {
          const found = rows()[0];
          const data = found ? { ...found } : null; // a snapshot, as a real response is
          if (table === 'event_feedback') afterConsentRead();
          return { data, error: null };
        },
        then: (resolve: (r: unknown) => void) => {
          const hit = rows();
          if (patch) for (const r of hit) Object.assign(r, patch);
          resolve({ data: hit.map((r) => ({ ...r })), error: null });
        },
      };
      return q;
    },
  };
}

const base = () => ({
  series_reviews: [{ id: 'r1', series_slug: 'social-hike', status: 'pending', author_name: 'Ana', quote: 'Lovely walk.', source_event_id: 'e1', author_profile_id: 'u1', sort_order: 0 }],
  event_feedback: [{ event_id: 'e1', user_id: 'u1', liked: 'Lovely walk.', quote_ok: true }],
});

describe('approve is atomic with what it checked', () => {
  it('control: nothing changes in between → approved', async () => {
    const t = base();
    const res = await moderate(fakeDb(t, () => {}), 'r1', 'approve');
    expect(res.code).toBe(0);
    expect(t.series_reviews[0]).toMatchObject({ status: 'approved' });
  });

  it('the words are edited between the check and the write (server re-pends them, new quote): refused, not published', async () => {
    const t = base();
    const res = await moderate(fakeDb(t, () => {
      t.event_feedback[0]!.liked = 'Unreviewed new words.';
      Object.assign(t.series_reviews[0]!, { quote: 'Unreviewed new words.', status: 'pending' });
    }), 'r1', 'approve');
    expect(res.code).toBe(4);
    expect(t.series_reviews[0]).toMatchObject({ status: 'pending', quote: 'Unreviewed new words.' });
  });

  it('the words are cleared between the check and the write (review rejected): refused, stays rejected', async () => {
    const t = base();
    const res = await moderate(fakeDb(t, () => {
      t.event_feedback[0]!.liked = null as never;
      Object.assign(t.series_reviews[0]!, { status: 'rejected' });
    }), 'r1', 'approve');
    expect(res.code).toBe(4);
    expect(t.series_reviews[0]).toMatchObject({ status: 'rejected' });
  });
});
