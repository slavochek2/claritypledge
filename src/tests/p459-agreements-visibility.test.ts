/**
 * @file p459-agreements-visibility.test.ts
 * @description Unit tests for P459: filterAgreementsForViewer() logic.
 *
 * Tests the pure visibility-filtering function that governs which agreements
 * are shown in the profile header metadata line and the new Connections page.
 *
 * The function lives in profile-agreements-section.tsx (and will be reused
 * or inlined in the new connections-page.tsx). These tests verify the 5 viewer
 * state matrix defined in the P459 spec:
 *
 *   1. Owner — sees all agreements regardless of status/visibility
 *   2. Visitor who is a party — sees their agreement even if private
 *   3. Visitor with public active agreements — sees public active only
 *   4. Visitor with no visible agreements — gets empty array
 *   5. Anonymous (null viewerProfileId) — sees public active only
 *
 * Tests are pure logic; no DB, no network, no mocks required.
 */

import { describe, it, expect } from 'vitest';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';

// ─── Helper: filterAgreementsForViewer (extracted for isolated testing) ────────
//
// This mirrors the function in profile-agreements-section.tsx.
// When the function is exported from that file (or a shared util), replace this
// local copy with a direct import.

function filterAgreementsForViewer(
  agreements: ClarityAgreement[],
  profileId: string,
  viewerProfileId: string | null,
): ClarityAgreement[] {
  // Owner sees everything
  if (viewerProfileId === profileId) {
    return agreements;
  }

  return agreements.filter((a) => {
    // Viewer is a party in this agreement
    if (
      viewerProfileId &&
      (viewerProfileId === a.creatorProfileId || viewerProfileId === a.partnerProfileId)
    ) {
      return true;
    }
    // Public active agreements visible to all
    return a.visibility === 'public' && a.status === 'active';
  });
}

// ─── Fixture builders ─────────────────────────────────────────────────────────

const PROFILE_ID = 'profile-owner-123';
const VIEWER_ID = 'profile-viewer-456';
const THIRD_ID = 'profile-third-789';

function makeAgreement(overrides: Partial<ClarityAgreement> = {}): ClarityAgreement {
  return {
    id: `agreement-${Math.random().toString(36).slice(2)}`,
    displayId: 'A-0001',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('filterAgreementsForViewer', () => {
  // ── 1. Owner state ───────────────────────────────────────────────────────

  describe('Owner (viewerProfileId === profileId)', () => {
    it('returns all agreements when owner has none', () => {
      const result = filterAgreementsForViewer([], PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(0);
    });

    it('returns all active agreements', () => {
      const agreements = [
        makeAgreement({ status: 'active' }),
        makeAgreement({ status: 'active', visibility: 'public' }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(2);
    });

    it('returns draft (pending) agreements — owner sees everything', () => {
      const agreements = [
        makeAgreement({ status: 'pending' }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(1);
    });

    it('returns expired agreements — owner sees everything', () => {
      const agreements = [
        makeAgreement({ status: 'expired' }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(1);
    });

    it('returns terminated agreements — owner sees everything', () => {
      const agreements = [
        makeAgreement({ status: 'terminated' }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(1);
    });

    it('returns private and public agreements — owner sees everything', () => {
      const agreements = [
        makeAgreement({ visibility: 'private', status: 'active' }),
        makeAgreement({ visibility: 'public', status: 'active' }),
        makeAgreement({ visibility: 'private', status: 'pending' }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result).toHaveLength(3);
    });

    it('returns all agreements in original order', () => {
      const agreements = [
        makeAgreement({ id: 'a1', status: 'active' }),
        makeAgreement({ id: 'a2', status: 'expired' }),
        makeAgreement({ id: 'a3', status: 'pending' }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, PROFILE_ID);
      expect(result.map(a => a.id)).toEqual(['a1', 'a2', 'a3']);
    });
  });

  // ── 2. Visitor who is a party ────────────────────────────────────────────

  describe('Visitor who is a party to an agreement', () => {
    it('sees agreement where they are the partner (private)', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'private',
        status: 'active',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(agreement.id);
    });

    it('sees agreement where they are the creator (private)', () => {
      const agreement = makeAgreement({
        creatorProfileId: VIEWER_ID,
        partnerProfileId: PROFILE_ID,
        visibility: 'private',
        status: 'active',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
    });

    it('sees their private agreement even when status is not active', () => {
      const agreements = [
        makeAgreement({
          partnerProfileId: VIEWER_ID,
          visibility: 'private',
          status: 'terminated',
        }),
        makeAgreement({
          partnerProfileId: VIEWER_ID,
          visibility: 'private',
          status: 'expired',
        }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(2);
    });

    it('does NOT see other visitors private agreements', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'active',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ── 3. Visitor with public active agreements ─────────────────────────────

  describe('Visitor (not a party, public agreements exist)', () => {
    it('sees public active agreements', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'public',
        status: 'active',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
    });

    it('does NOT see public non-active agreements', () => {
      const agreements = [
        makeAgreement({ visibility: 'public', status: 'pending', partnerProfileId: THIRD_ID }),
        makeAgreement({ visibility: 'public', status: 'expired', partnerProfileId: THIRD_ID }),
        makeAgreement({ visibility: 'public', status: 'terminated', partnerProfileId: THIRD_ID }),
        makeAgreement({ visibility: 'public', status: 'declined', partnerProfileId: THIRD_ID }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });

    it('does NOT see private active agreements they are not party to', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'active',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });

    it('returns only public active from a mixed set', () => {
      const agreements = [
        makeAgreement({ id: 'pub-active', visibility: 'public', status: 'active', partnerProfileId: THIRD_ID }),
        makeAgreement({ id: 'pub-pending', visibility: 'public', status: 'pending', partnerProfileId: THIRD_ID }),
        makeAgreement({ id: 'priv-active', visibility: 'private', status: 'active', partnerProfileId: THIRD_ID }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pub-active');
    });
  });

  // ── 4. Visitor with no visible agreements ────────────────────────────────

  describe('Visitor with no visible agreements', () => {
    it('returns empty array when all agreements are private and viewer is not a party', () => {
      const agreements = [
        makeAgreement({ visibility: 'private', status: 'active', partnerProfileId: THIRD_ID }),
        makeAgreement({ visibility: 'private', status: 'active', partnerProfileId: THIRD_ID }),
      ];
      const result = filterAgreementsForViewer(agreements, PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });

    it('returns empty array when there are no agreements at all', () => {
      const result = filterAgreementsForViewer([], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ── 5. Anonymous (null viewerProfileId) ─────────────────────────────────

  describe('Anonymous viewer (null viewerProfileId)', () => {
    it('sees public active agreements', () => {
      const agreement = makeAgreement({
        visibility: 'public',
        status: 'active',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(1);
    });

    it('does NOT see private agreements', () => {
      const agreement = makeAgreement({
        visibility: 'private',
        status: 'active',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });

    it('does NOT see public non-active agreements', () => {
      const agreement = makeAgreement({
        visibility: 'public',
        status: 'pending',
        partnerProfileId: THIRD_ID,
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });

    it('is never treated as owner even if profileId is null', () => {
      // Edge: profileId and viewerProfileId both null — should not match as owner
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'private',
        status: 'active',
      });
      // null !== PROFILE_ID, so never owner — returns empty
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, null);
      expect(result).toHaveLength(0);
    });
  });

  // ── 6. Deduplication: visitor is party AND public agreement exists ────────

  describe('No duplicates — visitor is party to agreement that is also public', () => {
    it('includes the agreement exactly once when viewer is party and it is public active', () => {
      const agreement = makeAgreement({
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'public',
        status: 'active',
      });
      const result = filterAgreementsForViewer([agreement], PROFILE_ID, VIEWER_ID);
      // filter() naturally deduplicates — party check short-circuits before public check
      expect(result).toHaveLength(1);
    });

    it('includes multiple agreements without duplicates when viewer is party to some and public exist', () => {
      const shared = makeAgreement({
        id: 'shared',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: VIEWER_ID,
        visibility: 'public',
        status: 'active',
      });
      const publicOnly = makeAgreement({
        id: 'pub-only',
        creatorProfileId: PROFILE_ID,
        partnerProfileId: THIRD_ID,
        visibility: 'public',
        status: 'active',
      });
      const result = filterAgreementsForViewer([shared, publicOnly], PROFILE_ID, VIEWER_ID);
      expect(result).toHaveLength(2);
      const ids = result.map(a => a.id);
      // No duplicate IDs
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
