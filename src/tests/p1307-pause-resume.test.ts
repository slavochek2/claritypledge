/**
 * @file p1307-pause-resume.test.ts
 * @description P1307 Decision 3 (spec Part 6) / Architecture Decision 7's correction: the
 * pause/resume rule — pause on `/live` or `/live/:code`, during explain-back capture mount,
 * and on immersive letter screens (D13); resume only when the location has left `/live`
 * AND `cp_active_session` (localStorage — corrected from sessionStorage, verified this
 * session against `live-session-context.tsx:5,20,30`) is absent; "was running before"
 * persists in `sessionStorage`; the paused heartbeat calls `touch_transcribe_room_capture`
 * every 2 minutes and sends no slices.
 *
 * ASSUMPTION, stated because the module does not exist yet: the location-based and
 * active-session-based predicates are exported as pure functions
 * `shouldPauseForLocation(pathname)` / `hasActiveLiveSession()` from the new
 * `src/app/contexts/room-capture-context.tsx`, so the ROUTING RULE is unit-testable without
 * mounting the whole provider (which needs AudioContext/getUserMedia, unavailable in
 * jsdom — same constraint slice-recorder.test.ts documents for createSliceRecorder). If
 * /dev inlines this logic instead of factoring it out, this file's imports are what need
 * to change; the rule table below is the spec content.
 *
 * `getActiveSessionFromStorage` / `saveActiveSessionToStorage` / `clearActiveSessionFromStorage`
 * ARE real, already-exported functions (`src/app/contexts/live-session-context.tsx`) —
 * used directly here rather than mocked, since Decision 7's correction says the provider
 * reads through exactly this file's helper.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveActiveSessionToStorage,
  clearActiveSessionFromStorage,
} from '@/app/contexts/live-session-context';
// /dev: the pure predicates live in room-capture-core (re-exported by room-capture-context).
import { shouldPauseForLocation, hasActiveLiveSession, PAUSED_HEARTBEAT_INTERVAL_MS } from '@/app/contexts/room-capture-core';

beforeEach(() => {
  clearActiveSessionFromStorage();
});

describe('P1307: shouldPauseForLocation — where capture pauses', () => {
  it('pauses on /live', () => {
    expect(shouldPauseForLocation('/live')).toBe(true);
  });

  it('pauses on /live/:code', () => {
    expect(shouldPauseForLocation('/live/ABC123')).toBe(true);
  });

  it('does NOT pause on /meet, /feed, a profile page, or /transcribe/:code', () => {
    for (const path of ['/events/my-event/meet', '/feed', '/p/someone', '/transcribe/XYZ789']) {
      expect(shouldPauseForLocation(path), path).toBe(false);
    }
  });

  it('does NOT pause on a route that merely starts with "/live" as a substring, e.g. /livesomething', () => {
    // Guards against a naive startsWith('/live') implementation matching an unrelated route.
    expect(shouldPauseForLocation('/livestream-unrelated')).toBe(false);
  });
});

describe('P1307: hasActiveLiveSession — the resume gate\'s second half', () => {
  it('is true when cp_active_session is present in localStorage', () => {
    saveActiveSessionToStorage({ code: 'ABC123', partnerName: 'Bob', role: 'creator', timestamp: new Date().toISOString() });
    expect(hasActiveLiveSession()).toBe(true);
  });

  it('is false once cp_active_session is cleared', () => {
    saveActiveSessionToStorage({ code: 'ABC123', partnerName: 'Bob', role: 'creator', timestamp: new Date().toISOString() });
    clearActiveSessionFromStorage();
    expect(hasActiveLiveSession()).toBe(false);
  });

  it('is false when nothing was ever saved', () => {
    expect(hasActiveLiveSession()).toBe(false);
  });
});

describe('P1307: the resume gate is BOTH conditions, not either', () => {
  // "Resume when the location has left /live AND no /live session is still active." Browser
  // Back out of a still-open session must NOT resume — location changed, but
  // cp_active_session is still present.
  it('does not resume on location change alone if a /live session is still active (Back button case)', () => {
    saveActiveSessionToStorage({ code: 'ABC123', partnerName: 'Bob', role: 'creator', timestamp: new Date().toISOString() });
    const leftLive = !shouldPauseForLocation('/meet');
    const sessionGone = !hasActiveLiveSession();
    expect(leftLive, 'control: this location must read as "left /live"').toBe(true);
    expect(sessionGone, 'the whole point: resume must be gated on this being false while a session is active').toBe(false);
    // The combined resume decision (left AND gone) must therefore be false.
    expect(leftLive && sessionGone).toBe(false);
  });

  it('resumes once the location has left /live AND the session has ended', () => {
    clearActiveSessionFromStorage(); // session ended
    const leftLive = !shouldPauseForLocation('/meet');
    const sessionGone = !hasActiveLiveSession();
    expect(leftLive && sessionGone, 'both conditions true must resume').toBe(true);
  });

  it('does not resume while still ON /live, even if cp_active_session happens to be absent', () => {
    // Defensive: an inconsistent state (still on /live, no stored session) must not
    // override the LOCATION half of the gate.
    const leftLive = !shouldPauseForLocation('/live');
    expect(leftLive).toBe(false);
  });
});

describe('P1307: the paused heartbeat cadence', () => {
  it('PAUSED_HEARTBEAT_INTERVAL_MS is 2 minutes', () => {
    // Decision 2 correction: "a lightweight touch_transcribe_room_capture(p_room_id) RPC
    // that the provider calls every 2 minutes while paused."
    expect(PAUSED_HEARTBEAT_INTERVAL_MS).toBe(2 * 60_000);
  });
});
