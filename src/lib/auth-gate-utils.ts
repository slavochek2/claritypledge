/**
 * @file auth-gate-utils.ts
 * @description Utility functions for P458: Anonymous User Auth Gate with Context Preservation
 *
 * Provides URL building, validation, and parsing for the auth-gate redirect flow:
 * - Anonymous user clicks position → redirect to /signup with context params
 * - After auth, AuthCallbackPage reads params and auto-saves the position
 *
 * Position value mapping:
 * - DB uses 'unsure' for the neutral position
 * - URL params use 'neutral' (the auth-gate contract)
 * - toAuthGatePosition/fromAuthGatePosition handle this translation
 */

import { analytics } from '@/lib/mixpanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PositionValue = 'agree' | 'disagree' | 'neutral';

export type AuthGateAction =
  | 'set-position'
  | 'start-story'
  | 'open-chat'
  | 'join-session'
  | 'create-story';

interface SetPositionParams {
  action: 'set-position';
  pointId: string;
  position: PositionValue;
  redirect: string;
  pointTitle?: string;
}

interface StartStoryParams {
  action: 'start-story';
  pointId: string;
  redirect?: string;
}

interface OpenChatParams {
  action: 'open-chat';
  pointId: string;
  redirect?: string;
}

interface JoinSessionParams {
  action: 'join-session';
  roomId: string;
  redirect?: string;
}

interface CreateStoryParams {
  action: 'create-story';
  redirect: string;
}

export type AuthGateParams =
  | SetPositionParams
  | StartStoryParams
  | OpenChatParams
  | JoinSessionParams
  | CreateStoryParams;

interface ParsedSetPositionIntent {
  action: 'set-position';
  pointId: string;
  position: PositionValue;
  redirect: string;
}

interface ParsedOtherIntent {
  action: Exclude<AuthGateAction, 'set-position'>;
  pointId?: string;
  roomId?: string;
  redirect?: string;
}

export type ParsedIntent = ParsedSetPositionIntent | ParsedOtherIntent | null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_POSITIONS: PositionValue[] = ['agree', 'disagree', 'neutral'];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidPosition(value: string | null | undefined): value is PositionValue {
  if (!value) return false;
  return (VALID_POSITIONS as string[]).includes(value);
}

export function isValidPointId(id: string | null | undefined): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id);
}

/** Generic UUID-shape check — same regex as isValidPointId, non-misleading name for non-point ids. */
export const isValidUUID = isValidPointId;

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

export function buildAuthGateUrl(params: AuthGateParams): string {
  analytics.track('auth_gate_triggered', { context: params.action, redirect_path: window.location.pathname });

  const base = '/signup';
  const sp = new URLSearchParams();
  sp.set('action', params.action);

  if (params.action === 'set-position') {
    sp.set('pointId', params.pointId);
    sp.set('position', params.position);
    sp.set('redirect', params.redirect);
    if (params.pointTitle) {
      // Truncate to 100 chars per Decision 4 in spec
      sp.set('pointTitle', params.pointTitle.slice(0, 100));
    }
  } else if (params.action === 'start-story' || params.action === 'open-chat') {
    sp.set('pointId', params.pointId);
    if (params.redirect) sp.set('redirect', params.redirect);
  } else if (params.action === 'join-session') {
    sp.set('roomId', params.roomId);
    if (params.redirect) sp.set('redirect', params.redirect);
  } else if (params.action === 'create-story') {
    sp.set('redirect', params.redirect);
  }

  return `${base}?${sp.toString()}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseAuthGateIntent(searchParams: URLSearchParams): ParsedIntent {
  const action = searchParams.get('action') as AuthGateAction | null;
  if (!action) return null;

  if (action === 'set-position') {
    const pointId = searchParams.get('pointId');
    const position = searchParams.get('position');
    const redirect = searchParams.get('redirect');

    if (!isValidPointId(pointId) || !isValidPosition(position) || !redirect) {
      return null;
    }
    if (!pointId) return null; // Unreachable after isValidPointId, but satisfies TS narrowing

    return {
      action: 'set-position',
      pointId,
      position: position as PositionValue,
      redirect,
    };
  }

  if (action === 'start-story' || action === 'open-chat') {
    const pointId = searchParams.get('pointId');
    const redirect = searchParams.get('redirect') ?? undefined;
    return { action, pointId: pointId ?? undefined, redirect };
  }

  if (action === 'join-session') {
    const roomId = searchParams.get('roomId');
    const redirect = searchParams.get('redirect') ?? undefined;
    return { action, roomId: roomId ?? undefined, redirect };
  }

  if (action === 'create-story') {
    const redirect = searchParams.get('redirect') ?? undefined;
    return { action, redirect };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Position mapping (DB ↔ URL param)
// ---------------------------------------------------------------------------

/** Convert DB position value to auth-gate URL position value. 'unsure' → 'neutral' */
export function toAuthGatePosition(dbPosition: string): PositionValue | null {
  if (dbPosition === 'unsure') return 'neutral';
  if (dbPosition === 'agree' || dbPosition === 'disagree' || dbPosition === 'neutral') {
    return dbPosition as PositionValue;
  }
  // Map granular positions to their group
  if (dbPosition === 'strongly_agree' || dbPosition === 'somewhat_agree') return 'agree';
  if (dbPosition === 'strongly_disagree' || dbPosition === 'somewhat_disagree') return 'disagree';
  return null;
}

/** Convert auth-gate URL position value to DB position value. 'neutral' → 'unsure' */
export function fromAuthGatePosition(urlPosition: PositionValue): string {
  if (urlPosition === 'neutral') return 'unsure';
  return urlPosition;
}

/** Get the human-readable verb for a position value (for context banner). */
export function getPositionVerb(position: string): string {
  switch (position) {
    case 'agree': return 'agree with';
    case 'disagree': return 'disagree with';
    case 'neutral': return 'mark as unsure on';
    default: return 'take a position on';
  }
}
