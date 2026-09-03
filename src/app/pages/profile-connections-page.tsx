/**
 * @file profile-connections-page.tsx
 * @description P459: Dedicated Partners page — /p/:id/partners.
 * Lists all agreements the viewer is permitted to see for a given profile.
 * Owner sees all agreements + "New Agreement" CTA.
 * Visitors see only what filterAgreementsForViewer permits.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getProfileBySlug, getProfile } from '@/app/data/api';
import type { Profile } from '@/app/types';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import { filterAgreementsForViewer } from '@/app/components/agreements/filter-agreements';
import { AgreementRow } from '@/app/components/agreements/agreement-row';
import { analytics } from '@/lib/mixpanel';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 mt-3 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-8 bg-muted rounded w-32" />
        <div className="h-11 bg-muted rounded-md w-32" />
      </div>
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
      {isOwner ? (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            No partners yet. Invite someone to get started.
          </p>
          <Button asChild className="min-h-11 bg-[#0044CC] hover:bg-[#0044CC]/90 text-white">
            <Link to="/agreements/new">Invite a new partner</Link>
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No agreements to show.</p>
      )}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export function ProfileConnectionsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser, isLoading: authLoading } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [agreements, setAgreements] = useState<ClarityAgreement[]>([]);
  const [incomingInvitations, setIncomingInvitations] = useState<ClarityAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || authLoading) return;

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
        analytics.track('partners_page_loaded', {
          profile_id: profileData.id,
          is_owner: viewerProfileId === profileData.id,
          agreement_count: fetchedAgreements.length,
        });
        setAgreements(fetchedAgreements);

        // Incoming invitations: pending agreements sent to the current user's email
        // where they haven't accepted yet (partner_profile_id is null)
        if (viewerProfileId === profileData.id && currentUser?.email) {
          const incoming = await agreementsService.getIncomingInvitations(currentUser.email, viewerProfileId);
          setIncomingInvitations(incoming);
        }
      } catch (err) {
        console.error('ProfileConnectionsPage: Failed to load:', err);
        setError('Failed to load connections. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, currentUser?.id, currentUser?.email, authLoading]);

  if (loading) return <PageSkeleton />;

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 mt-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
        <p className="text-sm text-muted-foreground">{error ?? 'Profile not found.'}</p>
      </div>
    );
  }

  const viewerProfileId = currentUser?.id ?? null;
  const isOwner = viewerProfileId === profile.id;
  const visibleAgreements = filterAgreementsForViewer(agreements, profile.id, viewerProfileId);

  const activeAgreements = visibleAgreements.filter(a => a.status === 'active');
  // P933: only show outgoing (creator) invitations here; incoming (recipient) ones
  // are handled by getIncomingInvitations and rendered in the "Invited to sign" section.
  const pendingAgreements = visibleAgreements.filter(
    a => a.status === 'pending' && a.creatorProfileId === viewerProfileId,
  );
  const hasAny = activeAgreements.length > 0 || pendingAgreements.length > 0 || incomingInvitations.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 mt-3 pb-20">
      {/* Back navigation */}
      <button
        onClick={() => navigate(`/p/${profile.slug ?? profile.id}`)}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </button>

      {/* Page heading */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">
          {isOwner ? 'My Partners' : `${(profile.name ?? 'User').split(' ')[0]}'s Partners`}
        </h1>
        {isOwner && hasAny && (
          <Button asChild className="min-h-11 bg-[#0044CC] hover:bg-[#0044CC]/90 text-white">
            <Link to="/agreements/new">Invite a new partner</Link>
          </Button>
        )}
      </div>

      <section aria-label="Partner Agreements">
        {!hasAny ? (
          <EmptyState isOwner={isOwner} />
        ) : (
          <div className="space-y-6">
            {incomingInvitations.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Invited to sign ({incomingInvitations.length})
                </h2>
                <ul className="space-y-0.5">
                  {incomingInvitations.map((agreement) => (
                    <li key={agreement.id}>
                      <Link
                        to={`/agreements/${agreement.id}/accept?token=${encodeURIComponent(agreement.invitationToken)}`}
                        className="flex items-center gap-3 px-4 py-3 min-h-14 rounded-lg hover:bg-muted/50 active:bg-muted transition-colors block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Invitation from ${agreement.creator?.name ?? 'someone'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-foreground">
                            {agreement.creator?.name ?? 'Someone'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">Invited you to co-sign</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Review
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeAgreements.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Active ({activeAgreements.length})
                </h2>
                <ul className="space-y-0.5">
                  {activeAgreements.map((agreement) => (
                    <AgreementRow
                      key={agreement.id}
                      agreement={agreement}
                      currentProfileId={profile.id}
                    />
                  ))}
                </ul>
              </div>
            )}

            {pendingAgreements.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pending invitation ({pendingAgreements.length})
                </h2>
                <ul className="space-y-0.5">
                  {pendingAgreements.map((agreement) => (
                    <AgreementRow
                      key={agreement.id}
                      agreement={agreement}
                      currentProfileId={profile.id}
                      resendable={isOwner}
                      cancelable={isOwner}
                      onCancelled={(id) => setAgreements((prev) => prev.filter((a) => a.id !== id))}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
