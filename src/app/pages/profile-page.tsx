/**
 * @file profile-page.tsx
 * @description This page displays a user's profile (P50: Profile & Pledge Separation).
 * Route: /p/:slug
 * Access: Public (all users with confirmed emails)
 * Shows: Name, role, avatar, and pledge status with appropriate CTAs.
 * - If owner + unverified: Email verification prompt
 * - If owner + pledger: "View My Pledge" button
 * - If owner + non-pledger: "Take the Pledge" CTA button
 * - If visitor + pledger: "View their pledge" link
 * - If visitor + non-pledger: No pledge link
 * Future: Events attended, Stories/Points (P58)
 */
import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getProfile, getProfileBySlug, createProfile, type Profile } from "@/app/data/api";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { MailIcon } from "lucide-react";

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user: currentUser, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const hasTrackedPageView = useRef(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Track current user ID for retry logic (stable reference)
  const currentUserId = currentUser?.id;
  const currentUserSlug = currentUser?.slug;

  useEffect(() => {
    if (!id) return;

    // Don't refetch if we already have the profile for this slug/id
    if (profile && (profile.slug === id || profile.id === id)) {
      return;
    }

    // Clear stale profile when navigating to a different profile
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

        // If profile not found but current user's slug matches, retry once after a short delay
        if (!profileData && (currentUserSlug === id || currentUserId === id) && retryCount === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadProfile(1);
        }

        if (profileData) {
          // Track profile page view (once per page load)
          if (!hasTrackedPageView.current) {
            hasTrackedPageView.current = true;
            analytics.track('profile_page_viewed', {
              profile_slug: profileData.slug,
              is_owner: currentUserId === profileData.id,
              has_pledged: profileData.hasPledged,
            });
          }
        }

        setProfile(profileData);
      } catch (error) {
        console.error("ProfilePage: Failed to load profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id, currentUserId, currentUserSlug, profile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading profile...</div>
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
            This profile doesn't exist or has been removed.
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

  const isOwner = session?.user?.id === profile.id;
  const hasPledged = profile.hasPledged;

  // Handle resend verification email
  const handleResendEmail = async () => {
    if (!profile?.email) return;

    setIsResending(true);
    setResendSuccess(false);

    try {
      await createProfile(profile.email);
      setResendSuccess(true);

      // Reset success message after 5 seconds
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (error) {
      console.error('Failed to resend verification email:', error);
    } finally {
      setIsResending(false);
    }
  };

  const avatarColor = getAvatarColor(profile.name, profile.avatarColor);

  // Show verification prompt for unverified owners
  if (isOwner && !profile.isVerified) {
    return (
      <>
        <SEO
          title="Verify Your Email"
          description="Verify your email to access your Clarity Pledge profile"
          url={`/p/${profile.slug}`}
        />
        <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
          <div className="container mx-auto max-w-lg">
            <div className="bg-card border rounded-lg shadow-sm p-8 text-center space-y-6">
              {/* Email Icon */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <MailIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>

              {/* Heading */}
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Verify Your Email
                </h1>
                <p className="text-muted-foreground">
                  To access your profile, please verify your email address.
                </p>
              </div>

              {/* Email Display */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">
                  We sent a link to:
                </p>
                <p className="text-base font-medium text-foreground">
                  {profile.email}
                </p>
              </div>

              {/* Resend Button */}
              <div className="space-y-3">
                <Button
                  onClick={handleResendEmail}
                  disabled={isResending || resendSuccess}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {isResending ? 'Sending...' : resendSuccess ? '✓ Email Sent!' : 'Resend Verification Email'}
                </Button>

                {resendSuccess && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Verification email sent! Please check your inbox.
                  </p>
                )}
              </div>

              {/* Help Text */}
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Already verified? Try{' '}
                  <button
                    onClick={() => window.location.reload()}
                    className="text-blue-500 hover:text-blue-600 underline"
                  >
                    refreshing this page
                  </button>{' '}
                  or{' '}
                  <Link to="/login" className="text-blue-500 hover:text-blue-600 underline">
                    logging out and back in
                  </Link>
                  .
                </p>
              </div>

              {/* Home Link */}
              <div className="pt-2">
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
                  ← Back to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title={profile.name}
        description={`${profile.name}'s profile on Clarity Pledge${profile.role ? ` - ${profile.role}` : ''}`}
        url={`/p/${profile.slug}`}
        type="profile"
        profile={{
          name: profile.name,
          role: profile.role,
          signedAt: profile.signedAt,
        }}
      />
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="container mx-auto max-w-3xl">
          {/* Profile Card */}
          <div className="bg-card border rounded-lg shadow-sm p-8">
            <div className="flex flex-col items-center text-center space-y-6">
              {/* Avatar with optional blue ring for pledgers */}
              <div className={`relative ${hasPledged ? 'p-1 bg-blue-500 rounded-full' : ''}`}>
                <div className={`w-24 h-24 rounded-full ${avatarColor} flex items-center justify-center text-white text-3xl font-bold`}>
                  {getInitials(profile.name)}
                </div>
              </div>

              {/* Name and Role */}
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  {profile.name}
                </h1>
                {profile.role && (
                  <p className="text-lg text-muted-foreground">
                    {profile.role}
                  </p>
                )}
              </div>

              {/* Pledge Status & CTAs */}
              <div className="w-full space-y-4 pt-4">
                {isOwner ? (
                  // Owner viewing their own profile
                  <div className="space-y-3">
                    {hasPledged ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          You've signed the Clarity Pledge
                        </p>
                        <Link to={`/p/${profile.slug}/pledge`} className="block">
                          <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                            View My Pledge
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Ready to make your public commitment?
                        </p>
                        <Link to="/sign-pledge?prefill=true" className="block">
                          <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                            Take the Pledge
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>
                ) : (
                  // Visitor viewing someone else's profile
                  <div className="space-y-3">
                    {hasPledged ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {profile.name.split(' ')[0]} has signed the Clarity Pledge
                        </p>
                        <Link
                          to={`/p/${profile.slug}/pledge`}
                          className="text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1"
                        >
                          View their pledge →
                        </Link>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Member of the Clarity community
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Future: Events attended, Stories/Points (P58) */}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
