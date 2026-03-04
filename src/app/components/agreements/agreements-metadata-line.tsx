/**
 * @file agreements-metadata-line.tsx
 * @description P459: Compact profile header metadata line showing agreement count.
 * Links to /p/:slug/partners. Handles 5 viewer states:
 *   Owner with agreements        → "N Clarity Partners →"
 *   Owner with 0 agreements      → "0 Clarity Partners →" (always shown so owner can reach the page)
 *   Visitor-party                → "You have N agreement(s) with this person →"
 *   Visitor with public visible  → "N Clarity Partners →"
 *   Non-owner, no visible        → null (renders nothing)
 */

import { Link } from 'react-router-dom';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import { filterAgreementsForViewer } from './filter-agreements';

interface AgreementsMetadataLineProps {
  profileId: string;
  viewerProfileId: string | null;
  agreements: ClarityAgreement[];
  slug: string | null;
}

export function AgreementsMetadataLine({
  profileId,
  viewerProfileId,
  agreements,
  slug,
}: AgreementsMetadataLineProps) {
  if (!slug) return null;

  const filtered = filterAgreementsForViewer(agreements, profileId, viewerProfileId);

  const isOwner = viewerProfileId === profileId;

  // Non-owner with nothing visible → hide entirely
  if (filtered.length === 0 && !isOwner) return null;

  // B1: count only active agreements for the "N Clarity Partners" display
  const activeCount = filtered.filter(a => a.status === 'active').length;

  let label: string;

  if (filtered.length === 0) {
    // Owner with 0 agreements — show count for consistency, page has the CTA
    label = '0 Clarity Partners';
  } else if (viewerProfileId && !isOwner) {
    // Check if viewer is party to any of the visible agreements
    const sharedCount = filtered.filter(
      (a) => a.creatorProfileId === viewerProfileId || a.partnerProfileId === viewerProfileId
    ).length;

    if (sharedCount > 0) {
      label = `You have ${sharedCount} agreement${sharedCount !== 1 ? 's' : ''} with this person`;
    } else {
      label = `${activeCount} Clarity Partner${activeCount !== 1 ? 's' : ''}`;
    }
  } else {
    // Owner with agreements (or anonymous — handled above)
    label = `${activeCount} Clarity Partner${activeCount !== 1 ? 's' : ''}`;
  }

  return (
    <Link
      to={`/p/${slug}/partners`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
    >
      <span aria-hidden="true">✦</span>
      {label}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
