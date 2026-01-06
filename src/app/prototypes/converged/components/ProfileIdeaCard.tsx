import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, HelpCircle, Sparkles, CheckCircle } from 'lucide-react';
import type { Idea, Position } from '../data/mock-data';
import { getIdeaStats, formatTimeAgo } from '../data/mock-data';
import { PositionBadge } from './PositionBadge';
import { routes } from '../config';

interface ProfileIdeaCardProps {
  idea: Idea;
  userPosition: Position;
  otherUserPosition?: Position | null; // For other person's profile
  isVerified: boolean;
  isOwnProfile: boolean;
  userName?: string; // Name of the profile owner
  profileOwnerId?: string; // ID of the profile owner (for verification navigation)
}

export function ProfileIdeaCard({
  idea,
  userPosition,
  otherUserPosition,
  isVerified,
  isOwnProfile,
  userName,
  profileOwnerId,
}: ProfileIdeaCardProps) {
  const navigate = useNavigate();
  const stats = getIdeaStats(idea);
  const userLabel = isOwnProfile ? 'You' : (userName || 'User').split(' ')[0];

  const handleVerify = () => {
    if (!profileOwnerId) return;

    navigate(routes.live, {
      state: {
        partnerId: profileOwnerId,
        ideaId: idea.id,
        ideaText: idea.text,
        myPosition: otherUserPosition, // Current user's position
        theirPosition: userPosition,   // Profile owner's position
      }
    });
  };

  return (
    <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
      {/* Position badges */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PositionBadge position={userPosition} label={userLabel} />
        {isVerified && (
          <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            Verified
          </span>
        )}
        {!isOwnProfile && otherUserPosition && (
          <>
            <span className="text-gray-300">·</span>
            <PositionBadge position={otherUserPosition} label="You" />
          </>
        )}
      </div>

      {/* Idea text */}
      <p className="text-base text-gray-900 mb-4">{idea.text}</p>

      {/* Stats row (not clickable on profile) */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="w-4 h-4" />
          {stats.agree}
        </span>
        <span className="flex items-center gap-1.5">
          <ThumbsDown className="w-4 h-4" />
          {stats.disagree}
        </span>
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4" />
          {stats.unsure}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {stats.crossVerified > 0 && (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {stats.crossVerified} cross-verified
            </span>
          )}
        </div>
        <span>{formatTimeAgo(idea.createdAt)}</span>
      </div>

      {/* Action button (only on other's profile if you disagree) */}
      {!isOwnProfile && userPosition !== otherUserPosition && otherUserPosition && (
        <button
          onClick={handleVerify}
          className="mt-4 w-full py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
        >
          Verify Understanding
        </button>
      )}
    </div>
  );
}
