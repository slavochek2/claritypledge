/**
 * @file room-capture-core.ts
 * @description P1307 Architecture Decision 7 — the pure half of room capture: the state
 * machine, the pause/resume predicates, the one-capture-per-browser lock, and the constants
 * those encode. Everything here is testable without a microphone, an AudioContext or a
 * Supabase client, and this module deliberately imports none of them.
 *
 * Kept apart from room-capture-context.tsx for a concrete reason, not tidiness: the Supabase
 * client takes a Web Lock of its own when it loads (its auth token lock), so any module that
 * imports it makes "exactly one lock request, for this room" unobservable.
 */
import { getActiveSessionFromStorage } from '@/app/contexts/live-session-context';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Decision 2 correction: the paused heartbeat. Must stay well inside the sweep's 10 minutes. */
export const PAUSED_HEARTBEAT_INTERVAL_MS = 2 * 60_000;

/**
 * D11: the per-person cap, from this member's own joined_at. MUST equal
 * ROOM_MAX_DURATION_MINUTES (transcribe-slice) and c_member_cap (the sweep). A dev build may
 * shorten it via VITE_P1307_CAPTURE_CAP_MINUTES so the cap AC can be exercised in minutes; a
 * production build ignores the override.
 */
export const CAPTURE_CAP_MINUTES = (() => {
  const override = Number(import.meta.env.VITE_P1307_CAPTURE_CAP_MINUTES);
  return import.meta.env.DEV && Number.isFinite(override) && override > 0 ? override : 180;
})();

/** One full slice queue's worth of failed or dropped slices — the room page's own threshold. */
export const STALL_AFTER_CONSECUTIVE_FAILURES = 3;

// ─── State machine ───────────────────────────────────────────────────────────

export type CapturePhase = 'idle' | 'starting' | 'capturing' | 'paused' | 'stalled' | 'ending' | 'observing';

export interface CaptureState {
  phase: CapturePhase;
  roomId: string | null;
  consecutiveFailures: number;
  roomCode?: string | null;
  memberId?: string | null;
  eventId?: string | null;
  joinedAt?: string | null;
}

export interface CaptureRoomInfo {
  id: string;
  code: string;
  eventId: string | null;
}

export interface CaptureMemberInfo {
  id: string;
  /** The consent gate: capture starts only when the server has recorded consent. */
  consentGivenAt?: string | null;
  joinedAt?: string | null;
}

export type CaptureAction =
  | { type: 'JOIN_REQUESTED'; roomId?: string | null; eventId?: string | null }
  | { type: 'JOIN_SUCCEEDED'; member: CaptureMemberInfo; room?: CaptureRoomInfo; observeOnly?: boolean }
  | { type: 'JOIN_FAILED'; message: string }
  | { type: 'ATTACH'; room: CaptureRoomInfo; member: CaptureMemberInfo; observeOnly: boolean }
  | { type: 'LOCK_ACQUIRED' }
  | { type: 'PAUSE_REQUESTED'; reason: string }
  | { type: 'RESUME_REQUESTED' }
  | { type: 'SLICE_SUCCEEDED' }
  | { type: 'SLICE_FAILED' }
  | { type: 'SLICE_REFUSED_410' }
  | { type: 'END_REQUESTED' }
  | { type: 'TEARDOWN_COMPLETE' }
  | { type: 'AUTH_CHANGED' };

export const INITIAL_CAPTURE_STATE: CaptureState = {
  phase: 'idle',
  roomId: null,
  consecutiveFailures: 0,
  roomCode: null,
  memberId: null,
  eventId: null,
  joinedAt: null,
};

/** Phases in which a capture exists for this person, whether or not this tab holds the mic. */
export const LIVE_PHASES: ReadonlySet<CapturePhase> = new Set(['capturing', 'stalled', 'paused', 'observing']);

function running(
  state: CaptureState,
  room: CaptureRoomInfo | undefined,
  member: CaptureMemberInfo,
  phase: CapturePhase,
): CaptureState {
  return {
    ...state,
    phase,
    roomId: room?.id ?? state.roomId,
    roomCode: room?.code ?? state.roomCode ?? null,
    eventId: room ? room.eventId : state.eventId ?? null,
    memberId: member.id,
    joinedAt: member.joinedAt ?? state.joinedAt ?? null,
    consecutiveFailures: 0,
  };
}

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'JOIN_REQUESTED':
      return state.phase === 'idle'
        ? { ...INITIAL_CAPTURE_STATE, phase: 'starting', roomId: action.roomId ?? null, eventId: action.eventId ?? null }
        : state;

    case 'JOIN_SUCCEEDED':
      if (state.phase !== 'starting') return state;
      // A member row without consent_given_at never starts capture.
      if (!action.member.consentGivenAt) return { ...INITIAL_CAPTURE_STATE };
      return running(state, action.room, action.member, action.observeOnly ? 'observing' : 'capturing');

    case 'JOIN_FAILED':
      return state.phase === 'starting' ? { ...INITIAL_CAPTURE_STATE } : state;

    case 'ATTACH':
      if (state.phase !== 'idle' || !action.member.consentGivenAt) return state;
      return running(state, action.room, action.member, action.observeOnly ? 'observing' : 'capturing');

    case 'LOCK_ACQUIRED':
      return state.phase === 'observing' ? { ...state, phase: 'capturing', consecutiveFailures: 0 } : state;

    case 'PAUSE_REQUESTED':
      return state.phase === 'capturing' || state.phase === 'stalled'
        ? { ...state, phase: 'paused', consecutiveFailures: 0 }
        : state;

    case 'RESUME_REQUESTED':
      // Pausing never STARTS a capture that was not running.
      return state.phase === 'paused' ? { ...state, phase: 'capturing' } : state;

    case 'SLICE_SUCCEEDED':
      return state.phase === 'capturing' || state.phase === 'stalled'
        ? { ...state, phase: 'capturing', consecutiveFailures: 0 }
        : state;

    case 'SLICE_FAILED': {
      if (state.phase !== 'capturing' && state.phase !== 'stalled') return state;
      const consecutiveFailures = state.consecutiveFailures + 1;
      return {
        ...state,
        consecutiveFailures,
        phase: consecutiveFailures >= STALL_AFTER_CONSECUTIVE_FAILURES ? 'stalled' : state.phase,
      };
    }

    case 'SLICE_REFUSED_410':
    case 'END_REQUESTED':
      return state.phase === 'idle' ? state : { ...state, phase: 'ending' };

    case 'TEARDOWN_COMPLETE':
    case 'AUTH_CHANGED':
      return { ...INITIAL_CAPTURE_STATE };
  }
}

// ─── Pause / resume predicates ───────────────────────────────────────────────

/** D3: room capture pauses on /live and /live/:code — and nowhere that merely starts with "live". */
export function shouldPauseForLocation(pathname: string): boolean {
  return /^\/live(\/|$)/.test(pathname);
}

/** The resume gate's second half: a /live session is still active in this browser
 *  (`cp_active_session`, localStorage), e.g. after browser Back out of a session. */
export function hasActiveLiveSession(): boolean {
  return getActiveSessionFromStorage() !== null;
}

// ─── One capture per browser ─────────────────────────────────────────────────

export interface CaptureLock {
  acquired: boolean;
  release: () => void;
}

/**
 * Web Locks: an exclusive, non-blocking lock per room. Released automatically when the tab
 * closes or crashes, so there is no lease to expire. A second tab's request resolves "not
 * acquired" at once and that tab observes. A browser without the API cannot coordinate tabs;
 * it captures, which is the pre-P1307 behaviour.
 */
export async function acquireCaptureLock(roomId: string): Promise<CaptureLock> {
  if (typeof navigator === 'undefined' || !navigator.locks) return { acquired: true, release: () => {} };
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const acquired = await new Promise<boolean>((resolve) => {
    void navigator.locks
      .request(`cp-room-capture-${roomId}`, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return held;
      })
      .catch(() => resolve(false));
  });
  return { acquired, release: acquired ? release : () => {} };
}
