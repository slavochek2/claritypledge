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
}

/**
 * Lightweight profile type for list views (champions page, featured profiles)
 * where we don't need or fetch sensitive data like email
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

