// ============================================================================
// Shared Utility Functions for Prototypes
// ============================================================================

import type { Position, PositionType, PositionEntry, Idea, IdeaSimple } from './types';

// -----------------------------------------------------------------------------
// Time Formatting
// -----------------------------------------------------------------------------

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Premium variant with "ago" suffix
export function formatTimeAgoVerbose(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// -----------------------------------------------------------------------------
// Position Helpers
// -----------------------------------------------------------------------------

export function getPositionCounts(idea: Idea | IdeaSimple): { agree: number; disagree: number; dont_know: number } {
  const counts = { agree: 0, disagree: 0, dont_know: 0 };

  Object.values(idea.positions).forEach(entry => {
    if (entry === null) return;

    // Handle both PositionEntry (linkedin-like) and Position (premium) formats
    const position: PositionType | null = typeof entry === 'object' && 'position' in entry
      ? entry.position
      : entry as PositionType | null;

    if (position && position in counts) {
      counts[position as PositionType]++;
    }
  });

  return counts;
}

export function getPositionEmoji(position: Position): string {
  switch (position) {
    case 'agree': return '✓';
    case 'disagree': return '✗';
    case 'dont_know': return '?';
    default: return '○';
  }
}

export function getPositionLabel(position: Position): string {
  switch (position) {
    case 'agree': return 'Agrees';
    case 'disagree': return 'Disagrees';
    case 'dont_know': return 'Uncertain';
    default: return 'No position';
  }
}

export function getPositionActionLabel(position: Position): string {
  switch (position) {
    case 'agree': return 'Agreed';
    case 'disagree': return 'Disagreed';
    case 'dont_know': return 'Unsure';
    default: return 'No position';
  }
}

// Extract position from PositionEntry or direct Position
export function extractPosition(entry: PositionEntry | Position | null): Position {
  if (entry === null) return null;
  if (typeof entry === 'object' && 'position' in entry) {
    return entry.position;
  }
  return entry as Position;
}

// -----------------------------------------------------------------------------
// Live Session Helpers
// -----------------------------------------------------------------------------

export function calculateGap(checkerRating: number, responderRating: number): {
  gap: number;
  type: 'overconfidence' | 'underconfidence' | 'none';
} {
  const gap = Math.abs(checkerRating - responderRating);

  if (gap <= 1) {
    return { gap, type: 'none' };
  }

  // Overconfidence: responder thought they understood better than they did
  // Underconfidence: responder understood better than they thought
  const type = responderRating > checkerRating ? 'overconfidence' : 'underconfidence';

  return { gap, type };
}

export function getGapMessage(gapType: 'overconfidence' | 'underconfidence' | 'none'): string {
  switch (gapType) {
    case 'overconfidence':
      return 'You thought you understood better than you did';
    case 'underconfidence':
      return 'You understood better than you thought!';
    case 'none':
      return 'Well calibrated!';
  }
}

// -----------------------------------------------------------------------------
// Verification Helpers
// -----------------------------------------------------------------------------

import type { VerificationStatus, VerificationSession, UnderstandingDirection } from './types';

/**
 * Get the best verification status for an idea across all sessions involving a user.
 * Priority: in_progress > verified > not_started
 *
 * @param sessions - All verification sessions for this idea involving the user
 * @returns The most relevant status and the partner user ID (if any)
 */
export function getBestVerificationStatus(
  sessions: VerificationSession[]
): { status: VerificationStatus; partnerId: string | null } {
  // Priority: in_progress first (active session), then verified, then not_started
  const inProgress = sessions.find(s => s.status === 'in_progress');
  if (inProgress) {
    const partnerId = inProgress.participants.find(p => p !== 'current') || null;
    return { status: 'in_progress', partnerId };
  }

  const verified = sessions.find(s => s.status === 'verified');
  if (verified) {
    const partnerId = verified.participants.find(p => p !== 'current') || null;
    return { status: 'verified', partnerId };
  }

  return { status: 'not_started', partnerId: null };
}

/**
 * Get the understanding direction for a session from a user's perspective.
 *
 * @param session - The verification session
 * @param viewerId - The user viewing this (typically 'current')
 * @returns The direction of understanding
 */
export function getUnderstandingDirection(
  session: VerificationSession,
  viewerId: string = 'current'
): UnderstandingDirection {
  const partnerId = session.participants.find(p => p !== viewerId);
  if (!partnerId) return 'none';

  const viewerVerified = session.verifiedBy.includes(viewerId);
  const partnerVerified = session.verifiedBy.includes(partnerId);

  if (viewerVerified && partnerVerified) return 'mutual';
  if (viewerVerified && !partnerVerified) return 'you_understand_them';
  if (!viewerVerified && partnerVerified) return 'they_understand_you';
  return 'none';
}

/**
 * Count mutual understandings for a user across sessions.
 * This is what we show on the button: "X understood"
 */
export function countMutualUnderstandings(
  sessions: VerificationSession[],
  userId: string = 'current'
): number {
  return sessions.filter(s => {
    const direction = getUnderstandingDirection(s, userId);
    return direction === 'mutual';
  }).length;
}

// -----------------------------------------------------------------------------
// ID Generation
// -----------------------------------------------------------------------------

export function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
