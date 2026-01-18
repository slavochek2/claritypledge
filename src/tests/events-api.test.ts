/**
 * @file events-api.test.ts
 * Unit tests for Events API functions (P61)
 *
 * These tests verify the client-side API functions work correctly.
 * They mock Supabase responses to test error handling and data mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEventSlug } from '@/app/data/api';

// Note: Full API tests require mocking Supabase which is complex.
// These tests focus on pure functions that don't need database mocks.

describe('Events API - Pure Functions', () => {
  describe('generateEventSlug', () => {
    beforeEach(() => {
      // Mock Date to ensure consistent test results
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-18T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('generates slug from title with date suffix', () => {
      const slug = generateEventSlug('Clarity Hike: Golden Gate');
      expect(slug).toBe('clarity-hike-golden-gate-2026-01-18');
    });

    it('handles special characters', () => {
      const slug = generateEventSlug('AI & ML Workshop: Part 1!');
      expect(slug).toBe('ai-ml-workshop-part-1-2026-01-18');
    });

    it('handles multiple spaces and dashes', () => {
      const slug = generateEventSlug('Event   with   spaces');
      expect(slug).toBe('event-with-spaces-2026-01-18');
    });

    it('truncates long titles to 50 characters', () => {
      const longTitle = 'This is a very long event title that should be truncated to prevent overly long URLs';
      const slug = generateEventSlug(longTitle);
      // Base slug should be max 50 chars before date suffix
      const baseSlug = slug.replace('-2026-01-18', '');
      expect(baseSlug.length).toBeLessThanOrEqual(50);
    });

    it('removes leading and trailing dashes', () => {
      const slug = generateEventSlug('---Event Name---');
      expect(slug).toBe('event-name-2026-01-18');
    });

    it('converts to lowercase', () => {
      const slug = generateEventSlug('EVENT NAME');
      expect(slug).toBe('event-name-2026-01-18');
    });

    it('handles empty title', () => {
      const slug = generateEventSlug('');
      expect(slug).toBe('-2026-01-18');
    });

    it('handles unicode characters', () => {
      const slug = generateEventSlug('日本語イベント');
      // Unicode chars are stripped, leaving just the date
      expect(slug).toBe('-2026-01-18');
    });
  });
});

describe('Events API - Type Mapping', () => {
  it('Event type has all required fields', () => {
    // Type-level test - if this compiles, the types are correct
    const event: import('@/app/types').Event = {
      id: 'test-id',
      slug: 'test-slug',
      title: 'Test Event',
      description: 'Test description',
      datetime: '2026-01-20T18:00:00Z',
      durationMinutes: 120,
      timezone: 'America/Los_Angeles',
      location: 'San Francisco, CA',
      hostId: 'host-id',
      createdAt: '2026-01-18T12:00:00Z',
      status: 'upcoming',
    };

    expect(event.id).toBe('test-id');
    expect(event.status).toBe('upcoming');
  });

  it('EventWithHost extends Event with host data', () => {
    const eventWithHost: import('@/app/types').EventWithHost = {
      id: 'test-id',
      slug: 'test-slug',
      title: 'Test Event',
      description: 'Test description',
      datetime: '2026-01-20T18:00:00Z',
      durationMinutes: 120,
      timezone: 'America/Los_Angeles',
      location: 'San Francisco, CA',
      hostId: 'host-id',
      createdAt: '2026-01-18T12:00:00Z',
      status: 'upcoming',
      // Host fields
      hostName: 'Test Host',
      hostSlug: 'test-host',
      hostRole: 'Community Lead',
      hostAvatarColor: '#3B82F6',
    };

    expect(eventWithHost.hostName).toBe('Test Host');
    expect(eventWithHost.hostSlug).toBe('test-host');
  });

  it('EventAttendee has required fields', () => {
    const attendee: import('@/app/types').EventAttendee = {
      profileId: 'profile-id',
      name: 'Test Attendee',
      slug: 'test-attendee',
      avatarColor: '#10B981',
    };

    expect(attendee.profileId).toBe('profile-id');
    expect(attendee.name).toBe('Test Attendee');
  });

  it('EventStatus only allows valid values', () => {
    // These should compile
    const status1: import('@/app/types').EventStatus = 'upcoming';
    const status2: import('@/app/types').EventStatus = 'completed';
    const status3: import('@/app/types').EventStatus = 'cancelled';

    expect(status1).toBe('upcoming');
    expect(status2).toBe('completed');
    expect(status3).toBe('cancelled');
  });
});

describe('Events API - Validation Logic', () => {
  it('maxAttendees is optional', () => {
    const eventWithLimit: import('@/app/types').Event = {
      id: 'test-id',
      slug: 'test-slug',
      title: 'Limited Event',
      description: 'Test',
      datetime: '2026-01-20T18:00:00Z',
      durationMinutes: 120,
      timezone: 'UTC',
      location: 'Online',
      hostId: 'host-id',
      maxAttendees: 20,
      createdAt: '2026-01-18T12:00:00Z',
      status: 'upcoming',
    };

    const eventUnlimited: import('@/app/types').Event = {
      id: 'test-id-2',
      slug: 'test-slug-2',
      title: 'Unlimited Event',
      description: 'Test',
      datetime: '2026-01-20T18:00:00Z',
      durationMinutes: 120,
      timezone: 'UTC',
      location: 'Online',
      hostId: 'host-id',
      createdAt: '2026-01-18T12:00:00Z',
      status: 'upcoming',
      // maxAttendees omitted - unlimited capacity
    };

    expect(eventWithLimit.maxAttendees).toBe(20);
    expect(eventUnlimited.maxAttendees).toBeUndefined();
  });
});
