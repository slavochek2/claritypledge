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
  expiresAt: string;
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

