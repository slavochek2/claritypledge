/**
 * @file sign-pledge-page.tsx
 * @description This page is where new users officially sign the Polymet Clarity Pledge.
 * It contains a form that collects the user's name, email, and other optional information.
 * This is the primary conversion point for the entire application.
 * After the user submits the form, it triggers the authentication flow (sending a magic link)
 * and shows a success message, instructing them to check their email to verify their pledge.
 */
import { SignPledgeForm } from "@/app/components/pledge/sign-pledge-form";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { getFeaturedProfiles, getVerifiedProfileCount, MAX_FEATURED_PROFILES } from "@/app/data/api";
import { getInitials } from "@/lib/utils";
import type { ProfileSummary } from "@/app/types";

export function SignPledgePage() {
  const navigate = useNavigate();
  const [champions, setChampions] = useState<ProfileSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [socialProofLoaded, setSocialProofLoaded] = useState(false);

  // If user has a recent pending verification (within last hour), redirect to confirmation
  // This prevents stale entries from previous sessions from trapping users
  useEffect(() => {
    const pendingEmail = sessionStorage.getItem('pendingVerificationEmail');
    if (pendingEmail) {
      navigate(`/sign-pledge/confirm?email=${encodeURIComponent(pendingEmail)}`, { replace: true });
    }
  }, [navigate]);

  // Fetch social proof data
  useEffect(() => {
    async function loadSocialProof() {
      try {
        const [profiles, count] = await Promise.all([
          getFeaturedProfiles(),
          getVerifiedProfileCount()
        ]);
        setChampions(profiles.slice(0, MAX_FEATURED_PROFILES));
        setTotalCount(count);
      } catch (error) {
        console.error('Failed to load social proof:', error);
        // Fail gracefully - social proof is non-critical
      } finally {
        setSocialProofLoaded(true);
      }
    }
    loadSocialProof();
  }, []);

  const handleSuccess = () => {
    // Get email from session storage (set by usePledgeForm/createProfile)
    const pendingEmail = sessionStorage.getItem('pendingVerificationEmail');

    // Check if this is a returning user
    const returningUserInfo = localStorage.getItem('returningUserInfo');

    if (returningUserInfo) {
      try {
        const { name } = JSON.parse(returningUserInfo);
        toast.success(`Welcome back, ${name}! Link sent.`);
        localStorage.removeItem('returningUserInfo');
      } catch {
        toast.success("Welcome back! Link sent.");
      }
    } else {
      toast.success("Pledge signed! Check your email.");
    }

    // Redirect to confirmation page with email as query param
    const emailParam = pendingEmail ? encodeURIComponent(pendingEmail) : '';
    navigate(`/sign-pledge/confirm?email=${emailParam}`);
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-serif font-bold mb-4">Take the Pledge</h1>

        {/* Social Proof - Compact Avatar Row */}
        {!socialProofLoaded ? (
          // Skeleton placeholder - prevents layout shift
          <div className="flex flex-col items-center gap-3 mb-4 animate-pulse" aria-hidden="true">
            <div className="flex items-center -space-x-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-muted" />
              ))}
            </div>
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        ) : totalCount > 0 && champions.length > 0 ? (
          <div className="flex flex-col items-center gap-3 mb-4 animate-in fade-in duration-300">
            <div className="flex items-center -space-x-2" role="group" aria-label="Recent clarity champions">
              {champions.map((champion) => {
                // Defensive: skip rendering if champion data is malformed
                if (!champion?.id || !champion?.name) return null;
                return (
                  <div
                    key={champion.id}
                    role="img"
                    aria-label={champion.name}
                    className="w-8 h-8 rounded-full border-2 border-white/80 bg-slate-400 flex items-center justify-center text-white text-xs font-medium"
                  >
                    {getInitials(champion.name)}
                  </div>
                );
              })}
              {totalCount > champions.length && (
                <div
                  className="w-8 h-8 rounded-full border-2 border-white/80 bg-slate-300 flex items-center justify-center text-xs font-medium text-slate-600"
                  aria-label={`${totalCount - champions.length} more champions`}
                >
                  +{totalCount - champions.length}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Join {totalCount} clarity champion{totalCount !== 1 ? 's' : ''} who've taken the pledge
            </p>
          </div>
        ) : null}
      </div>
      <SignPledgeForm
        onSuccess={handleSuccess}
        onSwitchToLogin={() => navigate('/login')}
      />
    </div>
  );
}

