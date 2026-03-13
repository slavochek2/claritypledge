/**
 * @file agreements-metadata-line.tsx
 * @description P462: Prominent partner count in profile header.
 * Links to /p/:slug/partners. Handles viewer states:
 *   Any viewer, N>0 active     → "✦ N Clarity Partners →" (number bold navy xl)
 *   Owner, 0 agreements        → "✦ 0 Clarity Partners →" (number muted xl)
 *   Non-owner, no visible      → null (renders nothing)
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

  const displayCount = filtered.length === 0 ? 0 : activeCount;
  const partnersLabel = `Clarity Partner${displayCount !== 1 ? 's' : ''}`;
  const isZeroState = displayCount === 0;

  return (
    <Link
      to={`/p/${slug}/partners`}
      className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity min-h-[44px]"
    >
      <span aria-hidden="true" className="text-muted-foreground">✦</span>
      <span className={isZeroState
        ? 'text-xl text-muted-foreground'
        : 'text-xl font-bold text-[#002B5C]'
      }>
        {displayCount}
      </span>
      <span className="text-sm text-muted-foreground">
        {partnersLabel} →
      </span>
    </Link>
  );
}
