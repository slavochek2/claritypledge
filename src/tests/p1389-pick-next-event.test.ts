import { describe, expect, it } from 'vitest';
import { pickNextEvent } from '@/app/data/event-close-service';

const ev = (id: string, title: string, datetime: string, hostId = 'h1', status = 'upcoming') => ({ id, title, datetime, hostId, status });

describe('P1389 pickNextEvent', () => {
  const tonight = ev('t', 'Clarity Night #2: AI', '2026-10-06T11:30:00Z');

  it('picks the earliest later Clarity Night by the same host', () => {
    const list = [
      ev('far', 'Clarity Night #4', '2026-10-20T11:30:00Z'),
      ev('near', 'Clarity Night #3', '2026-10-13T11:30:00Z'),
    ];
    expect(pickNextEvent(tonight, list)?.id).toBe('near');
  });

  it('skips cancelled, other hosts, other series, earlier events and tonight itself', () => {
    const list = [
      tonight,
      ev('cancelled', 'Clarity Night #3', '2026-10-13T11:30:00Z', 'h1', 'cancelled'),
      ev('other-host', 'Clarity Night #3', '2026-10-13T11:30:00Z', 'h2'),
      ev('other-series', 'Hike', '2026-10-13T11:30:00Z'),
      ev('earlier', 'Clarity Night #1', '2026-09-29T11:30:00Z'),
    ];
    expect(pickNextEvent(tonight, list)).toBeNull();
  });
});
