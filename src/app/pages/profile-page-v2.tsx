/**
 * @file profile-page-v2.tsx
 * @description Profile page v2 - Full interactive UI matching linkedin-like prototype.
 * P115: Imports all interactive components from prototype (tooltips, share dialogs,
 * position buttons, expandable sections, navigation to detail pages).
 *
 * Route: /p/:id
 * Access: Public (all users with confirmed emails)
 */
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getProfile, getProfileBySlug, createProfile, type Profile } from "@/app/data/api";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import {
  MailIcon,
  ArrowLeft,
  Share2,
  Ear,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pin,
} from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// P115: Import interactive components from prototype
import { InlineCalibration } from "@/app/components/profile/calibration-display";
import {
  MobileTooltip,
  ShareButton,
  ShareDialog,
  PositionButtons,
  PositionBadge,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from "@/app/prototypes/linkedin-like/components/shared";
import type { PositionType, Position, Story as ProtoStory, Point } from "@/app/prototypes/shared/types";
import { getPositionGroup, type PositionButtonGroup } from "@/app/prototypes/shared/types";
// P116: Import shared mock data utilities (DRY - don't duplicate)
import {
  getMockDataForProfile,
  getPointPositionCounts,
  formatTimeAgo,
  type MockUser,
} from "@/app/data/mock-profile-data";
import { storiesService } from "@/app/data/stories-service";
import type { StoryWithAuthor } from "@/app/types";

// Routes for detail pages (main app, not prototype)
// Points include a 'from' param to provide profile context
const detailRoutes = {
  story: (id: string) => `/story/${id}`,
  point: (id: string, profileId?: string) => profileId ? `/point/${id}?from=${profileId}` : `/point/${id}`,
};

// Tab types
type ContentTab = 'stories' | 'points';

export function ProfilePageV2() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user: currentUser, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const hasTrackedPageView = useRef(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);

  // P115: Stories/Points/Calibration state
  const [contentTab, setContentTab] = useState<ContentTab>('stories');
  const [mockData, setMockData] = useState<ReturnType<typeof getMockDataForProfile> | null>(null);
  const [realStories, setRealStories] = useState<StoryWithAuthor[]>([]);

  // Track current user ID for retry logic
  const currentUserId = currentUser?.id;
  const currentUserSlug = currentUser?.slug;

  // Load profile
  useEffect(() => {
    if (!id) return;

    if (profile && (profile.slug === id || profile.id === id)) {
      return;
    }

    if (profile && profile.slug !== id && profile.id !== id) {
      setProfile(null);
    }

    const loadProfile = async (retryCount = 0) => {
      setLoading(true);

      try {
        let profileData = await getProfileBySlug(id);

        if (!profileData) {
          profileData = await getProfile(id);
        }

        if (!profileData && (currentUserSlug === id || currentUserId === id) && retryCount === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadProfile(1);
        }

        if (profileData) {
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
      } catch (err) {
        console.error("ProfilePageV2: Failed to load profile:", err);
        setError("Failed to load profile. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id, currentUserId, currentUserSlug, profile]);

  // Load mock data (for points/calibration) and real stories when profile is available
  useEffect(() => {
    if (!profile) return;
    const data = getMockDataForProfile(profile);
    setMockData(data);

    // Load real stories from storiesService
    storiesService.getStoriesByAuthor(profile.id).then(stories => {
      setRealStories(stories);
    }).catch(err => {
      console.error('Failed to load stories:', err);
    });
  }, [profile]);

  const handleCreateClick = useCallback(() => {
    navigate('/create');
  }, [navigate]);

  // Handle resend verification email
  const handleResendEmail = async () => {
    if (!profile?.email) return;

    setIsResending(true);
    setResendSuccess(false);

    try {
      await createProfile(
        profile.name,
        profile.email,
        profile.role,
        profile.linkedinUrl,
        profile.reason
      );
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (error) {
      console.error('Failed to resend verification email:', error);
      toast.error('Failed to send email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => {
                setError(null);
                setLoading(true);
                window.location.reload();
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              Try Again
            </Button>
            <Link to="/events">
              <Button variant="outline">Go to Events</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">Profile Not Found</h1>
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
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <MailIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>

              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Verify Your Email
                </h1>
                <p className="text-muted-foreground">
                  To access your profile, please verify your email address.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">We sent a link to:</p>
                <p className="text-base font-medium text-foreground">{profile.email}</p>
              </div>

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

  // Stories come from real service; points/calibration still from mock
  const userStories = realStories;
  const userPoints = mockData?.points || [];
  const mockStories = mockData?.stories || []; // Used by points tab for linked stories
  const calibration = mockData?.calibration || null;
  const credibilityStats = mockData?.credibilityStats || { ear: 0, mic: 0 };

  // Main profile view (matches prototype Profile.tsx UI with full interactivity)
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
      <div className="relative max-w-4xl mx-auto pb-20">
        {/* Main profile content - centered */}
        <div className="max-w-lg mx-auto px-4 mt-3">
          {/* Back button - P114: uses history if from same site, fallback to /events */}
          <button
            onClick={() => {
              const referrer = document.referrer;
              let sameOrigin = false;
              try {
                sameOrigin = referrer ? new URL(referrer).origin === window.location.origin : false;
              } catch {
                // Invalid URL - treat as external
              }
              if (sameOrigin) {
                navigate(-1);
              } else {
                navigate('/events');
              }
            }}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={16} className="mr-1" />
            Back
          </button>

          {/* Profile header card - matches prototype compact-profile-card */}
          <div className="bg-card rounded-lg border border-border shadow-sm p-6">
            {/* Top row: Avatar + Name/Role + Share button */}
            <div className="flex items-start gap-4">
              {/* Avatar - blue ring if pledger */}
              <div className="flex-shrink-0">
                <GravatarAvatar
                  name={profile.name}
                  size="lg"
                  isPledger={profile.hasPledged}
                />
              </div>

              {/* Name and Role */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground truncate">{profile.name}</h2>
                  {credibilityStats.ear > 0 && (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground cursor-default">
                            <Ear size={14} />
                            {credibilityStats.ear}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {isOwner
                              ? `You understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`
                              : `${profile.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`
                            }
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {profile.role && (
                  <p className="text-sm text-muted-foreground truncate">{profile.role}</p>
                )}
                {profile.hasPledged ? (
                  <Link
                    to={`/p/${profile.slug}/pledge`}
                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1 inline-block"
                  >
                    {isOwner ? 'See my Clarity Pledge' : 'See their Clarity Pledge'}
                  </Link>
                ) : isOwner ? (
                  <Link
                    to="/sign-pledge"
                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1 inline-block"
                  >
                    Take the Clarity Pledge
                  </Link>
                ) : null}
              </div>

              {/* Share button - only shown for profile owner */}
              {isOwner && (
                <MobileTooltip content="Share profile">
                  <button
                    onClick={() => setShowShareDialog(true)}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors flex-shrink-0"
                    aria-label="Share profile"
                  >
                    <Share2 size={16} />
                  </button>
                </MobileTooltip>
              )}
            </div>

            {/* Calibration bars - inline */}
            {calibration && (
              <InlineCalibration calibration={calibration} />
            )}
          </div>

          {/* Create Stories & Points CTA (owner only) */}
          {isOwner && (
            <div className="pt-3">
              <button
                onClick={handleCreateClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Sparkles size={18} />
                <span className="text-sm font-medium">Create Story</span>
              </button>
            </div>
          )}

          {/* Content tab selector */}
          <div className="bg-card border border-border mt-3 rounded-lg overflow-hidden">
            {/* Stories / Points tabs */}
            <div className="flex" role="tablist" aria-label="Profile content tabs">
              <button
                id="stories-tab"
                role="tab"
                aria-selected={contentTab === 'stories'}
                aria-controls="stories-panel"
                onClick={() => setContentTab('stories')}
                className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                  contentTab === 'stories'
                    ? 'text-blue-600'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Stories ({userStories.length})
                {contentTab === 'stories' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
              <button
                id="points-tab"
                role="tab"
                aria-selected={contentTab === 'points'}
                aria-controls="points-panel"
                onClick={() => setContentTab('points')}
                className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                  contentTab === 'points'
                    ? 'text-blue-600'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Points ({userPoints.length})
                {contentTab === 'points' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            </div>
          </div>

          {/* Content list */}
          <div
            className="pt-4 space-y-3"
            role="tabpanel"
            id={contentTab === 'stories' ? 'stories-panel' : 'points-panel'}
            aria-labelledby={contentTab === 'stories' ? 'stories-tab' : 'points-tab'}
          >
            {contentTab === 'stories' ? (
              userStories.length === 0 ? (
                <div className="bg-card rounded-lg p-8 text-center">
                  <p className="text-muted-foreground mb-4">No stories shared yet</p>
                  {isOwner && (
                    <button
                      onClick={handleCreateClick}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Sparkles size={16} />
                      Share your first story
                    </button>
                  )}
                </div>
              ) : (
                userStories.map((story) => (
                  <StoryCardFull
                    key={story.id}
                    story={story}
                    author={{
                      id: profile.id,
                      name: profile.name,
                      role: profile.role,
                      hasPledged: profile.hasPledged,
                    }}
                    credibilityStats={credibilityStats}
                  />
                ))
              )
            ) : (
              userPoints.length === 0 ? (
                <div className="bg-card rounded-lg p-8 text-center">
                  <p className="text-muted-foreground">No positions taken yet</p>
                </div>
              ) : (
                userPoints.map((point) => (
                  <PointCardFull
                    key={point.id}
                    point={point}
                    profileOwner={{
                      id: profile.id,
                      name: profile.name,
                      role: profile.role,
                      hasPledged: profile.hasPledged,
                    }}
                    credibilityStats={credibilityStats}
                    linkedStories={mockStories.filter(s => point.linkedStoryIds.includes(s.id))}
                  />
                ))
              )
            )}
          </div>
        </div>

        {/* Share Profile Dialog (P115) */}
        <ShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          type="profile"
          url={`${window.location.origin}/p/${profile.slug}`}
          title={`${profile.name}'s Clarity Profile`}
          description={`Check out ${profile.name}'s profile on Clarity Pledge`}
        />
      </div>
    </>
  );
}

// =============================================================================
// StoryCardFull - Full interactive StoryCard matching prototype
// =============================================================================

interface StoryCardFullProps {
  story: StoryWithAuthor;
  author: MockUser;
  credibilityStats: { ear: number; mic: number };
}

function StoryCardFull({
  story,
  author,
  credibilityStats,
}: StoryCardFullProps) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(detailRoutes.story(story.id));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="group bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Main content */}
      <div className="p-4">
        {/* Author row with avatar */}
        <div className="flex items-start gap-3">
          {/* Avatar column */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/p/${story.authorSlug || author.id}`);
            }}
            className="flex-shrink-0 hover:opacity-80 transition-opacity self-start"
          >
            <GravatarAvatar
              name={author.name}
              size="sm"
              isPledger={author.hasPledged}
            />
          </button>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            {/* Author info row */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/p/${story.authorSlug || author.id}`);
                  }}
                  className="font-semibold text-foreground hover:underline text-sm"
                >
                  {author.name}
                </button>
                {credibilityStats.ear > 0 && (
                  <MobileTooltip content={`${author.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Ear size={12} />
                      {credibilityStats.ear}
                    </span>
                  </MobileTooltip>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {author.role} · {formatTimeAgo(story.createdAt)}
              </p>
            </div>

            {/* Story text */}
            <p className="text-foreground text-base">{story.content}</p>

            {/* Stats row */}
            {story.understoodCount > 0 && (
              <div className="flex items-center gap-1 mt-3 text-sm text-muted-foreground">
                <span className="px-2.5 py-1 bg-muted rounded-full text-sm">
                  {story.understoodCount} understood
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer row with action icons */}
      <div
        className="flex items-center justify-end pl-[52px] pr-4 py-3 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <ShareButton
            type="story"
            id={story.id}
            title={`${author.name}'s story`}
            description={story.content.slice(0, 100)}
          />
          <MobileTooltip content="Open story">
            <button
              onClick={() => navigate(detailRoutes.story(story.id))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
              aria-label="Open story"
            >
              <ExternalLink size={16} />
            </button>
          </MobileTooltip>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PointCardFull - Full interactive PointCard matching prototype
// =============================================================================

interface PointCardFullProps {
  point: Point;
  profileOwner: MockUser;
  credibilityStats: { ear: number; mic: number };
  linkedStories: ProtoStory[];
}

function PointCardFull({
  point,
  profileOwner,
  credibilityStats,
  linkedStories,
}: PointCardFullProps) {
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    point.positions['current']?.position || null
  );
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const baseCounts = getPointPositionCounts(point);

  // Track initial position from mock data
  const initialPosition = point.positions['current']?.position || null;

  // Compute adjusted counts based on user's current position vs initial
  const counts = useMemo((): SevenPointCounts => {
    const adjusted: SevenPointCounts = {
      strongly_agree: 0,
      agree: baseCounts.agree,
      somewhat_agree: 0,
      unsure: baseCounts.unsure,
      somewhat_disagree: 0,
      disagree: baseCounts.disagree,
      strongly_disagree: 0,
    };

    const getGroup = (pos: PositionType | null): PositionButtonGroup | null => {
      if (!pos) return null;
      return getPositionGroup(pos);
    };

    const initialGroup = getGroup(initialPosition as PositionType | null);
    const currentGroup = getGroup(userPosition as PositionType | null);

    if (initialGroup !== currentGroup) {
      if (initialGroup === 'agree') adjusted.agree = Math.max(0, adjusted.agree - 1);
      else if (initialGroup === 'disagree') adjusted.disagree = Math.max(0, adjusted.disagree - 1);
      else if (initialGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);

      if (currentGroup === 'agree') adjusted.agree++;
      else if (currentGroup === 'disagree') adjusted.disagree++;
      else if (currentGroup === 'unsure') adjusted.unsure++;
    }

    return adjusted;
  }, [baseCounts, initialPosition, userPosition]);

  const handleCardClick = () => {
    navigate(detailRoutes.point(point.id, profileOwner.id));
  };

  const handlePositionClick = (position: Position) => {
    setUserPosition(userPosition === position ? null : position);
  };

  // Get profile owner's position on this point
  const profileOwnerPosition = point.positions[profileOwner.id]?.position;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group bg-card rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-border overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Main content */}
      <div className="p-4">
        {/* Quote pattern: position label outside, Point in quoted box */}
        {profileOwnerPosition && (
          <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
            <GravatarAvatar
              name={profileOwner.name}
              size="sm"
              isPledger={profileOwner.hasPledged}
              className="!w-5 !h-5 !text-[10px]"
            />
            <span className="font-medium">{profileOwner.name}</span>
            {credibilityStats.ear > 0 && (
              <MobileTooltip content={`${profileOwner.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
                <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                  <Ear size={14} />
                  {credibilityStats.ear}
                </span>
              </MobileTooltip>
            )}
            <PositionBadge position={profileOwnerPosition as PositionType} />
          </div>
        )}

        {/* Quoted Point box */}
        <div className="bg-muted border border-border rounded-lg p-3">
          {/* Two-column layout */}
          <div className="flex items-start gap-3">
            {/* Pin icon column */}
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
              <Pin size={16} className="rotate-45" />
            </div>

            {/* Content column */}
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-base">{point.text}</p>

              {/* Position buttons */}
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                />
              </div>
            </div>
          </div>

          {/* Footer - inside quoted box */}
          <div
            className="flex items-center justify-between mt-3 pt-3 border-t border-border pl-[44px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Collapsible trigger (if has linked stories) */}
            {linkedStories.length > 0 ? (
              <button
                onClick={() => setStoriesExpanded(!storiesExpanded)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
                aria-expanded={storiesExpanded}
              >
                {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  {linkedStories.length} {linkedStories.length === 1 ? 'story' : 'stories'} by {profileOwner.name}
                </span>
              </button>
            ) : (
              <span />
            )}

            {/* Action icons */}
            <div className="flex items-center gap-1">
              <ShareButton
                type="point"
                id={point.id}
                description={point.text.slice(0, 100)}
              />
              <MobileTooltip content="Open point">
                <button
                  onClick={() => navigate(detailRoutes.point(point.id, profileOwner.id))}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                  aria-label="Open point"
                >
                  <ExternalLink size={16} />
                </button>
              </MobileTooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded linked stories */}
      {storiesExpanded && linkedStories.length > 0 && (
        <div className="pl-4 sm:pl-[60px] pr-4 pb-4" onClick={(e) => e.stopPropagation()}>
          {linkedStories.length === 1 ? (
            <QuotedStoryCard
              story={linkedStories[0]}
              author={profileOwner}
              credibilityStats={credibilityStats}
            />
          ) : (
            <ThreadLineGroup>
              {linkedStories.slice(0, 3).map((story, index) => (
                <ThreadLineItem key={story.id} isLast={index === linkedStories.length - 1}>
                  <QuotedStoryCard
                    story={story}
                    author={profileOwner}
                    credibilityStats={credibilityStats}
                  />
                </ThreadLineItem>
              ))}
              {linkedStories.length > 3 && (
                <ThreadLineItem isLast>
                  <button
                    onClick={() => navigate(detailRoutes.point(point.id, profileOwner.id))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    +{linkedStories.length - 3} more stories
                  </button>
                </ThreadLineItem>
              )}
            </ThreadLineGroup>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// QuotedStoryCard - Story shown inside a Point card
// =============================================================================

interface QuotedStoryCardProps {
  story: ProtoStory;
  author: MockUser;
  credibilityStats: { ear: number; mic: number };
}

function QuotedStoryCard({ story, author, credibilityStats }: QuotedStoryCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(detailRoutes.story(story.id))}
      className="group/quote w-full text-left p-3 rounded-lg border border-border bg-muted hover:bg-muted/80 hover:border-border transition-colors cursor-pointer"
    >
      {/* Author info at top */}
      <div className="flex items-center gap-2 mb-1.5">
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/p/${author.id}`);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/p/${author.id}`);
            }
          }}
          className="hover:opacity-80 transition-opacity cursor-pointer"
        >
          <GravatarAvatar
            name={author.name}
            size="sm"
            isPledger={author.hasPledged}
            className="!w-6 !h-6 !text-[11px]"
          />
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/p/${author.id}`);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/p/${author.id}`);
            }
          }}
          className="text-xs font-medium text-foreground hover:underline cursor-pointer"
        >
          {author.name}
        </span>
        {credibilityStats.ear > 0 && (
          <MobileTooltip content={`${author.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
              <Ear size={12} />
              {credibilityStats.ear}
            </span>
          </MobileTooltip>
        )}
      </div>
      {/* Story text */}
      <p className="text-sm text-foreground line-clamp-2">{story.text}</p>
    </div>
  );
}
