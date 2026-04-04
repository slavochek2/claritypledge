/**
 * @file filter-agreements-edge-cases.test.ts
 * @description Edge-case unit tests for filterAgreementsForViewer().
 *
 * Complements p459-agreements-visibility.test.ts with advanced scenarios:
 * - Mixed status/visibility combinations
 * - Null partnerProfileId (pending agreements)
 * - Viewer as creator (not partner) in private agreement
 * - Empty agreement arrays with all viewer types
 * - Parametric status testing (single status per agreement type)
 * - Ordering preservation across filter
 * - No-duplicate filtering when viewer is party AND agreement is public
 * - Large batch performance baseline (100 agreements)
 *
 * Tests are pure logic; no DB, no network, no mocks required.
 */

import { describe, it, expect } from 'vitest';
import { filterAgreementsForViewer } from '@/app/components/agreements/filter-agreements';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';

// ─── Fixture builder ──────────────────────────────────────────────────────────

const PROFILE_ID = 'profile-owner-123';
const VIEWER_ID = 'profile-viewer-456';
const THIRD_ID = 'profile-third-789';
const FOURTH_ID = 'profile-fourth-000';

function makeAgreement(overrides: Partial<ClarityAgreement> = {}): ClarityAgreement {
  return {
    id: `agreement-${Math.random().toString(36).slice(2)}`,
    displayId: `A-${Math.floor(Math.random() * 10000)}`,
    creatorProfileId: PROFILE_ID,
    partnerProfileId: VIEWER_ID,
    partnerEmail: 'partner@example.com',
    termsText: 'We commit to monthly /live sessions.',
    status: 'active',
    visibility: 'private',
    invitationToken: 'token-abc',
    invitationExpiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    partnerSignedAt: '2025-01-02T00:00:00Z',
    terminatedAt: null,
    terminatedBy: null,
    creator: null,
    partner: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('filterAgreementsForViewer — edge cases', () => {
  // ── 1. Mixed status/visibility combinations ──────────────────────────────

  describe('Mixed status+visibility combinations', () => {
    it('filters correctly from [active+public, terminated+public, pending+private]', () => {
      const agreements = [
        makeAgreement({
          id: 'active-pub',
          status: 'active',
          visibility: 'public',
          partnerProfileId: THIRD_ID,
        }),
        makeAgreement({
          id: 'term-pub',
          status: 'terminated',
          visibility: 'public',
          partnerProfileId: THIRD_ID,
        }),
        makeAgreement({
          id: 'pend-priv',
          status: 'pending',
          visibility: 'private',
          partnerProfileId: THIRD_ID,
        }),
      ];

      // Anonymous visitor sees only active+public
      const anonResult = filterAgreementsForViewer(agreements, PROFILE_ID, null);
      expect(anonResult).toHaveLength(1);
      expect(anonResult[0].id).toBe('active-pub');

      // Non-party visitor sees same
      const visitorResult = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(visitorResult).toHaveLength(1);
      expect(visitorResult[0].id).toBe('active-pub');

      // Owner sees all
      const ownerResult = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(ownerResult).toHaveLength(3);
    });

    it('handles all 10 status+visibility combinations', () => {
      const statuses = ['pending', 'active', 'declined', 'expired', 'terminated'] as const;
      const visibilities = ['private', 'public'] as const;

      const agreements = statuses.flatMap((status) =>
        visibilities.map((visibility) =>
          makeAgreement({
            id: `${status}-${visibility}`,
            status,
            visibility,
            partnerProfileId: THIRD_ID,
          }),
        ),
      );

      // Anonymous: only active+public
      const anonResult = filterAgreementsForViewer(agreements, PROFILE_ID, null);
      expect(anonResult).toHaveLength(1);
      expect(anonResult[0].id).toBe('active-public');

      // Non-party visitor: same
      const visitorResult = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(visitorResult).toHaveLength(1);

      // Owner: all 10
      const ownerResult = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(ownerResult).toHaveLength(10);
    });
  });

  // ── 2. Null partnerProfileId (pending agreement not yet accepted) ────────

  describe('Null partnerProfileId', () => {
    it('creator sees their pending agreement with null partnerProfileId', () => {
      const agreement = makeAgreement({
        creatorProfileId: VIEWER_ID,
        partnerProfileId: null,
        status: 'pending',
        visibility: 'private',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      // Viewer is creator, so they see it (party check)
      expect(result).toHaveLength(1);
    });

    it('non-creator anonymous does not see pending with null partnerProfileId', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: null,
        status: 'pending',
        visibility: 'private',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      // Anonymous sees only public+active; pending+private fails both
      expect(result).toHaveLength(0);
    });

    it('non-creator non-party does not see pending with null partnerProfileId', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: null,
        status: 'pending',
        visibility: 'private',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ── 3. Viewer is creator (not partner) in private agreement ────────────

  describe('Viewer as creator in private agreement', () => {
    it('creator sees their own private agreement even if status is not active', () => {
      const agreement = makeAgreement({
        id: 'creator-private',
        creatorProfileId: VIEWER_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'pending',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('creator-private');
    });

    it('creator sees their own private expired agreement', () => {
      const agreement = makeAgreement({
        creatorProfileId: VIEWER_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'expired',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
    });

    it('creator sees their own private terminated agreement', () => {
      const agreement = makeAgreement({
        creatorProfileId: VIEWER_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'terminated',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
    });
  });

  // ── 4. Empty agreements array with all viewer types ────────────────────

  describe('Empty agreements array', () => {
    it('returns empty for owner', () => {
      const result = filterAgreementsForViewer([], PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(0);
    });

    it('returns empty for visitor', () => {
      const result = filterAgreementsForViewer([], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });

    it('returns empty for anonymous', () => {
      const result = filterAgreementsForViewer([], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });
  });

  // ── 5. Parametric status test ────────────────────────────────────────

  describe('Single public agreement with each status', () => {
    it('anonymous sees public+pending → 0 (not active)', () => {
      const agreement = makeAgreement({
        status: 'pending',
        visibility: 'public',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });

    it('anonymous sees public+active → 1', () => {
      const agreement = makeAgreement({
        status: 'active',
        visibility: 'public',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(1);
    });

    it('anonymous sees public+declined → 0 (not active)', () => {
      const agreement = makeAgreement({
        status: 'declined',
        visibility: 'public',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });

    it('anonymous sees public+expired → 0 (not active)', () => {
      const agreement = makeAgreement({
        status: 'expired',
        visibility: 'public',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });

    it('anonymous sees public+terminated → 0 (not active)', () => {
      const agreement = makeAgreement({
        status: 'terminated',
        visibility: 'public',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });
  });

  // ── 6. Ordering preservation ─────────────────────────────────────────

  describe('Ordering preservation', () => {
    it('returns results in input order when filtering', () => {
      const agreements = [
        makeAgreement({
          id: 'first',
          status: 'active',
          visibility: 'public',
          partnerProfileId: THIRD_ID,
        }),
        makeAgreement({
          id: 'second',
          status: 'pending',
          visibility: 'public',
          partnerProfileId: THIRD_ID,
        }),
        makeAgreement({
          id: 'third',
          status: 'active',
          visibility: 'public',
          partnerProfileId: FOURTH_ID,
        }),
      ];

      const result = filterAgreementsForViewer(agreements, PROFILE_ID, null);
      expect(result.map((a) => a.id)).toEqual(['first', 'third']);
    });

    it('preserves order for mixed private+public when viewer is party', () => {
      const agreements = [
        makeAgreement({
          id: '1',
          status: 'pending',
          visibility: 'private',
          partnerProfileId: VIEWER_ID,
        }),
        makeAgreement({
          id: '2',
          status: 'active',
          visibility: 'public',
          partnerProfileId: THIRD_ID,
        }),
        makeAgreement({
          id: '3',
          status: 'active',
          visibility: 'private',
          partnerProfileId: VIEWER_ID,
        }),
      ];

      const result = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(result.map((a) => a.id)).toEqual(['1', '2', '3']);
    });

    it('maintains input order for owner viewing all', () => {
      const agreements = [
        makeAgreement({ id: 'z-third' }),
        makeAgreement({ id: 'a-first' }),
        makeAgreement({ id: 'm-second' }),
      ];

      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result.map((a) => a.id)).toEqual(['z-third', 'a-first', 'm-second']);
    });
  });

  // ── 7. No duplicates when viewer is party AND public+active ──────────────

  describe('No-duplicate filtering', () => {
    it('returns agreement exactly once when viewer is party and it is public+active', () => {
      const agreement = makeAgreement({
        id: 'shared',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'public',
        status: 'active',
      });

      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      // filter() processes each element once; short-circuit on party check prevents double-counting
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('shared');
    });

    it('no duplicates in batch with viewer-as-party and public+active mixed', () => {
      const sharedParty = makeAgreement({
        id: 'party-pub-active',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'public',
        status: 'active',
      });

      const otherParty = makeAgreement({
        id: 'other-party',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'private',
        status: 'pending',
      });

      const publicOnly = makeAgreement({
        id: 'public-only',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'public',
        status: 'active',
      });

      const result = filterAgreementsForViewer(
        [sharedParty, otherParty, publicOnly],
        PROFILE_ID,
        VIEWER_ID,
      );

      expect(result).toHaveLength(3);
      const ids = result.map((a) => a.id);
      // No repeated IDs
      expect(new Set(ids).size).toBe(3);
    });
  });

  // ── 8. Large batch (100 agreements) ──────────────────────────────────

  describe('Large batch filtering', () => {
    it('correctly processes 100 agreements with mixed states', () => {
      const agreements: ClarityAgreement[] = [];

      // 25 active+public (visible to all)
      for (let i = 0; i < 25; i++) {
        agreements.push(
          makeAgreement({
            id: `active-pub-${i}`,
            status: 'active',
            visibility: 'public',
            partnerProfileId: THIRD_ID,
          }),
        );
      }

      // 25 pending+public (not visible to non-parties)
      for (let i = 0; i < 25; i++) {
        agreements.push(
          makeAgreement({
            id: `pending-pub-${i}`,
            status: 'pending',
            visibility: 'public',
            partnerProfileId: THIRD_ID,
          }),
        );
      }

      // 25 active+private where viewer is party
      for (let i = 0; i < 25; i++) {
        agreements.push(
          makeAgreement({
            id: `party-priv-${i}`,
            status: 'active',
            visibility: 'private',
            partnerProfileId: VIEWER_ID,
          }),
        );
      }

      // 25 active+private where viewer is NOT party
      for (let i = 0; i < 25; i++) {
        agreements.push(
          makeAgreement({
            id: `other-priv-${i}`,
            status: 'active',
            visibility: 'private',
            partnerProfileId: THIRD_ID,
          }),
        );
      }

      expect(agreements).toHaveLength(100);

      // Anonymous: 25 active+public only
      const anonResult = filterAgreementsForViewer(agreements, PROFILE_ID, null);
      expect(anonResult).toHaveLength(25);
      expect(anonResult.every((a) => a.status === 'active' && a.visibility === 'public')).toBe(true);

      // Viewer: 25 active+public + 25 as party = 50
      const visitorResult = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(visitorResult).toHaveLength(50);
      const visitorIds = new Set(visitorResult.map((a) => a.id));
      // Verify no duplicates
      expect(visitorIds.size).toBe(50);

      // Owner: all 100
      const ownerResult = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(ownerResult).toHaveLength(100);
    });

    it('large batch ordering is preserved', () => {
      const agreements: ClarityAgreement[] = [];

      for (let i = 0; i < 50; i++) {
        agreements.push(
          makeAgreement({
            id: `item-${i}`,
            status: 'active',
            visibility: 'public',
            partnerProfileId: THIRD_ID,
          }),
        );
      }

      const result = filterAgreementsForViewer(agreements, PROFILE_ID, null);
      const ids = result.map((a) => a.id);

      // Verify input order preserved
      for (let i = 0; i < ids.length; i++) {
        expect(ids[i]).toBe(`item-${i}`);
      }
    });
  });

  // ── 9. Edge case: multiple parties, complex filtering ─────────────────

  describe('Complex multi-party scenarios', () => {
    it('viewer sees only agreements they are party to, plus public+active', () => {
      const partyPrivate = makeAgreement({
        id: 'party-priv',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'private',
        status: 'expired',
      });

      const partyPublic = makeAgreement({
        id: 'party-pub-pending',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'public',
        status: 'pending',
      });

      const thirdPartyPrivate = makeAgreement({
        id: 'other-priv',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'active',
      });

      const publicActive = makeAgreement({
        id: 'pub-active',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: FOURTH_ID,
        visibility: 'public',
        status: 'active',
      });

      const result = filterAgreementsForViewer(
        [partyPrivate, partyPublic, thirdPartyPrivate, publicActive],
        PROFILE_ID,
        VIEWER_ID,
      );

      expect(result).toHaveLength(3);
      const ids = new Set(result.map((a) => a.id));
      expect(ids.has('party-priv')).toBe(true);
      expect(ids.has('party-pub-pending')).toBe(true);
      expect(ids.has('pub-active')).toBe(true);
      expect(ids.has('other-priv')).toBe(false);
    });
  });
});
