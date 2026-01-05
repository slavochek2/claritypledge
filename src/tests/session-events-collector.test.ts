/**
 * @file session-events-collector.test.ts
 * @description Unit tests for SessionEventsCollector - ML training event capture
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionEventsCollector } from '@/lib/session-events-collector';

describe('SessionEventsCollector', () => {
  let collector: SessionEventsCollector;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    collector = new SessionEventsCollector();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('start()', () => {
    it('sets startTime to current time', () => {
      const now = Date.now();
      collector.start();
      expect(collector.getStartTime()).toBe(now);
    });

    it('clears any previous events', () => {
      collector.start();
      collector.addEvent('test_event', { foo: 'bar' });
      expect(collector.getEvents()).toHaveLength(1);

      // Start again - should clear
      collector.start();
      expect(collector.getEvents()).toHaveLength(0);
    });

    it('sets isStarted to true', () => {
      expect(collector.isStarted()).toBe(false);
      collector.start();
      expect(collector.isStarted()).toBe(true);
    });

    it('logs start message', () => {
      collector.start();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[EventsCollector] Started collecting at',
        expect.any(String)
      );
    });
  });

  describe('addEvent()', () => {
    it('warns and returns early if called before start()', () => {
      collector.addEvent('test_event', { foo: 'bar' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[EventsCollector] addEvent called before start()'
      );
      expect(collector.getEvents()).toHaveLength(0);
    });

    it('captures event with correct relative timestamp', () => {
      collector.start();

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      collector.addEvent('live_rating_submitted', { rating: 8 });

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'live_rating_submitted',
        timestamp: 5000,
        properties: { rating: 8 },
      });
    });

    it('captures multiple events with incrementing timestamps', () => {
      collector.start();

      vi.advanceTimersByTime(1000);
      collector.addEvent('event_1', { step: 1 });

      vi.advanceTimersByTime(2000);
      collector.addEvent('event_2', { step: 2 });

      vi.advanceTimersByTime(3000);
      collector.addEvent('event_3', { step: 3 });

      const events = collector.getEvents();
      expect(events).toHaveLength(3);
      expect(events[0].timestamp).toBe(1000);
      expect(events[1].timestamp).toBe(3000); // 1000 + 2000
      expect(events[2].timestamp).toBe(6000); // 1000 + 2000 + 3000
    });

    it('logs captured event', () => {
      collector.start();
      vi.advanceTimersByTime(1500);
      collector.addEvent('test_event', {});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[EventsCollector] Captured event:',
        'test_event',
        'at',
        1500,
        'ms'
      );
    });

    it('handles empty properties object', () => {
      collector.start();
      collector.addEvent('empty_props', {});

      const events = collector.getEvents();
      expect(events[0].properties).toEqual({});
    });

    it('handles complex nested properties', () => {
      collector.start();
      collector.addEvent('complex_event', {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        nullable: null,
      });

      const events = collector.getEvents();
      expect(events[0].properties).toEqual({
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        nullable: null,
      });
    });
  });

  describe('getEvents()', () => {
    it('returns a copy of events array (immutability)', () => {
      collector.start();
      collector.addEvent('test', {});

      const events1 = collector.getEvents();
      const events2 = collector.getEvents();

      expect(events1).not.toBe(events2); // Different array references
      expect(events1).toEqual(events2); // Same content
    });

    it('mutations to returned array do not affect internal state', () => {
      collector.start();
      collector.addEvent('original', { id: 1 });

      const events = collector.getEvents();
      events.push({ type: 'injected', timestamp: 999, properties: {} });

      expect(collector.getEvents()).toHaveLength(1);
      expect(collector.getEvents()[0].type).toBe('original');
    });

    it('returns empty array before any events added', () => {
      collector.start();
      expect(collector.getEvents()).toEqual([]);
    });
  });

  describe('getStartTime()', () => {
    it('returns 0 before start() is called', () => {
      expect(collector.getStartTime()).toBe(0);
    });

    it('returns Unix timestamp after start()', () => {
      const now = 1704067200000; // 2024-01-01 00:00:00 UTC
      vi.setSystemTime(now);

      collector.start();
      expect(collector.getStartTime()).toBe(now);
    });
  });

  describe('getDurationMs()', () => {
    it('returns 0 before start() is called', () => {
      expect(collector.getDurationMs()).toBe(0);
    });

    it('returns elapsed time since start()', () => {
      collector.start();

      vi.advanceTimersByTime(10000);
      expect(collector.getDurationMs()).toBe(10000);

      vi.advanceTimersByTime(5000);
      expect(collector.getDurationMs()).toBe(15000);
    });
  });

  describe('isStarted()', () => {
    it('returns false initially', () => {
      expect(collector.isStarted()).toBe(false);
    });

    it('returns true after start()', () => {
      collector.start();
      expect(collector.isStarted()).toBe(true);
    });

    it('returns false after reset()', () => {
      collector.start();
      collector.reset();
      expect(collector.isStarted()).toBe(false);
    });
  });

  describe('getMetadata()', () => {
    it('returns session start time', () => {
      const now = 1704067200000;
      vi.setSystemTime(now);

      collector.start();
      const metadata = collector.getMetadata();

      expect(metadata.sessionStartedAt).toBe(now);
    });

    it('returns empty participants array (to be filled by caller)', () => {
      collector.start();
      const metadata = collector.getMetadata();

      expect(metadata.participants).toEqual([]);
    });
  });

  describe('reset()', () => {
    it('clears all events', () => {
      collector.start();
      collector.addEvent('event1', {});
      collector.addEvent('event2', {});
      expect(collector.getEvents()).toHaveLength(2);

      collector.reset();
      expect(collector.getEvents()).toHaveLength(0);
    });

    it('resets startTime to 0', () => {
      collector.start();
      expect(collector.getStartTime()).toBeGreaterThan(0);

      collector.reset();
      expect(collector.getStartTime()).toBe(0);
    });

    it('logs reset message', () => {
      collector.reset();
      expect(consoleLogSpy).toHaveBeenCalledWith('[EventsCollector] Reset');
    });

    it('allows starting a new session after reset', () => {
      collector.start();
      collector.addEvent('old_event', {});
      collector.reset();

      vi.advanceTimersByTime(1000);
      collector.start();
      collector.addEvent('new_event', {});

      expect(collector.getEvents()).toHaveLength(1);
      expect(collector.getEvents()[0].type).toBe('new_event');
      expect(collector.getEvents()[0].timestamp).toBe(0); // Relative to new start
    });
  });
});
