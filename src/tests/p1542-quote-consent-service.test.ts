/**
 * P1542 review round 9: an answer save sends NO quote permission (p_quote_ok NULL — the server keeps its own), and the
 * box's own write is a separate call (set_event_quote_ok).
 */
import { describe, it, expect, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import { saveEventFeedback, setEventQuoteOk } from '@/app/data/event-close-service';

describe('the close service, quote permission', () => {
  it('an answer save sends p_quote_ok NULL', async () => {
    await saveEventFeedback('ev-1', { score: 7, liked: 'Words.', improve: '' });
    expect(rpc).toHaveBeenCalledWith('save_event_feedback', expect.objectContaining({ p_quote_ok: null }));
  });
  it('the box writes through set_event_quote_ok with the click time, true or false', async () => {
    expect(await setEventQuoteOk('ev-1', false, '2026-10-29T12:00:00.000Z')).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith('set_event_quote_ok', { p_event_id: 'ev-1', p_quote_ok: false, p_clicked_at: '2026-10-29T12:00:00.000Z' });
  });
});
