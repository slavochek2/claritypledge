/**
 * @file profile-page.tsx
 * @description This page displays a user's public profile.
 * It's the canonical page for a single pledge, showing the user's name, role, the reason they signed,
 * and a list of people who have witnessed their pledge.
 * This page is viewable by anyone, but it has two states: one for the profile owner and one for visitors.
 * Owners see a preview banner and other management tools, while visitors see the public-facing profile
 * and have the option to "witness" the pledge themselves.
 * It's a cornerstone of the application, making the pledges public and verifiable.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getProfile, getProfileBySlug, addWitness, type Profile } from "@/app/data/api";
import { ProfileVisitorView } from "@/app/components/profile/profile-visitor-view";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircleIcon } from "lucide-react";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const firstTime = searchParams.get("firstTime") === "true";
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user: currentUser, session, isLoading: isUserLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const hasTrackedPageView = useRef(false);

  // Track current user ID for retry logic (stable reference)
  const currentUserId = currentUser?.id;
  const currentUserSlug = currentUser?.slug;

  useEffect(() => {
    console.log('ProfilePage: useEffect triggered. ID:', id, 'firstTime:', firstTime);
    if (!id) {
      console.error('❌ ProfilePage: No ID provided in URL params');
      return;
    }

    // Don't refetch if we already have the profile for this slug/id
    if (profile && (profile.slug === id || profile.id === id)) {
      console.log('ProfilePage: Profile already loaded, skipping fetch');
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
        console.log('🔍 ProfilePage: Loading profile with ID/slug:', id, retryCount > 0 ? `(retry ${retryCount})` : '');

        // Try to load by slug first, then fall back to ID
        let profileData = await getProfileBySlug(id);
        console.log('📊 ProfilePage: getProfileBySlug result:', profileData ? 'Found' : 'Not found');

        if (!profileData) {
          console.log('🔄 ProfilePage: Trying getProfile with ID...');
          profileData = await getProfile(id);
          console.log('📊 ProfilePage: getProfile result:', profileData ? 'Found' : 'Not found');
        }

        // If profile not found but current user's slug matches, retry once after a short delay.
        // This handles the rare case where the DB write from AuthCallbackPage hasn't propagated yet.
        if (!profileData && (currentUserSlug === id || currentUserId === id) && retryCount === 0) {
          console.log('🔄 ProfilePage: Profile not found but user matches. Retrying in 500ms...');
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadProfile(1);
        }

        if (profileData) {
          console.log('✅ ProfilePage: Profile loaded successfully:', {
            id: profileData.id,
            name: profileData.name,
            slug: profileData.slug,
            isVerified: profileData.isVerified
          });

          // Track profile page view (once per page load)
          if (!hasTrackedPageView.current) {
            hasTrackedPageView.current = true;
            analytics.track('profile_page_viewed', {
              profile_slug: profileData.slug,
              is_owner: currentUserId === profileData.id,
              witness_count: profileData.witnesses?.length || 0,
            });
          }
        } else {
          console.error('❌ ProfilePage: No profile found for:', id);
        }

        setProfile(profileData);
        console.log('ProfilePage: Profile data set. Profile:', profileData);

        // Show welcome dialog for first-time visitors (owners only)
        if (firstTime && currentUserId && profileData && currentUserId === profileData.id) {
          setShowWelcome(true);
          analytics.track('welcome_dialog_shown', { profile_slug: profileData.slug });
          // Clear flags from session storage once user is viewing their own profile
          sessionStorage.removeItem('firstTimePledge');
          sessionStorage.removeItem('pendingProfile');
        }
      } catch (error) {
        console.error("❌ ProfilePage: Failed to load profile:", error);
      } finally {
        // Always set loading to false when profile fetch completes
        setLoading(false);
        console.log('ProfilePage: Loading finished.');
      }
    };

    loadProfile();
  }, [id, firstTime, currentUserId, currentUserSlug, profile]); // Removed isUserLoading - profile page fetches independently

  console.log('ProfilePage: Render. Loading:', loading, 'Profile:', profile, 'CurrentUser:', currentUser, 'isUserLoading:', isUserLoading);

  // Only wait for profile loading, not auth loading
  // The profile page can render the public view while auth is still loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading Pledge...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">
            Profile Not Found
          </h1>
          <p className="text-muted-foreground">
            This pledge doesn't exist or has been removed.
          </p>
          <Link to="/">
            <Button className="bg-[#0044CC] hover:bg-[#0033AA] text-white">
              Go to Home
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

    const witnessId = await addWitness(profile.id, witnessName, linkedinUrl);
    console.log(`Witness added: ${witnessName} with witnessId: ${witnessId}`);
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
        url={`/p/${profile.slug}`}
        type="profile"
        profile={{
          name: profile.name,
          role: profile.role,
          signedAt: profile.signedAt,
        }}
      />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-5xl py-12 px-4">
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