import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Radio, Zap } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { StoryCard } from './StoryCard';
import { RatingDots } from './shared';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { routes } from '../config';
import {
  getStoryById,
  getUserById,
  getPointsForStory,
  mockVerificationSessions,
  currentUser,
} from '../data/mock-data';
import type { Story } from '../../shared/types';

/**
 * StoryDetail - Journey 2: "Understand a person"
 * Shows a Story with linked Points (via StoryCard) and Clarity Sessions.
 */
export function StoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const story = getStoryById(id || '');

  if (!story) {
    return (
      <PrototypeLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-gray-500">Story not found</p>
        </div>
      </PrototypeLayout>
    );
  }

  const author = getUserById(story.authorId);

  return (
    <PrototypeLayout>
      <div className="max-w-lg mx-auto pb-8">
        {/* Back button */}
        <div className="px-4 pt-3">
          <button
            onClick={() => navigate(routes.myEvents)}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 -ml-1"
          >
            <ArrowLeft size={16} />
            My Events
          </button>
        </div>

        {/* Story card - in detail view mode (includes Linked Points section) */}
        <div className="px-2 pt-2">
          <StoryCard story={story} isDetailView />
        </div>

        {/* Clarity Sessions section */}
        <ClaritySessionsSection story={story} navigate={navigate} />
      </div>
    </PrototypeLayout>
  );
}

// Clarity Sessions section - shows verifications related to this story's linked points
interface ClaritySessionsSectionProps {
  story: Story;
  navigate: ReturnType<typeof useNavigate>;
}

function ClaritySessionsSection({ story, navigate }: ClaritySessionsSectionProps) {
  // Get points linked to this story
  const linkedPoints = getPointsForStory(story.id);
  const linkedPointIds = linkedPoints.map(p => p.id);

  // For Stories, we show sessions that:
  // 1. Involve the story author AND
  // 2. Are about one of the linked points (or their equivalent idea IDs)
  // Since mock data uses idea IDs that match point content, we'll use a simple approach:
  // Show sessions where the story author is a participant

  const sessions = mockVerificationSessions.filter(session =>
    session.participants.includes(story.authorId) &&
    session.ratings && Object.keys(session.ratings).length > 0
  );

  // Extract individual verifications from sessions
  type Verification = {
    sessionId: string;
    verifierId: string;
    verifiedId: string;
    rating: number;
    isAcrossDisagreement: boolean;
  };

  const verifications: Verification[] = [];

  for (const session of sessions) {
    const [p1, p2] = session.participants;
    const verifiedBy = session.verifiedBy || [];
    const ratings = session.ratings || {};

    // Check if positions differ (simplified: assume different for now if both have positions)
    const isDifferentPosition = p1 !== p2;

    // For Story pages: only show verifications where the STORY OWNER is the verifier
    // (they confirmed someone else understood their story)
    // The other party in the session is the one who demonstrated understanding

    // If story author is p1 and they gave a rating, show "p2 understands p1 (author)"
    if (p1 === story.authorId && verifiedBy.includes(p1) && ratings[p1] !== undefined) {
      verifications.push({
        sessionId: session.id,
        verifierId: p1,  // story author verified
        verifiedId: p2,  // other person demonstrated understanding
        rating: ratings[p1],
        isAcrossDisagreement: !!isDifferentPosition,
      });
    }

    // If story author is p2 and they gave a rating, show "p1 understands p2 (author)"
    if (p2 === story.authorId && verifiedBy.includes(p2) && ratings[p2] !== undefined) {
      verifications.push({
        sessionId: session.id,
        verifierId: p2,  // story author verified
        verifiedId: p1,  // other person demonstrated understanding
        rating: ratings[p2],
        isAcrossDisagreement: !!isDifferentPosition,
      });
    }
  }

  if (verifications.length === 0) return null;

  const acrossDisagreementCount = verifications.filter(v => v.isAcrossDisagreement).length;

  const getUser = (userId: string) => {
    if (userId === 'current') return currentUser;
    return getUserById(userId);
  };

  const getName = (userId: string) => {
    // Always use actual name in Clarity Sessions log (third-person narrative context)
    const user = getUser(userId);
    return user?.name || 'Unknown';
  };

  return (
    <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-gray-500" />
          <span className="font-medium text-gray-900">Clarity Sessions</span>
          <span className="text-sm text-gray-500">({verifications.length})</span>
        </div>
        {acrossDisagreementCount > 0 && (
          <div className="flex items-center gap-1.5 text-gray-500 text-sm">
            <Zap size={14} />
            <span>{acrossDisagreementCount} across disagreement</span>
          </div>
        )}
      </div>

      {/* Verification list */}
      <div className="p-4 space-y-2">
        {verifications.map((v, idx) => (
          <button
            key={`${v.sessionId}-${v.verifierId}-${idx}`}
            onClick={() => navigate(routes.liveSession(v.sessionId))}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            {/* Avatar of person who demonstrated understanding */}
            {(() => {
              const user = getUser(v.verifiedId);
              return user ? (
                <GravatarAvatar
                  name={user.name}
                  size="sm"
                  isPledger={user.hasPledged}
                  className="!w-8 !h-8 !text-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">?</div>
              );
            })()}

            {/* Text: "X understands Y" - verified demonstrates understanding of verifier */}
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium text-gray-900">{getName(v.verifiedId)}</span>
                <span className="text-gray-500"> understands </span>
                <span className="font-medium text-gray-900">{getName(v.verifierId)}</span>
              </p>
            </div>

            {/* Rating dots + across disagreement indicator */}
            <div className="flex items-center gap-2">
              {v.isAcrossDisagreement && (
                <Zap size={12} className="text-gray-400" />
              )}
              <RatingDots rating={v.rating} size="sm" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
