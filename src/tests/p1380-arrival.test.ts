/**
 * P1380: the arrival question's rules in the app. The same examples as the emails' Deno test
 * (supabase/functions/_shared/p1380-event-emails.test.ts), so the two copies cannot drift.
 */
import { describe, expect, it } from 'vitest';
import {
  arrivalQuestion,
  arrivalWindowOpen,
  isOnlineLocation,
  mapsUrl,
  onTimeLine,
  venueName,
  arrivedLabel,
} from '@/app/prototypes/events/arrival/arrival-text';
import { arrivalApplies } from '@/app/prototypes/events/arrival/ArrivalGate';

const START = '2026-10-06T11:30:00Z'; // 18:30 Bangkok
const night = {
  preparationEnabled: true,
  location: 'Zuzalu library, 4Seas Nimman, Chiang Mai',
  hostId: 'host',
  datetime: START,
  durationMinutes: 120,
  timezone: 'Asia/Bangkok',
};
const t = (min: number) => new Date(new Date(START).getTime() + min * 60_000);

describe('P1380 arrival text', () => {
  it('names the venue when the location starts with a place name', () => {
    expect(venueName(night.location)).toBe('Zuzalu library');
    expect(arrivalQuestion(night.location)).toBe('Have you arrived at Zuzalu library?');
  });
  it('falls back to "Have you arrived?" when there is no place name', () => {
    expect(venueName('12 Nimman Road, Chiang Mai')).toBeNull();
    expect(venueName('Zuzalu library')).toBeNull();
    expect(arrivalQuestion('12 Nimman Road, Chiang Mai')).toBe('Have you arrived?');
  });
  it('treats only http(s) links as online', () => {
    expect(isOnlineLocation('https://meet.google.com/abc')).toBe(true);
    expect(isOnlineLocation(night.location)).toBe(false);
    expect(isOnlineLocation('javascript:alert(1)')).toBe(false);
  });
  it('states the start sharp, doors 15 min before, in the event time zone', () => {
    expect(onTimeLine(night.datetime, night.timezone)).toBe(
      'We start at 18:30 sharp (doors open 18:15). Round 1 pairs whoever is in the room at 18:30; later arrivals join from round 2.',
    );
  });
  it('builds an encoded maps link', () => {
    expect(mapsUrl('A & B, C')).toBe('https://www.google.com/maps/search/?api=1&query=A%20%26%20B%2C%20C');
  });
});

describe('P1380 arrival window and who is asked', () => {
  it('opens an hour before the start and closes at the end', () => {
    expect(arrivalWindowOpen(night, t(-61))).toBe(false);
    expect(arrivalWindowOpen(night, t(-60))).toBe(true);
    expect(arrivalWindowOpen(night, t(120))).toBe(true);
    expect(arrivalWindowOpen(night, t(121))).toBe(false);
  });
  it('asks a registrant of an in-person Preparation-on event during the window', () => {
    expect(arrivalApplies(night, 'anna', t(-10))).toBe(true);
  });
  it('never asks the host, an online event, a Preparation-off event, or outside the window', () => {
    expect(arrivalApplies(night, 'host', t(-10))).toBe(false);
    expect(arrivalApplies({ ...night, location: 'https://zoom.us/j/1' }, 'anna', t(-10))).toBe(false);
    expect(arrivalApplies({ ...night, preparationEnabled: false }, 'anna', t(-10))).toBe(false);
    expect(arrivalApplies(night, 'anna', t(-120))).toBe(false);
    expect(arrivalApplies(night, null, t(-10))).toBe(false);
    expect(arrivalApplies(null, 'anna', t(-10))).toBe(false);
  });
});

describe('P1380 host arrival label', () => {
  it('shows the arrival time in the event time zone', () => {
    expect(arrivedLabel('2026-10-06T11:22:00Z', 'Asia/Bangkok')).toBe('Arrived 18:22');
  });
});
