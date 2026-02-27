/**
 * @file agreements-metadata-line.tsx
 * @description P459: Compact profile header metadata line showing agreement count.
 * Links to /p/:slug/connections. Handles 4 viewer states:
 *   Owner with agreements        → "N Clarity Partners →"
 *   Visitor-party                → "You have N agreement(s) with this person →"
 *   Visitor with public visible  → "N Clarity Partners →"
 *   No visible agreements        → null (renders nothing)
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

  if (filtered.length === 0) return null;

  let label: string;

  if (viewerProfileId && viewerProfileId !== profileId) {
    // Check if viewer is party to any of the visible agreements
    const sharedCount = filtered.filter(
      (a) => a.creatorProfileId === viewerProfileId || a.partnerProfileId === viewerProfileId
    ).length;

    if (sharedCount > 0) {
      label = `You have ${sharedCount} agreement${sharedCount !== 1 ? 's' : ''} with this person`;
    } else {
      const n = filtered.length;
      label = `${n} Clarity Partner${n !== 1 ? 's' : ''}`;
    }
  } else {
    // Owner (viewerProfileId === profileId) or anonymous (viewerProfileId === null)
    const n = filtered.length;
    label = `${n} Clarity Partner${n !== 1 ? 's' : ''}`;
  }

  return (
    <Link
      to={`/p/${slug}/connections`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
    >
      <span aria-hidden="true">✦</span>
      {label}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
