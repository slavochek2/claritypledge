/**
 * @file p686-badge-service.test.ts
 *
 * Unit tests for P686 badge service logic.
 *
 * Tests pure functions:
 * 1. Badge count computation (0, partial, 9/9)
 * 2. Position qualification check
 * 3. Certification precondition checks (all gates must pass)
 *
 * NOTE: These tests import from the badge service module once created.
 * The function signatures below match the expected API described in the spec.
 * Update import paths after implementation.
 *
 * TODO: Update import path after implementation:
 *   import { computeBadgeCount, isQualifyingPosition, canCertify } from '@/lib/badge-service';
 */

import { describe, it, expect } from 'vitest';

// ───────────────────────────────────────────────────────────────────────────────
// Inline implementations — replace with real imports after badge-service is built
// These mirror the spec's exact logic for TDD-style verification.
// ───────────────────────────────────────────────────────────────────────────────

type PositionType =
  | 'strongly_agree'
  | 'agree'
  | 'somewhat_agree'
  | 'unsure'
  | 'somewhat_disagree'
  | 'disagree'
  | 'strongly_disagree';

interface BadgePoint {
  user_id: string;
  point_id: string;
  position: PositionType;
  verified_at: string;
}

interface CertificationContext {
  /** The person selecting the story (must be certifier) */
  speakerProfileId: string;
  /** The person listening (must be logged in) */
  listenerProfileId: string | null;
  /** The certifier's profile ID */
  certifierProfileId: string;
  /** Whether the certifier has is_certifier = true */
  speakerIsCertifier: boolean;
  /** Whether the story's point has 'understanding' in system_tags */
  pointHasUnderstandingTag: boolean;
  /** The listener's position on the certification point */
  listenerPosition: PositionType | null;
  /** Whether a badge_point already exists for (listener, point) */
  alreadyBadged: boolean;
}

/** Spec logic: only agree (+2) and strongly_agree (+3) qualify */
function isQualifyingPosition(position: PositionType | null): boolean {
  if (position === null) return false;
  return position === 'agree' || position === 'strongly_agree';
}

/** Returns the number of unique points a user has been badged on */
function computeBadgeCount(badgePoints: BadgePoint[]): number {
  const uniquePoints = new Set(badgePoints.map(bp => bp.point_id));
  return uniquePoints.size;
}

/** Returns true only when ALL certification preconditions pass */
function canCertify(ctx: CertificationContext): boolean {
  // 1. Speaker must be the certifier
  if (ctx.speakerProfileId !== ctx.certifierProfileId) return false;
  // 2. Certifier must have is_certifier = true
  if (!ctx.speakerIsCertifier) return false;
  // 3. Listener must be a logged-in user (not a guest)
  if (ctx.listenerProfileId === null) return false;
  // 4. Point must have #understanding system tag
  if (!ctx.pointHasUnderstandingTag) return false;
  // 5. Listener position must qualify (agree or strongly_agree)
  if (!isQualifyingPosition(ctx.listenerPosition)) return false;
  // 6. Not already badged (duplicate → do nothing)
  if (ctx.alreadyBadged) return false;
  return true;
}

// ───────────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';
const POINT_1 = 'point-1-uuid';
const POINT_2 = 'point-2-uuid';
const POINT_3 = 'point-3-uuid';

function makeBadge(userId: string, pointId: string, position: PositionType = 'agree'): BadgePoint {
  return { user_id: userId, point_id: pointId, position, verified_at: '2026-04-10T10:00:00Z' };
}

describe('computeBadgeCount', () => {
  it('returns 0 when user has no badge points', () => {
    expect(computeBadgeCount([])).toBe(0);
  });

  it('returns 1 when user has exactly one badge point', () => {
    expect(computeBadgeCount([makeBadge(USER_A, POINT_1)])).toBe(1);
  });

  it('returns 3 when user has three distinct badge points', () => {
    expect(computeBadgeCount([
      makeBadge(USER_A, POINT_1),
      makeBadge(USER_A, POINT_2),
      makeBadge(USER_A, POINT_3),
    ])).toBe(3);
  });

  it('returns 9 when user has all 9 badge points', () => {
    const points = Array.from({ length: 9 }, (_, i) => makeBadge(USER_A, `point-${i}`));
    expect(computeBadgeCount(points)).toBe(9);
  });

  it('deduplicates: same (user, point) repeated counts as 1', () => {
    // Spec: UNIQUE(user_id, point_id) — but test the count function defensively
    expect(computeBadgeCount([
      makeBadge(USER_A, POINT_1),
      makeBadge(USER_A, POINT_1), // duplicate
    ])).toBe(1);
  });

  it('counts independently per user (multi-user data in same array)', () => {
    const points = [
      makeBadge(USER_A, POINT_1),
      makeBadge(USER_A, POINT_2),
      makeBadge(USER_B, POINT_1), // different user, same point
    ];
    // computeBadgeCount is called per user — filter before calling
    const userACount = computeBadgeCount(points.filter(bp => bp.user_id === USER_A));
    const userBCount = computeBadgeCount(points.filter(bp => bp.user_id === USER_B));
    expect(userACount).toBe(2);
    expect(userBCount).toBe(1);
  });
});

describe('isQualifyingPosition', () => {
  it('agree qualifies', () => {
    expect(isQualifyingPosition('agree')).toBe(true);
  });

  it('strongly_agree qualifies', () => {
    expect(isQualifyingPosition('strongly_agree')).toBe(true);
  });

  it('somewhat_agree does NOT qualify (spec explicit)', () => {
    expect(isQualifyingPosition('somewhat_agree')).toBe(false);
  });

  it('unsure does NOT qualify', () => {
    expect(isQualifyingPosition('unsure')).toBe(false);
  });

  it('somewhat_disagree does NOT qualify', () => {
    expect(isQualifyingPosition('somewhat_disagree')).toBe(false);
  });

  it('disagree does NOT qualify', () => {
    expect(isQualifyingPosition('disagree')).toBe(false);
  });

  it('strongly_disagree does NOT qualify', () => {
    expect(isQualifyingPosition('strongly_disagree')).toBe(false);
  });

  it('null (no position filed) does NOT qualify', () => {
    expect(isQualifyingPosition(null)).toBe(false);
  });
});

describe('canCertify', () => {
  const CERTIFIER_ID = 'certifier-uuid';

  function makeCtx(overrides: Partial<CertificationContext> = {}): CertificationContext {
    return {
      speakerProfileId: CERTIFIER_ID,       // certifier is speaking
      listenerProfileId: USER_A,             // logged-in listener
      certifierProfileId: CERTIFIER_ID,
      speakerIsCertifier: true,
      pointHasUnderstandingTag: true,
      listenerPosition: 'agree',
      alreadyBadged: false,
      ...overrides,
    };
  }

  it('returns true when all preconditions pass (happy path)', () => {
    expect(canCertify(makeCtx())).toBe(true);
  });

  it('returns true when listener position is strongly_agree', () => {
    expect(canCertify(makeCtx({ listenerPosition: 'strongly_agree' }))).toBe(true);
  });

  it('returns false when speaker is NOT the certifier', () => {
    expect(canCertify(makeCtx({ speakerProfileId: USER_A }))).toBe(false);
  });

  it('returns false when speaker is not flagged is_certifier = true', () => {
    expect(canCertify(makeCtx({ speakerIsCertifier: false }))).toBe(false);
  });

  it('returns false when listener is a guest (null profileId)', () => {
    expect(canCertify(makeCtx({ listenerProfileId: null }))).toBe(false);
  });

  it('returns false when point lacks #understanding system tag', () => {
    expect(canCertify(makeCtx({ pointHasUnderstandingTag: false }))).toBe(false);
  });

  it('returns false when listener position is somewhat_agree', () => {
    expect(canCertify(makeCtx({ listenerPosition: 'somewhat_agree' }))).toBe(false);
  });

  it('returns false when listener position is disagree', () => {
    expect(canCertify(makeCtx({ listenerPosition: 'disagree' }))).toBe(false);
  });

  it('returns false when listener has no position filed (null)', () => {
    expect(canCertify(makeCtx({ listenerPosition: null }))).toBe(false);
  });

  it('returns false when (user, point) is already badged — duplicate prevention', () => {
    expect(canCertify(makeCtx({ alreadyBadged: true }))).toBe(false);
  });

  it('fails when ALL gates fail simultaneously', () => {
    expect(canCertify(makeCtx({
      speakerProfileId: USER_A,
      speakerIsCertifier: false,
      listenerProfileId: null,
      pointHasUnderstandingTag: false,
      listenerPosition: null,
      alreadyBadged: true,
    }))).toBe(false);
  });
});
