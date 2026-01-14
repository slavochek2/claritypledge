/**
 * @file VerificationStatusPanel.tsx
 * @description Inline expandable panel showing verification status for an idea.
 * Expands below the card like Twitter comments.
 * Shows rating dots for each verification (like in /live).
 *
 * Key concept: Each verification is ONE DIRECTION. A session between two people
 * can have 0, 1, or 2 verifications. We display each verification as its own row.
 *
 * Context-aware filtering:
 * - contextUserId determines whose verifications to show
 * - On your profile: shows only YOUR verifications
 * - On someone else's profile: shows only THEIR verifications
 * - On idea detail page (showAll=true): shows ALL verifications
 */
import { useNavigate } from 'react-router-dom';
import { VerificationSession, getUserById } from '../../data/mock-data';
import { RatingDots } from './RatingDots';
import { routes } from '../../config';

interface VerificationStatusPanelProps {
  sessions: VerificationSession[];
  ideaId: string;
  currentUserId?: string; // The logged-in user ('current')
  contextUserId?: string; // Whose verifications to show (profile owner)
  showAll?: boolean; // If true, show all verifications (idea detail page)
}

// A single verification (one person understanding another)
interface Verification {
  sessionId: string;
  verifierId: string;    // Who did the verification (who understands)
  verifiedId: string;    // Who was verified (who is understood)
  rating: number;
}

// Extract individual verifications from sessions
const extractVerifications = (sessions: VerificationSession[]): Verification[] => {
  const verifications: Verification[] = [];

  for (const session of sessions) {
    const [p1, p2] = session.participants;
    const verifiedBy = session.verifiedBy || [];
    const ratings = session.ratings || {};

    // If p1 verified (understands p2)
    if (verifiedBy.includes(p1) && ratings[p1] !== undefined) {
      verifications.push({
        sessionId: session.id,
        verifierId: p1,
        verifiedId: p2,
        rating: ratings[p1],
      });
    }

    // If p2 verified (understands p1)
    if (verifiedBy.includes(p2) && ratings[p2] !== undefined) {
      verifications.push({
        sessionId: session.id,
        verifierId: p2,
        verifiedId: p1,
        rating: ratings[p2],
      });
    }
  }

  return verifications;
};

export function VerificationStatusPanel({
  sessions,
  ideaId,
  currentUserId = 'current',
  contextUserId,
  showAll = false,
}: VerificationStatusPanelProps) {
  const navigate = useNavigate();

  // Get display name (short version for compact display)
  const getName = (userId: string) => {
    if (userId === 'current' || userId === currentUserId) return 'You';
    const user = getUserById(userId);
    const fullName = user?.name || userId;
    return fullName.split(' ')[0];
  };

  // Extract all individual verifications from sessions
  const allVerifications = extractVerifications(sessions);

  // Filter based on context
  const effectiveContextUser = contextUserId || currentUserId;
  const contextVerifications = showAll
    ? allVerifications
    : allVerifications.filter(v =>
        v.verifierId === effectiveContextUser ||
        v.verifiedId === effectiveContextUser ||
        (effectiveContextUser === 'current' && (v.verifierId === 'current' || v.verifiedId === 'current'))
      );

  // Navigate to live session
  const handleSessionClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    navigate(routes.live(sessionId));
  };

  const handleSeeAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(routes.idea(ideaId));
  };

  // Check if there are more verifications in full list
  const allVerificationsCount = extractVerifications(sessions).length;
  const hasMoreVerifications = !showAll && allVerificationsCount > contextVerifications.length;

  // Empty state
  if (contextVerifications.length === 0) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-6" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <p className="text-gray-500 text-sm">No verifications yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Start a live session to verify understanding
          </p>
          {hasMoreVerifications && (
            <button
              onClick={handleSeeAll}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              See all verifications for this idea →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50" onClick={e => e.stopPropagation()}>
      {/* Verification list - each row is ONE verification (one direction) */}
      <div className="px-3 py-2 space-y-1.5 max-h-64 overflow-y-auto">
        {contextVerifications.map((v) => (
          <button
            key={`${v.sessionId}-${v.verifierId}`}
            onClick={(e) => handleSessionClick(e, v.sessionId)}
            className="w-full py-1.5 px-3 rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-200 transition-all text-left bg-white"
          >
            {/* Single verification row: "X understands Y" · rating */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900">{getName(v.verifierId)}</span>
              <span className="text-gray-500 text-xs">understands</span>
              <span className="font-medium text-sm text-gray-900">{getName(v.verifiedId)}</span>
              <span className="text-gray-300 mx-1">·</span>
              <RatingDots rating={v.rating} size="sm" />
            </div>
          </button>
        ))}
      </div>

      {/* See more link */}
      {hasMoreVerifications && (
        <div className="px-3 py-2 border-t border-gray-200">
          <button
            onClick={handleSeeAll}
            className="w-full text-center text-xs text-blue-600 hover:text-blue-700 font-medium py-1"
          >
            See {allVerificationsCount - contextVerifications.length} more Clarity sessions →
          </button>
        </div>
      )}
    </div>
  );
}
