import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { getProfile, getProfileBySlug, addWitness, type Profile } from "@/polymet/data/api";
import { ProfileVisitorView } from "@/polymet/components/profile-visitor-view";
import { OwnerPreviewBanner } from "@/polymet/components/owner-preview-banner";
import { UnverifiedProfileBanner } from "@/polymet/components/unverified-profile-banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircleIcon } from "lucide-react";
import { useUser } from "@/hooks/use-user";

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const firstTime = searchParams.get("firstTime") === "true";
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user: currentUser, isLoading: isUserLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    console.log('ProfilePage: useEffect triggered. ID:', id, 'firstTime:', firstTime);
    if (!id) {
      console.error('❌ ProfilePage: No ID provided in URL params');
      return;
    }
    
    const loadProfile = async () => {
      try {
        console.log('🔍 ProfilePage: Loading profile with ID/slug:', id);
        
        // Load profile and current user in parallel for better performance
        const profileData = await (async () => {
            // Try to load by slug first, then fall back to ID
            let data = await getProfileBySlug(id);
            console.log('📊 ProfilePage: getProfileBySlug result:', data ? 'Found' : 'Not found');
            
            if (!data) {
              console.log('🔄 ProfilePage: Trying getProfile with ID...');
              data = await getProfile(id);
              console.log('📊 ProfilePage: getProfile result:', data ? 'Found' : 'Not found');
            }
            
            if (data) {
              console.log('✅ ProfilePage: Profile loaded successfully:', {
                id: data.id,
                name: data.name,
                slug: data.slug,
                isVerified: data.isVerified
              });
            } else {
              console.error('❌ ProfilePage: No profile found for:', id);
            }
            
            return data;
          })();
        
        setProfile(profileData);
        console.log('ProfilePage: Profile data set. Profile:', profileData);
        
        // Show welcome dialog for first-time visitors (owners only)
        if (firstTime && currentUser && profileData && currentUser.id === profileData.id) {
          setShowWelcome(true);
          // Clear flags from local storage once user is viewing their own profile
          localStorage.removeItem('firstTimePledge');
          localStorage.removeItem('pendingProfile'); // Use new key
        }
      } catch (error) {
        console.error("❌ ProfilePage: Failed to load profile:", error);
      } finally {
        setLoading(false);
        console.log('ProfilePage: Loading finished.');
      }
    };

    loadProfile();
  }, [id, firstTime, currentUser]);

  console.log('ProfilePage: Render. Loading:', loading, 'Profile:', profile, 'CurrentUser:', currentUser);

  if (loading || isUserLoading) {
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

  const isOwner = currentUser && profile && currentUser.id === profile.id;
  const isVerified = profile?.isVerified ?? false;
  const profileUrl = `${window.location.origin}/p/${profile?.slug || profile?.id}`;

  // The unverified banner is now driven by the user state from the hook
  const showUnverifiedBanner = isOwner && (!isVerified || (currentUser as any)?.isPending);

  const handleWitness = async (witnessName: string, linkedinUrl?: string) => {
    if (!profile) return;
    try {
      const witnessId = await addWitness(profile.id, witnessName, linkedinUrl);
      console.log(`Witness added: ${witnessName} with witnessId: ${witnessId}`);
      // Refresh profile to show new witness
      const updatedProfile = profile.slug 
        ? await getProfileBySlug(profile.slug)
        : await getProfile(profile.id);
      if (updatedProfile) setProfile(updatedProfile);
    } catch (error) {
      console.error("Error adding witness:", error);
    }
  };

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    // Remove firstTime param from URL
    searchParams.delete("firstTime");
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* Banners */}
        {showUnverifiedBanner && <UnverifiedProfileBanner email={profile.email} />}
        {isOwner && isVerified && !(currentUser as any)?.isPending && <OwnerPreviewBanner profileUrl={profileUrl} />}
        
        <div className="container mx-auto max-w-5xl py-12 px-4">
          {profile && (
            <ProfileVisitorView 
              profile={profile} 
              onWitness={handleWitness}
              isOwner={!!isOwner}
              currentUser={currentUser}
            />
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
              Welcome! Your Clarity Pledge is Created
            </DialogTitle>
            <DialogDescription className="text-center space-y-4 pt-4">
              <p>
                This is how others will see your commitment to clarity.
              </p>
              {!profile?.isVerified && (
                <p className="text-sm bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                  <strong>Next step:</strong> Check your email to verify your pledge and unlock sharing tools.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Link to="/dashboard" className="w-full">
              <Button className="w-full bg-[#0044CC] hover:bg-[#003399]">
                Go to Dashboard
              </Button>
            </Link>
            <Button variant="outline" onClick={handleCloseWelcome} className="w-full">
              Stay Here
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
