/**
 * @file ClaritySessions.tsx
 * @description Clarity Sessions section - shows verification history for a story.
 * Forked from prototype StoryDetail's ClaritySessionsSection.
 * Accepts data via props instead of importing from mock-data.
 *
 * Displays a list of verifications where someone confirmed understanding
 * another person's perspective.
 */

import { useNavigate } from 'react-router-dom';
import { Radio, Zap } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { RatingDots } from '@/app/components/shared';

/** User info for display */
export interface ClarityUser {
  id: string;
  name: string;
  hasPledged: boolean;
}

/** A single verification entry */
export interface Verification {
  sessionId: string;
  /** The person who gave the rating (story owner) */
  verifierId: string;
  /** The person who demonstrated understanding */
  verifiedId: string;
  /** Rating 1-10 */
  rating: number;
  /** Whether the two parties have different positions */
  isAcrossDisagreement: boolean;
}

interface ClaritySessionsProps {
  /** List of verifications to display */
  verifications: Verification[];
  /** Lookup function to get user info */
  getUserById: (id: string) => ClarityUser | undefined;
  /** Route generator for session links */
  getSessionRoute?: (sessionId: string) => string;
  /** Total count of verifications (may differ from array length if paginated) */
  totalCount?: number;
}

/**
 * ClaritySessions - displays verification history for a story
 * Shows who understood the story owner as confirmed by the owner.
 */
export function ClaritySessions({
  verifications,
  getUserById,
  getSessionRoute,
  totalCount,
}: ClaritySessionsProps) {
  const navigate = useNavigate();

  // Don't render if no verifications
  if (verifications.length === 0) {
    return null;
  }

  const acrossDisagreementCount = verifications.filter(v => v.isAcrossDisagreement).length;
  const displayCount = totalCount ?? verifications.length;

  const getName = (userId: string): string => {
    const user = getUserById(userId);
    return user?.name || 'Unknown';
  };

  const defaultSessionRoute = (sessionId: string) => `/live/${sessionId}`;
  const sessionRoute = getSessionRoute || defaultSessionRoute;

  return (
    <div className="bg-white border border-border mx-2 mt-3 rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-900">Clarity Sessions</span>
          <span className="text-sm text-gray-500">({displayCount})</span>
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
            onClick={() => navigate(sessionRoute(v.sessionId))}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            {/* Avatar of person who demonstrated understanding */}
            {(() => {
              const user = getUserById(v.verifiedId);
              return user ? (
                <GravatarAvatar
                  name={user.name}
                  size="sm"
                  isPledger={user.hasPledged}
                  className="!w-8 !h-8 !text-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">
                  ?
                </div>
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
              {v.isAcrossDisagreement && <Zap size={12} className="text-gray-400" />}
              <RatingDots rating={v.rating} size="sm" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Empty state component for when there are no verifications yet
 */
export function ClaritySessionsEmpty() {
  return (
    <div className="bg-white border border-border mx-2 mt-3 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Radio className="w-4 h-4 text-gray-500" />
        <span className="font-medium text-gray-900">Clarity Sessions</span>
        <span className="text-sm text-gray-500">(0)</span>
      </div>
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500">No verifications yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Verifications appear when someone confirms they understand this story
        </p>
      </div>
    </div>
  );
}
