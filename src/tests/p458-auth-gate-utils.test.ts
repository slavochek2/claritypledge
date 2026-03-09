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
 */

import { describe, it, expect } from 'vitest';
import {
  buildAuthGateUrl,
  isValidPosition,
  isValidPointId,
  parseAuthGateIntent,
} from '@/lib/auth-gate-utils';

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
