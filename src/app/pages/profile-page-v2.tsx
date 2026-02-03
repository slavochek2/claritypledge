/**
 * @file profile-page-v2.tsx
 * @description Profile page v2 - plugged from linkedin-like prototype.
 * P113 v2: Uses prototype UI with real auth + profile data, mock Stories/Points/Calibration.
 *
 * Route: /p/:id
 * Access: Public (all users with confirmed emails)
 *
 * This version mirrors the prototype's Profile.tsx UI while connecting to production
 * auth (useAuth) and profile (getProfileBySlug) systems.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getProfile, getProfileBySlug, createProfile, type Profile } from "@/app/data/api";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import { MailIcon, ArrowLeft, Share2, Ear, Sparkles } from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// P113 v2: Import calibration display
import { InlineCalibration, type UserCalibration } from "@/app/components/profile/calibration-display";

// P113 v2: Mock data for Stories/Points/Calibration (will be replaced with real data later)
// These types mirror the prototype's shared types
interface MockStory {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  visibility: 'public' | 'shared' | 'private';
  linkedPointIds: string[];
  verificationCount: number;
}

interface MockPoint {
  id: string;
  text: string;
  createdAt: string;
  positions: Record<string, { position: string; timestamp: string } | undefined>;
  linkedStoryIds: string[];
}

// Mock data factory - generates mock data for any profile
function getMockDataForProfile(profileId: string): {
  stories: MockStory[];
  points: MockPoint[];
  calibration: UserCalibration | null;
  credibilityStats: { ear: number; mic: number };
} {
  // Generate consistent mock data based on profile ID
  const seed = profileId.charCodeAt(0) || 1;
  const hasEnoughSessions = seed % 3 !== 0; // 2/3 users have calibration data

  const mockStories: MockStory[] = [
    {
      id: `st-${profileId}-1`,
      text: 'After switching to fully remote, I found myself shipping 40% more features. The lack of interruptions and commute time gave me deep focus blocks I never had in the office.',
      authorId: profileId,
      createdAt: '2026-01-03T10:00:00Z',
      visibility: 'public',
      linkedPointIds: ['pt1', 'pt2'],
      verificationCount: 3,
    },
    {
      id: `st-${profileId}-2`,
      text: 'Our team tried a "no meetings Wednesday" experiment. Productivity went through the roof - I finished a project that had been stalled for weeks.',
      authorId: profileId,
      createdAt: '2026-01-08T14:00:00Z',
      visibility: 'shared',
      linkedPointIds: ['pt1', 'pt2'],
      verificationCount: 2,
    },
  ];

  const mockPoints: MockPoint[] = [
    {
      id: 'pt1',
      text: 'Remote work is more productive than office work for knowledge workers',
      createdAt: '2026-01-01T10:00:00Z',
      positions: {
        [profileId]: { position: 'agree', timestamp: '2026-01-07T08:30:00Z' },
      },
      linkedStoryIds: [`st-${profileId}-1`],
    },
    {
      id: 'pt2',
      text: 'Fewer meetings leads to better outcomes',
      createdAt: '2026-01-02T14:00:00Z',
      positions: {
        [profileId]: { position: 'strongly_agree', timestamp: '2026-01-06T11:15:00Z' },
      },
      linkedStoryIds: [`st-${profileId}-2`],
    },
  ];

  const mockCalibration: UserCalibration | null = hasEnoughSessions
    ? {
        listener: { avgGap: -0.5 + (seed % 20) / 10, state: 'calibrated', sessionCount: 8 + (seed % 5) },
        speaker: { avgGap: 0.2, state: 'calibrated', sessionCount: 8 + (seed % 5) },
      }
    : null;

  return {
    stories: mockStories,
    points: mockPoints,
    calibration: mockCalibration,
    credibilityStats: { ear: 5 + (seed % 10), mic: 3 + (seed % 8) },
  };
}

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

  // P113 v2: Stories/Points/Calibration state
  const [contentTab, setContentTab] = useState<ContentTab>('stories');
  const [mockData, setMockData] = useState<{
    stories: MockStory[];
    points: MockPoint[];
    calibration: UserCalibration | null;
    credibilityStats: { ear: number; mic: number };
  } | null>(null);

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
      } catch (error) {
        console.error("ProfilePageV2: Failed to load profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id, currentUserId, currentUserSlug, profile]);

  // Load mock data when profile is available
  useEffect(() => {
    if (!profile?.id) return;
    const data = getMockDataForProfile(profile.id);
    setMockData(data);
  }, [profile?.id]);

  // Handle disabled "Create" button click
  const handleCreateClick = () => {
    toast("Coming soon", { description: "Create feature is not yet available" });
  };

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

  // Get mock data
  const userStories = mockData?.stories || [];
  const userPoints = mockData?.points || [];
  const calibration = mockData?.calibration || null;
  const credibilityStats = mockData?.credibilityStats || { ear: 0, mic: 0 };

  // Main profile view (matches prototype Profile.tsx UI)
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
          {/* Back button - dynamic navigation */}
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate(session ? '/me' : '/')}
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

              {/* Share button - top right */}
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `${profile.name}'s Clarity Profile`,
                      url: window.location.href,
                    }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    toast("Link copied", { description: "Profile URL copied to clipboard" });
                  }
                }}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors flex-shrink-0"
                aria-label="Share profile"
              >
                <Share2 size={16} />
              </button>
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
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors opacity-50 cursor-not-allowed"
                aria-disabled="true"
              >
                <Sparkles size={18} />
                <span className="text-sm font-medium">Create Stories & Points</span>
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
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors opacity-50 cursor-not-allowed"
                      aria-disabled="true"
                    >
                      <Sparkles size={16} />
                      Share your first story
                    </button>
                  )}
                </div>
              ) : (
                userStories.map((story) => (
                  <StoryCardSimple key={story.id} story={story} profileName={profile.name} />
                ))
              )
            ) : (
              userPoints.length === 0 ? (
                <div className="bg-card rounded-lg p-8 text-center">
                  <p className="text-muted-foreground">No positions taken yet</p>
                </div>
              ) : (
                userPoints.map((point) => (
                  <PointCardSimple
                    key={point.id}
                    point={point}
                    profileId={profile.id}
                    profileName={profile.name}
                  />
                ))
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Simplified StoryCard for profile page (no navigation to prototype routes)
function StoryCardSimple({ story, profileName }: { story: MockStory; profileName: string }) {
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border p-4">
      <div className="flex items-start gap-3">
        <GravatarAvatar name={profileName} size="sm" isPledger={true} />
        <div className="flex-1 min-w-0">
          <div className="mb-2">
            <span className="font-semibold text-foreground text-sm">{profileName}</span>
            <p className="text-xs text-muted-foreground">{formatTimeAgo(story.createdAt)}</p>
          </div>
          <p className="text-foreground text-base">{story.text}</p>
          <div className="flex items-center gap-1 mt-3 text-sm text-muted-foreground">
            <span className="px-2.5 py-1 bg-muted rounded-full text-sm text-muted-foreground">
              {story.verificationCount} understood
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simplified PointCard for profile page
function PointCardSimple({
  point,
  profileId,
  profileName,
}: {
  point: MockPoint;
  profileId: string;
  profileName: string;
}) {
  const position = point.positions[profileId]?.position;
  const positionLabel = position
    ? position.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  return (
    <div className="bg-card rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-border p-4">
      <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
        <GravatarAvatar name={profileName} size="sm" isPledger={true} className="!w-5 !h-5 !text-[10px]" />
        <span className="font-medium">{profileName}</span>
        {positionLabel && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            position?.includes('agree')
              ? 'bg-blue-100 text-blue-700'
              : position?.includes('disagree')
              ? 'bg-red-100 text-red-700'
              : 'bg-muted text-muted-foreground'
          }`}>
            {positionLabel}
          </span>
        )}
      </div>
      <p className="text-foreground text-base">{point.text}</p>
    </div>
  );
}
