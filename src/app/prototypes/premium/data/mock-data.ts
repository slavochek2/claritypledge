// ============================================================================
// Premium Prototype Data Layer
// ============================================================================
// Re-exports shared types and data with simplified interface for Premium.

// Re-export types
export type { Position, User, IdeaSimple as Idea, Certification, Comment, Message } from '../../shared/types';

// Re-export shared data and helpers
export {
  currentUser,
  mockUsers,
  mockCertifications,
  mockComments,
  mockMessages,
  getUserById,
  getCommentsForIdea,
  getCertificationsForIdea,
} from '../../shared/mock-data';

// Re-export utils
export { formatTimeAgoVerbose as formatTimeAgo, getPositionCounts } from '../../shared/utils';

// Premium uses simplified ideas (no timestamps on positions, no visibility)
import { getSimplifiedIdeas, getSimpleIdeaById } from '../../shared/mock-data';

export const mockIdeas = getSimplifiedIdeas();
export const getIdeaById = getSimpleIdeaById;
