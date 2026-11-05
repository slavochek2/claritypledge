import { describe, it, expect, vi, beforeEach } from 'vitest';

const track = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));

import {
  eventTypeOf,
  trackRsvpCompleted,
  trackPostSignupRsvp,
  fetchSeriesSlug,
} from '@/app/prototypes/events/rsvp-analytics';

beforeEach(() => {
  track.mockReset();
  maybeSingle.mockReset();
});

describe('P1640 RSVP analytics helper', () => {
  it('event type is the series slug, or standalone', () => {
    expect(eventTypeOf({ seriesSlug: 'social-hike' })).toBe('social-hike');
    expect(eventTypeOf({})).toBe('standalone');
    expect(eventTypeOf({ seriesSlug: null })).toBe('standalone');
  });

  it.each(['signed_in', 'post_signup', 'close_page'] as const)('fires event_rsvp_completed for path %s', (path) => {
    trackRsvpCompleted({ id: 'e1', seriesSlug: 'social-hike' }, path);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('event_rsvp_completed', { event_id: 'e1', event_type: 'social-hike', path });
  });

  it('post-signup fires event_rsvp_auto with event_type and then completed', async () => {
    maybeSingle.mockResolvedValue({ data: { series_slug: 'clarity-night' } });
    await trackPostSignupRsvp('e2', 'my-slug', 'pledge');
    expect(track).toHaveBeenNthCalledWith(1, 'event_rsvp_auto', {
      event_slug: 'my-slug',
      event_id: 'e2',
      event_type: 'clarity-night',
      registration_source: 'pledge',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'event_rsvp_completed', {
      event_id: 'e2',
      event_type: 'clarity-night',
      path: 'post_signup',
    });
  });

  it('a failed series read records unknown, not standalone, and does not throw', async () => {
    maybeSingle.mockRejectedValue(new Error('network'));
    expect(await fetchSeriesSlug('e3')).toBe('unknown');
    await trackPostSignupRsvp('e3', 's', 'x');
    expect(track).toHaveBeenLastCalledWith('event_rsvp_completed', { event_id: 'e3', event_type: 'unknown', path: 'post_signup' });
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await fetchSeriesSlug('e3')).toBe('unknown');
  });
});

// The three callers only call the helper inside their success branch. Pin the order in source so a
// refactor that moves the call above the success check fails here.
import { readFileSync } from 'node:fs';
describe('P1640 callers fire only on success', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('EventDetail: inside `if (success)`', () => {
    const s = read('src/app/prototypes/events/components/EventDetail.tsx');
    expect(s).toMatch(/if \(success\) \{\s*trackRsvpCompleted\(event, 'signed_in'\);/);
  });
  it('AuthCallbackPage: inside `if (rsvpSuccess)`', () => {
    expect(read('src/auth/AuthCallbackPage.tsx')).toMatch(/if \(rsvpSuccess\) \{[^}]*trackPostSignupRsvp\(/s);
  });
  it('EventClosePage: after the `!ok` return', () => {
    expect(read('src/app/prototypes/events/close/EventClosePage.tsx')).toMatch(
      /if \(!ok\) return toast\.error\([^\n]*\n\s*trackRsvpCompleted\(nextEvent, 'close_page'\);/,
    );
  });
});
