/**
 * @file p1307-capture-state-machine.test.ts
 * @description P1307 Architecture Decision 7: `RoomCaptureProvider`'s state machine —
 * `idle | starting | capturing | paused | stalled | ending`, a `useReducer` matching the
 * naming convention `transcribe-room-page.tsx`'s own `ViewState` union already uses
 * (`type ViewState = 'loading' | 'consent' | 'joining' | 'room' | 'ended'`, confirmed this
 * session).
 *
 * ASSUMPTION, stated because the module does not exist yet: the reducer is exported as a
 * pure function `captureReducer(state, action)` from the new
 * `src/app/contexts/room-capture-context.tsx`, independent of React — the standard shape
 * for a testable useReducer, and the only way to unit-test a state machine without mounting
 * a provider that needs AudioContext/getUserMedia/Web Locks (none of which jsdom has, per
 * slice-recorder.test.ts's own precedent for the same class of dependency). If /dev
 * structures the reducer differently, this file's IMPORT is what needs to change — the
 * transition table below is the actual spec content and should survive that.
 *
 * Each test below cites the spec line it encodes.
 */
import { describe, it, expect } from 'vitest';
// /dev: the pure state machine lives in room-capture-core (re-exported by room-capture-context),
// which imports no Supabase client — see that file's header.
import { captureReducer, type CaptureState, type CaptureAction } from '@/app/contexts/room-capture-core';

function state(overrides: Partial<CaptureState> = {}): CaptureState {
  return {
    phase: 'idle',
    roomId: null,
    consecutiveFailures: 0,
    ...overrides,
  } as CaptureState;
}

describe('P1307: capture state machine — idle | starting | capturing | paused | stalled | ending', () => {
  it('idle -> starting on a join request', () => {
    const next = captureReducer(state({ phase: 'idle' }), { type: 'JOIN_REQUESTED', roomId: 'r1' } as CaptureAction);
    expect(next.phase).toBe('starting');
  });

  it('starting -> capturing ONLY after the join RPC returns a member row with consent_given_at set', () => {
    // Part 1: "The microphone prompt and both recorders start only after it returns a
    // member row with consent_given_at set."
    const starting = state({ phase: 'starting', roomId: 'r1' });
    const withoutConsent = captureReducer(starting, {
      type: 'JOIN_SUCCEEDED', member: { id: 'm1', consentGivenAt: null },
    } as CaptureAction);
    expect(withoutConsent.phase, 'a member row with consentGivenAt: null must NOT start capture').not.toBe('capturing');

    const withConsent = captureReducer(starting, {
      type: 'JOIN_SUCCEEDED', member: { id: 'm1', consentGivenAt: '2026-09-14T00:00:00Z' },
    } as CaptureAction);
    expect(withConsent.phase).toBe('capturing');
  });

  it('starting -> idle on join failure or timeout, landing on /meet with no bar and no capture', () => {
    const starting = state({ phase: 'starting', roomId: 'r1' });
    const next = captureReducer(starting, { type: 'JOIN_FAILED', message: 'boom' } as CaptureAction);
    expect(next.phase).toBe('idle');
    expect(next.roomId, 'a failed join must not leave a stale roomId behind').toBeNull();
  });

  it('capturing -> paused on entering /live or an explain-back recording (D3)', () => {
    const capturing = state({ phase: 'capturing', roomId: 'r1' });
    const next = captureReducer(capturing, { type: 'PAUSE_REQUESTED', reason: 'live-session' } as CaptureAction);
    expect(next.phase).toBe('paused');
    expect(next.roomId, 'pausing must not forget which room to resume into').toBe('r1');
  });

  it('paused -> capturing on resume, ONLY if it was running before (D3)', () => {
    const paused = state({ phase: 'paused', roomId: 'r1' });
    const next = captureReducer(paused, { type: 'RESUME_REQUESTED' } as CaptureAction);
    expect(next.phase).toBe('capturing');
  });

  it('idle never transitions to capturing on a bare resume — pausing never STARTS a capture that was not already running', () => {
    const idle = state({ phase: 'idle' });
    const next = captureReducer(idle, { type: 'RESUME_REQUESTED' } as CaptureAction);
    expect(next.phase, 'RESUME_REQUESTED against idle must be a no-op, not a fresh start').toBe('idle');
  });

  it('capturing -> stalled after 3 consecutive failed/dropped slices', () => {
    let s = state({ phase: 'capturing', consecutiveFailures: 0 });
    s = captureReducer(s, { type: 'SLICE_FAILED' } as CaptureAction);
    expect(s.phase).toBe('capturing');
    s = captureReducer(s, { type: 'SLICE_FAILED' } as CaptureAction);
    expect(s.phase).toBe('capturing');
    s = captureReducer(s, { type: 'SLICE_FAILED' } as CaptureAction);
    expect(s.phase, 'the THIRD consecutive failure must flip to stalled').toBe('stalled');
  });

  it('a successful slice resets the consecutive-failure counter', () => {
    let s = state({ phase: 'capturing', consecutiveFailures: 2 });
    s = captureReducer(s, { type: 'SLICE_SUCCEEDED' } as CaptureAction);
    expect(s.consecutiveFailures).toBe(0);
    s = captureReducer(s, { type: 'SLICE_FAILED' } as CaptureAction);
    s = captureReducer(s, { type: 'SLICE_FAILED' } as CaptureAction);
    expect(s.phase, 'two failures after a reset must not carry over toward stalled').toBe('capturing');
  });

  it('any phase but idle -> ending -> idle on the FIRST 410 (room ended or too long)', () => {
    // Invariant: "Capture stops at the cap and at room end, on the client — the server
    // refusing slices is not a stop." This is the client honoring exactly that signal.
    const capturing = state({ phase: 'capturing', roomId: 'r1' });
    const ending = captureReducer(capturing, { type: 'SLICE_REFUSED_410' } as CaptureAction);
    expect(['ending', 'idle']).toContain(ending.phase);
    const settled = captureReducer(ending, { type: 'TEARDOWN_COMPLETE' } as CaptureAction);
    expect(settled.phase).toBe('idle');
    expect(settled.roomId).toBeNull();
  });

  it('stalled + a 410 also tears down — the stall state does not block the hard stop', () => {
    const stalled = state({ phase: 'stalled', roomId: 'r1' });
    const next = captureReducer(stalled, { type: 'SLICE_REFUSED_410' } as CaptureAction);
    expect(['ending', 'idle']).toContain(next.phase);
  });

  it('any phase -> idle immediately on an auth-id change (sign-out or a different user)', () => {
    for (const phase of ['starting', 'capturing', 'paused', 'stalled'] as const) {
      const next = captureReducer(state({ phase, roomId: 'r1' }), { type: 'AUTH_CHANGED' } as CaptureAction);
      expect(next.phase, `AUTH_CHANGED from ${phase} must stop capture immediately`).toBe('idle');
      expect(next.roomId).toBeNull();
    }
  });

  it('idle stays idle on AUTH_CHANGED — nothing to stop', () => {
    const next = captureReducer(state({ phase: 'idle' }), { type: 'AUTH_CHANGED' } as CaptureAction);
    expect(next.phase).toBe('idle');
  });
});
