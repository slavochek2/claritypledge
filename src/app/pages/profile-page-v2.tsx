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
import { getProfile, getProfileBySlug, createProfile, updateProfile, type Profile } from "@/app/data/api";
import { BannerDisplay, BannerControls, useBanner } from '@/app/components/shared/banner';
import { SEO } from "@/app/components/seo";
import { earTooltip } from "@/components/ui/ear-tooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PointCardWithLinks } from "@/app/components/social/point-card-with-links";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import {
  MailIcon,
  ArrowLeft,
  Ear,
  Globe,
  ExternalLink,
  Pin,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  ScrollText,
  Loader2,
  ImagePlus,
  Award,
} from "lucide-react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { AgentByline } from '@/app/components/shared/agent-byline';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { useAgentAccountIds } from "@/app/contexts/agent-accounts-context";
import { ImageLightbox } from "@/app/components/shared/image-lightbox";
import { UnderstoodBadge } from "@/components/ui/understood-badge";

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
import { InlineVisibilityIcon } from "@/app/components/shared/visibility-badge";
import { TagPills } from '@/app/components/shared/tag-pills';
import { AgentStoryFooter } from '@/app/components/shared/agent-story-footer';
import { StoryImage } from '@/app/components/shared/story-image';
import { StoryMedia } from '@/app/components/shared/story-media';
import { stripAgentPrefix } from '@/lib/utils';
import { StoryVideoQuotes } from '@/app/components/shared/story-video-quotes';
import { storyTextForDisplay } from '@/lib/story-quotes';
import { normalizeVideoQuotes } from '@/lib/video';
import { uploadStoryImage } from '@/app/data/story-image-service';
import { stripHashtags, extractHashtags } from '@/lib/utils';
import type { PositionType, PositionButtonGroup, StoryVisibility } from "@/app/types";
import type { Position } from "@/app/components/shared/prototype-types";
import { toSevenPointCounts, getPositionGroup } from "@/app/utils/position-helpers";
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



import { storiesService } from "@/app/data/stories-service";
import { pointsService } from "@/app/data/points-service";
import { badgeService } from "@/app/data/badge-service";
import { linkifyText } from "@/app/utils/linkify";
import { calibrationService } from "@/app/data/calibration-service";
import { agreementsService } from "@/app/data/agreements-service";
import type { ClarityAgreement } from "@/app/data/agreements-service.interface";
import { RemovePositionDialog, useRemovePositionGuard } from "@/app/components/shared/remove-position-dialog";
import { ThreadLineGroup, ThreadLineItem } from "@/app/components/shared/ThreadLine";
import { AgreementsMetadataLine } from "@/app/components/agreements/agreements-metadata-line";
import type { StoryWithPoints, PointWithUserPosition, CalibrationResult } from "@/app/types";
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
  const { calibrationGap, listenerSessionCount, speakerSessionCount, speakerCalibrationAvg, speakerListenerSelfRatingAvg } = result.calibration;

  const listenerGap = calibrationGap != null ? -calibrationGap : 0;
  const speakerGap = (speakerCalibrationAvg != null && speakerListenerSelfRatingAvg != null)
    ? -(speakerListenerSelfRatingAvg - speakerCalibrationAvg)
    : 0;

  const getState = (gap: number): 'calibrated' | 'overconfident' | 'underconfident' => {
    if (Math.abs(gap) <= 0.5) return 'calibrated';
    return gap < 0 ? 'overconfident' : 'underconfident';
  };

  return {
    listener: { avgGap: listenerGap, state: getState(listenerGap), sessionCount: listenerSessionCount },
    speaker: { avgGap: speakerGap, state: getState(speakerGap), sessionCount: speakerSessionCount },
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
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);

  // P115: Stories/Points/Calibration state — all from real services
  const [contentTab, setContentTab] = useState<ContentTab>('points');
  const [realStories, setRealStories] = useState<StoryWithPoints[]>([]);
  const [realPoints, setRealPoints] = useState<PointWithUserPosition[]>([]);
  const [realCalibration, setRealCalibration] = useState<UserCalibration | null>(null);
  const [sessionsCompleted, setSessionsCompleted] = useState<number>(0);
  const [calibrationLoaded, setCalibrationLoaded] = useState(false);

  // P465: Viewer story count map for other profiles (fetched async)
  const [viewerStoryCountMap, setViewerStoryCountMap] = useState<Map<string, number>>(new Map());
  // P470: Viewer story ID map for other profiles — pointId → storyId (first story per point)
  const [viewerStoryIdForPoint, setViewerStoryIdForPoint] = useState<Map<string, string>>(new Map());
  const [realEarsCount, setRealEarsCount] = useState<number>(0);

  // P422: Agreements state
  const [agreements, setAgreements] = useState<ClarityAgreement[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(true);

  // P686: Badge count state
  const [badgeCount, setBadgeCount] = useState(0);

  // P1104: is this profile a machine's reading of a person, and who is answerable for it?
  const { isAgentAccountId, operatorNameFor, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(profile?.id);
  const operatorName = operatorNameFor(profile?.id);

  // Loading state for secondary content (stories, points, calibration)
  const [contentLoading, setContentLoading] = useState(true);

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

  // Load all profile data from real services
  useEffect(() => {
    if (!profile) return;

    // Reset all content state when profile changes (e.g. navigating between profiles)
    setContentLoading(true);
    setCalibrationLoaded(false);
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
      setSessionsCompleted(calibration.sessionsCompleted);
      setCalibrationLoaded(true);

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
            visibility: point.visibility ?? 'public',
          };
        });

          // P465: Fetch viewer's own story links for other profiles
          // Must complete BEFORE setRealPoints to avoid race condition where
          // cards render with empty viewerStoryCountMap showing false "Add your story" CTA
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
          } else if (currentUserId && profile && currentUserId === profile.id) {
            // P824: Own profile — count story links from linksByPoint (no visibility filter).
            // linksByPoint comes from story_points with no visibility constraint, so private
            // stories are counted. The former viewerStoriesForPoint useMemo counted from
            // realStories (visibility='public' only) and missed private stories.
            const ownCountMap = new Map<string, number>();
            linksByPoint.forEach((storyIds, pointId) => {
              ownCountMap.set(pointId, storyIds.length);
            });
            setViewerStoryCountMap(ownCountMap);
          }

          setRealPoints(adaptedPoints);
        } else {
          setRealPoints(validPoints);
        }
      } // End of else (createdPoints.length > 0)
      setContentLoading(false);
    }).catch(err => {
      console.error('Failed to load profile data:', err);
      setContentLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- currentUserId is derived from currentUser?.id which is already tracked
  }, [profile, currentUser?.id]);

  // Load ears count separately
  useEffect(() => {
    if (!profile) return;
    // P1104: an agent account holds no reputation, so do not ask for one. Waiting for the
    // registry before deciding matters — isAgent is false while it loads, so firing on the
    // first pass would query ears for every agent regardless of the gate.
    if (identityPending) return;
    if (isAgent) {
      setRealEarsCount(0);
      return;
    }

    calibrationService.getEarsCount(profile.id).then(count => {
      setRealEarsCount(count);
    }).catch(err => {
      console.error('Failed to load ears count:', err);
    });
  }, [profile, isAgent, identityPending]);

  // P686: Load badge count separately
  useEffect(() => {
    if (!profile) return;

    badgeService.getBadgeCount(profile.id).then(count => {
      setBadgeCount(count);
    }).catch(err => {
      console.error('Failed to load badge count:', err);
    });
  }, [profile]);


  // P504: Banner state — delegated to shared useBanner hook
  const saveBanner = useCallback(async (newUrl: string | null) => {
    if (!profile) return;
    await updateProfile(profile.id, {
      banner_url: newUrl,
      ...(newUrl !== null && { banner_generation_attempted: true }),
    });
    setProfile(prev => prev ? {
      ...prev,
      bannerUrl: newUrl ?? undefined,
      ...(newUrl !== null && { bannerGenerationAttempted: true }),
    } : prev);
  }, [profile]);

  const banner = useBanner({
    entityType: 'profile',
    entityId: profile?.id ?? '',
    initialBannerUrl: profile?.bannerUrl ?? null,
    onSave: saveBanner,
  });

  // P504: Lazy banner generation for profiles without banners
  const lazyBannerTriggered = useRef(false);
  useEffect(() => {
    if (
      !profile ||
      lazyBannerTriggered.current ||
      profile.bannerUrl ||
      profile.bannerGenerationAttempted ||
      !session?.access_token ||
      currentUserId !== profile.id
    ) return;
    lazyBannerTriggered.current = true;
    banner.handleRegenerate();
  }, [profile, session?.access_token, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          visibility: point.visibility ?? 'public',
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
      if (position === null) {
        // P401: Use guarded removal — shows dialog if linked stories exist
        await guardedRemovePosition(pointId);
        return;
      } else {
        await pointsService.setPosition(pointId, currentUser.id, position);
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
          visibility: point.visibility ?? 'public',
        };
      });

      setRealPoints(adaptedPoints);
    } catch (err) {
      console.error('[DEBUG] Failed to update position:', err);
      toast.error('Failed to save position');
    }
  };

  if (loading) {
    return <ClarityPageLoader />;
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
          <div className="container mx-auto max-w-2xl">
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
        image={banner.bannerUrl || profile.avatarUrl || undefined}
        type="profile"
        profile={{
          name: profile.name,
          role: profile.role,
          signedAt: profile.signedAt,
        }}
      />
      <div className="relative max-w-4xl mx-auto pb-20">
        {/* Main profile content - centered */}
        <div className="max-w-2xl mx-auto px-4 mt-3">
          {/* Back button - P114: uses history if from same site, fallback to /events */}
          <button
            onClick={() => navigate('/events')}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={16} className="mr-1" />
            Back
          </button>

          {/* P510: Profile header card — banner + avatar overlap + name beside avatar */}
          <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
            {/* P510: Banner with visible gradient fallback, custom height */}
            <BannerDisplay
              bannerUrl={banner.bannerUrl}
              altText={`${profile.name}'s profile banner`}
              heightClassName="h-[120px] md:h-[160px]"
              fallbackClassName="bg-gradient-to-r from-blue-500/20 via-indigo-400/15 to-purple-500/20"
              aria-busy={banner.isLoading || undefined}
            >
              {/* P510: Loading shimmer overlay during generation */}
              {banner.isLoading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse rounded-t-xl" />
              )}
              {isOwner && (
                <BannerControls
                  variant="minimal"
                  onRegenerate={banner.handleRegenerate}
                  onRemove={banner.handleRemove}
                  isLoading={banner.isLoading}
                  hasBanner={!!banner.bannerUrl}
                  showSearch={banner.showSearch}
                  onSearch={banner.handleSearch}
                  searchError={banner.searchError || undefined}
                  onShare={() => setShowShareDialog(true)}
                />
              )}
            </BannerDisplay>

            {/* P510: Avatar + name/role overlap row + details below */}
            <div className="px-4 md:px-6 pb-6">
              {/* Overlap row: avatar + name beside it */}
              <div className="flex items-end">
                <div className="flex items-center gap-4 mt-[-48px] relative z-10">
                  {/* Avatar - 96px, overlapping banner by 48px */}
                  {profile.avatarUrl ? (
                    <button
                      type="button"
                      className={`flex-shrink-0 ring-4 ring-white dark:ring-card ${isAgent ? 'rounded-sm' : 'rounded-full'} cursor-pointer hover:scale-105 transition-transform bg-transparent p-0 border-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`}
                      data-testid="profile-avatar"
                      onClick={() => setAvatarLightboxOpen(true)}
                      aria-label={isAgent ? `View the avatar for ${profile.name}` : `View ${profile.name}'s profile photo`}
                    >
                      <GravatarAvatar
                        name={profile.name}
                        photoUrl={profile.avatarUrl ?? undefined}
                        avatarColor={profile.avatarColor}
                        size="xl"
                        isPledger={profile.hasPledged}
                        isAgent={isAgent}
                        identityPending={identityPending}
                        showBadge={!isAgent && !identityPending && badgeCount > 0}
                        badgeCount={Math.min(badgeCount, 9)}
                      />
                    </button>
                  ) : (
                    <div className={`flex-shrink-0 ring-4 ring-white dark:ring-card ${isAgent ? 'rounded-sm' : 'rounded-full'}`} data-testid="profile-avatar">
                      <GravatarAvatar
                        name={profile.name}
                        photoUrl={undefined}
                        avatarColor={profile.avatarColor}
                        size="xl"
                        isPledger={profile.hasPledged}
                        isAgent={isAgent}
                        identityPending={identityPending}
                        showBadge={!isAgent && !identityPending && badgeCount > 0}
                        badgeCount={Math.min(badgeCount, 9)}
                      />
                    </div>
                  )}
                  {profile.avatarUrl && (
                    <ImageLightbox
                      src={profile.avatarUrl.includes('googleusercontent.com') ? profile.avatarUrl.replace(/=s\d+(-c)?$/, '=s400') : profile.avatarUrl}
                      alt={`${profile.name}'s profile photo`}
                      open={avatarLightboxOpen}
                      onOpenChange={setAvatarLightboxOpen}
                      eventName="profile_photo_viewed"
                    />
                  )}
                  {/* Name + ear count + role beside avatar */}
                  <div className="min-w-0 pt-[48px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* P1141 amendment: an agent account is named the SAME way here as on
                          every card — `[Machine] reading of {Name}`. This h2 rendered the raw
                          stored `Agent · {Name}` and was the last surface still doing so, so the
                          same account read as two different identities depending on the page.
                          It matters most HERE: the profile is the one surface whose whole job is
                          identity, and the one a reader is likeliest to mistake for the subject's
                          own account. `h2` is kept for the heading semantics the page outline and
                          screen-reader rotor depend on; the size lives on the byline. */}
                      {isAgent ? (
                        <h2 className="min-w-0">
                          <AgentByline name={profile.name} size="lg" />
                        </h2>
                      ) : (
                        <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
                      )}
                      {/* P1104: an agent account holds no reputation count. */}
                      {!isAgent && !identityPending && (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span data-testid="ear-badge" className="inline-flex items-center gap-0.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 cursor-default flex-shrink-0">
                              <Ear size={14} />
                              {credibilityStats.ear}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {earTooltip(credibilityStats.ear, profile.name, isOwner)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      )}
                    </div>
                    {/* P1104: the operator line. The public-figure policy approval is
                        CONDITIONAL on this rendering — a robot face carrying a position
                        the subject never took, with no human named as answerable, is
                        worse than a photograph with one. It ships in the same change as
                        the avatar, never after it. */}
                    {isAgent && (
                      <p
                        className="text-sm text-muted-foreground break-words"
                        data-testid="agent-operator-line"
                      >
                        {`Operated by ${operatorName}`}
                      </p>
                    )}
                    {(profile.role || profile.linkedinUrl) && (
                      <div className="flex items-center gap-1.5">
                        {profile.role && (
                          <p className="text-sm text-muted-foreground break-words">{profile.role}</p>
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
                  </div>
                </div>

              </div>

              {/* Details below avatar/name row - full width */}
              <div className="mt-2">
                {/* P1104: an agent account holds no pledge and no badge, so neither link
                    may appear on its profile. The avatar's shield was already gated;
                    these two were not, so a share link landing here could offer "Their
                    Clarity Pledge" for a machine's reading of a person. */}
                {!isAgent && profile.hasPledged ? (
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
                {/* P686: Badge link — shown when profile has at least one verified badge point */}
                {!isAgent && badgeCount > 0 && (
                  <a
                    href={`/p/${profile.slug}/badge`}
                    className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1"
                  >
                    <Award className="h-4 w-4" aria-hidden="true" />
                    {isOwner ? `My Clarity Badge (${Math.min(badgeCount, 9)}/9)` : `See their Clarity Badge (${Math.min(badgeCount, 9)}/9)`}
                  </a>
                )}
                {/* P462: Partners count — grouped with pledge link as navigation cluster.
                     P1104: an agent account has no Clarity Partners. A partnership is a
                     relationship two people entered; rendering "0 Clarity Partners" on a
                     machine reading implies it could have some. */}
                {isAgent || identityPending ? null : agreementsLoading ? (
                  <div className="h-[44px]" />
                ) : (
                  <div className="mt-2 animate-[clarity-appear_300ms_ease-out_forwards]">
                    <AgreementsMetadataLine
                      profileId={profile.id}
                      viewerProfileId={currentUser?.id ?? null}
                      agreements={agreements}
                      slug={profile.slug}
                    />
                  </div>
                )}
                {/* P539: Calibration — shown on all profiles (own + guest).
                     Estimation available: header + bar + label. Not enough data: header + segmented bar + "N more needed". */}
                {/* P1104: calibration measures a listener against their own sessions. An
                     agent holds no sessions, and "Complete 5 sessions in a listener role"
                     addressed to a machine reading is an invitation it can never take. */}
                {calibrationLoaded && !isAgent && !identityPending && (
                  <div className="animate-[clarity-appear_300ms_ease-out_forwards]">
                    <InlineCalibration
                      calibration={calibration}
                      sessionsCompleted={sessionsCompleted}
                      action={isOwner ? (
                        <Link
                          to="/me/calibration"
                          className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                        >
                          see breakdown
                        </Link>
                      ) : undefined}
                    />
                  </div>
                )}
                {profile.bio && (
                  <p data-testid="profile-bio" className="text-sm text-muted-foreground mt-2 break-words">
                    {linkifyText(profile.bio)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Create Stories & Points CTA (owner only) */}
          {isOwner && (
            <div className="pt-3">
              <button
                onClick={handleCreateClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Globe size={18} />
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
              <div className="space-y-4 animate-pulse transition-opacity duration-300">
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
                    onUpdate={(storyId, content) => setRealStories(prev => prev.map(s => s.id === storyId ? { ...s, content, tags: extractHashtags(content) } : s))}
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
                      // P1104: without this the card falls back to the default palette, so
                      // an agent's square avatar rendered in another account's colour — the
                      // shape marker was right and the colour marker was silently absent.
                      avatarColor: profile.avatarColor,
                      ear: credibilityStats.ear,
                      position: point.positions?.[profile.id]?.position || null,
                    }}
                    currentUserId={currentUser?.id}
                    onPositionSelect={(pos) => handleProfilePointPosition(point.id, pos)}
                    onClear={() => guardedRemovePosition(point.id)}
                    getPointPositionCounts={(p: AdaptedPoint) => toSevenPointCounts(p.positionCounts ?? {})}
                    viewerStoryCount={viewerStoryCountMap?.get(point.id) ?? 0}
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
  onUpdate?: (storyId: string, content: string) => void;
}

/** Char threshold to show the expand toggle — generous since CSS line-clamp-8 handles visual truncation */
const STORY_THRESHOLD = 400;

/** Hard character max for story editing (mirrors DB CHECK constraint) */
const STORY_EDIT_CHAR_MAX = 10000;

function StoryCardFull({
  story,
  author,
  credibilityStats,
  currentUserId,
  onPointPositionSelect,
  onDelete,
  onUpdate,
}: StoryCardFullProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState<string | undefined>(story.imageUrl ?? undefined);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Sync localImageUrl when story prop changes (e.g., parent refetch)
  useEffect(() => {
    setLocalImageUrl(story.imageUrl ?? undefined);
  }, [story.imageUrl]);

  const handleEditStart = () => {
    setEditContent(story.content);
    setIsEditing(true);
    // Focus textarea after render
    setTimeout(() => editTextareaRef.current?.focus(), 0);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleEditSave = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === story.content) {
      handleEditCancel();
      return;
    }
    setIsSaving(true);
    const tags = extractHashtags(trimmed);
    const result = await storiesService.updateStory(story.id, { content: trimmed, tags });
    setIsSaving(false);
    if (result) {
      setIsEditing(false);
      setEditContent('');
      onUpdate?.(story.id, trimmed);
      toast.success('Story updated');
    } else {
      toast.error('Failed to update story');
    }
  };

  // P591: Image handlers (author only) — immediate operations, not part of text draft
  const handleChangeImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleRemoveImage = useCallback(async () => {
    const previousUrl = localImageUrl;
    setLocalImageUrl(undefined);
    try {
      await storiesService.updateStory(story.id, { imageUrl: null });
      toast('Image removed', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            setLocalImageUrl(previousUrl);
            await storiesService.updateStory(story.id, { imageUrl: previousUrl });
          },
        },
      });
      analytics.track('story_image_removed', { story_id: story.id });
    } catch {
      setLocalImageUrl(previousUrl);
      toast.error('Failed to remove image. Please try again.');
    }
  }, [story.id, localImageUrl]);

  const handleImageFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (!file || !session?.access_token) return;

    try {
      const publicUrl = await uploadStoryImage(story.id, file, session.access_token);
      await storiesService.updateStory(story.id, { imageUrl: publicUrl });
      setLocalImageUrl(publicUrl);
      toast.success('Image updated');
      analytics.track('story_image_changed', { story_id: story.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (message.includes('format') || message.includes('5MB')) {
        toast.error('Please use JPEG, PNG, or WebP format (max 5MB)');
      } else {
        toast.error('Failed to upload image. Please try again.');
      }
    }
  }, [story.id, session?.access_token]);

  const handleCardClick = () => {
    if (isEditing) return;
    navigate(detailRoutes.story(story.id));
  };

  const linkedPoints = story.points || [];
  // P1212 §1 — the label belongs to StoryVideoQuotes' own <h3>, never to the prose. Strip
  // it from `content` so the heading renders once, from the component that owns it.
  // (This comment said "renders no quote block" until 2026-09-04, when §4 gave this surface
  //  the block; the stripping is now what PREVENTS a double heading rather than what
  //  suppresses a stray one.)
  const strippedContent = storyTextForDisplay(story.content, story.tags);
  const { isAgentAccountId: isAgentStory, isLoading: storyIdentityPending } = useAgentAccountIds();
  const storyIsAgent = isAgentStory(story.authorId);

  return (
    <>
    {/* P591: Hidden file input for image upload/change */}
    {currentUserId === story.authorId && (
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,.heic,.HEIC"
        className="hidden"
        onChange={handleImageFileSelected}
        tabIndex={-1}
        aria-hidden="true"
      />
    )}
    <div
      role="button"
      tabIndex={0}
      className={`relative group bg-card rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-border overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none${storyIsAgent ? ' agent-card-drained' : ''}`}
      {...(storyIsAgent ? { 'data-agent-row': 'true' } : {})}
      aria-label={`Story by ${author.name}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-story-toggle]')) return;
        handleCardClick();
      }}
      onKeyDown={(e) => {
        // P1212: only the CARD ITSELF activates on Enter/Space. Without this target check
        // the handler fires for a keydown on any nested control and — because it calls
        // preventDefault() — CANCELS that control's own activation before navigating. The
        // quote timecodes §4 added here are anchors: a keyboard reader pressing Enter on
        // "2:14" had the link cancelled and was sent to the story page instead of the
        // source video. The data-story-toggle check below it is the narrow, per-control
        // version of the same guard and is kept for the click path's sake.
        if (e.target !== e.currentTarget) return;
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
            aria-label={`View ${author.name}'s profile`}
          >
            <GravatarAvatar
              name={author.name}
              photoUrl={author.avatarUrl ?? undefined}
              avatarColor={author.avatarColor}
              size="sm"
              isPledger={author.hasPledged}
              isAgent={storyIsAgent}
              identityPending={storyIdentityPending}
            />
          </button>

          {/* P1141 amendment: the drain is NOT applied here — it used to wrap this whole
              content column and greyed the video, the quote pills and the viewer's own
              controls. See src/index.css. */}
          <div className="flex-1 min-w-0">
            {/* Author info row */}
            <div className="mb-2">
              {/* `min-w-0` added with AgentByline: without it this row does not shrink and the
                  chip spills past the card at 320px, the defect measured on the other three
                  surfaces (chip right=308 vs card right=289). */}
              <div className="flex min-w-0 items-center gap-1.5">
                {/* P1141: this surface rendered the raw `Agent · {Name}` while the feed and
                    the story page rendered the byline component — the same story read two
                    different ways depending on where you found it. */}
                {storyIsAgent && !storyIdentityPending ? (
                  <AgentByline
                    name={author.name}
                    onNameClick={(e) => {
                      e.stopPropagation();
                      navigate(`/p/${story.authorSlug || author.id}`);
                    }}
                  />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/p/${story.authorSlug || author.id}`);
                    }}
                    className="font-semibold text-foreground hover:underline text-sm"
                  >
                    {author.name}
                  </button>
                )}
                {/* P1104: an agent holds no reputation. Hand-rolled pill, not <EarBadge>,
                    so it needs BOTH the gate and the testid the page-wide sweep keys on. */}
                {!storyIsAgent && !storyIdentityPending && (
                <MobileTooltip content={earTooltip(credibilityStats.ear, author.name)}>
                  <span data-testid="ear-badge" className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                    <Ear size={12} />
                    {credibilityStats.ear}
                  </span>
                </MobileTooltip>
                )}
              </div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <span>{author.role} · {formatTimeAgo(story.createdAt)}</span>
                <InlineVisibilityIcon visibility={story.visibility} />
              </div>
            </div>

            {/* Story text / inline edit */}
            {isEditing ? (
              <div role="presentation" onClick={(e) => e.stopPropagation()} className="space-y-2">
                {/* P591: Image controls in edit mode — changes are immediate, not part of text draft */}
                {localImageUrl ? (
                  <StoryImage
                    src={localImageUrl}
                    authorName={author.name}
                    onChangeImage={handleChangeImage}
                    onRemoveImage={handleRemoveImage}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleChangeImage}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ImagePlus size={18} />
                    Add image
                  </button>
                )}
                <Textarea
                  ref={editTextareaRef}
                  value={editContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditContent(val.length <= STORY_EDIT_CHAR_MAX ? val : val.slice(0, STORY_EDIT_CHAR_MAX));
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && editContent.trim()) handleEditSave();
                    if (e.key === 'Escape') handleEditCancel();
                  }}
                  disabled={isSaving}
                  className="min-h-[100px] resize-y"
                />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleEditCancel} disabled={isSaving}>Cancel</Button>
                  <Button size="sm" onClick={handleEditSave} disabled={!editContent.trim() || isSaving} className="bg-blue-500 hover:bg-blue-600 text-white">
                    {isSaving ? <><Loader2 size={14} className="animate-spin mr-1" />Saving…</> : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* P1212 §4 — the profile rendered the IMAGE only, so a shared agent
                    profile showed no video. `StoryCardFull` is private to this page and
                    predates P1141, so the `StoryMedia` sweep that fixed the feed, the
                    point-detail card and the story detail never reached it: grepping the
                    component name could not find a surface that inlines its own markup.

                    Video-over-image is StoryMedia's own rule, and the image path is passed
                    through untouched via `imageProps` — a story with no parseable video
                    renders exactly the markup it rendered before. The EDIT branch above
                    keeps StoryImage deliberately: it owns upload/delete of `image_url`,
                    which is an image control, not a media renderer. */}
                {(story.videoUrl || localImageUrl) && (
                  <div className="mb-2">
                    <StoryMedia
                      videoUrl={story.videoUrl}
                      durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
                      mode="thumbnail"
                      storyHref={detailRoutes.story(story.id)}
                      imageProps={localImageUrl ? {
                        src: localImageUrl,
                        authorName: author.name,
                        onClick: () => navigate(detailRoutes.story(story.id)),
                      } : undefined}
                    />
                  </div>
                )}
                <p id={`story-text-${story.id}`} className={`text-foreground text-base break-words ${!storyExpanded ? 'line-clamp-8' : ''}`}>{linkifyText(strippedContent)}</p>
                {/* P1212 §4 — the quotes travel with the story here too. Founder, on this exact
                    surface: "If I send a profile of Yann LeCun to somebody, it should render the
                    full card that we have, like with the video and the timestamps". §1 removed
                    the inline bodies, so without this the profile shows the argument and none of
                    the evidence. No `onSeek` — no player here; StoryVideoQuotes turns each
                    timecode into a link into the source at that second. */}
                {normalizeVideoQuotes(story.videoQuotes).quotes.length > 0 && story.videoUrl && (
                  <div role="presentation" onClick={(e) => e.stopPropagation()}>
                    <StoryVideoQuotes
                      videoUrl={story.videoUrl}
                      quotes={normalizeVideoQuotes(story.videoQuotes).quotes}
                      subjectName={stripAgentPrefix(story.authorName ?? author.name) ?? author.name}
                    />
                  </div>
                )}
                {strippedContent.length > STORY_THRESHOLD && (
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
              </>
            )}

            {/* P1212 §2 — attribution level 3 of 3, on the surface most likely to be
                mistaken for the subject's own page. Not shown while editing: the edit view
                is the author's own working surface, not a reader's. */}
            {!isEditing && storyIsAgent && !storyIdentityPending && (
              <AgentStoryFooter
                name={story.authorName ?? author.name}
                hasQuotes={normalizeVideoQuotes(story.videoQuotes).quotes.length > 0}
              />
            )}

            {/* P503: Tag pills */}
            {!isEditing && ((story.tags?.length ?? 0) > 0 || (story.systemTags?.length ?? 0) > 0) && (
              <TagPills tags={story.tags} systemTags={story.systemTags} context="profile" className="mt-2" />
            )}

            {/* Stats row */}
            <div className="flex items-center gap-1 mt-3 text-sm text-muted-foreground">
              {/* P1141: an agent account cannot sit in a live session and cannot rate a
                  paraphrase, so this count reads 0 permanently. A reader who knows the metric
                  reads that as "nobody understood this", when the truth is "this metric does
                  not describe an agent story". Hidden unconditionally, never hide-when-zero.
                  Gated on identityPending too — the registry fails closed. */}
              {!storyIsAgent && !storyIdentityPending && <UnderstoodBadge count={story.understoodCount} />}
            </div>
          </div>
        </div>
      </div>

      {/* Footer row with linked points and action icons */}
      <div
        role="presentation"
        className="flex items-center justify-between pl-4 sm:pl-[68px] pr-4 py-3 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Point count + author CTA (P580: always show count, author gets "+ add a point") */}
        <div className="flex items-center gap-2">
          {linkedPoints.length > 0 ? (
            <button
              onClick={() => setPointsExpanded(!pointsExpanded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors"
              aria-expanded={pointsExpanded}
            >
              {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'}
              </span>
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">0 points</span>
          )}
          {currentUserId === story.authorId && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/story/${story.id}?addPoint=true`); }}
              className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + Add point
            </button>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {/* Edit/Delete — owner only */}
          {currentUserId === story.authorId && (
            <>
              <MobileTooltip content="Edit story">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditStart(); }}
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
        <div role="presentation" className="pl-4 sm:pl-[68px] pr-4 pb-4" onClick={(e) => e.stopPropagation()}>
          <ThreadLineGroup>
            {linkedPoints.map((point, index) => {
              const isLast = index === linkedPoints.length - 1;
              return (
                <ThreadLineItem key={point.id} isLast={isLast}>
                  <QuotedPointCard
                    point={point}
                    authorId={author.id}
                    fromProfileId={author.id}
                    authorName={author.name}
                    authorAvatarUrl={author.avatarUrl ?? undefined}
                    authorAvatarColor={author.avatarColor}
                    authorEarCount={credibilityStats.ear}
                    authorHasPledged={author.hasPledged}
                    currentUserId={currentUserId}
                    onPositionSelect={(pos) => onPointPositionSelect?.(point.id, pos)}
                  />
                </ThreadLineItem>
              );
            })}
          </ThreadLineGroup>
        </div>
      )}
    </div>
    </>
  );
}

// =============================================================================

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
  const { isAgentAccountId: isAgentOwner, isLoading: ownerIdentityPending } = useAgentAccountIds();
  const ownerIsAgent = isAgentOwner(profileOwner.id);
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
      className={`group bg-card rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-border overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none${ownerIsAgent ? ' agent-card-drained' : ''}`}
      {...(ownerIsAgent ? { 'data-agent-row': 'true' } : {})}
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
              isAgent={ownerIsAgent}
              identityPending={ownerIdentityPending}
              className="!w-5 !h-5 !text-[10px]"
            />
            <span className={`inline-flex items-center gap-1.5${ownerIsAgent ? ' agent-drained-chrome' : ''}`}>
            {/* P1141 amendment: an agent account is named the same way on every surface;
                the raw stored `Agent · {Name}` used to leak through here. */}
            {ownerIsAgent ? (
              <AgentByline name={profileOwner.name} />
            ) : (
              <span className="font-medium">{profileOwner.name}</span>
            )}
            {!ownerIsAgent && !ownerIdentityPending && (
            <MobileTooltip content={earTooltip(credibilityStats.ear, profileOwner.name)}>
              <span data-testid="ear-badge" className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Ear size={14} />
                {credibilityStats.ear}
              </span>
            </MobileTooltip>
            )}
            <PositionBadge position={profileSubjectPosition as PositionType} />
            </span>
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
              <p className="text-foreground text-base break-words">{linkifyText(stripHashtags(point.statement, point.tags))}</p>

              {/* P503: Tag pills */}
              {((point.tags?.length ?? 0) > 0 || (point.systemTags?.length ?? 0) > 0) && (
                <TagPills tags={point.tags} systemTags={point.systemTags} context="profile" className="mt-2" />
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

