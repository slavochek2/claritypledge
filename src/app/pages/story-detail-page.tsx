/**
 * @file story-detail-page.tsx
 * @description Story detail page - shows a story with its linked points and Clarity Sessions.
 * Route: /story/:id
 *
 * Story IDs follow pattern: st-{profileId}-{num}
 * We extract the profile ID and regenerate consistent mock data.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getProfile, type Profile } from '@/app/data/api';
import {
  extractProfileIdFromStoryId,
  getMockDataForProfile,
  getPointsForStory,
  getPointPositionCounts,
  type ProfileMockData,
} from '@/app/data/mock-profile-data';
import type { Story, Point } from '@/app/prototypes/shared/types';
import { StoryCardDetail, type StoryAuthor, type CredibilityStats } from '@/app/components/social/StoryCardDetail';
import { ClaritySessions, ClaritySessionsEmpty, type Verification, type ClarityUser } from '@/app/components/social/ClaritySessions';

// Mock verification sessions for demo purposes
// In a real app, this would come from the backend
interface MockVerificationSession {
  id: string;
  participants: [string, string];
  verifiedBy: string[];
  ratings: Record<string, number>;
}

export function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mockData, setMockData] = useState<ProfileMockData | null>(null);
  const [story, setStory] = useState<Story | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setError('No story ID provided');
        setLoading(false);
        return;
      }

      // Extract profile ID from story ID (pattern: st-{profileId}-{num})
      const profileId = extractProfileIdFromStoryId(id);
      if (!profileId) {
        setError('Invalid story ID format');
        setLoading(false);
        return;
      }

      try {
        // Load the profile
        const profileData = await getProfile(profileId);
        if (!profileData) {
          setError('Profile not found');
          setLoading(false);
          return;
        }

        setProfile(profileData);

        // Generate mock data for this profile
        const data = getMockDataForProfile(profileData);
        setMockData(data);

        // Find the story
        const foundStory = data.stories.find(s => s.id === id);
        if (!foundStory) {
          setError('Story not found');
          setLoading(false);
          return;
        }

        setStory(foundStory);
        setLoading(false);
      } catch (err) {
        console.error('Error loading story:', err);
        setError('Failed to load story');
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  // Convert profile to StoryAuthor format
  const author: StoryAuthor | null = useMemo(() => {
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      role: profile.role || undefined,
      hasPledged: profile.hasPledged,
    };
  }, [profile]);

  // Get credibility stats from mock data
  const authorCredibility: CredibilityStats = useMemo(() => {
    return mockData?.credibilityStats || { ear: 0, mic: 0 };
  }, [mockData]);

  // Get linked points
  const linkedPoints: Point[] = useMemo(() => {
    if (!story || !mockData) return [];
    return getPointsForStory(story, mockData);
  }, [story, mockData]);

  // Generate mock verification sessions for this story
  // In a real app, these would come from the database
  const mockSessions: MockVerificationSession[] = useMemo(() => {
    if (!profile || !story) return [];

    // Generate some mock sessions based on verificationCount
    const sessions: MockVerificationSession[] = [];
    const mockUsers = ['user1', 'user2', 'user3'];

    for (let i = 0; i < Math.min(story.verificationCount, 3); i++) {
      sessions.push({
        id: `session-${story.id}-${i}`,
        participants: [profile.id, mockUsers[i]],
        verifiedBy: [profile.id],
        ratings: { [profile.id]: 7 + i },
      });
    }

    return sessions;
  }, [profile, story]);

  // Convert mock sessions to Verification format
  const verifications: Verification[] = useMemo(() => {
    if (!profile) return [];

    const result: Verification[] = [];

    for (const session of mockSessions) {
      const [p1, p2] = session.participants;
      const verifiedBy = session.verifiedBy || [];
      const ratings = session.ratings || {};

      // If story author is p1 and they gave a rating, show "p2 understands p1 (author)"
      if (p1 === profile.id && verifiedBy.includes(p1) && ratings[p1] !== undefined) {
        result.push({
          sessionId: session.id,
          verifierId: p1,
          verifiedId: p2,
          rating: ratings[p1],
          isAcrossDisagreement: true, // Simplified - assume different positions
        });
      }

      // If story author is p2 and they gave a rating
      if (p2 === profile.id && verifiedBy.includes(p2) && ratings[p2] !== undefined) {
        result.push({
          sessionId: session.id,
          verifierId: p2,
          verifiedId: p1,
          rating: ratings[p2],
          isAcrossDisagreement: true,
        });
      }
    }

    return result;
  }, [profile, mockSessions]);

  // User lookup for ClaritySessions
  const getUserById = (userId: string): ClarityUser | undefined => {
    if (!profile) return undefined;

    if (userId === profile.id) {
      return { id: profile.id, name: profile.name, hasPledged: profile.hasPledged };
    }

    // Mock users for demo
    const mockUserNames: Record<string, string> = {
      user1: 'Alice Thompson',
      user2: 'Bob Chen',
      user3: 'Carol Williams',
    };

    if (mockUserNames[userId]) {
      return { id: userId, name: mockUserNames[userId], hasPledged: true };
    }

    return undefined;
  };

  // Routes for the StoryCardDetail component
  const routes = useMemo(() => ({
    story: (storyId: string) => `/story/${storyId}`,
    point: (pointId: string) => `/point/${pointId}?from=${profile?.id}`,
    profile: (profileId: string) => `/p/${profile?.slug || profileId}`,
  }), [profile]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Skeleton for back button */}
        <div className="h-4 bg-gray-200 rounded w-20 mb-6 animate-pulse" />
        {/* Skeleton for story card */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-pulse">
          <div className="border-l-4 border-blue-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-24" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>
          </div>
        </div>
        {/* Skeleton for linked points */}
        <div className="mt-4">
          <div className="h-4 bg-gray-200 rounded w-32 mb-3 animate-pulse" />
          <div className="space-y-3">
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        {/* Skeleton for Clarity Sessions */}
        <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg animate-pulse">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-32" />
          </div>
          <div className="p-4 space-y-2">
            <div className="h-12 bg-gray-200 rounded" />
            <div className="h-12 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !story || !mockData || !profile || !author) {
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
          <p className="text-gray-500">{error || 'Story not found'}</p>
        </div>
      </div>
    );
  }

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

      {/* Story card with full metadata */}
      <div className="px-2">
        <StoryCardDetail
          story={story}
          author={author}
          authorCredibility={authorCredibility}
          linkedPoints={linkedPoints}
          getPointPositionCounts={getPointPositionCounts}
          isDetailView
          routes={routes}
        />
      </div>

      {/* Clarity Sessions section */}
      {verifications.length > 0 ? (
        <ClaritySessions
          verifications={verifications}
          getUserById={getUserById}
        />
      ) : story.verificationCount > 0 ? (
        // Show empty state with the verification count hint
        <ClaritySessionsEmpty />
      ) : null}
    </div>
  );
}

export default StoryDetailPage;
