/**
 * @file profile-agreements-section.tsx
 * @description P422: Profile page section showing Clarity Partner Agreements.
 * Handles 5 viewer states: own-empty, own-nonempty, visitor-public,
 * visitor-is-party, visitor-no-public.
 */

import { Link } from 'react-router-dom';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import { AgreementRow } from './agreement-row';

export interface ProfileAgreementsSectionProps {
  profileId: string;
  viewerProfileId: string | null;
  agreements: ClarityAgreement[];
  isLoading: boolean;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AgreementsSkeleton() {
  return (
    <ul aria-label="Loading agreements" aria-busy="true" className="space-y-2">
      {[1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg animate-pulse">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-1/4" />
          </div>
          <div className="h-5 bg-muted rounded w-16" />
        </li>
      ))}
    </ul>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader() {
  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      <span className="text-xs text-muted-foreground" aria-hidden="true">✦</span>
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        Partner Agreements
      </h2>
    </div>
  );
}

// ─── Visibility filtering ─────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileAgreementsSection({
  profileId,
  viewerProfileId,
  agreements,
  isLoading,
}: ProfileAgreementsSectionProps) {
  const isOwner = viewerProfileId === profileId;

  if (isLoading) {
    return (
      <section aria-label="Partner Agreements">
        <SectionHeader />
        <AgreementsSkeleton />
      </section>
    );
  }

  const visibleAgreements = filterAgreementsForViewer(agreements, profileId, viewerProfileId);

  // own-empty: owner with no agreements at all
  if (isOwner && agreements.length === 0) {
    return (
      <section aria-label="Partner Agreements">
        <SectionHeader />
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">No agreements yet.</p>
          <Link
            to="/agreements/new"
            className="inline-flex items-center justify-center text-sm font-semibold h-9 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create Agreement
          </Link>
        </div>
      </section>
    );
  }

  // visitor-no-public: nothing visible to this viewer
  if (!isOwner && visibleAgreements.length === 0) {
    return null;
  }

  // own-nonempty / visitor-public / visitor-is-party
  return (
    <section aria-label="Partner Agreements">
      <SectionHeader />
      <ul className="space-y-0.5" aria-label={`${visibleAgreements.length} agreement${visibleAgreements.length !== 1 ? 's' : ''}`}>
        {visibleAgreements.map((agreement) => (
          <AgreementRow
            key={agreement.id}
            agreement={agreement}
            currentProfileId={profileId}
          />
        ))}
      </ul>
      {isOwner && (
        <div className="px-4 pt-3">
          <Link
            to="/agreements/new"
            className="text-xs font-medium text-primary hover:underline transition-colors"
          >
            + New agreement
          </Link>
        </div>
      )}
    </section>
  );
}
