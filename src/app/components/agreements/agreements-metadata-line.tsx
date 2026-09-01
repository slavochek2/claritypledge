/**
 * @file agreements-metadata-line.tsx
 * @description P462: Partner count in profile header as a blue link.
 * Links to /p/:slug/partners. Handles viewer states:
 *   Any viewer, N>0 active     → "✦ N Clarity Partners →" (blue link)
 *   Owner, 0 agreements        → "✦ 0 Clarity Partners →" (blue link)
 *   Non-owner, 0 active        → "✦ 0 Clarity Partners" (static muted text, not clickable)
 */

import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
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

  // B1: count only active agreements for the "N Clarity Partners" display
  const activeCount = filtered.filter(a => a.status === 'active').length;

  const displayCount = filtered.length === 0 ? 0 : activeCount;
  const partnersLabel = `Clarity Partner${displayCount !== 1 ? 's' : ''}`;

  // Non-owner with 0 partners → show static text (like LinkedIn hidden connections)
  if (displayCount === 0 && !isOwner) {
    return (
      <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground min-h-11">
        <Users className="h-4 w-4" aria-hidden="true" />
        0 {partnersLabel}
      </span>
    );
  }

  return (
    <Link
      to={`/p/${slug}/partners`}
      className="flex items-center gap-1 text-sm font-semibold text-blue-500 hover:text-blue-600 hover:underline transition-colors min-h-11"
    >
      <Users className="h-4 w-4" aria-hidden="true" />
      {displayCount} {partnersLabel}
    </Link>
  );
}
