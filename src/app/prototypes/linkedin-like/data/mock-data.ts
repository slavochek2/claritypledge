// ============================================================================
// LinkedIn-like Prototype Data Layer
// ============================================================================
// Re-exports shared types and data, adds linkedin-specific helpers if needed.

// Re-export everything from shared
export * from '../../shared/types';
export * from '../../shared/utils';
export * from '../../shared/mock-data';

// LinkedIn-like specific type aliases for backwards compatibility
export type { Position, PositionType, PositionEntry } from '../../shared/types';
export type { IdeaVisibility, VerificationStatus, UnderstandingDirection } from '../../shared/types';
export type { Notification, NotificationType } from '../../shared/types';

// P55: Understanding Verification Loop types
export type { SurfacedIdea, SwipeAction, IdeaQueueItem, IdeasTabState } from '../../shared/types';
