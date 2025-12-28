/**
 * Core TypeScript interfaces for the Clarity Pledge application
 */

export interface Witness {
  id: string;
  name: string;
  linkedinUrl?: string;
  timestamp: string;
  isVerified: boolean;
}

export interface Profile {
  id: string;
  slug: string;
  name: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  witnesses: Witness[];
  reciprocations: number;
  avatarColor?: string;
  pledgeVersion?: number; // 1 = Clarity Pledge (v1), 2 = Clarity Pledge (v2)
}

/**
 * Lightweight profile type for list views (champions page, featured profiles)
 * Does not include sensitive data like email for privacy
 */
export interface ProfileSummary {
  id: string;
  slug: string;
  name: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  avatarColor?: string;
  witnessCount?: number;
  reciprocations?: number;
}

/**
 * Database row types (snake_case) - matches Supabase schema
 */
export interface DbWitness {
  id: string;
  witness_name: string;
  witness_linkedin_url?: string;
  created_at: string;
  is_verified: boolean;
}

export interface DbProfile {
  id: string;
  slug?: string;
  name?: string;
  email: string;
  role?: string;
  linkedin_url?: string;
  reason?: string;
  created_at: string;
  is_verified: boolean;
  witnesses?: DbWitness[];
  avatar_color?: string;
  pledge_version?: number;
}

/**
 * Database row type for partial selects (featured profiles, list views)
 */
export interface DbProfileSummary {
  id: string;
  slug?: string;
  name?: string;
  role?: string;
  linkedin_url?: string;
  reason?: string;
  created_at: string;
  is_verified: boolean;
  avatar_color?: string;
}

// ============================================================================
// CLARITY PARTNERS TYPES (P19 MVP)
// ============================================================================

export type DemoStatus = 'waiting' | 'in_progress' | 'completed';
export type PartnershipStatus = 'pending' | 'accepted' | 'declined';

export interface ClaritySession {
  id: string;
  code: string;
  creatorName: string;
  creatorNote?: string;
  joinerName?: string;
  state: ClaritySessionState;
  demoStatus: DemoStatus;
  partnershipStatus: PartnershipStatus;
  createdAt: string;
  expiresAt: string | null; // NULL means no expiry (chat lives forever)
  // P23: Live Clarity Meetings
  mode?: 'async' | 'live' | 'review';
  liveState?: Record<string, unknown>;
}

export interface ClaritySessionState {
  currentLevel?: number;
  currentRound?: number;
  speakerName?: string;
  listenerName?: string;
  // Extensible for future UI state
  [key: string]: unknown;
}

export interface DbClaritySession {
  id: string;
  code: string;
  creator_name: string;
  creator_note?: string;
  joiner_name?: string;
  state: ClaritySessionState;
  demo_status: DemoStatus;
  partnership_status: PartnershipStatus;
  created_at: string;
  expires_at: string;
  // P23: Live Clarity Meetings
  mode?: 'async' | 'live' | 'review';
  live_state?: Record<string, unknown>;
}

// ============================================================================
// DEMO FLOW TYPES (Story 2 - 5-Level Guided Demo)
// ============================================================================

export type DemoPhase = 'idea' | 'paraphrase' | 'rating' | 'position' | 'transition';
export type Position = 'agree' | 'disagree' | 'skip';

/** Configuration for each demo level */
export interface DemoLevelConfig {
  level: number;
  title: string;
  prompt: string;
  speakerRole: 'creator' | 'joiner';
  positionRequired: boolean; // Level 3-4 can skip position
  isCommitmentLevel?: boolean; // Level 5 uses preset text
}

/** Current state of the demo (synced via session.state) */
export interface DemoFlowState {
  currentLevel: number;
  currentRound: number;
  phase: DemoPhase;
  // Speaker's idea
  ideaText?: string;
  ideaConfirmed: boolean;
  // Listener's paraphrase
  paraphraseText?: string;
  paraphraseConfirmed: boolean;
  // Ratings (both rate simultaneously)
  speakerRating?: number; // Speaker's assessment of listener's understanding
  listenerSelfRating?: number; // Listener's self-assessment
  correctionText?: string;
  // Understanding achieved
  isAccepted: boolean;
  // Position (only after understanding)
  askForPosition?: boolean; // Speaker decides
  position?: Position;
  positionConfirmed: boolean;
}

/** Demo round record (saved to clarity_demo_rounds table) */
export interface DemoRound {
  id: string;
  sessionId: string;
  level: number;
  roundNumber: number;
  speakerName: string;
  listenerName: string;
  ideaText?: string;
  paraphraseText?: string;
  speakerRating?: number;
  listenerSelfRating?: number;
  calibrationGap?: number;
  correctionText?: string;
  isAccepted: boolean;
  position?: Position;
  createdAt: string;
}

export interface DbDemoRound {
  id: string;
  session_id: string;
  level: number;
  round_number: number;
  speaker_name: string;
  listener_name: string;
  idea_text?: string;
  paraphrase_text?: string;
  speaker_rating?: number;
  listener_self_rating?: number;
  calibration_gap?: number;
  correction_text?: string;
  is_accepted: boolean;
  position?: Position;
  created_at: string;
}

/** Idea in the backlog */
export interface ClarityIdea {
  id: string;
  sessionId: string;
  authorName: string;
  content: string;
  sourceLevel?: number;
  status: 'pending' | 'in_meeting' | 'discussed' | 'skipped';
  roundsCount?: number;
  finalAccuracy?: number;
  position?: Position;
  discussedAt?: string;
  createdAt: string;
}

export interface DbClarityIdea {
  id: string;
  session_id: string;
  author_name: string;
  content: string;
  source_level?: number;
  status: 'pending' | 'in_meeting' | 'discussed' | 'skipped';
  rounds_count?: number;
  final_accuracy?: number;
  position?: Position;
  discussed_at?: string;
  created_at: string;
}

// ============================================================================
// CLARITY CHAT TYPES (P19.2 MVP)
// ============================================================================

export type ChatPosition = 'agree' | 'disagree' | 'dont_know';
export type VerificationStatus = 'pending' | 'accepted' | 'needs_retry';

/** Chat message (idea in chat context) */
export interface ChatMessage {
  id: string;
  sessionId: string;
  authorName: string;
  content: string;
  createdAt: string;
  // Explanation request (null = no pending request)
  explanationRequestedAt?: string | null;
  // Joined from verifications (optional)
  verifications?: Verification[];
}

export interface DbChatMessage {
  id: string;
  session_id: string;
  author_name: string;
  content: string;
  created_at: string;
  explanation_requested_at?: string | null;
}

/** Verification (paraphrase attempt on a message) */
export interface Verification {
  id: string;
  messageId: string;
  verifierName: string;
  paraphraseText: string;
  selfRating?: number; // 0-100, verifier's self-assessment
  accuracyRating?: number; // 0-100, null until author rates
  calibrationGap?: number; // accuracyRating - selfRating (positive = underestimated)
  correctionText?: string; // Author's feedback if not accepted
  roundNumber: number; // Which attempt (1, 2, 3...)
  status: VerificationStatus;
  position?: ChatPosition; // null until verifier states position
  audioUrl?: string; // URL to audio recording in storage
  createdAt: string;
}

export interface DbVerification {
  id: string;
  message_id: string;
  verifier_name: string;
  paraphrase_text: string;
  self_rating?: number;
  accuracy_rating?: number;
  calibration_gap?: number;
  correction_text?: string;
  round_number: number;
  status: VerificationStatus;
  position?: ChatPosition;
  audio_url?: string;
  created_at: string;
}

// ============================================================================
// IDEA FEED TYPES (P19.3 - Orphan Ideas)
// ============================================================================

export type FeedVote = 'agree' | 'disagree' | 'dont_know';
export type ProvenanceType = 'direct' | 'elevated_chat' | 'elevated_comment';

/** Feed idea (orphan idea - exists independently on public feed) */
export interface FeedIdea {
  id: string;
  content: string;
  originatorName: string;
  originatorSessionId?: string;
  provenanceType: ProvenanceType;
  sourceSessionId?: string;
  sourceMessageId?: string;
  sourceCommentId?: string;
  visibility: 'public' | 'private';
  createdAt: string;
  // Aggregated counts (computed)
  agreeCount?: number;
  disagreeCount?: number;
  dontKnowCount?: number;
  commentCount?: number;
  // Current user's vote (if any)
  userVote?: FeedVote;
}

export interface DbFeedIdea {
  id: string;
  content: string;
  originator_name: string;
  originator_session_id?: string;
  provenance_type: ProvenanceType;
  source_session_id?: string;
  source_message_id?: string;
  source_comment_id?: string;
  visibility: 'public' | 'private';
  created_at: string;
}

/** Vote on a feed idea */
export interface IdeaVote {
  id: string;
  ideaId: string;
  voterSessionId: string;
  voterName: string;
  vote: FeedVote;
  createdAt: string;
  updatedAt: string;
}

export interface DbIdeaVote {
  id: string;
  idea_id: string;
  voter_session_id: string;
  voter_name: string;
  vote: FeedVote;
  created_at: string;
  updated_at: string;
}

/** Vote history entry (recorded when vote changes) */
export interface IdeaVoteHistory {
  id: string;
  voteId: string;
  ideaId: string;
  voterSessionId: string;
  voterName: string;
  vote: FeedVote;
  changedAt: string;
}

export interface DbIdeaVoteHistory {
  id: string;
  vote_id: string;
  idea_id: string;
  voter_session_id: string;
  voter_name: string;
  vote: FeedVote;
  changed_at: string;
}

/** Comment on a feed idea */
export interface IdeaComment {
  id: string;
  ideaId: string;
  authorSessionId: string;
  authorName: string;
  content: string;
  elevatedToIdeaId?: string;
  createdAt: string;
}

export interface DbIdeaComment {
  id: string;
  idea_id: string;
  author_session_id: string;
  author_name: string;
  content: string;
  elevated_to_idea_id?: string;
  created_at: string;
}

// ============================================================================
// LIVE CLARITY MEETINGS TYPES (P23)
// ============================================================================

export type LiveSessionMode = 'async' | 'live' | 'review';
export type LiveRole = 'speaker' | 'listener';
export type LiveFlag = 'new_idea' | 'judgment' | 'not_what_i_meant' | 'your_idea';
export type LiveRatingLabel = 'not_yet' | 'getting_there' | 'almost' | 'got_it';

/**
 * P23.1 Rating flow phases for sealed-bid pattern
 * P23.2: Added 'idle' for start screen with Check/Prove buttons
 */
export type RatingPhase = 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results';

/**
 * P23.1 Gap type for risk messaging
 */
export type GapType = 'overconfidence' | 'underconfidence' | 'none';

/**
 * V6 Live session state synced via clarity_sessions.live_state
 *
 * Key V6 model (sealed-bid):
 * - Both users rate simultaneously, ratings hidden until both submit
 * - Speaker rates: "How well listener understands me"
 * - Listener rates: "How well I understand speaker"
 * - Gap surfaced only after both submit with explain-back options
 */
export interface LiveSessionState {
  // Current idea being discussed (legacy, may be removed)
  currentIdeaId?: string;
  currentIdeaNumber?: number;
  currentIdeaOriginator?: string;

  // Current turn state (legacy)
  currentSpeaker?: string;
  currentListener?: string;
  currentRound: number;

  // Role selections (legacy - kept for backward compatibility)
  roleSelections: {
    [userName: string]: LiveRole;
  };

  // Legacy ratings
  selfRating?: number;
  otherRating?: number;

  // V5: Slider-based understanding ratings (legacy - kept for compatibility)
  sliderRatings: {
    [userName: string]: number;
  };

  // V5: Self-ratings via "Listen Actively Now" button (legacy)
  listenActivelyRatings: {
    [userName: string]: number;
  };

  // V5: Pending rating request (legacy)
  pendingRatingRequest?: string;

  // V5: Gap detection state (legacy)
  gapDetected?: boolean;
  gapValue?: number;

  // V5: Understanding checks count
  checksCount: number;
  checksTotal: number;

  // Ideas progress
  ideasDiscussed: number;
  ideasUnderstood: number;

  // Session control
  isRecording?: boolean;

  // V5: Talk-time tracking
  talkTime: {
    [userName: string]: number;
  };

  // V5: Currently speaking
  currentlySpeaking?: string;

  // ============================================================================
  // V7 (P23.2): Check/Prove model
  // ============================================================================

  // Current phase of the rating flow
  ratingPhase: RatingPhase;

  // Who tapped "Check if partner gets me" (initiator of the understanding check)
  // The checker is the person being understood
  checkerName?: string;

  // V12: "Did I get it?" — listener-initiated check
  // When set, indicates listener initiated (proverName = listener who wants to prove understanding)
  // When undefined, indicates speaker initiated via "Did you get it?"
  proverName?: string;

  // Ratings - both describe how well the responder understands the checker
  // checkerRating: Checker's belief about how well partner understands them
  // responderRating: Responder's self-assessment of how well they understand checker
  checkerRating?: number;
  responderRating?: number;

  // Submission flags for new model
  checkerSubmitted: boolean;
  responderSubmitted: boolean;

  // Explain-back tracking
  explainBackRound: number;
  explainBackRatings: number[]; // History of checker ratings after each explain-back

  // Skip notification - who clicked "Skip" or "Good enough"
  // When one user skips, partner sees a toast notification
  skippedBy?: string;

  // Gated rating - listener must tap "Done Explaining" before speaker can rate
  // When listener taps "Done Explaining", this becomes true and speaker's rating UI unlocks
  explainBackDone?: boolean;
}

/** Default initial state for new live sessions */
export const DEFAULT_LIVE_STATE: LiveSessionState = {
  currentRound: 1,
  roleSelections: {},
  sliderRatings: {},
  listenActivelyRatings: {},
  checksCount: 0,
  checksTotal: 0,
  ideasDiscussed: 0,
  ideasUnderstood: 0,
  talkTime: {},
  // Check/Prove model defaults - starts in idle state
  ratingPhase: 'idle',
  checkerSubmitted: false,
  responderSubmitted: false,
  explainBackRound: 0,
  explainBackRatings: [],
  explainBackDone: false,
};

/** Live turn record (saved to clarity_live_turns table) */
export interface LiveTurn {
  id: string;
  sessionId: string;
  ideaId?: string;
  speakerName: string;
  listenerName: string;
  actorName: string;
  role: LiveRole;
  transcript?: string;
  selfRating?: number;
  otherRating?: number;
  flag?: LiveFlag;
  roundNumber: number;
  createdAt: string;
}

export interface DbLiveTurn {
  id: string;
  session_id: string;
  idea_id?: string;
  speaker_name: string;
  listener_name: string;
  actor_name: string;
  role: LiveRole;
  transcript?: string;
  self_rating?: number;
  other_rating?: number;
  flag?: LiveFlag;
  round_number: number;
  created_at: string;
}

/** Rating button mapping */
export const LIVE_RATING_LABELS: { label: LiveRatingLabel; text: string; range: [number, number] }[] = [
  { label: 'not_yet', text: 'Not yet', range: [0, 4] },
  { label: 'getting_there', text: 'Getting there', range: [5, 6] },
  { label: 'almost', text: 'Almost', range: [7, 9] },
  { label: 'got_it', text: 'Got it!', range: [10, 10] },
];

/** Convert rating label to numeric value (midpoint of range, or 10 for got_it) */
export function ratingLabelToValue(label: LiveRatingLabel): number {
  const rating = LIVE_RATING_LABELS.find((r) => r.label === label);
  if (!rating) return 5;
  if (label === 'got_it') return 10;
  return Math.floor((rating.range[0] + rating.range[1]) / 2);
}

