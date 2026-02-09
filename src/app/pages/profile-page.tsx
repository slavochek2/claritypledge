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
 * P113: Added Stories/Points tabs and CalibrationDisplay with mock data
 */
import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getProfile, getProfileBySlug, createProfile, type Profile } from "@/app/data/api";
import { storiesService } from "@/app/data/stories-service";
import { pointsService } from "@/app/data/points-service";
import { calibrationService } from "@/app/data/calibration-service";
import type { StoryWithAuthor, PointWithUserPosition, CalibrationResult } from "@/app/types";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import { MailIcon, ArrowLeftIcon, BookOpenIcon, TargetIcon, PlusIcon } from "lucide-react";
import { CompactProfileCard } from "@/app/components/profile/compact-profile-card";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
// Import prototype components
import { StoryCard as PrototypeStoryCard } from "@/app/prototypes/linkedin-like/components/StoryCard";
import { PointCard as PrototypePointCard } from "@/app/prototypes/linkedin-like/components/PointCard";
import type { Story, Point, PositionEntry } from "@/app/prototypes/shared/types";
import { useNavigate } from "react-router-dom";

// P113: Tab types for Stories/Points
type ProfileTab = 'stories' | 'points';

/**
 * Wrappers for prototype components that fix navigation to production routes
 */

/** Wrapper for StoryCard that handles navigation to production routes */
function StoryCard({ story, context }: { story: Story; context?: string }) {
  const navigate = useNavigate();

  // Intercept navigation by wrapping the story with click handler
  const handleClick = (e: React.MouseEvent) => {
    // If clicking on the card itself (not a button), navigate to story detail
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    navigate(`/story/${story.id}`);
  };

  return (
    <div onClick={handleClick}>
      <PrototypeStoryCard story={story} context={context} disableNavigation={true} />
    </div>
  );
}

/** Wrapper for PointCard that handles navigation to production routes */
function PointCard({ point, profileOwnerId }: { point: Point; profileOwnerId?: string }) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    // If clicking on the card itself (not a button), navigate to point detail
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    navigate(`/point/${point.id}`);
  };

  return (
    <div onClick={handleClick}>
      <PrototypePointCard point={point} profileOwnerId={profileOwnerId} disableNavigation={true} />
    </div>
  );
}

/**
 * Adapters to convert production data to prototype format
 */

/** Fetch linked story IDs for a point from story_points table */
async function getLinkedStoryIdsForPoint(pointId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('story_points')
    .select('story_id')
    .eq('point_id', pointId);

  if (error || !data) return [];
  return data.map(row => row.story_id);
}

/** Fetch linked point IDs for a story from story_points table */
async function getLinkedPointIdsForStory(storyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('story_points')
    .select('point_id')
    .eq('story_id', storyId);

  if (error || !data) return [];
  return data.map(row => row.point_id);
}

/** Convert production StoryWithAuthor to prototype Story format */
async function adaptStory(story: StoryWithAuthor, _profileId: string): Promise<Story> {
  const linkedPointIds = await getLinkedPointIdsForStory(story.id);

  return {
    id: story.id,
    text: story.content,
    authorId: story.authorId,
    createdAt: story.createdAt,
    visibility: 'public', // Production doesn't have visibility yet
    verificationCount: 0, // TODO: add when verification is implemented
    tags: story.tags || [],
    linkedPointIds,
  };
}

/** Convert production PointWithUserPosition to prototype Point format */
async function adaptPoint(
  point: PointWithUserPosition,
  _profileId: string,
  _isOwner: boolean
): Promise<Point> {
  const linkedStoryIds = await getLinkedStoryIdsForPoint(point.id);

  // Build positions map - for profile view, we only show the profile owner's position
  const positions: Record<string, PositionEntry | null> = {};
  if (point.userPosition) {
    positions[profileId] = {
      position: point.userPosition.position,
      timestamp: point.userPosition.createdAt,
    };
  }

  return {
    id: point.id,
    text: point.statement,
    createdAt: point.createdAt || new Date().toISOString(),
    positions,
    linkedStoryIds,
  };
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user: currentUser, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const hasTrackedPageView = useRef(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // P113: Stories/Points state (adapted to prototype format)
  const [activeTab, setActiveTab] = useState<ProfileTab>('stories');
  const [stories, setStories] = useState<Story[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

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

  // P113: Load stories, points, and calibration when profile is available
  useEffect(() => {
    if (!profile?.id) return;

    const loadProfileData = async () => {
      setContentLoading(true);
      setContentError(null);

      try {
        const [userStories, userPoints, userCalibration] = await Promise.all([
          storiesService.getStoriesByAuthor(profile.id),
          pointsService.getPointsWithUserPositions(profile.id),
          calibrationService.getCalibration(profile.id),
        ]);

        // Adapt to prototype format (includes fetching linked stories/points)
        const adaptedStories = await Promise.all(
          userStories.map(story => adaptStory(story, profile.id))
        );
        const adaptedPoints = await Promise.all(
          userPoints.map(point => adaptPoint(point, profile.id, isOwner))
        );

        setStories(adaptedStories);
        setPoints(adaptedPoints);
        setCalibration(userCalibration);
      } catch (error) {
        console.error('Failed to load profile content:', error);
        setContentError('Failed to load content. Please try refreshing the page.');
      } finally {
        setContentLoading(false);
      }
    };

    loadProfileData();
  }, [profile?.id]);

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

  // P113: Handle disabled "Create" button click
  const handleCreateClick = () => {
    toast("Coming soon");
  };

  // Handle resend verification email
  const handleResendEmail = async () => {
    if (!profile?.email) return;

    setIsResending(true);
    setResendSuccess(false);

    try {
      // P50 fix: createProfile requires (name, email, role?, linkedinUrl?, reason?)
      await createProfile(
        profile.name,
        profile.email,
        profile.role,
        profile.linkedinUrl,
        profile.reason
      );
      setResendSuccess(true);

      // Reset success message after 5 seconds
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (error) {
      console.error('Failed to resend verification email:', error);
    } finally {
      setIsResending(false);
    }
  };

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
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="container mx-auto max-w-lg">
          {/* Back button - goes to events for logged-in, home for logged-out */}
          <Link
            to={session ? "/events" : "/"}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back
          </Link>

          {/* P75: Compact Profile Card */}
          <CompactProfileCard profile={profile} isOwner={isOwner} />

          {/* P113: Calibration Display */}
          {calibration && (
            <div className="bg-card border rounded-lg shadow-sm p-6 mt-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">Calibration</h2>
              {calibration.status === 'insufficient' ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">
                    Complete {calibration.sessionsRequired - calibration.sessionsCompleted} more session
                    {calibration.sessionsRequired - calibration.sessionsCompleted !== 1 ? 's' : ''} to see calibration
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {calibration.sessionsCompleted} of {calibration.sessionsRequired} sessions completed
                  </p>
                </div>
              ) : calibration.calibration ? (
                (() => {
                  // Convert 0-10 scale to percentage, handle nulls
                  const listenerPct = calibration.calibration.listenerCalibrationAvg != null
                    ? Math.round(calibration.calibration.listenerCalibrationAvg * 10)
                    : null;
                  const speakerPct = calibration.calibration.speakerCalibrationAvg != null
                    ? Math.round(calibration.calibration.speakerCalibrationAvg * 10)
                    : null;
                  // Overall = average of available scores
                  const overallPct = listenerPct != null && speakerPct != null
                    ? Math.round((listenerPct + speakerPct) / 2)
                    : listenerPct ?? speakerPct;

                  return (
                    <div className="space-y-4">
                      {/* Overall Score */}
                      {overallPct != null && (
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Overall</span>
                            <span className="font-medium text-foreground">{overallPct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${overallPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {/* As Listener */}
                      {listenerPct != null && (
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">As Listener</span>
                            <span className="font-medium text-foreground">{listenerPct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${listenerPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {/* As Speaker */}
                      {speakerPct != null && (
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">As Speaker</span>
                            <span className="font-medium text-foreground">{speakerPct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${speakerPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        Based on {calibration.sessionsCompleted} sessions
                      </p>
                    </div>
                  );
                })()
              ) : null}
            </div>
          )}

          {/* P113: Stories/Points Tabs */}
          <div className="bg-card border rounded-lg shadow-sm mt-4 overflow-hidden">
            {/* Tab Header */}
            <div className="flex border-b border-border" role="tablist" aria-label="Profile content tabs">
              <button
                id="stories-tab"
                role="tab"
                aria-selected={activeTab === 'stories'}
                aria-controls="stories-panel"
                onClick={() => setActiveTab('stories')}
                className={`flex-1 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 ${
                  activeTab === 'stories' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpenIcon className="w-4 h-4" />
                Stories
                {activeTab === 'stories' && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
                )}
              </button>
              <button
                id="points-tab"
                role="tab"
                aria-selected={activeTab === 'points'}
                aria-controls="points-panel"
                onClick={() => setActiveTab('points')}
                className={`flex-1 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-2 ${
                  activeTab === 'points' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TargetIcon className="w-4 h-4" />
                Points
                {activeTab === 'points' && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div
              className="p-4"
              role="tabpanel"
              id={activeTab === 'stories' ? 'stories-panel' : 'points-panel'}
              aria-labelledby={activeTab === 'stories' ? 'stories-tab' : 'points-tab'}
            >
              {contentError ? (
                <div className="text-center py-8">
                  <p className="text-destructive">{contentError}</p>
                </div>
              ) : contentLoading ? (
                <div className="text-center py-8">
                  <div className="animate-pulse text-muted-foreground">Loading...</div>
                </div>
              ) : activeTab === 'stories' ? (
                stories.length > 0 ? (
                  <div className="space-y-3">
                    {stories.map((story) => (
                      <StoryCard
                        key={story.id}
                        story={story}
                        context="profile"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No stories shared yet</p>
                    {isOwner && (
                      <Button
                        variant="outline"
                        className="mt-4 opacity-50 cursor-not-allowed"
                        onClick={handleCreateClick}
                        aria-disabled="true"
                      >
                        <PlusIcon className="w-4 h-4 mr-2" />
                        Share your first story
                      </Button>
                    )}
                  </div>
                )
              ) : (
                points.length > 0 ? (
                  <div className="space-y-3">
                    {points.map((point) => (
                      <PointCard
                        key={point.id}
                        point={point}
                        profileOwnerId={profile.id}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No positions taken yet</p>
                  </div>
                )
              )}
            </div>

            {/* P113: Create Button (owner only, visually disabled but clickable for toast) */}
            {isOwner && (
              <div className="border-t border-border p-4">
                <Button
                  variant="outline"
                  className="w-full opacity-50 cursor-not-allowed"
                  onClick={handleCreateClick}
                  aria-disabled="true"
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Create {activeTab === 'stories' ? 'Story' : 'Point'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
