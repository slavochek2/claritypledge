/**
 * @file pledge-page.tsx
 * @description This page displays a user's pledge certificate (P50: Profile & Pledge Separation).
 * Route: /p/:slug/pledge
 * Access: Public, but only available for users with has_pledged=true (shows "not found" for non-pledgers).
 * Shows the full pledge certificate with pledge text, witnesses, QR code, and reason.
 * This page is viewable by anyone, but it has two states: one for the pledge owner and one for visitors.
 * Owners see a preview banner and share tools, while visitors see the public-facing certificate
 * and have the option to "witness" the pledge themselves.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { getProfile, getProfileBySlug, addWitness, type Profile } from "@/app/data/api";
import { ProfileVisitorView } from "@/app/components/profile/pledge-certificate-view";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircleIcon, ArrowLeft } from "lucide-react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";

export function PledgePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const firstTime = searchParams.get("firstTime") === "true";

  const [profile, setProfile] = useState<Profile | null>(null);
  const { user: currentUser, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const hasTrackedPageView = useRef(false);

  // Track current user ID for retry logic (stable reference)
  const currentUserId = currentUser?.id;
  const currentUserSlug = currentUser?.slug;

  useEffect(() => {
    if (!id) return;

    // Don't refetch if we already have the profile for this slug/id
    if (profile && (profile.slug === id || profile.id === id)) {
      // Still handle firstTime welcome dialog
      if (firstTime && currentUserId && profile.id === currentUserId) {
        setShowWelcome(true);
        sessionStorage.removeItem('firstTimePledge');
        sessionStorage.removeItem('pendingProfile');
      }
      return;
    }

    // Clear stale profile when navigating to a different profile
    // This prevents showing old profile data while new one loads
    if (profile && profile.slug !== id && profile.id !== id) {
      setProfile(null);
    }

    const loadProfile = async (retryCount = 0) => {
      setLoading(true);

      try {
        // Try to load by slug first, then fall back to ID
        let profileData = await getProfileBySlug(id);

        if (!profileData) {
          profileData = await getProfile(id);
        }

        // If profile not found but current user's slug matches, retry once after a short delay.
        // This handles the rare case where the DB write from AuthCallbackPage hasn't propagated yet.
        if (!profileData && (currentUserSlug === id || currentUserId === id) && retryCount === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadProfile(1);
        }

        if (profileData) {
          // Track pledge page view (once per page load)
          if (!hasTrackedPageView.current) {
            hasTrackedPageView.current = true;
            analytics.track('pledge_page_viewed', {
              profile_slug: profileData.slug,
              is_owner: currentUserId === profileData.id,
              witness_count: profileData.witnesses?.length || 0,
            });
          }
        }

        setProfile(profileData);

        // Show welcome dialog for first-time visitors (owners only)
        if (firstTime && currentUserId && profileData && currentUserId === profileData.id) {
          setShowWelcome(true);
          analytics.track('welcome_dialog_shown', { profile_slug: profileData.slug });
          // Clear flags from session storage once user is viewing their own profile
          sessionStorage.removeItem('firstTimePledge');
          sessionStorage.removeItem('pendingProfile');
        }
      } catch (error) {
        console.error("PledgePage: Failed to load profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id, firstTime, currentUserId, currentUserSlug, profile]);

  // Only wait for profile loading, not auth loading
  // The profile page can render the public view while auth is still loading
  if (loading) {
    return <ClarityPageLoader />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            Pledge Not Found
          </h1>
          <p className="text-muted-foreground">
            This pledge doesn't exist or has been removed.
          </p>
          <Link to="/">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">
              Go to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // P50: Show "not found" if user hasn't pledged (certificate only available for pledgers)
  if (!profile.hasPledged) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            Pledge Not Found
          </h1>
          <p className="text-muted-foreground">
            This user hasn't signed the Clarity Pledge yet.
          </p>
          <Link to={`/p/${profile.slug}`}>
            <Button variant="outline">
              View Profile
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Use session.user.id for instant owner detection (no DB fetch needed)
  // This prevents "visitor view flicker" while profile is still loading
  const isOwner = session?.user?.id === profile.id;

  const handleWitness = async (witnessName: string, linkedinUrl?: string) => {
    if (!profile) throw new Error("No profile loaded");

    await addWitness(profile.id, witnessName, linkedinUrl);
    // Refresh profile to show new witness
    const updatedProfile = profile.slug
      ? await getProfileBySlug(profile.slug)
      : await getProfile(profile.id);
    if (updatedProfile) setProfile(updatedProfile);
  };

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    // Remove firstTime param from URL
    searchParams.delete("firstTime");
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <>
      <SEO
        title={profile.name}
        description={profile.reason || `${profile.name} has signed the Clarity Pledge, committing to clear, honest communication.`}
        url={`/p/${profile.slug}/pledge`}
        type="profile"
        profile={{
          name: profile.name,
          role: profile.role,
          signedAt: profile.signedAt,
        }}
      />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-5xl py-12 px-4">
          {/* P114: Back button to profile */}
          <button
            onClick={() => navigate(`/p/${profile.slug}`)}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </button>
          {profile && (
            <>
              <ProfileVisitorView
                profile={profile}
                onWitness={handleWitness}
                isOwner={!!isOwner}
                currentUser={currentUser}
              />
            </>
          )}
        </div>
      </div>

      {/* First Time Welcome Dialog */}
      <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircleIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-center text-2xl">
              Pledge Sealed
            </DialogTitle>
            <DialogDescription className="text-center space-y-4 pt-4">
              <p>
                Your public promise is live!
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button variant="outline" onClick={handleCloseWelcome} className="w-full">
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}