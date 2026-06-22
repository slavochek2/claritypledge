import { describe, it, expect } from 'vitest';
import { WEBINAR_SERIES, filterWebinarSeries } from '@/app/data/webinar-series';
import type { EventWithHost } from '@/app/types';

function makeEvent(overrides: Partial<EventWithHost>): EventWithHost {
  return {
    id: 'test-id',
    slug: 'test-slug',
    title: "Clarity Experiment #1: I've Lost Co-Founders. Here's How to Keep Yours.",
    description: 'Test description',
    datetime: '2026-06-26T08:30:00Z',
    durationMinutes: 60,
    timezone: 'Europe/Berlin',
    location: 'https://meet.google.com/rdi-qdab-qca',
    hostId: WEBINAR_SERIES.HOST_ID,
    createdAt: '2026-06-16T00:00:00Z',
    status: 'upcoming',
    hostName: 'Slava',
    hostSlug: 'slava',
    ...overrides,
  } as EventWithHost;
}

describe('P939: webinar series filter', () => {
  it('includes event with matching title prefix and host', () => {
    const events = [makeEvent({})];
    expect(filterWebinarSeries(events)).toHaveLength(1);
  });

  it('excludes event with correct title prefix but wrong host_id', () => {
    const events = [makeEvent({ hostId: 'other-host-id' })];
    expect(filterWebinarSeries(events)).toHaveLength(0);
  });

  it('excludes event with correct host but title not starting with prefix', () => {
    const events = [makeEvent({ title: 'Some Other Event' })];
    expect(filterWebinarSeries(events)).toHaveLength(0);
  });

  it('includes guest-week occurrence — title prefix followed by guest suffix', () => {
    const events = [makeEvent({ title: "Clarity Experiment #5: I've Lost Co-Founders — with Jane Doe" })];
    expect(filterWebinarSeries(events)).toHaveLength(1);
  });

  it('excludes legacy "Live webinar #" rows (transition complete — prefix retired)', () => {
    const events = [makeEvent({ title: "Live webinar #1: I've Lost Co-Founders. Here's How to Keep Yours." })];
    expect(filterWebinarSeries(events)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterWebinarSeries([])).toHaveLength(0);
  });

  it('filters a mixed list — only series events pass', () => {
    const seriesEvent = makeEvent({});
    const wrongHost = makeEvent({ hostId: 'other-host-id' });
    const unrelatedEvent = makeEvent({ title: 'AI Running Club', hostId: 'other-id' });
    const result = filterWebinarSeries([seriesEvent, wrongHost, unrelatedEvent]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(seriesEvent.id);
  });

  it('SERIES_PARAM constant matches the expected URL param key', () => {
    expect(WEBINAR_SERIES.SERIES_PARAM).toBe('lost-cofounders');
  });
});
