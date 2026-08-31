import type { StoryVideoQuotesData } from '@/lib/video';
/**
 * Core TypeScript interfaces for the Clarity Pledge application
 */

// ============================================================================
// PERSON REFERENCE TYPE (P118 - Avatar Consolidation)
// ============================================================================

/**
 * Canonical type for rendering a person's avatar.
 * Use with PersonAvatar component to ensure consistent badge display.
 * hasPledged is ALWAYS present - TypeScript enforces completeness.
 */
export interface PersonRef {
  name: string;
  slug?: string;
  avatarColor?: string; // Optional — PersonAvatar defaults to #3B82F6
  avatarUrl?: string | null;
  hasPledged: boolean; // ALWAYS present
  badgeCount?: number; // P686: Number of verified badge points (0–9)
  earCount?: number; // P940: distinct stories this person was rated on (read via earCountOf)
}

// ============================================================================
// WITNESS AND PROFILE TYPES
// ============================================================================

export interface Witness {
  id: string;
  name: string;
  linkedinUrl?: string;
  timestamp: string;
  isVerified: boolean;
}

export interface Profile {
  id: string;
  slug: string | null; // P50: null for /live users who haven't verified yet
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
  avatarUrl?: string; // P63: URL to avatar image (e.g., from Google OAuth)
  avatarProvider?: 'google' | 'generated' | 'gravatar'; // P63: Source of avatar
  pledgeVersion?: number; // 1=v1, 2=v2 ("without"), 3=v3 ("withholding"), 4=v4 (number-first)
  hasPledged: boolean; // P50: false for /live registrations, true for /sign-pledge
  bio?: string | null; // P414: Optional self-description, max 160 chars
  bannerUrl?: string; // P504: AI-generated profile banner image
  bannerGenerationAttempted?: boolean; // P504: Whether banner generation was attempted
  isTestAccount?: boolean; // P1133: plumbed through for Mixpanel is_internal tagging
}

/**
 * Lightweight profile type for list views (pledgers page, featured profiles)
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
  avatarUrl?: string; // P63: URL to avatar image (e.g., from Google OAuth)
  avatarProvider?: 'google' | 'generated' | 'gravatar'; // P63: Source of avatar
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
  avatar_url?: string; // P63: URL to avatar image (e.g., from Google OAuth)
  avatar_provider?: 'google' | 'generated' | 'gravatar'; // P63: Source of avatar
  pledge_version?: number;
  has_pledged?: boolean; // P50: false for /live registrations, true for /sign-pledge
  bio?: string | null; // P414: Short self-description, max 160 chars
  banner_url?: string | null; // P504: AI-generated profile banner image
  banner_generation_attempted?: boolean; // P504: Whether banner generation was attempted
  is_test_account?: boolean; // P571: Excludes account from public /pledgers listing
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
  avatar_url?: string; // P63: URL to avatar image (e.g., from Google OAuth)
  avatar_provider?: 'google' | 'generated' | 'gravatar'; // P63: Source of avatar
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
  creatorProfileId?: string | null;
  joinerProfileId?: string | null;
  state: ClaritySessionState;
  demoStatus: DemoStatus;
  partnershipStatus: PartnershipStatus;
  createdAt: string;
  expiresAt: string | null; // NULL means no expiry (chat lives forever)
  endedAt?: string | null; // Set when creator ends the session
  // P23: Live Clarity Meetings
  mode?: 'async' | 'live' | 'review';
  liveState?: Record<string, unknown>;
  // P160: Private session mode (no audio/events captured for ML training)
  isPrivate?: boolean;
  // P511: Last heartbeat timestamp (for zombie session detection)
  lastActivityAt?: string | null;
  // P703: Letter-sourced session fields
  sourceLetterId?: string | null;
  sourceStoryId?: string | null;
  targetListenerId?: string | null;
  status?: string | null;
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
  /**
   * P1057: OPTIONAL because `code` is no longer readable by anon/authenticated —
   * the column-level SELECT grant omits it, so no client row carries it. The value
   * reaches ClaritySession by being spliced in from the caller (which always already
   * holds it); see mapSessionFromDb's `knownCode` parameter in api.ts.
   *
   * Still present on rows returned by SECURITY DEFINER functions that run as owner
   * (claim_joiner_seat RETURNS SETOF clarity_sessions), which is why this is optional
   * rather than removed.
   */
  code?: string;
  creator_name: string;
  creator_note?: string;
  joiner_name?: string;
  creator_profile_id?: string | null;
  joiner_profile_id?: string | null;
  state: ClaritySessionState;
  demo_status: DemoStatus;
  partnership_status: PartnershipStatus;
  created_at: string;
  expires_at: string;
  ended_at?: string | null;
  // P23: Live Clarity Meetings
  mode?: 'async' | 'live' | 'review';
  live_state?: Record<string, unknown>;
  // P160: Private session mode
  is_private?: boolean;
  // P511: Last heartbeat timestamp
  last_activity_at?: string | null;
  // P703: Letter-sourced session fields
  source_letter_id?: string | null;
  source_story_id?: string | null;
  target_listener_id?: string | null;
  status?: string | null;
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
 * P562: Free mode phase type — parallel to RatingPhase for guided mode.
 * sealed-bid → waiting → reveal → paraphrase → unlocked → (success or back to idle)
 */
export type FreePhase = 'sealed-bid' | 'waiting' | 'reveal' | 'paraphrase' | 'unlocked' | 'success';

/** P562: Session interaction mode */
export type SessionMode = 'guided' | 'free';

/** P562: Committed round record for Journey display */
export interface FreeRoundRecord {
  listenerConfidence: number;
  speakerBelief: number;
  label: string;
}

/**
 * P23.1 Gap type for risk messaging
 */
export type GapType = 'overconfidence' | 'underconfidence' | 'none';

/**
 * P23.3 Flow type for understanding check initiation
 * - 'check': Speaker initiated "Did you get it?" (standard flow)
 * - 'prove': Listener initiated "Did I get it?" (prover flow)
 */
export type FlowType = 'check' | 'prove';

/**
 * V6 Live session state synced via clarity_sessions.live_state
 *
 * Key V6 model (sealed-bid):
 * - Both users rate simultaneously, ratings hidden until both submit
 * - Speaker rates: "How well listener understands me"
 * - Listener rates: "How well I understand speaker"
 * - Gap surfaced only after both submit with explain-back options
 */

/**
 * Clarification phase enum - replaces three boolean flags to prevent invalid states
 * - 'speaker-deciding': Speaker sees "Clarify now" / "Good enough", listener waits
 * - 'speaker-clarifying': Speaker is verbally clarifying, listener listens
 * - 'listener-responding': Speaker done clarifying, listener's turn to act
 */
export type ClarificationPhase =
  | 'speaker-deciding'
  | 'speaker-clarifying'
  | 'listener-responding';

/**
 * P272/P398: Snapshot of story data shared across the live session.
 * Extracted to a named type so SessionHistoryItem and LiveSessionState.selectedStoryData
 * can reference the same shape without circular ordering issues.
 */
export type LiveStoryData = Pick<StoryWithAuthor,
  'authorName' | 'authorSlug' | 'authorAvatarColor' | 'authorAvatarUrl' |
  'authorRole' | 'authorEarsCount' | 'authorHasPledged' | 'visibility'
> & {
  id: string;
  authorId?: string;
  content: string;
  points: Array<{
    id: string;
    statement: string;
    context?: string;
    tags: string[];
    systemTags?: string[]; // P686: for badge certification check
    positionCounts?: Record<string, number>;
    userPosition?: string | null;
    profileSubjectPosition?: string | null;
    visibility?: string; // P681: optional because old live_state JSON lacks it
  }>;
  createdAt?: string;
};

/** P398: Enriched history entry for a completed or skipped round */
export interface SessionHistoryItem {
  title: string;
  type: 'story' | 'point' | 'free';
  // Journey data — undefined for skipped rounds
  checkerRating?: number;
  responderRating?: number;
  explainBackRatings?: number[];
  checkerName?: string;
  partnerName?: string;
  completedAt?: string;
  skipped?: boolean;
  isChecker?: boolean;
  /** P398: Story snapshot for story-type rounds — rendered in round summary screen */
  storyData?: LiveStoryData;
}

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

  // Whether the checker is the session creator (true) or joiner (false).
  // Used for role determination instead of name comparison (names can collide).
  checkerIsCreator?: boolean;

  // "Did I get it?" — listener-initiated check (P23.3)
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
  // P646: Role-based identity — true if creator skipped, false if joiner
  skippedByIsCreator?: boolean;

  // Gated rating - listener must tap "Done Explaining" before speaker can rate
  // When listener taps "Done Explaining", this becomes true and speaker's rating UI unlocks
  explainBackDone?: boolean;

  // B32_2 fix: Track that speaker has seen explainBackDone at least once in this round
  // This allows the speaker's rating drawer to persist even when explainBackDone is reset
  // (e.g., when listener clicks "Continue as listener" after negotiation)
  speakerSawExplainBackDone?: boolean;

  // Speaker clarification flow - after explain-back rating < 10, speaker can clarify before listener tries again
  // Single enum replaces three booleans to prevent invalid state combinations
  // State machine: undefined → 'speaker-deciding' → 'speaker-clarifying' → 'listener-responding'
  clarificationPhase?: ClarificationPhase;

  // Celebration acknowledgment - tracks who clicked "Continue" on celebration screen
  // Both users must acknowledge before state resets to allow independent dismissal
  /** @deprecated P525: Use celebrationAcknowledgedByCreator/Joiner booleans instead. Kept for backward compat. */
  celebrationAcknowledgedBy?: string[];

  // P525: Boolean celebration acknowledgment — each user writes their own key, no race possible.
  // JSONB || merge of independent keys never collides.
  celebrationAcknowledgedByCreator?: boolean;
  celebrationAcknowledgedByJoiner?: boolean;

  // Perspective request - listener wants to share their own perspective instead of explaining back
  // When set, speaker sees dialog to accept the role swap
  perspectiveRequestedBy?: string;

  // Role switch negotiation - when listener clicks "Respond as speaker"
  // Step 1: Speaker sees "Accept" / "Ask to explain back first"
  // Step 2: If speaker chose "Ask to explain back first", listener sees "Continue as listener" / "I really need to speak"
  // Step 3: If listener chose "I really need to speak", speaker sees "Let them speak"
  roleSwitchNegotiation?: {
    // Who initiated the role switch request (the listener who wants to become speaker)
    requestedBy: string;
    // P646: Role-based identity — true if creator requested, false if joiner
    requestedByIsCreator?: boolean;
    // Current negotiation state
    state: 'pending' | 'speaker-asked-to-explain' | 'listener-insists';
  };

  // ============================================================================
  // P128: Content selection for /live beginning screen
  // ============================================================================

  // Selected story for content-attached verification
  selectedStoryId?: string;

  // Selected story data (full content pushed by speaker so listener can read without RLS).
  // LiveStoryData picks all StoryWithAuthor display fields so any new field added there
  // is automatically required here — prevents silent drift.
  selectedStoryData?: LiveStoryData;

  // Selected point for content-attached verification
  selectedPointId?: string;

  // Title of selected content (for session history display)
  selectedContentTitle?: string;

  // Session history: completed verifications in this session
  sessionHistory?: SessionHistoryItem[];

  // P892: True once the current round's completion has been appended to
  // sessionHistory (first celebration ack or exit flush). Prevents double-append
  // when the mutual handshake later fires. Cleared on every round reset.
  roundRecorded?: boolean;

  // P398: Set when a user clicks "Does X understand you?" or "Do I understand X?"
  // Signals partner to close history view immediately (before submission).
  // Cleared when the round resets to idle.
  ratingInitiatedBy?: string;
  // P646: Role-based identity — true if creator initiated, false if joiner
  ratingInitiatedByIsCreator?: boolean;

  // ============================================================================
  // P275: Live session point positions (stored here instead of point_positions table)
  // Unverified guests cannot write to point_positions (RLS: is_verified=true required).
  // Live positions are ephemeral game state — stored in live_state for real-time sync.
  // Structure: { [participantName]: { [pointId]: PositionType | null } }
  // ============================================================================
  /** @deprecated Use livePositionsCreator/livePositionsJoiner — nested object is clobbered by JSONB shallow merge */
  livePositions?: Record<string, Record<string, PositionType | null>>;

  /** P562: Creator's live positions — top-level for JSONB shallow merge safety */
  livePositionsCreator?: Record<string, PositionType | null>;

  /** P562: Joiner's live positions — top-level for JSONB shallow merge safety */
  livePositionsJoiner?: Record<string, PositionType | null>;

  // ============================================================================
  // P562: Free mode — structured start, then continuous sliders
  // ============================================================================

  /** Session interaction mode: 'guided' (default) or 'free' */
  sessionMode?: SessionMode;

  /** Current free mode phase (only meaningful when sessionMode === 'free') */
  freePhase?: FreePhase;

  /** Creator's live slider position (0-10), top-level for JSONB shallow merge */
  freeSliderCreator?: number;

  /** Joiner's live slider position (0-10), top-level for JSONB shallow merge */
  freeSliderJoiner?: number;

  /** Committed free mode rounds for Journey display */
  freeRounds?: FreeRoundRecord[];

  /** P600: Speaker's re-rated belief after hearing paraphrase (3rd number before sliders) */
  freeRerating?: number;

  // ============================================================================
  // P686: Badge auto-certification
  // ============================================================================

  /** true when a badge point was just earned this round */
  badgePointEarned?: boolean;

  /** total badge count after this round (for celebration display) */
  badgeCount?: number;
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
  // P128: Session history (completed verifications)
  sessionHistory: [],
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
  /** P275: Positions set by this participant during the round. { [pointId]: PositionType | null } */
  pointPositions?: Record<string, PositionType | null>;
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
  /** P275: Positions set by this participant during the round. { [pointId]: PositionType | null } */
  point_positions?: Record<string, PositionType | null>;
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

// ============================================================================
// EVENTS TYPES (P61)
// ============================================================================

export type EventStatus = 'upcoming' | 'completed' | 'cancelled';

export interface Event {
  id: string;
  slug: string;
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number;
  timezone: string;
  location: string;
  hostId: string;
  maxAttendees?: number;
  createdAt: string;
  status: EventStatus;
  bannerUrl?: string;
  /** P1179: optional extra Links-menu entries. Tags only, never paths — see event-links.ts. */
  links?: EventLinkEntry[];
  /** P1194: whether a group chat link exists. The existence is public; the URL is not. */
  hasGroupChat?: boolean;
  /**
   * P1194: set by createEvent when the event saved but its group chat link did not.
   * Transient, never persisted — it exists so the create form can tell the host
   * instead of navigating away on a silent partial success.
   */
  groupChatWriteFailed?: boolean;
}

/**
 * P1179: one per-event extra in the room's Links menu.
 * A TAG, never a path or URL — that is what makes the open-redirect invariant
 * hold by construction rather than by a runtime check.
 */
export interface EventLinkEntry {
  tag: string;
  /** Optional display name; render `label ?? tag` (Resolved Decision 3). */
  label?: string;
}

export interface EventWithHost extends Event {
  hostName: string;
  hostSlug: string;
  hostRole?: string;
  hostAvatarColor?: string;
  hostAvatarUrl?: string;
  /** P118: Whether the host has signed the pledge (for badge display) */
  hostHasPledged?: boolean;
  /** Number of confirmed understanding events for the host */
  hostEarCount?: number;
  // Optional display fields - mock service populates these inline for convenience.
  // Real service fetches attendees separately via getEventAttendees().
  // Components should handle these being undefined when using real API.
  attendees?: EventAttendee[];
  attendeeCount?: number;
}

export interface EventAttendee {
  profileId: string;
  name: string;
  slug: string;
  avatarColor?: string;
  avatarUrl?: string;
  /** Whether this attendee has signed the pledge */
  hasPledged: boolean;
  /** Number of confirmed understanding events (ear count) */
  earCount: number;
}

export interface DbEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  datetime: string;
  duration_minutes: number;
  timezone: string;
  location: string;
  host_id: string;
  max_attendees?: number;
  created_at: string;
  status: EventStatus;
  banner_url?: string | null;
  /** P1179: JSONB array, defaults to [] on every row. */
  links?: EventLinkEntry[] | null;
  has_group_chat?: boolean;
}

export interface DbEventRsvp {
  id: string;
  event_id: string;
  profile_id: string;
  rsvped_at: string;
}

// P406: Practice Rooms — open-room model for event-native session start
export interface EventPracticeRoom {
  id: string;
  eventId: string;
  creatorId: string;
  sessionId: string | null;
  /** Fetched via JOIN to clarity_sessions */
  sessionCode: string | null;
  status: 'waiting' | 'active' | 'closed';
  createdAt: string;
  expiresAt: string;
  /** Joined from profiles */
  creatorName: string;
  creatorSlug: string;
  creatorAvatarColor: string;
  creatorAvatarUrl: string | null;
}

// P1114: Event room presence + CMP opt-in. Mirrors the RPC return shape of
// join_event_room / set_room_opt_in / set_room_readiness / get_my_room_status
// (supabase/migrations/20260819171000_p1114_event_room_rpcs.sql) and the public
// roster's column-level SELECT grant (20260819161000_p1114_event_room_tables.sql).
//
// REVISED 2026-08-20 (spec Solution, "REVISED (2)" block): identity is auth.uid()
// now, not a bearer secret — the table still carries a `client_secret` column
// (kept for e2e/integration/p1114-db-schema.spec.ts's confidentiality guard) but no
// client type or function reads or returns it any more.
export interface EventRoomMember {
  id: string;
  eventId: string;
  /** null = walk-in, never had (or didn't use) an account */
  profileId: string | null;
  displayName: string;
  /** null = has not answered yet — distinct from false (explicit opt-out) */
  optedIn: boolean | null;
  /** null = has not answered yet. 0-10, no expiry (Decision 6 / spec §7). */
  readinessValue: number | null;
  /** null = has not rated yet. 0-10. Required by set_room_opt_in to answer at all
   * (2026-08-21 reinstatement) — never set without opted_in also being set, and vice versa. */
  comprehensionRating: number | null;
  joinedAt: string;
  /** Read-side join to `profiles`, populated only by the public roster query
   * (getRoomRoster) — REVISED 2026-08-20: the roster renders registered attendees
   * as the normal person row used elsewhere (full name, profile link, avatar,
   * pledge ring, ear badge). Always null on a walk-in (profileId is null) and on
   * the four RPC responses (join/opt-in/readiness/self-status never join profiles —
   * the caller already has its own display_name/identity). */
  profileSlug: string | null;
  profileAvatarColor: string | null;
  profileAvatarUrl: string | null;
  profileHasPledged: boolean;
  profileEarCount: number;
}

/** The calling browser's OWN room row — returned by join_event_room / set_room_opt_in /
 * set_room_readiness / get_my_room_status. Identical shape to EventRoomMember: the
 * caller's session (auth.uid()) is what makes these calls "self" calls, so there is no
 * extra field to carry. Kept as a distinct alias (not merged into EventRoomMember) so
 * call sites read intent — "this is MY row" vs "this is A roster row." */
export type EventRoomSelf = EventRoomMember;

// ============================================================================
// STORIES, POINTS, AND CALIBRATION TYPES (P117)
// ============================================================================

/**
 * 7-point Likert scale for positions on Points
 * Maps to database enum: position_type
 */
export type PositionType =
  | 'strongly_disagree' // -3
  | 'disagree' // -2
  | 'somewhat_disagree' // -1
  | 'unsure' // 0
  | 'somewhat_agree' // +1
  | 'agree' // +2
  | 'strongly_agree'; // +3

/** Numeric values for position types (for sorting/comparison) */
export const POSITION_VALUES: Record<PositionType, number> = {
  strongly_disagree: -3,
  disagree: -2,
  somewhat_disagree: -1,
  unsure: 0,
  somewhat_agree: 1,
  agree: 2,
  strongly_agree: 3,
};

/** Button groups for 3-button UI (maps 7-point scale to 3 groups) */
export type PositionButtonGroup = 'disagree' | 'unsure' | 'agree';

/** Human-readable labels for position types */
export const POSITION_LABELS: Record<PositionType, string> = {
  strongly_disagree: 'Strongly Disagree',
  disagree: 'Disagree',
  somewhat_disagree: 'Somewhat Disagree',
  unsure: 'Unsure',
  somewhat_agree: 'Somewhat Agree',
  agree: 'Agree',
  strongly_agree: 'Strongly Agree',
};

// ----------------------------------------------------------------------------
// Stories
// ----------------------------------------------------------------------------

export type StoryVisibility = 'public' | 'private';
export type ContentVisibility = 'public' | 'private';

export interface Story {
  id: string;
  authorId: string;
  content: string;
  visibility: StoryVisibility;
  currentVersion: number;
  understoodCount: number; // distinct listeners with ≥8/10 accuracy
  createdAt: string;
  updatedAt: string;
  tags: string[];
  systemTags: string[]; // P630: System tags (st-group, version, category)
  bannerUrl?: string; // P504: AI-generated banner image
  imageUrl?: string; // P591: Story supporting image
  /**
   * P1141: the canonical watch URL of the story's source video — the ONE stored
   * field. Player, thumbnail and the open-at-timestamp fallback are all
   * re-derived from it, so no two stored fields can drift apart. Absent or
   * unparseable is treated identically to "this story has no video", and every
   * surface then renders exactly as it did before P1141.
   */
  videoUrl?: string;
  /** P1141: the supporting quotes and their per-quote timecodes, plus the video's duration. */
  videoQuotes?: StoryVideoQuotesData;
}

/** Story with author profile info for display */
export interface StoryWithAuthor extends Story {
  authorName: string;
  authorSlug: string;
  authorAvatarColor?: string;
  authorAvatarUrl?: string;
  authorRole?: string;
  authorEarsCount?: number; // P132: Credibility badge display
  authorHasPledged?: boolean;
}

/** Story with linked points */
export interface StoryWithPoints extends StoryWithAuthor {
  points: PointSummary[];
}

export interface DbStory {
  id: string;
  author_id: string;
  content: string;
  visibility: StoryVisibility;
  current_version: number;
  understood_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  system_tags: string[]; // P630: System tags (st-group, version, category)
  banner_url?: string | null; // P504: AI-generated banner image
  image_url?: string | null; // P591: Story supporting image
  video_url?: string | null; // P1141: canonical watch URL, the ONE stored video field
  video_quotes?: unknown; // P1141: raw jsonb — normalize with normalizeVideoQuotes()
}

// ----------------------------------------------------------------------------
// Story Versions (immutable snapshots for verification tracking)
// ----------------------------------------------------------------------------

export interface StoryVersion {
  id: string;
  storyId: string;
  versionNumber: number;
  content: string;
  createdAt: string;
}

export interface DbStoryVersion {
  id: string;
  story_id: string;
  version_number: number;
  content: string;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Points (statements users take positions on)
// ----------------------------------------------------------------------------

export interface Point {
  id: string;
  statement: string;
  context?: string;
  firstValidatorId: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  systemTags: string[]; // P630: System tags (st-group, version, category)
  bannerUrl?: string; // P504: AI-generated banner image
  visibility: ContentVisibility; // P586: public/private visibility — REQUIRED (P681)
  supersededBy?: string | null; // P800: UUID of the successor point; null = this is the head
}

/** Point summary for embedding in other views */
export interface PointSummary {
  id: string;
  statement: string;
  context?: string;
  tags: string[];
  systemTags: string[]; // P630: System tags (st-group, version, category)
  positionCounts?: Record<string, number>;
  userPosition?: PositionType | null;
  profileSubjectPosition?: PositionType | null;
  visibility: ContentVisibility; // P586: public/private visibility — REQUIRED (P681)
  supersededBy?: string | null; // P800: UUID of the successor point; null = this is the head
}

/** Point with creator profile info */
export interface PointWithCreator extends Point {
  creatorName: string;
  creatorSlug: string;
  creatorAvatarColor?: string;
  creatorAvatarUrl?: string;
}

/** Point with position counts */
export interface PointWithCounts extends PointWithCreator {
  positionCounts: Record<PositionType, number>;
  totalPositions: number;
}

/** Point with user's position */
export interface PointWithUserPosition extends PointWithCounts {
  userPosition?: PointPosition;
  profileSubjectPosition?: PointPosition;
}

export interface DbPoint {
  id: string;
  statement: string;
  context?: string;
  first_validator_id: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  system_tags: string[]; // P630: System tags (st-group, version, category)
  banner_url?: string | null; // P504: AI-generated banner image
}

// ----------------------------------------------------------------------------
// Story-Points junction
// ----------------------------------------------------------------------------

export interface StoryPoint {
  storyId: string;
  pointId: string;
  createdAt: string;
}

export interface DbStoryPoint {
  story_id: string;
  point_id: string;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Point Positions (current user positions)
// ----------------------------------------------------------------------------

export interface PointPosition {
  id: string;
  pointId: string;
  userId: string;
  position: PositionType;
  reasoning?: string;
  createdAt: string;
  updatedAt: string;
}

/** Position with user profile info */
export interface PointPositionWithUser extends PointPosition {
  userName: string;
  userSlug: string;
  userAvatarColor?: string;
  userAvatarUrl?: string;
  earCount: number;
  userHasPledged: boolean;
}

export interface DbPointPosition {
  id: string;
  point_id: string;
  user_id: string;
  position: PositionType;
  reasoning?: string;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Point Position History (audit log)
// ----------------------------------------------------------------------------

export interface PointPositionHistory {
  id: string;
  pointId: string;
  userId: string;
  position: PositionType | null; // null = position removed
  reasoning?: string;
  sessionId?: string;
  changedAt: string;
}

export interface DbPointPositionHistory {
  id: string;
  point_id: string;
  user_id: string;
  position: PositionType | null;
  reasoning?: string;
  session_id?: string;
  changed_at: string;
}

// ----------------------------------------------------------------------------
// Story Verifications (from /live sessions)
// ----------------------------------------------------------------------------

export interface StoryVerification {
  id: string;
  storyId?: string;
  versionId?: string;
  sessionId?: string;
  speakerId: string;
  listenerId: string;
  speakerRating: number; // 0-10
  listenerRating: number; // 0-10
  accuracyAchieved: boolean; // true if speakerRating >= 8
  createdAt: string;
  source?: string; // default 'live'
  verified?: boolean; // default true
  sortOrder?: number | null;
}

/** Verification with profile info for display */
export interface StoryVerificationWithProfiles extends StoryVerification {
  speakerName: string;
  speakerSlug: string;
  listenerName: string;
  listenerSlug: string;
}

export interface DbStoryVerification {
  id: string;
  story_id?: string;
  version_id?: string;
  session_id?: string;
  speaker_id: string;
  listener_id: string;
  speaker_rating: number;
  listener_rating: number;
  accuracy_achieved: boolean;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Calibration (computed from verifications)
// ----------------------------------------------------------------------------

export interface CalibrationStats {
  /** Number of successful listener verifications (≥8/10) */
  earsCount: number;
  /** Verification sessions completed as listener */
  listenerSessionCount: number;
  /** Verification sessions completed as speaker */
  speakerSessionCount: number;
  /** Average rating received as listener (how well others rate their understanding) */
  listenerCalibrationAvg: number | null;
  /** Average self-rating as listener */
  listenerSelfRatingAvg: number | null;
  /** Average rating given as speaker */
  speakerCalibrationAvg: number | null;
  /** Average self-rating received from listeners when speaking */
  speakerListenerSelfRatingAvg: number | null;
  /** Calibration gap: self-rating minus actual rating (positive = overconfident) */
  calibrationGap: number | null;
}

/** Result of calibration query with status */
export interface CalibrationResult {
  status: 'sufficient' | 'insufficient';
  sessionsCompleted: number;
  sessionsRequired: number;
  calibration?: CalibrationStats;
}

// ----------------------------------------------------------------------------
// Profile Extensions (added columns from P117)
// ----------------------------------------------------------------------------

/** Extended profile fields added by P117 migration */
export interface ProfileCalibrationFields {
  earsCount: number;
  verificationSessionCount: number;
}

/** Extended DbProfile with calibration fields */
export interface DbProfileWithCalibration extends DbProfile {
  ears_count?: number;
  verification_session_count?: number;
}

// ----------------------------------------------------------------------------
// Session Extensions (profile linking from P117)
// ----------------------------------------------------------------------------

/** Extended session fields for profile linking */
export interface DbClaritySessionWithProfiles extends DbClaritySession {
  creator_profile_id?: string;
  joiner_profile_id?: string;
}

// ============================================================================
// CLARITY DOCS TYPES (P551)
// ============================================================================

/** Per-point display config within a doc story */
export interface DocPointConfig {
  order?: string[];
  hidden?: string[];
  /**
   * P898: how many of the ordered VISIBLE points render before the story.
   * Absent = 1 (the historical implicit single lead). 0 = story-first.
   * `order` remains the single source of truth for sequence — this only
   * marks where the pre/post-story split falls. Clamped on read to
   * [0, visiblePoints.length].
   */
  lead_count?: number;
}

/** Database row type for clarity_docs table */
export interface DbClarityDoc {
  id: string;
  owner_id: string;
  title: string;
  visibility: ContentVisibility;
  created_at: string;
  updated_at: string;
}

/** Database row type for doc_stories junction table */
export interface DbDocStory {
  doc_id: string;
  story_id: string;
  position: number;
  point_config: DocPointConfig;
  created_at: string;
}

/** App-level doc type with computed fields */
export interface ClarityDoc extends DbClarityDoc {
  story_count: number;
  point_count: number;
  has_sent_letters: boolean;
}

/** App-level doc story with resolved story data (includes linked points) */
export interface DocStory extends DbDocStory {
  story: StoryWithPoints;
}

// ============================================================================
// TRANSCRIPTION TYPES (P495)
// ============================================================================

export interface TranscriptSegment {
  speaker_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface SessionTranscript {
  id: string;
  session_id: string;
  session_code: string;
  language: string | null;
  segments: TranscriptSegment[];
  speaker_map: Record<string, { user_id?: string; display_name: string }> | null;
  model_version: string | null;
  processing_time_ms: number | null;
  created_at: string;
}

export type TranscriptionJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | null;

// ============================================================================
// CLARITY LETTERS TYPES (P581)
// ============================================================================

export type LetterStatus = 'draft' | 'sealed' | 'expired';
export type DeliveryStatus = 'sent' | 'opened' | 'in_progress' | 'completed';
export type LetterMode = 'one-to-one' | 'one-to-many';

export interface ClarityLetter {
  id: string;
  source_doc_id: string;
  sender_id: string;
  sender_display_name?: string;
  sender_slug?: string | null;
  sender_avatar_url?: string;
  sender_avatar_color?: string;
  sender_has_pledged?: boolean;
  mode: LetterMode;
  status: LetterStatus;
  sealed_at: string | null;
  created_at: string;
  responses_mode?: 'off' | 'invite' | 'push';
}

export interface LetterDelivery {
  id: string;
  letter_id: string;
  receiver_email: string | null;
  receiver_profile_id: string | null;
  receiver_name: string | null;
  /** P725: public handle of the receiver profile (null when anonymous link_respondent) */
  receiver_slug?: string | null;
  invitation_token: string;
  /**
   * P1071: RPC-only verdict field. Present ONLY on deliveries sourced from
   * `get_letter_for_reading` (the anon token RPC), which redacts `receiver_email`
   * and `invitation_token` from its response and returns this comparison instead.
   *
   * `true`  — the signed-in caller's email matches the delivery's receiver_email
   * `false` — a signed-in caller whose email does NOT match (the wrong-user case)
   * `null`  — no signed-in caller, or the delivery has no receiver_email; the
   *           guard does not apply. Anonymous reading through an invitation link
   *           is intended behaviour, so `null` must never be treated as a failed
   *           match — compare with `=== false`, never `!value`.
   *
   * Absent on deliveries read directly from `letter_deliveries` under RLS, which
   * still carry the real `receiver_email`.
   */
  is_intended_recipient?: boolean | null;
  invitation_expires_at: string | null;
  access_token_expires_at: string | null;
  status: DeliveryStatus;
  stories_rated: number;
  opened_at: string | null;
  completed_at: string | null;
  read_at: string | null;
  created_at: string;
  /** P699 Phase 2: stories_rated + points_positioned (present when loaded via get_deliveries_with_progress) */
  steps_completed?: number;
  /** P699 Phase 2: total_stories + total_points (present when loaded via get_deliveries_with_progress) */
  total_steps?: number;
  /** P745: story index saved when receiver pauses to join /live */
  saved_story_index?: number | null;
}

/** P660: Inbox item — received letters + outgoing responses (UNION ALL) */
export interface InboxItem {
  type: 'received' | 'recipient_responded' | 'link_respondent' | 'recipient_in_progress' | 'link_respondent_in_progress';
  delivery_id: string;
  letter_id: string;
  /** Title of the source doc/draft */
  title: string;
  /** Sender name (for received letters) or responder name (for responses) */
  actor_name: string;
  /** P725: public handle of the actor profile (null for anonymous link respondents) */
  actor_slug?: string | null;
  timestamp: string;
  read_at: string | null;
  /** P695: null for pending, ISO string when letter was completed by recipient */
  completed_at: string | null;
  /** P699: stories rated so far (received letters only, in-progress) */
  stories_rated?: number;
  /** P699: total stories in the letter (received letters only) */
  total_stories?: number;
  /** P699 Phase 2: stories_rated + points_positioned (received letters only) */
  steps_completed?: number;
  /** P699 Phase 2: total_stories + total_points (received letters only) */
  total_steps?: number;
}

/** P699: Single story in the story walk — normalized for both sender and receiver */
export interface StoryWalkItem {
  /** story_id from snapshot */
  storyId: string;
  /** 0-based position in the letter */
  position: number;
  /** Snapshot data (point_config, visibility) */
  snapshot: LetterStorySnapshot;
  /** Sender prediction (always present for sender perspective; present for receiver after they rated) */
  prediction: number | undefined;
  /** Receiver rating (present only when receiver has rated this story) */
  rating: number | undefined;
  /** Gap = |prediction - rating|; undefined when either is missing */
  gap: number | undefined;
  /** Whether sender overestimated receiver's understanding (prediction > rating) */
  isOverconfident: boolean;
  /** Point responses for this story's points (indexed by point_id) */
  receiverPositions: Map<string, PositionType>;
  /** P705: Viewer's own live positions from point_positions (indexed by point_id) */
  viewerPositions?: Map<string, PositionType>;
  /** P904: Receiver's explain-back for this story, or null if none recorded yet */
  explainBack?: ExplainBackRow | null;
  /** P904: True when the sender (author) has not yet opened this explain-back */
  explainBackUnread?: boolean;
}

/**
 * P904: One async "explain-back" per (story × delivery) — the receiver's recorded
 * (audio v0) or typed explanation of what they understood. Pair-private.
 */
export interface ExplainBackRow {
  id: string;
  letter_id: string;
  story_id: string;
  delivery_id: string;
  recorder_id: string;
  medium: 'audio' | 'text';
  audio_storage_path: string | null;
  text_fallback: string | null;
  author_read_at: string | null;
  created_at: string;
  /** P904: recorder's display name — enriched client-side for the author's
   * "What {name} understood →" label (the letter's aggregate receiverName can be null). */
  recorderName?: string;
}

export interface LetterStorySnapshot {
  letter_id: string;
  story_id: string;
  version_id: string;
  position: number;
  point_config: Record<string, unknown>;
  visibility: string;
}

export interface LetterPrediction {
  id: string;
  letter_id: string;
  delivery_id: string | null;
  story_id: string;
  prediction: number;
  created_at: string;
}

export interface LetterPointResponse {
  id: string;
  delivery_id: string;
  point_id: string;
  position: string; // PositionType value
  created_at: string;
}

// ============================================================================
// P700: Letter Overview Payload Types
// ============================================================================

export interface OverviewStoryPoint {
  id: string;
  text: string;
  hashtag: string;   // first tag from points.tags (live, may be empty string)
  sort_order: number;
}

export interface OverviewStory {
  story_id: string;
  position: number;
  title?: string;
  content: string;
  hashtags: string[];  // live from stories.tags
  points: OverviewStoryPoint[];
}

export interface OverviewDelivery {
  delivery_id: string;
  display_name: string;       // server-computed: receiver_name || profile.name || 'Anonymous'
  full_display_name: string;  // P843: profile.name preferred (no auto-handle suffix); avatar+name parity with rest of app
  profile_slug: string | null;
  profile_id: string | null;
  avatar_url: string | null;  // P843: from profiles.avatar_url
  has_pledged: boolean;       // P843: pledge ring on PersonAvatar
  has_responded: boolean;
  completed_at: string | null;
}

export interface OverviewPrediction {
  delivery_id: string | null;  // null for 1-to-many shared predictions
  story_id: string;
  prediction: number;
}

export interface OverviewRating {
  delivery_id: string;
  story_id: string;
  listener_rating: number;
}

export interface OverviewPointResponse {
  delivery_id: string;
  point_id: string;
  position: PositionType;
}

export interface LetterOverviewPayload {
  letter: {
    id: string;
    title: string;
    status: string;
    sender_id: string;
    sender: {                  // P843: author avatar + full name for overview header
      profile_id: string | null;
      name: string;
      slug: string | null;
      avatar_url: string | null;
      has_pledged: boolean;
    };
  };
  stories: OverviewStory[];
  deliveries: OverviewDelivery[];
  predictions: OverviewPrediction[];
  ratings: OverviewRating[];
  pointResponses: OverviewPointResponse[];
}

