// ============================================================================
// Shared Type Definitions for Prototypes
// ============================================================================
// This is the single source of truth for all prototype types.
// Both linkedin-like and premium prototypes import from here.

// -----------------------------------------------------------------------------
// Position Types
// -----------------------------------------------------------------------------

// 7-point Likert scale: -3 to +3
// Enables tracking position *magnitude* changes for V7 vision's Asymmetric Conversion Hypothesis
//
// Scale values:
//   strongly_disagree (-3), disagree (-2), somewhat_disagree (-1),
//   unsure (0),
//   somewhat_agree (+1), agree (+2), strongly_agree (+3)
//
export type PositionType =
  | 'strongly_disagree'  // -3
  | 'disagree'           // -2
  | 'somewhat_disagree'  // -1
  | 'unsure'             // 0
  | 'somewhat_agree'     // +1
  | 'agree'              // +2
  | 'strongly_agree';    // +3

export type Position = PositionType | null;

// Legacy 3-point positions for backwards compatibility (migrate to moderate values)
// agree → agree (+2), disagree → disagree (-2), dont_know → unsure (0)
export type LegacyPositionType = 'agree' | 'disagree' | 'dont_know';

export interface PositionEntry {
  position: PositionType;
  timestamp: string;
}

// Position value mapping for numeric operations
export const POSITION_VALUES: Record<PositionType, number> = {
  strongly_disagree: -3,
  disagree: -2,
  somewhat_disagree: -1,
  unsure: 0,
  somewhat_agree: 1,
  agree: 2,
  strongly_agree: 3,
};

// Button groups for 3-button UI
export type PositionButtonGroup = 'disagree' | 'unsure' | 'agree';

// Map position type to its button group
export function getPositionGroup(position: PositionType): PositionButtonGroup {
  switch (position) {
    case 'strongly_disagree':
    case 'disagree':
    case 'somewhat_disagree':
      return 'disagree';
    case 'unsure':
      return 'unsure';
    case 'somewhat_agree':
    case 'agree':
    case 'strongly_agree':
      return 'agree';
  }
}

export interface PositionCTACopy {
  symbol: string;
  label: string;
  ctaText: string;
  ariaLabel: string;
}

// Map position button group to adaptive story CTA copy (P456)
export function getPositionCTACopy(group: PositionButtonGroup): PositionCTACopy {
  switch (group) {
    case 'agree':
      return {
        symbol: '✓',
        label: 'Agree',
        ctaText: 'Why do you agree? →',
        ariaLabel: 'Tell your story about your agreement',
      };
    case 'disagree':
      return {
        symbol: '✗',
        label: 'Disagree',
        ctaText: 'Why do you disagree? →',
        ariaLabel: 'Tell your story about your disagreement',
      };
    case 'unsure':
      return {
        symbol: '~',
        label: 'Unsure',
        ctaText: 'Why are you unsure? →',
        ariaLabel: 'Tell your story about being unsure',
      };
  }
}

// -----------------------------------------------------------------------------
// User Types
// -----------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  avatar: string;
  verifiedListenerScore: number;
  bio?: string;
  // LinkedIn-like extended fields (optional for premium)
  role?: string;
  company?: string;
  connections?: number;
  // Pledge status - determines blue ring and pledge CTA visibility
  hasPledged?: boolean;
}

// -----------------------------------------------------------------------------
// Idea Types
// -----------------------------------------------------------------------------

export type IdeaVisibility = 'public' | 'shared' | 'private';

// Base idea with simple positions (premium style)
export interface IdeaBase {
  id: string;
  text: string;
  createdBy: string;
  createdAt: string;
  verificationCount: number;
  crossDisagreementCount: number;
  commentCount: number;
}

// Full idea with timestamps and visibility (linkedin-like style)
export interface Idea extends IdeaBase {
  visibility: IdeaVisibility;
  positions: Record<string, PositionEntry | null>;
}

// Simple idea for premium (can derive from full Idea)
export interface IdeaSimple extends IdeaBase {
  positions: Record<string, Position>;
}

// -----------------------------------------------------------------------------
// Verification Types
// -----------------------------------------------------------------------------

export type VerificationStatus = 'not_started' | 'in_progress' | 'verified';

export interface VerificationSession {
  id: string;
  ideaId: string;
  participants: [string, string];
  status: VerificationStatus;
  startedAt: string;
  completedAt?: string;
  // Track who has verified understanding of whom (directionality)
  // Each entry means "userId has verified they understand the other participant"
  verifiedBy: string[];
  // Ratings: keyed by verifier's userId, value is their rating (1-10)
  // e.g., { 'current': 8, 'user2': 7 } means current gave 8/10, user2 gave 7/10
  ratings?: Record<string, number>;
}

// Directionality types for UI display
export type UnderstandingDirection = 'mutual' | 'you_understand_them' | 'they_understand_you' | 'none';

export interface Certification {
  id: string;
  ideaId: string;
  speakerId: string;
  listenerId: string;
  speakerPosition: Position;
  listenerPosition: Position;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Social Types
// -----------------------------------------------------------------------------

export interface Comment {
  id: string;
  ideaId: string;
  userId: string;
  text: string;
  createdAt: string;
  likes?: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  ideaId?: string;
  read?: boolean;
}

// -----------------------------------------------------------------------------
// Live Session Types
// -----------------------------------------------------------------------------

export type MeetingPhase = 'start' | 'waiting' | 'live';
export type RatingPhase = 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results' | 'perfect';
export type FlowType = 'check' | 'prove';
export type GapType = 'overconfidence' | 'underconfidence' | 'none';

export interface LiveSessionState {
  meetingPhase: MeetingPhase;
  ratingPhase: RatingPhase;
  flowType: FlowType | null;
  checkerName: string | null;
  responderName: string | null;
  checkerRating: number | undefined;
  responderRating: number | undefined;
  explainBackRatings: number[];
  explainBackDone: boolean;
}

// -----------------------------------------------------------------------------
// P55: Understanding Verification Loop Types
// -----------------------------------------------------------------------------

/**
 * A surfaced idea from a meeting participant that needs position staking.
 * This represents an idea that someone wants to verify understanding on.
 */
export interface SurfacedIdea {
  id: string;
  text: string;
  surfacedBy: string; // User ID who surfaced this idea
  surfacedAt: string; // ISO timestamp
  // Your position on this idea (for "Your Ideas" queue)
  yourPosition?: PositionType | null;
  // Whether you've locked in your position (after agreeing in swipe)
  locked?: boolean;
}

/**
 * Swipe action for the Tinder-style card interface.
 * - right: Agree with the idea
 * - left: Dismiss (disagree or don't care)
 * - down: Later (put at bottom of queue)
 */
export type SwipeAction = 'right' | 'left' | 'down';

/**
 * Queue item for the "Your Ideas" swipe interface.
 * Wraps a surfaced idea with queue-specific metadata.
 */
export interface IdeaQueueItem extends SurfacedIdea {
  // Queue position (LIFO - last in, first out)
  queuePosition: number;
  // Whether this idea has been actioned (swiped)
  actioned: boolean;
  // The action taken (if any)
  action?: SwipeAction;
}

/**
 * State for the Ideas tab during a live meeting.
 */
export interface IdeasTabState {
  // Ideas you need to review (from the other person)
  yourIdeasQueue: IdeaQueueItem[];
  // Ideas they need to review (from you)
  theirIdeas: SurfacedIdea[];
  // Count of pending ideas (for badge)
  pendingCount: number;
  // Currently viewed section
  activeSection: 'your-ideas' | 'their-ideas';
}

// -----------------------------------------------------------------------------
// Notification Types
// -----------------------------------------------------------------------------

export type NotificationType = 'verification_request' | 'verification_accepted' | 'verification_declined';

/**
 * A notification for in-app alerts (bell icon).
 * First type: verification requests from other users.
 */
export interface Notification {
  id: string;
  type: NotificationType;
  fromUserId: string;         // Who triggered this notification
  storyId?: string;           // Story they want to verify (for verification_request)
  eventId?: string;           // Event context (if applicable)
  createdAt: string;
  read: boolean;
}

// -----------------------------------------------------------------------------
// Calibration Types (P56.1)
// -----------------------------------------------------------------------------

/**
 * Calibration state - how self-assessment compares to reality.
 * - 'underconfident': You think you understand less than you do
 * - 'calibrated': Your self-assessment matches reality
 * - 'overconfident': You think you understand more than you do
 */
export type CalibrationState = 'underconfident' | 'calibrated' | 'overconfident';

/**
 * Calibration metrics for a single role (listener or speaker).
 */
export interface RoleCalibration {
  avgGap: number;          // Negative = overconfident, Positive = underconfident
  state: CalibrationState;
  sessionCount: number;    // How many data points
}

/**
 * User calibration metrics.
 * Tracks the gap between self-estimated understanding and actual ratings.
 *
 * Listener calibration: Your estimate vs their rating of your paraphrase
 *   - You estimate 7, they rate you 6 → -1 (overconfident as listener)
 *
 * Speaker calibration: Your estimate vs their understanding after paraphrase
 *   - You estimate 7, they actually got 6 → -1 (overconfident as speaker)
 */
export interface UserCalibration {
  listener: RoleCalibration;
  speaker: RoleCalibration;
}

// -----------------------------------------------------------------------------
// P60: Story and Point Types (Exploration UX)
// -----------------------------------------------------------------------------

/**
 * A Story is a personal experience that can only be understood (not debated).
 * Stories have an author and are shown with blue styling.
 *
 * Visibility:
 * - 'private': Only author sees (drafts)
 * - 'shared': Event participants see (requires eventId)
 * - 'public': Everyone sees (global feed, profile)
 */
export interface Story {
  id: string;
  text: string;
  authorId: string;           // Who wrote this story
  createdAt: string;
  visibility: IdeaVisibility;
  eventId?: string;           // Required when visibility='shared' - which event this is shared with
  linkedPointIds: string[];   // Points this story relates to
  verificationCount: number;  // How many people verified understanding
  crossDisagreementCount?: number; // How many cross-disagreement verifications
}

/**
 * A Point is a claim about reality that can be agreed/disagreed with.
 * Points are ownerless/global - shown with yellow styling, no avatar.
 */
export interface Point {
  id: string;
  text: string;
  createdAt: string;
  positions: Record<string, PositionEntry | null>;  // User positions on this point
  linkedStoryIds: string[];   // Stories that relate to this point
}

/**
 * Position on a Story - includes the author's position on linked Points
 * and whether the viewer agrees/disagrees with the linked Points.
 */
export interface StoryPosition {
  storyId: string;
  authorId: string;
  authorPositionOnPoint: PositionType | null;  // Author's stance
  viewerPositionOnPoint: PositionType | null;  // Current user's stance
}
