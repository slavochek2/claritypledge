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

