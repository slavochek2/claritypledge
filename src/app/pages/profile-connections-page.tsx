/**
 * @file profile-connections-page.tsx
 * @description P459: Dedicated Connections page — /p/:id/connections.
 * Lists all agreements the viewer is permitted to see for a given profile.
 * Owner sees all agreements + "New Agreement" CTA.
 * Visitors see only what filterAgreementsForViewer permits.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getProfileBySlug, getProfile } from '@/app/data/api';
import type { Profile } from '@/app/types';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import { filterAgreementsForViewer } from '@/app/components/agreements/filter-agreements';
import { AgreementRow } from '@/app/components/agreements/agreement-row';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 mt-3 animate-pulse">
      <div className="h-8 bg-muted rounded w-48 mb-6" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground mb-4">No agreements to show.</p>
      {isOwner && (
        <Link
          to="/agreements/new"
          className="inline-flex items-center justify-center text-sm font-semibold h-9 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Agreement
        </Link>
      )}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export function ProfileConnectionsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agreements, setAgreements] = useState<ClarityAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch profile (try slug first, fall back to ID)
        let profileData = await getProfileBySlug(id);
        if (!profileData) {
          profileData = await getProfile(id);
        }

        if (!profileData) {
          setError('Profile not found.');
          setLoading(false);
          return;
        }

        setProfile(profileData);

        // Fetch agreements
        const viewerProfileId = currentUser?.id ?? null;
        const fetchedAgreements = await agreementsService.getAgreementsForProfile(
          profileData.id,
          viewerProfileId
        );
        setAgreements(fetchedAgreements);
      } catch (err) {
        console.error('ProfileConnectionsPage: Failed to load:', err);
        setError('Failed to load connections. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, currentUser?.id]);

  if (loading) return <PageSkeleton />;

  if (error || !profile) {
    return (
      <div className="max-w-lg mx-auto px-4 mt-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back
        </button>
        <p className="text-sm text-muted-foreground">{error ?? 'Profile not found.'}</p>
      </div>
    );
  }

  const viewerProfileId = currentUser?.id ?? null;
  const isOwner = viewerProfileId === profile.id;
  const visibleAgreements = filterAgreementsForViewer(agreements, profile.id, viewerProfileId);

  return (
    <div className="max-w-lg mx-auto px-4 mt-3 pb-20">
      {/* Back navigation */}
      <button
        onClick={() => navigate(`/p/${profile.slug ?? profile.id}`)}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={16} className="mr-1" />
        Back
      </button>

      {/* Page heading */}
      <h1 className="text-xl font-bold text-foreground mb-4">
        {isOwner ? 'My Partners' : `${(profile.name ?? 'User').split(' ')[0]}'s Partners`}
      </h1>

      {/* Partner Agreements section */}
      <section aria-label="Partner Agreements">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground" aria-hidden="true">✦</span>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Partner Agreements
          </h2>
        </div>

        {visibleAgreements.length === 0 ? (
          <EmptyState isOwner={isOwner} />
        ) : (
          <>
            <ul
              className="space-y-0.5"
              aria-label={`${visibleAgreements.length} agreement${visibleAgreements.length !== 1 ? 's' : ''}`}
            >
              {visibleAgreements.map((agreement) => (
                <AgreementRow
                  key={agreement.id}
                  agreement={agreement}
                  currentProfileId={profile.id}
                />
              ))}
            </ul>

            {isOwner && (
              <div className="px-4 pt-4">
                <Link
                  to="/agreements/new"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline transition-colors"
                >
                  + New Agreement
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
