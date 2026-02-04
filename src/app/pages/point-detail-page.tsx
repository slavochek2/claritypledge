/**
 * @file point-detail-page.tsx
 * @description Point detail page - shows a point with positions and linked stories.
 * Route: /point/:id
 *
 * Points are shared across profiles. We use a referrer query param to contextualize
 * the view, or show a generic view if no referrer.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pin, Ear } from 'lucide-react';
import { getProfile, type Profile } from '@/app/data/api';
import {
  getMockDataForProfile,
  getStoriesForPoint,
  getPointPositionCounts,
  type ProfileMockData,
} from '@/app/data/mock-profile-data';
import type { Story, Point, PositionType } from '@/app/prototypes/shared/types';
import { getPositionGroup, type PositionButtonGroup } from '@/app/prototypes/shared/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionBadge,
  PositionButtons,
  FilterTabs,
  ShareButton,
  MobileTooltip,
  type PositionFilter,
} from '@/app/prototypes/linkedin-like/components/shared';
import {
  StoryCardDetail,
  type StoryAuthor,
  type CredibilityStats,
} from '@/app/components/social/StoryCardDetail';

// Mock user data for demo
interface MockUser {
  id: string;
  name: string;
  role?: string;
  company?: string;
  hasPledged: boolean;
}

// Mock users for position holders who don't have a profile
const mockUsers: Record<string, MockUser> = {
  user1: { id: 'user1', name: 'Alice Thompson', role: 'Product Manager', company: 'TechCorp', hasPledged: true },
  user2: { id: 'user2', name: 'Bob Chen', role: 'Engineer', company: 'StartupXYZ', hasPledged: false },
  user3: { id: 'user3', name: 'Carol Williams', role: 'Designer', hasPledged: true },
};

const mockUserCredibility: Record<string, CredibilityStats> = {
  user1: { ear: 5, mic: 3 },
  user2: { ear: 2, mic: 1 },
  user3: { ear: 8, mic: 6 },
};

export function PointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mockData, setMockData] = useState<ProfileMockData | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [userPosition, setUserPosition] = useState<PositionType | null>(null);

  // Get referrer profile ID from query params (e.g., /point/pt1?from=profile-uuid)
  const referrerProfileId = searchParams.get('from');

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setError('No point ID provided');
        setLoading(false);
        return;
      }

      try {
        // If we have a referrer profile, use that to generate mock data
        let profileData: Profile | null = null;

        if (referrerProfileId) {
          profileData = await getProfile(referrerProfileId);
        }

        // If no referrer or referrer not found, use a generic mock profile
        // This allows direct links to work without a profile context
        if (!profileData) {
          // Create a minimal mock profile for generic point viewing
          profileData = {
            id: 'generic-user',
            name: 'Anonymous',
            email: '',
            slug: 'anonymous',
            hasPledged: false,
            isVerified: true,
            role: null,
            linkedinUrl: null,
            reason: null,
            signedAt: null,
          };
        }

        setProfile(profileData);

        // Generate mock data for this profile
        const data = getMockDataForProfile(profileData);
        setMockData(data);

        // Find the point
        const foundPoint = data.points.find(p => p.id === id);
        if (!foundPoint) {
          setError('Point not found');
          setLoading(false);
          return;
        }

        setPoint(foundPoint);
        setUserPosition((foundPoint.positions['current']?.position as PositionType) || null);
        setLoading(false);
      } catch (err) {
        console.error('Error loading point:', err);
        setError('Failed to load point');
        setLoading(false);
      }
    }

    loadData();
  }, [id, referrerProfileId]);

  // Get linked stories
  const linkedStories = useMemo(() => {
    if (!point || !mockData) return [];
    return getStoriesForPoint(point, mockData);
  }, [point, mockData]);

  // Group positions by stance
  type PositionHolder = {
    userId: string;
    position: PositionType;
    user: MockUser | null;
    credibility: CredibilityStats;
    story?: Story;
  };

  const positionGroups = useMemo(() => {
    if (!point || !mockData) return { agree: [], disagree: [], unsure: [] };

    const groups: Record<PositionButtonGroup, PositionHolder[]> = {
      agree: [],
      disagree: [],
      unsure: [],
    };

    for (const [userId, entry] of Object.entries(point.positions)) {
      if (userId === 'current' || !entry?.position) continue;

      const group = getPositionGroup(entry.position as PositionType);

      // Get user info
      let user: MockUser | null = null;
      let credibility: CredibilityStats = { ear: 0, mic: 0 };

      if (userId === profile?.id) {
        user = {
          id: profile.id,
          name: profile.name,
          role: profile.role || undefined,
          hasPledged: profile.hasPledged,
        };
        credibility = mockData.credibilityStats;
      } else if (mockUsers[userId]) {
        user = mockUsers[userId];
        credibility = mockUserCredibility[userId] || { ear: 0, mic: 0 };
      }

      // Find linked story for this user
      const story = linkedStories.find(s => s.authorId === userId);

      groups[group].push({
        userId,
        position: entry.position as PositionType,
        user,
        credibility,
        story,
      });
    }

    return groups;
  }, [point, mockData, profile, linkedStories]);

  // Position counts for filter tabs
  const positionCounts = useMemo(() => {
    if (!point) return { all: 0, agree: 0, disagree: 0, unsure: 0 };
    const counts = getPointPositionCounts(point);
    return {
      all: Object.keys(point.positions).filter(id => id !== 'current').length,
      agree: counts.agree + counts.strongly_agree + counts.somewhat_agree,
      disagree: counts.disagree + counts.strongly_disagree + counts.somewhat_disagree,
      unsure: counts.unsure,
    };
  }, [point]);

  // Counts for position buttons (adjusted based on user's position)
  const buttonCounts = useMemo(() => {
    const base = {
      strongly_agree: 0,
      agree: positionCounts.agree,
      somewhat_agree: 0,
      unsure: positionCounts.unsure,
      somewhat_disagree: 0,
      disagree: positionCounts.disagree,
      strongly_disagree: 0,
    };
    return base;
  }, [positionCounts]);

  const handlePositionClick = (position: PositionType) => {
    // Toggle: clicking same position removes it
    setUserPosition(userPosition === position ? null : position);
  };

  // Routes for components
  const routes = useMemo(
    () => ({
      story: (storyId: string) => `/story/${storyId}`,
      point: (pointId: string) => `/point/${pointId}?from=${profile?.id}`,
      profile: (profileId: string) => `/p/${profile?.slug || profileId}`,
    }),
    [profile]
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Skeleton for back button */}
        <div className="h-4 bg-gray-200 rounded w-20 mb-6 animate-pulse" />
        {/* Skeleton for point card */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4 animate-pulse">
          <div className="border-l-4 border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="flex gap-2">
                  <div className="h-8 bg-gray-200 rounded w-20" />
                  <div className="h-8 bg-gray-200 rounded w-20" />
                  <div className="h-8 bg-gray-200 rounded w-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Skeleton for stories section */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
          <div className="flex border-b border-gray-100">
            <div className="flex-1 h-12 bg-gray-100" />
          </div>
          <div className="p-4 space-y-3">
            <div className="h-24 bg-gray-200 rounded" />
            <div className="h-24 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !point || !mockData) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/events');
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 py-2 -ml-2 pl-2 pr-3 min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="text-center py-12">
          <p className="text-gray-500">{error || 'Point not found'}</p>
        </div>
      </div>
    );
  }

  // Which position groups to show based on filter
  const positionsToShow: PositionButtonGroup[] =
    positionFilter === 'all' ? ['agree', 'disagree', 'unsure'] : [positionFilter as PositionButtonGroup];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/events');
          }
        }}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 py-2 -ml-2 pl-2 pr-3 min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Point card with full features */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm border-l-4 border-l-slate-400 overflow-hidden mb-4">
        <div className="p-4">
          {/* Two-column layout */}
          <div className="flex gap-3">
            {/* Pin icon - blue to distinguish from Stories */}
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
              <Pin size={20} />
            </div>

            {/* Content column */}
            <div className="flex-1 min-w-0">
              {/* Point text */}
              <p className="text-gray-900 font-medium text-lg mb-3">{point.text}</p>

              {/* Position buttons (interactive) */}
              <div className="mb-3">
                <PositionButtons
                  userPosition={userPosition}
                  counts={buttonCounts}
                  onPositionClick={handlePositionClick}
                />
              </div>

              {/* Credibility context if viewing from a profile */}
              {profile && point.positions[profile.id] && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{profile.name}'s position:</span>
                  <PositionBadge position={point.positions[profile.id]?.position as PositionType} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer with share button */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-gray-100">
          <ShareButton type="point" id={point.id} description={point.text.slice(0, 100)} />
        </div>
      </div>

      {/* Linked Stories section */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Filter tabs */}
        <FilterTabs
          activeFilter={positionFilter}
          onFilterChange={setPositionFilter}
          counts={positionCounts}
        />

        {/* Stories by position */}
        <div className="p-4 space-y-4">
          {positionsToShow.map(positionGroup => {
            const holdersInGroup = positionGroups[positionGroup];

            if (holdersInGroup.length === 0 && positionFilter === 'all') {
              return null; // Hide empty sections when showing all
            }

            if (holdersInGroup.length === 0) {
              return (
                <p key={positionGroup} className="text-center text-gray-400 text-sm py-3">
                  (no positions yet)
                </p>
              );
            }

            return (
              <div key={positionGroup} className="space-y-3">
                {holdersInGroup.map(holder => {
                  if (holder.story && holder.user) {
                    // Show StoryCardDetail for users with stories
                    const author: StoryAuthor = {
                      id: holder.user.id,
                      name: holder.user.name,
                      role: holder.user.role,
                      hasPledged: holder.user.hasPledged,
                    };

                    return (
                      <StoryCardDetail
                        key={holder.userId}
                        story={holder.story}
                        author={author}
                        authorCredibility={holder.credibility}
                        linkedPoints={[]} // Don't show linked points in this context
                        getPointPositionCounts={getPointPositionCounts}
                        context="point-detail"
                        authorPosition={holder.position}
                        routes={routes}
                      />
                    );
                  }

                  // Position holder without a story
                  return (
                    <PositionOnlyCard
                      key={holder.userId}
                      user={holder.user}
                      userId={holder.userId}
                      position={holder.position}
                      credibility={holder.credibility}
                      onProfileClick={() => {
                        if (holder.userId === profile?.id) {
                          navigate(routes.profile(profile.id));
                        }
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact card for position holders without a story
 * Styled consistently with StoryCardDetail patterns
 */
function PositionOnlyCard({
  user,
  userId,
  position,
  credibility,
  onProfileClick,
}: {
  user: MockUser | null;
  userId: string;
  position: PositionType;
  credibility: CredibilityStats;
  onProfileClick?: () => void;
}) {
  const name = user?.name || `User ${userId.slice(0, 6)}`;
  const hasPledged = user?.hasPledged || false;
  const role = user?.role;
  const company = user?.company;

  return (
    <div
      role={onProfileClick ? 'button' : undefined}
      tabIndex={onProfileClick ? 0 : undefined}
      onClick={onProfileClick}
      onKeyDown={
        onProfileClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onProfileClick();
              }
            }
          : undefined
      }
      className={`group flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 ${onProfileClick ? 'cursor-pointer hover:bg-gray-100 hover:border-gray-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none' : ''} transition-colors`}
    >
      {/* Avatar */}
      <GravatarAvatar
        name={name}
        size="sm"
        isPledger={hasPledged}
        className="!w-5 !h-5 !text-[10px]"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Name */}
          <span className="font-medium text-gray-900 text-sm truncate">{name}</span>
          {/* Credibility - ear count */}
          {credibility.ear > 0 && (
            <MobileTooltip
              content={`${name.split(' ')[0]} understood ${credibility.ear} ${credibility.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}
            >
              <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                <Ear size={12} />
                {credibility.ear}
              </span>
            </MobileTooltip>
          )}
          {/* Position badge */}
          <PositionBadge position={position} />
        </div>
        {/* Role metadata */}
        {(role || company) && (
          <p className="text-xs text-gray-500 truncate">
            {role}
            {company && ` at ${company}`}
          </p>
        )}
      </div>

      {/* No story indicator */}
      <span className="text-xs text-gray-400 italic flex-shrink-0">No story yet</span>
    </div>
  );
}

export default PointDetailPage;
