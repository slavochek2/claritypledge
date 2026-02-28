/**
 * @file filter-agreements.ts
 * @description P459: Client-side visibility filter for agreements.
 * Determines which agreements are visible to a given viewer.
 *
 * 5 viewer states:
 *   1. Owner (viewerProfileId === profileId) — sees all agreements
 *   2. Visitor who is a party — sees their agreement even if private
 *   3. Visitor with public active agreements — sees public active only
 *   4. Visitor with no visible agreements — gets empty array
 *   5. Anonymous (null viewerProfileId) — sees public active only
 */

import type { ClarityAgreement } from '@/app/data/agreements-service.interface';

export function filterAgreementsForViewer(
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
