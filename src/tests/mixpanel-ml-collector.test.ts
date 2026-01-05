/**
 * @file mixpanel-ml-collector.test.ts
 * @description Unit tests for ML collector registration in analytics wrapper
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { analytics } from '@/lib/mixpanel';
import { SessionEventsCollector } from '@/lib/session-events-collector';

describe('analytics ML collector integration', () => {
  let collector: SessionEventsCollector;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    collector = new SessionEventsCollector();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Always unregister before each test to ensure clean state
    analytics.unregisterMLCollector();
  });

  afterEach(() => {
    analytics.unregisterMLCollector();
    consoleLogSpy.mockRestore();
  });

  describe('registerMLCollector()', () => {
    it('logs registration message', () => {
      analytics.registerMLCollector(collector);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Analytics] ML collector registered - all events will be captured'
      );
    });
  });

  describe('unregisterMLCollector()', () => {
    it('logs unregistration message', () => {
      analytics.registerMLCollector(collector);
      consoleLogSpy.mockClear();

      analytics.unregisterMLCollector();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Analytics] ML collector unregistered'
      );
    });
  });

  describe('track() with ML collector', () => {
    it('does not capture events when no collector is registered', () => {
      // Collector is started but NOT registered
      collector.start();

      analytics.track('test_event', { foo: 'bar' });

      expect(collector.getEvents()).toHaveLength(0);
    });

    it('does not capture events when collector is registered but not started', () => {
      analytics.registerMLCollector(collector);
      // Collector is registered but NOT started

      analytics.track('test_event', { foo: 'bar' });

      expect(collector.getEvents()).toHaveLength(0);
    });

    it('captures events when collector is registered AND started', () => {
      analytics.registerMLCollector(collector);
      collector.start();

      analytics.track('live_rating_submitted', { rating: 8, role: 'checker' });

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('live_rating_submitted');
      expect(events[0].properties).toEqual({ rating: 8, role: 'checker' });
    });

    it('captures all tracked events (not just live_* events)', () => {
      analytics.registerMLCollector(collector);
      collector.start();

      analytics.track('page_viewed', { page: '/settings' });
      analytics.track('live_session_joined', { code: 'ABC123' });
      analytics.track('button_clicked', { button: 'submit' });

      const events = collector.getEvents();
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.type)).toEqual([
        'page_viewed',
        'live_session_joined',
        'button_clicked',
      ]);
    });

    it('stops capturing after unregister', () => {
      analytics.registerMLCollector(collector);
      collector.start();

      analytics.track('event_1', {});
      analytics.unregisterMLCollector();
      analytics.track('event_2', {});

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('event_1');
    });

    it('handles track() with no properties', () => {
      analytics.registerMLCollector(collector);
      collector.start();

      analytics.track('simple_event');

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].properties).toEqual({});
    });

    it('handles track() with undefined properties', () => {
      analytics.registerMLCollector(collector);
      collector.start();

      analytics.track('event_with_undefined', undefined);

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].properties).toEqual({});
    });

    it('allows re-registration with a new collector', () => {
      const collector1 = new SessionEventsCollector();
      const collector2 = new SessionEventsCollector();

      analytics.registerMLCollector(collector1);
      collector1.start();
      analytics.track('event_for_collector_1', {});

      analytics.registerMLCollector(collector2);
      collector2.start();
      analytics.track('event_for_collector_2', {});

      expect(collector1.getEvents()).toHaveLength(1);
      expect(collector1.getEvents()[0].type).toBe('event_for_collector_1');

      expect(collector2.getEvents()).toHaveLength(1);
      expect(collector2.getEvents()[0].type).toBe('event_for_collector_2');
    });
  });

  describe('track() in production vs development', () => {
    // Note: These tests verify ML collection works regardless of PROD/DEV mode
    // The mixpanel.track() call to the actual Mixpanel service is gated by isProduction,
    // but ML collection happens regardless

    it('captures for ML even in development mode (import.meta.env.PROD = false)', () => {
      // In test environment, PROD is false by default
      analytics.registerMLCollector(collector);
      collector.start();

      analytics.track('dev_event', { env: 'development' });

      // ML collection should still work
      expect(collector.getEvents()).toHaveLength(1);
    });
  });
});
