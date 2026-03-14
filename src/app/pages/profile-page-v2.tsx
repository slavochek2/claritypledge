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
import { PointCardWithLinks } from "@/app/components/social/point-card-with-links";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import {
  MailIcon,
  ArrowLeft,
  Share2,
  Ear,
  PenLine,
  ExternalLink,
  Pin,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  ScrollText,
} from "lucide-react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";

const LinkedInBrandIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
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
  type SevenPointCounts,
} from "@/app/components/shared";
import { VisibilityBadge } from "@/app/components/shared/visibility-badge";
import { LinkedText } from '@/app/components/shared/linked-text';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';
import type { PositionType, StoryVisibility } from "@/app/types";
import type { Position } from "@/app/components/shared/prototype-types";
import { adjustPositionCounts, toSevenPointCounts } from "@/app/utils/position-helpers";
import { formatTimeAgo } from "@/app/utils/format-time";
// Profile owner context for card components
interface ProfileOwner {
  id: string;
  name: string;
  role?: string | null;
  hasPledged: boolean;
  avatarUrl?: string | null;
  avatarColor?: string;
}

// P134: Type definitions for adapted prototype format (module-level for shared use)
interface AdaptedPosition {
  position: string;
  timestamp: string;
}
interface AdaptedStory {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  visibility: StoryVisibility;
  understoodCount: number;
  tags: string[];
  linkedPointIds: string[];
}
interface AdaptedPoint {
  id: string;
  text: string;
  createdAt: string;
  positions: Record<string, AdaptedPosition>;
  positionCounts: Record<string, number>;
  linkedStoryIds: string[];
  linkedStories: AdaptedStory[];
  tags: string[];
}

/** Normalize real positionCounts to SevenPointCounts (ensure all keys present) */
function toSevenPointCounts(counts: Record<string, number>): SevenPointCounts {
  return {
    strongly_agree: counts.strongly_agree ?? 0,
    agree: counts.agree ?? 0,
    somewhat_agree: counts.somewhat_agree ?? 0,
    unsure: counts.unsure ?? 0,
    somewhat_disagree: counts.somewhat_disagree ?? 0,
    disagree: counts.disagree ?? 0,
    strongly_disagree: counts.strongly_disagree ?? 0,
  };
}


import { storiesService } from "@/app/data/stories-service";
import { pointsService } from "@/app/data/points-service";
import { linkifyText } from "@/app/utils/linkify";
import { calibrationService } from "@/app/data/calibration-service";
import { agreementsService } from "@/app/data/agreements-service";
import type { ClarityAgreement } from "@/app/data/agreements-service.interface";
import { RemovePositionDialog, useRemovePositionGuard } from "@/app/components/shared/remove-position-dialog";
import { AgreementsMetadataLine } from "@/app/components/agreements/agreements-metadata-line";
import type { StoryWithPoints, PointWithUserPosition, PointSummary, CalibrationResult } from "@/app/types";
import type { UserCalibration } from "@/app/components/profile/calibration-display";

// Routes for detail pages (main app, not prototype)
// Points include a 'from' param to provide profile context
const detailRoutes = {
  story: (id: string) => `/story/${id}`,
  point: (id: string, profileId?: string) => profileId ? `/point/${id}?from=${profileId}` : `/point/${id}`,
};

// Tab types
type ContentTab = 'stories' | 'points';

/** Map real CalibrationResult → UserCalibration for display component.
 *  Sign convention: real service uses self-actual (positive=overconfident),
 *  display uses actual-self (negative=overconfident). Negate the gap. */
function toUserCalibration(result: CalibrationResult): UserCalibration | null {
  if (result.status === 'insufficient' || !result.calibration) return null;
  const { calibrationGap, sessionCount, speakerCalibrationAvg, speakerListenerSelfRatingAvg } = result.calibration;

  const listenerGap = calibrationGap != null ? -calibrationGap : 0;
  const speakerGap = (speakerCalibrationAvg != null && speakerListenerSelfRatingAvg != null)
    ? -(speakerListenerSelfRatingAvg - speakerCalibrationAvg)
    : 0;

  const getState = (gap: number): 'calibrated' | 'overconfident' | 'underconfident' => {
    if (Math.abs(gap) <= 0.5) return 'calibrated';
    return gap < 0 ? 'overconfident' : 'underconfident';
  };

  return {
    listener: { avgGap: listenerGap, state: getState(listenerGap), sessionCount },
    speaker: { avgGap: speakerGap, state: getState(speakerGap), sessionCount },
  };
}

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

  // P115: Stories/Points/Calibration state — all from real services
  const [contentTab, setContentTab] = useState<ContentTab>('points');
  const [realStories, setRealStories] = useState<StoryWithPoints[]>([]);
  const [realPoints, setRealPoints] = useState<PointWithUserPosition[]>([]);
  const [realCalibration, setRealCalibration] = useState<UserCalibration | null>(null);

  // P465: Viewer story count map for other profiles (fetched async)
  const [viewerStoryCountMap, setViewerStoryCountMap] = useState<Map<string, number>>(new Map());
  // P470: Viewer story ID map for other profiles — pointId → storyId (first story per point)
  const [viewerStoryIdForPoint, setViewerStoryIdForPoint] = useState<Map<string, string>>(new Map());
  const [realEarsCount, setRealEarsCount] = useState<number>(0);

  // P422: Agreements state
  const [agreements, setAgreements] = useState<ClarityAgreement[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(true);

  // Loading state for secondary content (stories, points, calibration)
  const [contentLoading, setContentLoading] = useState(true);

  // Track current user ID for retry logic
  const currentUserId = currentUser?.id;
  const currentUserSlug = currentUser?.slug;

  // P456: Compute viewer's story count per point — must be declared before any early return (hooks rule).
  // realStories is the profile owner's stories. When viewer IS the owner, this IS their stories.
  // When viewing another profile, map is empty (viewerStoryCount defaults to 0 = shows CTA, correct).
  const viewerStoriesForPoint = useMemo(() => {
    const map = new Map<string, number>();
    if (currentUserId && profile && currentUserId === profile.id) {
      realStories.forEach(story => {
        story.points?.forEach(p => {
          map.set(p.id, (map.get(p.id) ?? 0) + 1);
        });
      });
    }
    return map;
  }, [realStories, currentUserId, profile]);

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

  // Load all profile data from real services
  useEffect(() => {
    if (!profile) return;

    // Reset all content state when profile changes (e.g. navigating between profiles)
    setContentLoading(true);
    setAgreementsLoading(true);
    setRealStories([]);
    setRealPoints([]);

    // Load stories, points, calibration, and agreements in parallel
    Promise.all([
      storiesService.getStoriesByAuthorWithPoints(profile.id, currentUser?.id),
      // P151: Use getPointsForProfileDisplay (efficient batch loading)
      // This method:
      // - Returns points CREATED/VALIDATED by this user
      // - Includes position counts (batch loaded)
      // - Includes viewer's positions (batch loaded, using current user if available)
      // - Avoids N+1 queries (2-3 queries total instead of 1+N)
      pointsService.getPointsForProfileDisplay(profile.id, currentUser?.id),
      calibrationService.getCalibration(profile.id),
      // P422: Fetch agreements for this profile
      agreementsService.getAgreementsForProfile(profile.id, currentUser?.id ?? null),
    ]).then(async ([stories, pointsWithData, calibration, fetchedAgreements]) => {
      // Set stories (already have linked points from getStoriesByAuthorWithPoints)
      setRealStories(stories);
      setRealCalibration(toUserCalibration(calibration));

      // P422: Set agreements
      setAgreements(fetchedAgreements);
      setAgreementsLoading(false);

      // P151: Points now come with position counts and user positions pre-loaded
      // No manual batch fetching needed!

      if (pointsWithData.length === 0) {
        setRealPoints([]);
      } else {
        const validPoints = pointsWithData;

        // P134: Batch query for linked stories (point → stories)
        if (validPoints.length > 0) {
        const pointIds = validPoints.map(p => p.id);
        const { data: pointLinks } = await supabase
          .from('story_points')
          .select('point_id, story_id')
          .in('point_id', pointIds)
          .eq('author_id', profile.id);

        // Build map: point_id → story_ids[]
        const linksByPoint = new Map<string, string[]>();
        (pointLinks || []).forEach(link => {
          const storyIds = linksByPoint.get(link.point_id) || [];
          storyIds.push(link.story_id);
          linksByPoint.set(link.point_id, storyIds);
        });

        // Fetch the actual story records for all linked story IDs.
        // Query directly (not via stories-service) so RLS applies correctly:
        // visitors see public/shared stories; owners see all their own stories.
        // This fixes the bug where private stories (the default) were invisible
        // to visitors because the earlier getStoriesByAuthorWithPoints call
        // was scoped to the owner and returned no data for non-authors.
        const allLinkedStoryIds = [...new Set([...linksByPoint.values()].flat())];
        const { data: linkedStoriesRaw } = allLinkedStoryIds.length > 0
          ? await supabase
              .from('stories')
              .select('id, content, author_id, created_at, understood_count, tags, visibility')
              .in('id', allLinkedStoryIds)
              .order('created_at', { ascending: false })
          : { data: [] as Array<{ id: string; content: string; author_id: string; created_at: string; understood_count: number; tags: string[]; visibility: string }> };

        const linkedStoriesById = new Map(
          (linkedStoriesRaw ?? []).map(s => [s.id, s])
        );

        // P134: Adapt points to prototype format with linked stories
        const adaptedPoints: AdaptedPoint[] = validPoints.map(point => {
          const linkedStoryIds = linksByPoint.get(point.id) || [];
          const positions: Record<string, AdaptedPosition> = {};

          // Add current user's position if it exists (from getPointsForProfileDisplay viewer param)
          if (point.userPosition && currentUser?.id) {
            positions[currentUser.id] = {
              position: point.userPosition.position,
              timestamp: point.userPosition.createdAt,
            };
          }

          // Add profile subject's position (always loaded; causes point to appear on their profile)
          if (point.profileSubjectPosition) {
            positions[profile.id] = {
              position: point.profileSubjectPosition.position,
              timestamp: point.profileSubjectPosition.createdAt,
            };
          }

          // Adapt linked stories using the RLS-gated batch query result
          const linkedStories = linkedStoryIds
            .map(storyId => {
              const story = linkedStoriesById.get(storyId);
              if (!story) return null;
              return {
                id: story.id,
                text: story.content,
                authorId: story.author_id,
                createdAt: story.created_at,
                visibility: (story.visibility as StoryVisibility) ?? 'public',
                understoodCount: story.understood_count ?? 0,
                tags: story.tags || [],
                linkedPointIds: [point.id],
              };
            })
            .filter((s): s is AdaptedStory => s !== null);

          return {
            id: point.id,
            text: point.statement,
            createdAt: point.createdAt || new Date().toISOString(),
            positions,
            positionCounts: point.positionCounts ?? {},
            linkedStoryIds,
            linkedStories,
            tags: point.tags || [],
          };
        });

          setRealPoints(adaptedPoints);

          // P465: Fetch viewer's own story links for other profiles
          if (currentUserId && profile && currentUserId !== profile.id) {
            const pointIds = adaptedPoints.map(p => p.id);
            if (pointIds.length > 0) {
              const { data: viewerLinks } = await supabase
                .from('story_points')
                .select('point_id, story_id')
                .in('point_id', pointIds)
                .eq('author_id', currentUserId);

              const countMap = new Map<string, number>();
              const idMap = new Map<string, string>();
              (viewerLinks ?? []).forEach(link => {
                countMap.set(link.point_id, (countMap.get(link.point_id) ?? 0) + 1);
                if (!idMap.has(link.point_id)) {
                  idMap.set(link.point_id, link.story_id);
                }
              });
              setViewerStoryCountMap(countMap);
              setViewerStoryIdForPoint(idMap);
            }
          }
        } else {
          setRealPoints(validPoints);
        }
      } // End of else (createdPoints.length > 0)
      setContentLoading(false);
    }).catch(err => {
      console.error('Failed to load profile data:', err);
      setContentLoading(false);
    });
  }, [profile, currentUser?.id]);

  // Load ears count separately
  useEffect(() => {
    if (!profile) return;

    calibrationService.getEarsCount(profile.id).then(count => {
      setRealEarsCount(count);
    }).catch(err => {
      console.error('Failed to load ears count:', err);
    });
  }, [profile]);

  const handleCreateClick = useCallback(() => {
    navigate('/create');
  }, [navigate]);

  // P401: Guard position removal with linked-stories warning dialog
  const { dialogProps: removePositionDialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: currentUser?.id ?? '',
    onAfterRemove: async () => {
      // After confirmed removal, refetch points to get updated counts
      if (!profile || !currentUser?.id) return;
      const updatedPoints = await pointsService.getPointsForProfileDisplay(profile.id, currentUser.id);
      const existingPoints = realPoints as unknown as AdaptedPoint[];
      const adaptedPoints = updatedPoints.map(point => {
        const positions: Record<string, { position: string; timestamp: string }> = {};
        if (point.userPosition && currentUser?.id) {
          positions[currentUser.id] = { position: point.userPosition.position, timestamp: point.userPosition.createdAt };
        }
        if (point.profileSubjectPosition) {
          positions[profile.id] = { position: point.profileSubjectPosition.position, timestamp: point.profileSubjectPosition.createdAt };
        }
        const existing = existingPoints.find(rp => rp.id === point.id);
        return {
          id: point.id,
          text: point.statement,
          createdAt: point.createdAt || new Date().toISOString(),
          positions,
          positionCounts: point.positionCounts ?? {},
          linkedStoryIds: existing?.linkedStoryIds ?? [],
          linkedStories: existing?.linkedStories ?? [],
          tags: point.tags || [],
        };
      });
      setRealPoints(adaptedPoints as unknown as PointWithUserPosition[]);

      // Also refetch stories so QuotedPointCard.userPosition syncs via its useEffect
      const updatedStories = await storiesService.getStoriesByAuthorWithPoints(profile.id, currentUser.id);
      setRealStories(updatedStories);
    },
  });

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

  // P154: Handle position selection on profile points
  const handleProfilePointPosition = async (pointId: string, position: Position) => {
    if (!currentUser?.id || !profile?.id) return;

    try {
      // Persist to database
      let result;
      if (position === null) {
        // P401: Use guarded removal — shows dialog if linked stories exist
        await guardedRemovePosition(pointId);
        return;
      } else {
        result = await pointsService.setPosition(pointId, currentUser.id, position);
      }

      if (!result) {
        toast.error('Failed to save position');
        return;
      }

      // Refetch points to get updated counts and user positions
      const updatedPoints = await pointsService.getPointsForProfileDisplay(
        profile.id,
        currentUser.id
      );

      // Transform to AdaptedPoint format, restoring linkedStories from current state
      const existingPoints = realPoints as AdaptedPoint[];
      const adaptedPoints = updatedPoints.map(point => {
        const positions: Record<string, { position: string; timestamp: string }> = {};

        // Add current user's position if it exists
        if (point.userPosition && currentUser?.id) {
          positions[currentUser.id] = {
            position: point.userPosition.position,
            timestamp: point.userPosition.createdAt,
          };
        }

        // Add profile subject's position
        if (point.profileSubjectPosition) {
          positions[profile.id] = {
            position: point.profileSubjectPosition.position,
            timestamp: point.profileSubjectPosition.createdAt,
          };
        }

        const existing = existingPoints.find(rp => rp.id === point.id);
        return {
          id: point.id,
          text: point.statement,
          createdAt: point.createdAt || new Date().toISOString(),
          positions,
          positionCounts: point.positionCounts ?? {},
          linkedStoryIds: existing?.linkedStoryIds ?? [],
          linkedStories: existing?.linkedStories ?? [],
          tags: point.tags || [],
        };
      });

      setRealPoints(adaptedPoints);
    } catch (err) {
      console.error('[DEBUG] Failed to update position:', err);
      toast.error('Failed to save position');
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

  // All data from real services
  const userStories = realStories;
  const userPoints = realPoints;
  const calibration = realCalibration;
  const credibilityStats = { ear: realEarsCount, mic: 0 };

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
            onClick={() => navigate('/events')}
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
                  photoUrl={profile.avatarUrl ?? undefined}
                  avatarColor={profile.avatarColor}
                  size="lg"
                  isPledger={profile.hasPledged}
                />
              </div>

              {/* Name and Role */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground truncate">{profile.name}</h2>
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
                          {credibilityStats.ear === 0
                            ? (isOwner ? 'Stories you fully understood, as confirmed by their owners' : `Stories ${profile.name.split(' ')[0]} fully understood, as confirmed by their owners`)
                            : (isOwner
                              ? `You understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`
                              : `${profile.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`)
                          }
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {(profile.role || profile.linkedinUrl) && (
                  <div className="flex items-center gap-1.5">
                    {profile.role && (
                      <p className="text-sm text-muted-foreground truncate">{profile.role}</p>
                    )}
                    {profile.linkedinUrl && (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={profile.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${profile.name}'s LinkedIn profile`}
                              className="flex-shrink-0 text-[#0A66C2] opacity-60 hover:opacity-100 transition-opacity"
                            >
                              <LinkedInBrandIcon size={14} />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Open LinkedIn profile</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
                {profile.hasPledged ? (
                  <Link
                    to={`/p/${profile.slug}/pledge`}
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1"
                  >
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    {isOwner ? 'My Clarity Pledge' : 'Their Clarity Pledge'}
                  </Link>
                ) : isOwner ? (
                  <Link
                    to="/sign-pledge"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1"
                  >
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    Take the Clarity Pledge
                  </Link>
                ) : null}
                {/* P462: Partners count — grouped with pledge link as navigation cluster */}
                {agreementsLoading ? (
                  <div className="h-[44px]" />
                ) : (
                  <AgreementsMetadataLine
                    profileId={profile.id}
                    viewerProfileId={currentUser?.id ?? null}
                    agreements={agreements}
                    slug={profile.slug}
                  />
                )}
                {/* Calibration bar - inside text column for natural alignment */}
                <InlineCalibration calibration={calibration} />
                {profile.bio && (
                  <p data-testid="profile-bio" className="text-sm text-muted-foreground mt-2 break-words">
                    {linkifyText(profile.bio)}
                  </p>
                )}
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
          </div>

          {/* Create Stories & Points CTA (owner only) */}
          {isOwner && (
            <div className="pt-3">
              <button
                onClick={handleCreateClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <PenLine size={18} />
                <span className="text-sm font-medium">Share a Story</span>
              </button>
            </div>
          )}

          {/* Content tab selector */}
          <div className="bg-card border border-border mt-3 rounded-lg overflow-hidden">
            {/* Points / Stories tabs */}
            <div className="flex" role="tablist" aria-label="Profile content tabs">
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
            </div>
          </div>

          {/* Content list */}
          <div
            className="pt-4 space-y-3"
            role="tabpanel"
            id={contentTab === 'stories' ? 'stories-panel' : 'points-panel'}
            aria-labelledby={contentTab === 'stories' ? 'stories-tab' : 'points-tab'}
          >
            {contentLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-24 bg-muted rounded-lg" />
                <div className="h-24 bg-muted rounded-lg" />
                <div className="h-24 bg-muted rounded-lg" />
              </div>
            ) : contentTab === 'stories' ? (
              userStories.length === 0 ? (
                <div className="bg-card rounded-lg p-8 text-center">
                  <p className="text-muted-foreground">No stories shared yet</p>
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
                      avatarUrl: profile.avatarUrl,
                      avatarColor: profile.avatarColor,
                    }}
                    credibilityStats={credibilityStats}
                    currentUserId={currentUser?.id}
                    onPointPositionSelect={handleProfilePointPosition}
                    onDelete={(storyId) => setRealStories(prev => prev.filter(s => s.id !== storyId))}
                  />
                ))
              )
            ) : (
              userPoints.length === 0 ? (
                <div className="bg-card rounded-lg p-8 text-center">
                  <p className="text-muted-foreground">No positions taken yet</p>
                </div>
              ) : (
                userPoints.map((point: AdaptedPoint) => (
                  <PointCardWithLinks
                    key={point.id}
                    point={point}
                    linkedStories={point.linkedStories || []}
                    profileOwner={{
                      id: profile.id,
                      name: profile.name,
                      hasPledged: profile.hasPledged,
                      avatarUrl: profile.avatarUrl,
                      ear: credibilityStats.ear,
                      position: point.positions?.[profile.id]?.position || null,
                    }}
                    currentUserId={currentUser?.id}
                    onPositionSelect={(pos) => handleProfilePointPosition(point.id, pos)}
                    getPointPositionCounts={(p: AdaptedPoint) => toSevenPointCounts(p.positionCounts ?? {})}
                    viewerStoryCount={
                      currentUser?.id === profile?.id
                        ? (viewerStoriesForPoint?.get(point.id) ?? 0)
                        : (viewerStoryCountMap?.get(point.id) ?? 0)
                    }
                    viewerStoryId={
                      currentUser?.id !== profile?.id
                        ? viewerStoryIdForPoint.get(point.id)
                        : undefined
                    }
                    getStoryAuthor={(authorId) => {
                      // Return author info for stories
                      if (authorId === profile.id) {
                        return {
                          id: profile.id,
                          name: profile.name,
                          role: profile.role,
                          hasPledged: profile.hasPledged,
                          avatarUrl: profile.avatarUrl,
                          avatarColor: profile.avatarColor,
                          ear: credibilityStats.ear,
                        };
                      }
                      return undefined;
                    }}
                    tags={point.tags}
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

        {/* P401: Remove position warning dialog */}
        <RemovePositionDialog {...removePositionDialogProps} />
      </div>
    </>
  );
}

// =============================================================================
// StoryCardFull - Full interactive StoryCard matching prototype
// =============================================================================

interface StoryCardFullProps {
  story: StoryWithPoints;
  author: ProfileOwner;
  credibilityStats: { ear: number; mic: number };
  currentUserId?: string;
  onPointPositionSelect?: (pointId: string, pos: Position | null) => void;
  onDelete?: (storyId: string) => void;
}

const STORY_THRESHOLD = 180;

function StoryCardFull({
  story,
  author,
  credibilityStats,
  currentUserId,
  onPointPositionSelect,
  onDelete,
}: StoryCardFullProps) {
  const navigate = useNavigate();
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCardClick = () => {
    navigate(detailRoutes.story(story.id));
  };

  const linkedPoints = story.points || [];
  const strippedContent = stripHashtags(story.content, story.tags);
  const isLongStory = strippedContent.length > STORY_THRESHOLD;
  const storyDisplayText =
    isLongStory && !storyExpanded
      ? strippedContent.slice(0, STORY_THRESHOLD) + '…'
      : strippedContent;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={`Story by ${author.name}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-story-toggle]')) return;
        handleCardClick();
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-story-toggle]')) return;
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
              photoUrl={author.avatarUrl ?? undefined}
              avatarColor={author.avatarColor}
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
                <MobileTooltip content={credibilityStats.ear === 0 ? `${author.name.split(' ')[0]} hasn't had any stories confirmed understood yet` : `${author.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Ear size={12} />
                    {credibilityStats.ear}
                  </span>
                </MobileTooltip>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span>{author.role} · {formatTimeAgo(story.createdAt)}</span>
                <VisibilityBadge visibility={story.visibility} />
              </p>
            </div>

            {/* Story text */}
            <p id={`story-text-${story.id}`} className="text-foreground text-base"><LinkedText text={storyDisplayText} /></p>
            {isLongStory && (
              <div role="presentation" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  data-story-toggle="true"
                  onClick={() => setStoryExpanded((prev) => !prev)}
                  aria-expanded={storyExpanded}
                  aria-controls={`story-text-${story.id}`}
                  className="text-sm text-blue-600 hover:text-blue-700 mt-1"
                >
                  {storyExpanded ? 'Show less' : 'Show more'}
                </button>
              </div>
            )}

            {/* P503: Tag pills */}
            {story.tags && story.tags.length > 0 && (
              <TagPills tags={story.tags} context="profile" className="mt-2" />
            )}

            {/* Stats row */}
            <div className="flex items-center gap-1 mt-3 text-sm text-muted-foreground">
              <span className="px-2.5 py-1 bg-muted rounded-full text-sm">
                {story.understoodCount} understood
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer row with linked points and action icons */}
      <div
        role="presentation"
        className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Collapsible trigger (if has linked points) */}
        {linkedPoints.length > 0 ? (
          <button
            onClick={() => setPointsExpanded(!pointsExpanded)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
            aria-expanded={pointsExpanded}
          >
            {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'} by {author.name}
            </span>
          </button>
        ) : (
          <span />
        )}

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {/* Edit/Delete — owner only */}
          {currentUserId === story.authorId && (
            <>
              <MobileTooltip content="Edit story">
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/story/${story.id}?edit=true`); }}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                  aria-label="Edit story"
                >
                  <Pencil size={16} />
                </button>
              </MobileTooltip>
              <MobileTooltip content="Delete story">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm('Delete this story? This cannot be undone.')) return;
                    setIsDeleting(true);
                    const success = await storiesService.deleteStory(story.id);
                    if (success) {
                      toast.success('Story deleted');
                      onDelete?.(story.id);
                    } else {
                      toast.error('Failed to delete story');
                      setIsDeleting(false);
                    }
                  }}
                  disabled={isDeleting}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-muted rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Delete story"
                >
                  <Trash2 size={16} />
                </button>
              </MobileTooltip>
            </>
          )}
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

      {/* Linked points - expanded content */}
      {pointsExpanded && linkedPoints.length > 0 && (
        <div role="presentation" className="pl-4 sm:pl-[68px] pr-4 pb-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          {linkedPoints.slice(0, 3).map((point) => (
            <QuotedPointCard
              key={point.id}
              point={point}
              authorId={author.id}
              authorName={author.name}
              authorAvatarUrl={author.avatarUrl ?? undefined}
              authorAvatarColor={author.avatarColor}
              authorEarCount={credibilityStats.ear}
              authorHasPledged={author.hasPledged}
              currentUserId={currentUserId}
              onPositionSelect={(pos) => onPointPositionSelect?.(point.id, pos)}
            />
          ))}
          {linkedPoints.length > 3 && (
            <button
              onClick={() => navigate(detailRoutes.story(story.id))}
              className="text-xs text-blue-600 hover:underline"
            >
              +{linkedPoints.length - 3} more points
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// QuotedPointCard - Point shown inside a Story card
// =============================================================================

interface QuotedPointCardProps {
  point: PointSummary;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorAvatarColor?: string;
  authorEarCount?: number;
  authorHasPledged: boolean;
  currentUserId?: string;
  onPositionSelect?: (position: Position) => void;
}

function QuotedPointCard({
  point,
  authorId,
  authorName,
  authorAvatarUrl,
  authorAvatarColor,
  authorEarCount,
  authorHasPledged,
  currentUserId,
  onPositionSelect,
}: QuotedPointCardProps) {
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(
    (point.userPosition as Position) ?? null
  );

  // Sync userPosition from prop when it changes (e.g. profile effect reruns after auth resolves)
  useEffect(() => {
    setUserPosition((point.userPosition as Position) ?? null);
  }, [point.userPosition]);

  const baseCounts = useMemo(
    () => toSevenPointCounts(point.positionCounts),
    [point.positionCounts],
  );

  // DB counts already include the user's own position.
  // Only adjust optimistically when position changes from the server-known value.
  const initialPosition = (point.userPosition as PositionType | null) ?? null;
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, initialPosition, userPosition as PositionType | null),
    [baseCounts, initialPosition, userPosition],
  );

  const handlePositionClick = (position: Position) => {
    const newPosition = userPosition === position ? null : position;
    // Only optimistically update for selection; removal waits for dialog confirm
    if (newPosition !== null) {
      setUserPosition(newPosition);
    }
    onPositionSelect?.(newPosition);
  };

  return (
    <div className="w-full text-left">
      {/* Author's position badge - shown above quoted box when available */}
      {point.profileSubjectPosition && (
        <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
          <GravatarAvatar
            name={authorName}
            photoUrl={authorAvatarUrl}
            avatarColor={authorAvatarColor}
            size="sm"
            isPledger={authorHasPledged}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{authorName}</span>
          {authorEarCount !== undefined && authorEarCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <Ear size={14} />
              {authorEarCount}
            </span>
          )}
          <PositionBadge position={point.profileSubjectPosition as PositionType} />
        </div>
      )}

      {/* Quoted Point box — changed from <button> to div[role=button] to fix nested button HTML violation */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(detailRoutes.point(point.id, authorId))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(detailRoutes.point(point.id, authorId));
          }
        }}
        className="group/quote w-full text-left p-3 rounded-lg border border-border bg-muted hover:bg-muted/80 hover:border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* Two-column layout */}
        <div className="flex items-start gap-3">
          {/* Pin icon column */}
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
            <Pin size={16} className="rotate-45" />
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground"><LinkedText text={stripHashtags(point.statement, point.tags)} /></p>

            {/* P503: Tag pills */}
            {point.tags && point.tags.length > 0 && (
              <TagPills tags={point.tags} context="profile" className="mt-1.5" />
            )}

            {/* Position buttons - show for authenticated users */}
            {currentUserId && (
              <div role="presentation" className="mt-2" onClick={(e) => e.stopPropagation()}>
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                  narrow
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// =============================================================================
// PointCardFull - Full interactive PointCard using real data
// =============================================================================

interface PointCardFullProps {
  point: PointWithUserPosition;
  profileOwner: ProfileOwner;
  credibilityStats: { ear: number; mic: number };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PointCardFull({
  point,
  profileOwner,
  credibilityStats,
}: PointCardFullProps) {
  const navigate = useNavigate();
  // Profile subject's position (always loaded; causes point to appear on their profile)
  const profileSubjectPosition = point.profileSubjectPosition?.position ?? null;
  const [userPosition, setUserPosition] = useState<Position>(null);
  const baseCounts = useMemo(() => toSevenPointCounts(point.positionCounts), [point.positionCounts]);

  // Compute adjusted counts when user clicks position buttons (local only)
  const counts = useMemo((): SevenPointCounts => {
    const adjusted = { ...baseCounts };

    const getGroup = (pos: PositionType | null): PositionButtonGroup | null => {
      if (!pos) return null;
      return getPositionGroup(pos);
    };

    const currentGroup = getGroup(userPosition as PositionType | null);

    // If user selected a position, increment that group
    if (currentGroup === 'agree') adjusted.agree++;
    else if (currentGroup === 'disagree') adjusted.disagree++;
    else if (currentGroup === 'unsure') adjusted.unsure++;

    return adjusted;
  }, [baseCounts, userPosition]);

  const handleCardClick = () => {
    navigate(detailRoutes.point(point.id, profileOwner.id));
  };

  const handlePositionClick = (position: Position) => {
    setUserPosition(userPosition === position ? null : position);
  };

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
        {profileSubjectPosition && (
          <div className="flex items-center gap-1.5 mb-2 text-sm text-foreground">
            <GravatarAvatar
              name={profileOwner.name}
              size="sm"
              isPledger={profileOwner.hasPledged}
              className="!w-5 !h-5 !text-[10px]"
            />
            <span className="font-medium">{profileOwner.name}</span>
            <MobileTooltip content={credibilityStats.ear === 0 ? `${profileOwner.name.split(' ')[0]} hasn't had any stories confirmed understood yet` : `${profileOwner.name.split(' ')[0]} understood ${credibilityStats.ear} ${credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Ear size={14} />
                {credibilityStats.ear}
              </span>
            </MobileTooltip>
            <PositionBadge position={profileSubjectPosition as PositionType} />
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
              <p className="text-foreground text-base"><LinkedText text={stripHashtags(point.statement, point.tags)} /></p>

              {/* P503: Tag pills */}
              {point.tags && point.tags.length > 0 && (
                <TagPills tags={point.tags} context="profile" className="mt-2" />
              )}

              {/* Position buttons */}
              <div role="presentation" className="mt-3" onClick={(e) => e.stopPropagation()}>
                <PositionButtons
                  userPosition={userPosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                  narrow
                />
              </div>
            </div>
          </div>

          {/* Footer - inside quoted box */}
          <div
            role="presentation"
            className="flex items-center justify-end mt-3 pt-3 border-t border-border pl-[44px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Action icons */}
            <div className="flex items-center gap-1">
              <ShareButton
                type="point"
                id={point.id}
                description={point.statement.slice(0, 100)}
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
    </div>
  );
}

