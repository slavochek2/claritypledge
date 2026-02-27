/**
 * @file p458-auth-gate-utils.test.ts
 * @description Unit tests for P458: Anonymous User Auth Gate with Context Preservation
 *
 * Tests the utility functions that will be created for the auth-gate redirect flow:
 *   - `buildAuthGateUrl(action, params)` — builds the /signup redirect URL with all context params
 *   - `isValidPosition(value)` — validates the position enum against allowed values
 *   - `isValidPointId(id)` — validates UUID v4 format before DB call
 *   - `parseAuthGateIntent(searchParams)` — parses intent from URL params on the callback side
 *
 * Security requirement from spec §Security Review:
 *   - `pointId` must be validated as UUID format before any DB call
 *   - `value` (position) must be validated against the enum allowlist
 *
 * NOTE: Functions will live in `src/lib/auth-gate-utils.ts` (to be created in P458 impl).
 * Until then, this file uses stubs that mirror the spec contract exactly.
 * Replace stubs with real imports once the implementation ships:
 *   import { buildAuthGateUrl, isValidPosition, isValidPointId, parseAuthGateIntent }
 *     from '@/lib/auth-gate-utils';
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PositionValue = 'agree' | 'disagree' | 'neutral';

type AuthGateAction =
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

type AuthGateParams =
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

type ParsedIntent = ParsedSetPositionIntent | ParsedOtherIntent | null;

// ---------------------------------------------------------------------------
// Stubs — mirror spec contract (remove after implementation)
// TODO(p458-impl): Replace with real import from '@/lib/auth-gate-utils'
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_POSITIONS: PositionValue[] = ['agree', 'disagree', 'neutral'];

function isValidPosition(value: string | null | undefined): value is PositionValue {
  if (!value) return false;
  return (VALID_POSITIONS as string[]).includes(value);
}

function isValidPointId(id: string | null | undefined): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id);
}

function buildAuthGateUrl(params: AuthGateParams): string {
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

function parseAuthGateIntent(searchParams: URLSearchParams): ParsedIntent {
  const action = searchParams.get('action') as AuthGateAction | null;
  if (!action) return null;

  if (action === 'set-position') {
    const pointId = searchParams.get('pointId');
    const position = searchParams.get('position');
    const redirect = searchParams.get('redirect');

    if (!isValidPointId(pointId) || !isValidPosition(position) || !redirect) {
      return null;
    }

    return {
      action: 'set-position',
      pointId: pointId!,
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
// Tests — isValidPosition
// ---------------------------------------------------------------------------

describe('isValidPosition()', () => {
  it("returns true for 'agree'", () => {
    expect(isValidPosition('agree')).toBe(true);
  });

  it("returns true for 'disagree'", () => {
    expect(isValidPosition('disagree')).toBe(true);
  });

  it("returns true for 'neutral'", () => {
    expect(isValidPosition('neutral')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidPosition('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidPosition(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidPosition(undefined)).toBe(false);
  });

  it("returns false for 'unsure' (not the same position enum used in auth gate)", () => {
    // The auth gate uses 'neutral' not 'unsure' — these are different enums.
    // 'unsure' is the internal DB enum; 'neutral' is the URL param contract.
    expect(isValidPosition('unsure')).toBe(false);
  });

  it('returns false for arbitrary strings', () => {
    expect(isValidPosition('yes')).toBe(false);
    expect(isValidPosition('AGREE')).toBe(false);
    expect(isValidPosition('maybe')).toBe(false);
  });

  it('returns false for SQL injection attempt', () => {
    expect(isValidPosition("'; DROP TABLE point_positions; --")).toBe(false);
  });

  it('returns false for space-padded valid value', () => {
    expect(isValidPosition(' agree')).toBe(false);
    expect(isValidPosition('agree ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — isValidPointId
// ---------------------------------------------------------------------------

describe('isValidPointId()', () => {
  it('returns true for a valid UUID v4', () => {
    expect(isValidPointId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns true for another valid UUID v4', () => {
    expect(isValidPointId('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidPointId(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidPointId(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidPointId('')).toBe(false);
  });

  it('returns false for arbitrary non-UUID string', () => {
    expect(isValidPointId('not-a-uuid')).toBe(false);
  });

  it('returns false for integer string', () => {
    expect(isValidPointId('12345')).toBe(false);
  });

  it('returns false for UUID-like string with wrong version digit', () => {
    // Version digit must be 4 for UUID v4
    expect(isValidPointId('550e8400-e29b-31d4-a716-446655440000')).toBe(false);
  });

  it('returns false for UUID with extra characters', () => {
    expect(isValidPointId('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
  });

  it('returns false for UUID with missing hyphens', () => {
    expect(isValidPointId('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('returns false for SQL injection attempt in ID field', () => {
    expect(isValidPointId("' OR '1'='1")).toBe(false);
  });

  it('returns false for URL-encoded UUID (contains %)', () => {
    expect(isValidPointId('550e8400%2de29b-41d4-a716-446655440000')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — buildAuthGateUrl
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('buildAuthGateUrl() — action: set-position', () => {
  it('returns a URL starting with /signup', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
    });
    expect(url).toMatch(/^\/signup\?/);
  });

  it('includes action=set-position in the URL', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
    });
    expect(url).toContain('action=set-position');
  });

  it('includes pointId in the URL', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
    });
    expect(url).toContain(`pointId=${VALID_UUID}`);
  });

  it('includes position in the URL', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'disagree',
      redirect: `/point/${VALID_UUID}`,
    });
    expect(url).toContain('position=disagree');
  });

  it('includes redirect in the URL', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
    });
    expect(url).toContain('redirect=');
    expect(url).toContain(encodeURIComponent(`/point/${VALID_UUID}`));
  });

  it('includes pointTitle when provided', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
      pointTitle: 'Climate change is primarily caused by human activity',
    });
    expect(url).toContain('pointTitle=');
    expect(url).toContain('Climate');
  });

  it('truncates pointTitle to 100 characters', () => {
    const longTitle = 'A'.repeat(150);
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
      pointTitle: longTitle,
    });
    // Decode and check the pointTitle param length
    const sp = new URLSearchParams(url.split('?')[1]);
    const encodedTitle = sp.get('pointTitle');
    expect(encodedTitle!.length).toBeLessThanOrEqual(100);
  });

  it('omits pointTitle when not provided', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'neutral',
      redirect: `/point/${VALID_UUID}`,
    });
    const sp = new URLSearchParams(url.split('?')[1]);
    expect(sp.get('pointTitle')).toBeNull();
  });

  it('builds correct URL for all three position values', () => {
    const positions: PositionValue[] = ['agree', 'disagree', 'neutral'];
    for (const position of positions) {
      const url = buildAuthGateUrl({
        action: 'set-position',
        pointId: VALID_UUID,
        position,
        redirect: `/point/${VALID_UUID}`,
      });
      expect(url).toContain(`position=${position}`);
    }
  });
});

describe('buildAuthGateUrl() — action: start-story', () => {
  it('includes action=start-story', () => {
    const url = buildAuthGateUrl({
      action: 'start-story',
      pointId: VALID_UUID,
    });
    expect(url).toContain('action=start-story');
  });

  it('includes pointId', () => {
    const url = buildAuthGateUrl({
      action: 'start-story',
      pointId: VALID_UUID,
    });
    expect(url).toContain(`pointId=${VALID_UUID}`);
  });
});

describe('buildAuthGateUrl() — action: open-chat', () => {
  it('includes action=open-chat', () => {
    const url = buildAuthGateUrl({
      action: 'open-chat',
      pointId: VALID_UUID,
    });
    expect(url).toContain('action=open-chat');
  });
});

describe('buildAuthGateUrl() — action: join-session', () => {
  it('includes action=join-session and roomId', () => {
    const url = buildAuthGateUrl({
      action: 'join-session',
      roomId: VALID_UUID,
    });
    expect(url).toContain('action=join-session');
    expect(url).toContain(`roomId=${VALID_UUID}`);
  });
});

describe('buildAuthGateUrl() — action: create-story', () => {
  it('includes action=create-story and redirect=/me', () => {
    const url = buildAuthGateUrl({
      action: 'create-story',
      redirect: '/me',
    });
    expect(url).toContain('action=create-story');
    expect(url).toContain('redirect=');
    expect(url).toContain('%2Fme');
  });
});

// ---------------------------------------------------------------------------
// Tests — parseAuthGateIntent
// ---------------------------------------------------------------------------

describe('parseAuthGateIntent() — action: set-position', () => {
  it('returns parsed intent for valid set-position params', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).not.toBeNull();
    expect(intent?.action).toBe('set-position');
  });

  it('returns pointId, position, and redirect from parsed intent', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'disagree',
      redirect: `/point/${VALID_UUID}`,
    });
    const intent = parseAuthGateIntent(sp) as ParsedSetPositionIntent;
    expect(intent.pointId).toBe(VALID_UUID);
    expect(intent.position).toBe('disagree');
    expect(intent.redirect).toBe(`/point/${VALID_UUID}`);
  });

  it('returns null when pointId is not a valid UUID', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: 'not-a-uuid',
      position: 'agree',
      redirect: `/point/not-a-uuid`,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('returns null when position is not a valid enum value', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'unsure',
      redirect: `/point/${VALID_UUID}`,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('returns null when redirect is missing', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('returns null when pointId is missing', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      position: 'agree',
      redirect: '/point/something',
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('returns null when action param is absent', () => {
    const sp = new URLSearchParams({
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('handles SQL injection attempt in position param — returns null', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: VALID_UUID,
      position: "'; DROP TABLE point_positions; --",
      redirect: `/point/${VALID_UUID}`,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('handles SQL injection attempt in pointId param — returns null', () => {
    const sp = new URLSearchParams({
      action: 'set-position',
      pointId: "' OR '1'='1",
      position: 'agree',
      redirect: `/point/anything`,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });

  it('parses all three valid position values correctly', () => {
    const positions: PositionValue[] = ['agree', 'disagree', 'neutral'];
    for (const position of positions) {
      const sp = new URLSearchParams({
        action: 'set-position',
        pointId: VALID_UUID,
        position,
        redirect: `/point/${VALID_UUID}`,
      });
      const intent = parseAuthGateIntent(sp) as ParsedSetPositionIntent;
      expect(intent).not.toBeNull();
      expect(intent.position).toBe(position);
    }
  });
});

describe('parseAuthGateIntent() — other actions', () => {
  it('parses action: start-story with pointId', () => {
    const sp = new URLSearchParams({
      action: 'start-story',
      pointId: VALID_UUID,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent?.action).toBe('start-story');
  });

  it('parses action: open-chat with pointId', () => {
    const sp = new URLSearchParams({
      action: 'open-chat',
      pointId: VALID_UUID,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent?.action).toBe('open-chat');
  });

  it('parses action: join-session with roomId', () => {
    const sp = new URLSearchParams({
      action: 'join-session',
      roomId: VALID_UUID,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent?.action).toBe('join-session');
  });

  it('parses action: create-story with redirect', () => {
    const sp = new URLSearchParams({
      action: 'create-story',
      redirect: '/me',
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent?.action).toBe('create-story');
  });

  it('returns null for an unknown action value', () => {
    const sp = new URLSearchParams({
      action: 'hack-the-planet',
      pointId: VALID_UUID,
    });
    const intent = parseAuthGateIntent(sp);
    expect(intent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests: buildAuthGateUrl → parseAuthGateIntent
// ---------------------------------------------------------------------------

describe('round-trip: buildAuthGateUrl → parseAuthGateIntent', () => {
  it('set-position round-trip preserves all fields', () => {
    const url = buildAuthGateUrl({
      action: 'set-position',
      pointId: VALID_UUID,
      position: 'agree',
      redirect: `/point/${VALID_UUID}`,
      pointTitle: 'Climate change is real',
    });
    const sp = new URLSearchParams(url.split('?')[1]);
    const intent = parseAuthGateIntent(sp) as ParsedSetPositionIntent;

    expect(intent).not.toBeNull();
    expect(intent.action).toBe('set-position');
    expect(intent.pointId).toBe(VALID_UUID);
    expect(intent.position).toBe('agree');
    expect(intent.redirect).toBe(`/point/${VALID_UUID}`);
  });

  it('start-story round-trip preserves action and pointId', () => {
    const url = buildAuthGateUrl({
      action: 'start-story',
      pointId: VALID_UUID,
    });
    const sp = new URLSearchParams(url.split('?')[1]);
    const intent = parseAuthGateIntent(sp);

    expect(intent).not.toBeNull();
    expect(intent?.action).toBe('start-story');
  });
});
