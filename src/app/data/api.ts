/**
 * @file api.ts
 * CRITICAL DATA LAYER
 * -------------------
 * This file handles data transport.
 * The `createProfile` function here is an "Initiator" - it only sends the email.
 * It DOES NOT write to the database. Do not add database writes to the signup flow here.
 */
import { supabase } from '@/lib/supabase';
import type { AuthError } from '@supabase/supabase-js';
import type {
  Profile,
  ProfileSummary,
  DbProfile,
  DbProfileSummary,
  DbWitness,
  ClaritySession,
  DbClaritySession,
  DemoFlowState,
  DemoRound,
  DbDemoRound,
  ClarityIdea,
  DbClarityIdea,
} from '@/app/types';

// Re-export types for convenience
export type { Profile, ProfileSummary, Witness, ClaritySession, DemoFlowState, DemoRound, ClarityIdea } from '@/app/types';

/** Maximum number of featured profiles to fetch (used for SignatureWall on landing page) */
export const MAX_FEATURED_PROFILES = 6;

/** Display limits for compact avatar row in hero sections */
export const AVATAR_ROW_LIMIT_MOBILE = 5;
export const AVATAR_ROW_LIMIT_DESKTOP = 8;

// ============================================================================
// Content Length Limits - Client-side validation (also enforced in DB)
// ============================================================================

/** Maximum length for idea content (about 800 words) */
export const MAX_IDEA_LENGTH = 5000;

/** Maximum length for comment content (about 300 words) */
export const MAX_COMMENT_LENGTH = 2000;

/** Maximum length for user names */
export const MAX_NAME_LENGTH = 100;

/** Maximum length for chat messages */
export const MAX_CHAT_MESSAGE_LENGTH = 5000;

/** Maximum length for paraphrase/verification text */
export const MAX_PARAPHRASE_LENGTH = 2000;

/** Maximum length for correction feedback */
export const MAX_CORRECTION_LENGTH = 1000;

/**
 * Validates and truncates content to the specified max length.
 * @param content - The content to validate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Name of the field for error messages
 * @returns Trimmed content
 * @throws Error if content exceeds limit after trimming
 */
export function validateContentLength(content: string, maxLength: number, fieldName: string): string {
  const trimmed = content.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters (got ${trimmed.length})`);
  }
  return trimmed;
}

// ============================================================================
// Result Types - Discriminated unions for proper error handling
// ============================================================================

/** Result type for operations that can fail with different error types */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: 'not_found' | 'server_error'; message?: string };

// ============================================================================
// Private Helpers - Shared logic to avoid duplication
// ============================================================================

/**
 * Enriches a raw database profile with witnesses and reciprocation count.
 * This is the shared logic used by both getProfile and getProfileBySlug.
 */
async function enrichProfileWithRelations(
  profile: DbProfile
): Promise<{ witnesses: DbWitness[]; reciprocationsCount: number }> {
  const { data: witnesses, error: witnessesError } = await supabase
    .from('witnesses')
    .select('*')
    .eq('profile_id', profile.id);

  if (witnessesError) {
    console.warn('⚠️ Error fetching witnesses (non-fatal):', witnessesError.message);
  }

  const { count: reciprocationsCount, error: reciprocationsError } = await supabase
    .from('witnesses')
    .select('*', { count: 'exact', head: true })
    .eq('witness_profile_id', profile.id);

  if (reciprocationsError) {
    console.warn('⚠️ Error fetching reciprocations (non-fatal):', reciprocationsError.message);
  }

  return {
    witnesses: witnesses || [],
    reciprocationsCount: reciprocationsCount || 0,
  };
}

/**
 * Fetches a single user profile by their UUID.
 * This function retrieves the profile and its associated witnesses.
 * @param id - The UUID of the user profile to fetch.
 * @returns A promise that resolves to the user's profile object or null if not found.
 * @deprecated Use getProfileResult() for proper error handling (distinguishes not_found vs server_error)
 */
export async function getProfile(id: string): Promise<Profile | null> {
  const result = await getProfileResult(id);
  return result.success ? result.data : null;
}

/**
 * Fetches a single user profile by their UUID with proper error handling.
 * Returns a discriminated union that distinguishes between "not found" and "server error".
 * @param id - The UUID of the user profile to fetch.
 * @returns Success with profile data, or failure with error type.
 */
export async function getProfileResult(id: string): Promise<ApiResult<Profile>> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileError) {
      // PGRST116 = "no rows returned" = not found
      if (profileError.code === 'PGRST116') {
        return { success: false, error: 'not_found' };
      }
      console.error('Error fetching profile:', profileError.message);
      return { success: false, error: 'server_error', message: profileError.message };
    }

    if (!profile) {
      return { success: false, error: 'not_found' };
    }

    const { witnesses, reciprocationsCount } = await enrichProfileWithRelations(profile);

    return {
      success: true,
      data: mapProfileFromDb({ ...profile, witnesses }, reciprocationsCount),
    };
  } catch (err) {
    console.error('Unexpected error in getProfileResult:', err);
    return { success: false, error: 'server_error' };
  }
}

/**
 * Fetches featured verified profiles for the landing page.
 * Returns up to MAX_FEATURED_PROFILES verified profiles, prioritizing those with reasons.
 * Uses a single query approach: fetches extra profiles and sorts client-side for efficiency.
 * @returns A promise that resolves to an array of up to MAX_FEATURED_PROFILES profile summary objects.
 */
export async function getFeaturedProfiles(): Promise<ProfileSummary[]> {
  try {
    const selectFields = 'id, slug, name, role, linkedin_url, reason, avatar_color, created_at, is_verified';

    // Single query: fetch more than needed, then sort/filter client-side
    // This avoids the two-query backfill approach for better performance
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(selectFields)
      .eq('is_verified', true)
      .order('created_at', { ascending: false })
      .limit(MAX_FEATURED_PROFILES * 3);

    if (profilesError) {
      console.error('Error fetching featured profiles:', profilesError.message);
      return [];
    }

    if (!profiles || profiles.length === 0) {
      return [];
    }

    // Sort: profiles with valid reasons first, then without
    const withReasons = profiles.filter(p => p.reason && p.reason.trim().length > 0);
    const withoutReasons = profiles.filter(p => !p.reason || p.reason.trim().length === 0);
    const combined = [...withReasons, ...withoutReasons].slice(0, MAX_FEATURED_PROFILES);

    if (combined.length === 0) {
      return [];
    }

    // Fetch witness and reciprocation counts in parallel
    const profileIds = combined.map(p => p.id);

    const [witnessResult, reciprocationsResult] = await Promise.all([
      supabase.from('witnesses').select('profile_id').in('profile_id', profileIds),
      supabase.from('witnesses').select('witness_profile_id').in('witness_profile_id', profileIds).not('witness_profile_id', 'is', null),
    ]);

    // Count witnesses per profile
    const witnessCounts: Record<string, number> = {};
    (witnessResult.data || []).forEach(w => {
      witnessCounts[w.profile_id] = (witnessCounts[w.profile_id] || 0) + 1;
    });

    // Count reciprocations per profile
    const reciprocationCounts: Record<string, number> = {};
    (reciprocationsResult.data || []).forEach(r => {
      if (r.witness_profile_id) {
        reciprocationCounts[r.witness_profile_id] = (reciprocationCounts[r.witness_profile_id] || 0) + 1;
      }
    });

    return combined.map(p => mapProfileSummaryFromDb(p, witnessCounts[p.id] || 0, reciprocationCounts[p.id] || 0));
  } catch (err) {
    console.error('Unexpected error in getFeaturedProfiles:', err);
    return [];
  }
}

/**
 * Gets the count of verified profiles.
 * Used for social proof display (e.g., "Join 47 champions who've taken the pledge").
 * @returns The count of verified profiles.
 */
export async function getVerifiedProfileCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_verified', true);

    if (error) {
      console.error('Error fetching verified profile count:', error.message);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('Unexpected error in getVerifiedProfileCount:', err);
    return 0;
  }
}

/**
 * Fetches all profiles that have been marked as verified.
 * This is used to populate the "Understanding Champions" page, showcasing all users who have completed the pledge process.
 * The function also fetches and attaches all witnesses for each profile.
 * Profiles with reasons are shown first, then those without.
 * @returns A promise that resolves to an array of verified profile objects.
 */
export async function getVerifiedProfiles(): Promise<Profile[]> {
  try {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_verified', true)
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('Error fetching verified profiles:', profilesError.message);
      return [];
    }

    if (!profiles || profiles.length === 0) {
      return [];
    }

    // Sort profiles: those with meaningful reasons first, then others
    const withReasons = profiles.filter(p => p.reason && p.reason.trim().length > 0);
    const withoutReasons = profiles.filter(p => !p.reason || p.reason.trim().length === 0);
    const sortedProfiles = [...withReasons, ...withoutReasons];

    // Fetch witnesses for all profiles
    const profileIds = sortedProfiles.map(p => p.id);
    const { data: allWitnesses, error: witnessesError } = await supabase
      .from('witnesses')
      .select('*')
      .in('profile_id', profileIds);

    if (witnessesError) {
      console.warn('Error fetching witnesses (non-fatal):', witnessesError.message);
    }

    // Attach witnesses to their profiles
    const profilesWithWitnesses = sortedProfiles.map(profile => ({
      ...profile,
      witnesses: (allWitnesses || []).filter(w => w.profile_id === profile.id)
    }));

    return profilesWithWitnesses.map(p => mapProfileFromDb(p));
  } catch (err) {
    console.error('Unexpected error in getVerifiedProfiles:', err);
    return [];
  }
}

/**
 * Initiates the user signup process by sending a magic link (One-Time Password) to the user's email.
 * This function handles both new user registration and login for existing users.
 * User metadata (name, role, etc.) is passed in the options and is used to create or update the user's profile
 * via a database trigger when the user clicks the magic link.
 * @param name - The user's full name.
 * @param email - The user's email address.
 * @param role - The user's professional role or title.
 * @param linkedinUrl - A URL to the user's LinkedIn profile.
 * @param reason - The user's reason for taking the pledge.
 * @returns A promise that resolves when the magic link has been sent.
 */
export async function createProfile(
  name: string,
  email: string,
  role?: string,
  linkedinUrl?: string,
  reason?: string
): Promise<void> {
  // The `createProfile` function ONLY sends the magic link.
  // The actual profile creation is handled in AuthCallbackPage after email verification.
  // NOTE: Slug is generated at profile creation time in AuthCallbackPage, not here.
  // This prevents race conditions when multiple users with the same name sign up simultaneously.

  const redirectUrl = `${window.location.origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        name,
        role,
        linkedin_url: linkedinUrl,
        reason,
        avatar_color: getRandomColor(),
      },
    },
  });

  if (error) {
    console.error('Supabase auth error:', error.message);
    throw error;
  }
}

/**
 * Adds a new witness to a user's profile.
 * A witness is someone who has endorsed or acknowledged a user's pledge.
 * @param profileId - The UUID of the profile being witnessed.
 * @param witnessName - The name of the person witnessing the pledge.
 * @param linkedinUrl - An optional URL to the witness's LinkedIn profile.
 * @returns A promise that resolves to the new witness's ID.
 * @throws Error if the database operation fails.
 */
export async function addWitness(
  profileId: string,
  witnessName: string,
  linkedinUrl?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('witnesses')
    .insert({
      profile_id: profileId,
      witness_name: witnessName,
      witness_linkedin_url: linkedinUrl,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error adding witness:', error.message);
    throw new Error(error.message);
  }
  return data.id;
}

/**
 * Sends a magic link to a user's email for login.
 * This is a simplified version of `createProfile` used for logging in existing users
 * where no profile data needs to be created or updated.
 * @param email - The email address to send the magic link to.
 * @returns A promise that resolves with an error object if the sign-in failed.
 */
export async function signInWithEmail(email: string): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  return { error };
}

/**
 * Fetches the profile of the currently authenticated user.
 * This function first gets the current user session from Supabase Auth,
 * then uses the user's ID to fetch their full profile information.
 * @returns {Promise<Profile | null>} A promise that resolves to the current user's profile object, or null if no user is logged in.
 */
export async function getCurrentUser(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  return getProfile(user.id);
}

/**
 * Signs the current user out of the application.
 * @returns {Promise<void>}
 */
export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Maps a partial database profile (without email/witnesses) to ProfileSummary.
 * Used for list views like featured profiles and champions page.
 */
function mapProfileSummaryFromDb(
  dbProfile: DbProfileSummary,
  witnessCount: number = 0,
  reciprocations: number = 0
): ProfileSummary {
  let safeSlug: string;
  if (dbProfile.slug && dbProfile.slug.trim() !== '') {
    safeSlug = dbProfile.slug;
  } else if (dbProfile.name && dbProfile.name.trim() !== '') {
    safeSlug = generateSlug(dbProfile.name);
  } else {
    safeSlug = dbProfile.id || 'user';
  }

  return {
    id: dbProfile.id,
    slug: safeSlug,
    name: dbProfile.name || 'Anonymous',
    role: dbProfile.role,
    linkedinUrl: dbProfile.linkedin_url,
    reason: dbProfile.reason,
    signedAt: dbProfile.created_at,
    isVerified: dbProfile.is_verified,
    avatarColor: dbProfile.avatar_color,
    witnessCount,
    reciprocations,
  };
}

/**
 * A private helper function to map data from the database (snake_case) to the frontend-friendly `Profile` interface (camelCase).
 * It also ensures a valid slug exists, generating one from the user's name if necessary.
 * @param dbProfile - The database profile row
 * @param reciprocations - Count of profiles where this user is a witness (how many people they've inspired)
 */
function mapProfileFromDb(dbProfile: DbProfile, reciprocations: number = 0): Profile {
  // Generate a safe slug if one doesn't exist or is empty
  // Priority: 1) existing slug 2) generate from name 3) use id as fallback
  let safeSlug: string;

  if (dbProfile.slug && dbProfile.slug.trim() !== '') {
    safeSlug = dbProfile.slug;
  } else if (dbProfile.name && dbProfile.name.trim() !== '') {
    safeSlug = generateSlug(dbProfile.name);
  } else {
    // Fallback to id if both slug and name are missing
    safeSlug = dbProfile.id || 'user';
  }

  return {
    id: dbProfile.id,
    slug: safeSlug,
    name: dbProfile.name || 'Anonymous',
    email: dbProfile.email,
    role: dbProfile.role,
    linkedinUrl: dbProfile.linkedin_url,
    reason: dbProfile.reason,
    signedAt: dbProfile.created_at,
    isVerified: dbProfile.is_verified,
    witnesses: (dbProfile.witnesses || []).map((w: DbWitness) => ({
      id: w.id,
      name: w.witness_name,
      linkedinUrl: w.witness_linkedin_url,
      timestamp: w.created_at,
      isVerified: w.is_verified,
    })),
    reciprocations,
    avatarColor: dbProfile.avatar_color,
    pledgeVersion: dbProfile.pledge_version || 2,
  };
}

/**
 * A private helper function to select a random color from a predefined palette.
 * This is used to assign a default avatar color to new users.
 * @returns {string} A hex color code.
 */
function getRandomColor() {
  const colors = ["#0044CC", "#002B5C", "#FFD700", "#FF6B6B", "#4ECDC4"];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generates a URL-friendly slug from a given string (typically a user's name).
 * Converts the string to lowercase, replaces spaces with hyphens, and removes special characters.
 * Example: "John Doe" -> "john-doe"
 * @param {string} name - The input string.
 * @returns {string} The generated slug.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/--+/g, '-'); // Replace multiple hyphens with single hyphen
}

/**
 * Generates a unique slug by checking database availability.
 * Tries the base slug first (e.g., "john-doe"), then appends incrementing
 * numbers if taken (e.g., "john-doe-2", "john-doe-3").
 * @param name - The user's name to generate slug from.
 * @returns A unique slug guaranteed not to exist in the database.
 */
export async function ensureUniqueSlug(name: string): Promise<string> {
  const baseSlug = generateSlug(name);

  if (!baseSlug) {
    return `user-${Date.now()}`;
  }

  // Check if base slug is available
  const { data: existing } = await supabase
    .from('profiles')
    .select('slug')
    .eq('slug', baseSlug)
    .single();

  if (!existing) {
    return baseSlug;
  }

  // Base slug taken, find next available number
  const { data: similarSlugs } = await supabase
    .from('profiles')
    .select('slug')
    .like('slug', `${baseSlug}-%`);

  const existingNumbers = (similarSlugs || [])
    .map(p => {
      const match = p.slug.match(new RegExp(`^${baseSlug}-(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);

  const nextNumber = existingNumbers.length > 0
    ? Math.max(...existingNumbers) + 1
    : 2;

  return `${baseSlug}-${nextNumber}`;
}

/**
 * Updates an existing user profile.
 * Only the profile owner can update their profile (enforced by RLS).
 * @param userId - The UUID of the profile to update.
 * @param updates - The fields to update.
 * @returns A promise with error if update failed.
 */
export async function updateProfile(
  userId: string,
  updates: {
    name?: string;
    role?: string;
    linkedin_url?: string;
    reason?: string;
  }
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('Error updating profile:', error.message);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Fetches a single user profile by their unique, URL-friendly slug.
 * This is the primary method for retrieving profiles for public-facing pages.
 * @param slug - The slug of the user profile to fetch.
 * @returns A promise that resolves to the user's profile object or null if not found.
 * @deprecated Use getProfileBySlugResult() for proper error handling (distinguishes not_found vs server_error)
 */
export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  const result = await getProfileBySlugResult(slug);
  return result.success ? result.data : null;
}

/**
 * Fetches a single user profile by slug with proper error handling.
 * Returns a discriminated union that distinguishes between "not found" and "server error".
 * @param slug - The slug of the user profile to fetch.
 * @returns Success with profile data, or failure with error type.
 */
export async function getProfileBySlugResult(slug: string): Promise<ApiResult<Profile>> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('slug', slug)
      .single();

    if (profileError) {
      // PGRST116 = "no rows returned" = not found
      if (profileError.code === 'PGRST116') {
        return { success: false, error: 'not_found' };
      }
      console.error('Error fetching profile by slug:', profileError.message);
      return { success: false, error: 'server_error', message: profileError.message };
    }

    if (!profile) {
      return { success: false, error: 'not_found' };
    }

    const { witnesses, reciprocationsCount } = await enrichProfileWithRelations(profile);

    return {
      success: true,
      data: mapProfileFromDb({ ...profile, witnesses }, reciprocationsCount),
    };
  } catch (err) {
    console.error('Unexpected error in getProfileBySlugResult:', err);
    return { success: false, error: 'server_error' };
  }
}

// ============================================================================
// CLARITY PARTNERS API (P19 MVP)
// ============================================================================

/**
 * Generates a 6-character alphanumeric room code.
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Maps database session to frontend ClaritySession type.
 */
function mapSessionFromDb(dbSession: DbClaritySession): ClaritySession {
  return {
    id: dbSession.id,
    code: dbSession.code,
    creatorName: dbSession.creator_name,
    creatorNote: dbSession.creator_note,
    joinerName: dbSession.joiner_name,
    state: dbSession.state,
    demoStatus: dbSession.demo_status,
    partnershipStatus: dbSession.partnership_status,
    createdAt: dbSession.created_at,
    expiresAt: dbSession.expires_at,
    endedAt: dbSession.ended_at,
    // P23: Live Clarity Meetings
    mode: dbSession.mode,
    liveState: dbSession.live_state,
  };
}

/**
 * Creates a new Clarity Partners session.
 * @param creatorName - Name of the session creator
 * @param creatorNote - Optional note explaining why the partner is being invited
 * @returns The created session
 */
export async function createClaritySession(
  creatorName: string,
  creatorNote?: string
): Promise<ClaritySession> {
  // Generate unique room code (retry if collision)
  let code = generateRoomCode();
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const { data, error } = await supabase
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: creatorName,
        creator_note: creatorNote,
        state: {},
        demo_status: 'waiting',
        partnership_status: 'pending',
      })
      .select()
      .single();

    if (!error && data) {
      console.log('✅ Created clarity session:', code);
      return mapSessionFromDb(data);
    }

    // If unique constraint violation, try new code
    if (error?.code === '23505') {
      code = generateRoomCode();
      attempts++;
      continue;
    }

    // Other error
    console.error('Error creating clarity session:', error?.message);
    throw new Error(error?.message || 'Failed to create session');
  }

  throw new Error('Failed to generate unique room code after multiple attempts');
}

/**
 * Joins an existing Clarity Partners session by room code.
 * @param code - The 6-character room code
 * @param joinerName - Name of the person joining
 * @returns The updated session or null if not found
 */
export async function joinClaritySession(
  code: string,
  joinerName: string
): Promise<ClaritySession | null> {
  const normalizedCode = code.toUpperCase().trim();

  // First check if session exists and is joinable
  const { data: existing, error: fetchError } = await supabase
    .from('clarity_sessions')
    .select('*')
    .eq('code', normalizedCode)
    .single();

  if (fetchError || !existing) {
    console.log('Session not found:', normalizedCode);
    return null;
  }

  // Check if already joined
  if (existing.joiner_name) {
    console.log('Session already has a joiner');
    // Return session anyway if they're rejoining with same name
    if (existing.joiner_name === joinerName) {
      return mapSessionFromDb(existing);
    }
    return null;
  }

  // Update with joiner name
  const { data, error } = await supabase
    .from('clarity_sessions')
    .update({ joiner_name: joinerName })
    .eq('code', normalizedCode)
    .select()
    .single();

  if (error || !data) {
    console.error('Error joining session:', error?.message);
    return null;
  }

  console.log('✅ Joined clarity session:', normalizedCode);
  return mapSessionFromDb(data);
}

/**
 * Gets a Clarity Partners session by room code.
 * @param code - The 6-character room code
 * @returns The session or null if not found
 */
export async function getClaritySession(code: string): Promise<ClaritySession | null> {
  const normalizedCode = code.toUpperCase().trim();

  const { data, error } = await supabase
    .from('clarity_sessions')
    .select('*')
    .eq('code', normalizedCode)
    .single();

  if (error || !data) {
    return null;
  }

  return mapSessionFromDb(data);
}

/**
 * Updates the session state (for realtime sync).
 * @param sessionId - The session UUID
 * @param state - Partial state to merge
 */
export async function updateClaritySessionState(
  sessionId: string,
  state: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('clarity_sessions')
    .update({ state })
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating session state:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Updates the live session state (P23: Live Clarity Meetings).
 * @param sessionId - The session UUID
 * @param liveState - The live state to set
 */
export async function updateClaritySessionLiveState(
  sessionId: string,
  liveState: Record<string, unknown>
): Promise<void> {
  console.log('[Live API] Updating live state for session:', sessionId, liveState);

  const { error } = await supabase
    .from('clarity_sessions')
    .update({ live_state: liveState, mode: 'live' })
    .eq('id', sessionId);

  if (error) {
    console.error('[Live API] Error updating live state:', error.message, error.code, error.details);
    // Check if this might be a missing column error
    if (error.message.includes('column') || error.code === '42703') {
      throw new Error('Database migration required: run supabase/migrations/20251223_p23_live_clarity_meetings.sql');
    }
    throw new Error(error.message);
  }
  console.log('[Live API] Live state updated successfully');
}

/**
 * Updates the demo status of a session.
 * @param sessionId - The session UUID
 * @param demoStatus - New demo status
 */
export async function updateClarityDemoStatus(
  sessionId: string,
  demoStatus: 'waiting' | 'in_progress' | 'completed'
): Promise<void> {
  const { error } = await supabase
    .from('clarity_sessions')
    .update({ demo_status: demoStatus })
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating demo status:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Clears the joiner from a session (when joiner leaves).
 * This signals to the creator that their partner has left.
 * @param sessionId - The session UUID
 */
export async function clearSessionJoiner(sessionId: string): Promise<void> {
  console.log('[Live] Clearing joiner from session:', sessionId);

  const { error } = await supabase
    .from('clarity_sessions')
    .update({ joiner_name: null })
    .eq('id', sessionId);

  if (error) {
    console.error('Error clearing session joiner:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Ends a clarity session (when creator leaves).
 * This signals to the joiner that the session has ended.
 * Uses live_state.sessionEnded since ended_at column doesn't exist.
 * @param sessionId - The session UUID
 */
export async function endClaritySession(sessionId: string): Promise<void> {
  console.log('[Live] Ending session:', sessionId);

  // First get current live_state to merge with
  const { data: current } = await supabase
    .from('clarity_sessions')
    .select('live_state')
    .eq('id', sessionId)
    .single();

  const currentLiveState = current?.live_state || {};

  const { error } = await supabase
    .from('clarity_sessions')
    .update({
      live_state: {
        ...currentLiveState,
        sessionEnded: true,
        sessionEndedAt: new Date().toISOString(),
      },
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Error ending session:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Subscribes to realtime changes for a session.
 * @param sessionId - The session UUID
 * @param onUpdate - Callback when session updates
 * @returns Unsubscribe function
 */
export function subscribeToClaritySession(
  sessionId: string,
  onUpdate: (session: ClaritySession) => void
): () => void {
  console.log('📡 Setting up realtime subscription for session:', sessionId);

  const channel = supabase
    .channel(`clarity_session:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'clarity_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        console.log('📡 Session update received:', payload);
        if (payload.new) {
          onUpdate(mapSessionFromDb(payload.new as DbClaritySession));
        }
      }
    )
    .subscribe((status) => {
      console.log('📡 Subscription status:', status);
    });

  return () => {
    console.log('📡 Unsubscribing from session:', sessionId);
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// DEMO FLOW API (Story 2 - 5-Level Guided Demo)
// ============================================================================

/**
 * Updates the demo flow state in the session (for realtime sync).
 * This merges the new state with existing state.
 * @param sessionId - The session UUID
 * @param demoState - The demo flow state to merge
 */
export async function updateDemoFlowState(
  sessionId: string,
  demoState: Partial<DemoFlowState>
): Promise<void> {
  // First get current state
  const { data: current, error: fetchError } = await supabase
    .from('clarity_sessions')
    .select('state')
    .eq('id', sessionId)
    .single();

  if (fetchError) {
    console.error('Error fetching current state:', fetchError.message);
    throw new Error(fetchError.message);
  }

  // Merge with new state
  const mergedState = {
    ...(current?.state || {}),
    ...demoState,
  };

  const { error } = await supabase
    .from('clarity_sessions')
    .update({ state: mergedState })
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating demo flow state:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Updated demo flow state:', demoState);
}

/**
 * Saves a completed demo round to the database.
 * @param round - The round data to save
 * @returns The saved round with ID
 */
export async function saveDemoRound(round: Omit<DemoRound, 'id' | 'createdAt'>): Promise<DemoRound> {
  const calibrationGap = round.speakerRating !== undefined && round.listenerSelfRating !== undefined
    ? round.speakerRating - round.listenerSelfRating
    : null;

  const { data, error } = await supabase
    .from('clarity_demo_rounds')
    .insert({
      session_id: round.sessionId,
      level: round.level,
      round_number: round.roundNumber,
      speaker_name: round.speakerName,
      listener_name: round.listenerName,
      idea_text: round.ideaText,
      paraphrase_text: round.paraphraseText,
      speaker_rating: round.speakerRating,
      listener_self_rating: round.listenerSelfRating,
      calibration_gap: calibrationGap,
      correction_text: round.correctionText,
      is_accepted: round.isAccepted,
      position: round.position,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving demo round:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Saved demo round:', data);
  return mapDemoRoundFromDb(data);
}

/**
 * Gets all demo rounds for a session.
 * @param sessionId - The session UUID
 * @returns Array of demo rounds
 */
export async function getDemoRounds(sessionId: string): Promise<DemoRound[]> {
  const { data, error } = await supabase
    .from('clarity_demo_rounds')
    .select('*')
    .eq('session_id', sessionId)
    .order('level', { ascending: true })
    .order('round_number', { ascending: true });

  if (error) {
    console.error('Error fetching demo rounds:', error.message);
    return [];
  }

  return (data || []).map(mapDemoRoundFromDb);
}

/**
 * Saves an idea to the backlog.
 * @param idea - The idea to save
 * @returns The saved idea with ID
 */
export async function saveClarityIdea(
  idea: Omit<ClarityIdea, 'id' | 'createdAt' | 'status' | 'roundsCount' | 'finalAccuracy' | 'position' | 'discussedAt'>
): Promise<ClarityIdea> {
  const { data, error } = await supabase
    .from('clarity_ideas')
    .insert({
      session_id: idea.sessionId,
      author_name: idea.authorName,
      content: idea.content,
      source_level: idea.sourceLevel,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving idea:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Saved clarity idea:', data);
  return mapClarityIdeaFromDb(data);
}

/**
 * Gets all ideas for a session.
 * @param sessionId - The session UUID
 * @returns Array of ideas
 */
export async function getClarityIdeas(sessionId: string): Promise<ClarityIdea[]> {
  const { data, error } = await supabase
    .from('clarity_ideas')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching ideas:', error.message);
    return [];
  }

  return (data || []).map(mapClarityIdeaFromDb);
}

// ============================================================================
// MAPPING HELPERS
// ============================================================================

function mapDemoRoundFromDb(db: DbDemoRound): DemoRound {
  return {
    id: db.id,
    sessionId: db.session_id,
    level: db.level,
    roundNumber: db.round_number,
    speakerName: db.speaker_name,
    listenerName: db.listener_name,
    ideaText: db.idea_text,
    paraphraseText: db.paraphrase_text,
    speakerRating: db.speaker_rating,
    listenerSelfRating: db.listener_self_rating,
    calibrationGap: db.calibration_gap,
    correctionText: db.correction_text,
    isAccepted: db.is_accepted,
    position: db.position,
    createdAt: db.created_at,
  };
}

function mapClarityIdeaFromDb(db: DbClarityIdea): ClarityIdea {
  return {
    id: db.id,
    sessionId: db.session_id,
    authorName: db.author_name,
    content: db.content,
    sourceLevel: db.source_level,
    status: db.status,
    roundsCount: db.rounds_count,
    finalAccuracy: db.final_accuracy,
    position: db.position,
    discussedAt: db.discussed_at,
    createdAt: db.created_at,
  };
}

// ============================================================================
// CLARITY CHAT API (P19.2 MVP)
// ============================================================================

import type {
  ChatMessage,
  DbChatMessage,
  Verification,
  DbVerification,
  ChatPosition,
  FeedIdea,
  DbFeedIdea,
  IdeaVote,
  DbIdeaVote,
  IdeaVoteHistory,
  IdeaComment,
  DbIdeaComment,
  FeedVote,
  ProvenanceType,
} from '@/app/types';

// Re-export chat types
export type { ChatMessage, Verification, ChatPosition } from '@/app/types';

// Re-export feed types
export type { FeedIdea, IdeaVote, IdeaComment, IdeaVoteHistory, FeedVote, ProvenanceType } from '@/app/types';

/**
 * Maps database chat message to frontend type.
 */
function mapChatMessageFromDb(db: DbChatMessage): ChatMessage {
  return {
    id: db.id,
    sessionId: db.session_id,
    authorName: db.author_name,
    content: db.content,
    createdAt: db.created_at,
    explanationRequestedAt: db.explanation_requested_at ?? null,
  };
}

/**
 * Maps database verification to frontend type.
 */
function mapVerificationFromDb(db: DbVerification): Verification {
  return {
    id: db.id,
    messageId: db.message_id,
    verifierName: db.verifier_name,
    paraphraseText: db.paraphrase_text,
    selfRating: db.self_rating ?? undefined,
    accuracyRating: db.accuracy_rating ?? undefined,
    calibrationGap: db.calibration_gap ?? undefined,
    correctionText: db.correction_text ?? undefined,
    roundNumber: db.round_number ?? 1,
    status: db.status,
    position: db.position ?? undefined,
    audioUrl: db.audio_url ?? undefined,
    createdAt: db.created_at,
  };
}

/**
 * Sends a chat message (idea) to a session.
 * @param sessionId - The session UUID
 * @param authorName - Who sent the message
 * @param content - The message content
 * @returns The created message
 */
export async function sendChatMessage(
  sessionId: string,
  authorName: string,
  content: string
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('clarity_chat_messages')
    .insert({
      session_id: sessionId,
      author_name: authorName,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending chat message:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Sent chat message:', data);
  return mapChatMessageFromDb(data);
}

/**
 * Gets all chat messages for a session.
 * @param sessionId - The session UUID
 * @returns Array of messages ordered by creation time
 */
export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('clarity_chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error.message);
    return [];
  }

  return (data || []).map(mapChatMessageFromDb);
}

/**
 * Subscribes to new chat messages in a session.
 * @param sessionId - The session UUID
 * @param onNewMessage - Callback when a new message arrives
 * @returns Unsubscribe function
 */
export function subscribeToChatMessages(
  sessionId: string,
  onNewMessage: (message: ChatMessage) => void
): () => void {
  const channel = supabase
    .channel(`chat_messages:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'clarity_chat_messages',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        console.log('📨 New chat message:', payload);
        if (payload.new) {
          onNewMessage(mapChatMessageFromDb(payload.new as DbChatMessage));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Creates a paraphrase verification for a message.
 * Automatically calculates round_number based on previous attempts.
 * @param messageId - The message being paraphrased
 * @param verifierName - Who is paraphrasing
 * @param paraphraseText - The paraphrase text
 * @returns The created verification
 */
export async function createVerification(
  messageId: string,
  verifierName: string,
  paraphraseText: string,
  selfRating?: number,
  audioUrl?: string
): Promise<Verification> {
  // Get existing verifications by this verifier to determine round number
  const { data: existing } = await supabase
    .from('clarity_verifications')
    .select('round_number')
    .eq('message_id', messageId)
    .eq('verifier_name', verifierName)
    .order('round_number', { ascending: false })
    .limit(1);

  const roundNumber = existing && existing.length > 0 ? existing[0].round_number + 1 : 1;

  const { data, error } = await supabase
    .from('clarity_verifications')
    .insert({
      message_id: messageId,
      verifier_name: verifierName,
      paraphrase_text: paraphraseText,
      self_rating: selfRating,
      audio_url: audioUrl,
      round_number: roundNumber,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating verification:', error.message);
    throw new Error(error.message);
  }

  console.log(`✅ Created verification (round ${roundNumber}):`, data);
  return mapVerificationFromDb(data);
}

/**
 * Gets all verifications for a message.
 * @param messageId - The message UUID
 * @returns Array of verifications
 */
export async function getVerificationsForMessage(messageId: string): Promise<Verification[]> {
  const { data, error } = await supabase
    .from('clarity_verifications')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching verifications:', error.message);
    return [];
  }

  return (data || []).map(mapVerificationFromDb);
}

/**
 * Gets all verifications for all messages in a session.
 * @param sessionId - The session UUID
 * @returns Map of messageId -> verifications
 */
export async function getVerificationsForSession(
  sessionId: string
): Promise<Map<string, Verification[]>> {
  // First get all message IDs in this session
  const { data: messages, error: msgError } = await supabase
    .from('clarity_chat_messages')
    .select('id')
    .eq('session_id', sessionId);

  if (msgError || !messages?.length) {
    return new Map();
  }

  const messageIds = messages.map((m) => m.id);

  // Then get all verifications for these messages
  const { data, error } = await supabase
    .from('clarity_verifications')
    .select('*')
    .in('message_id', messageIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching verifications:', error.message);
    return new Map();
  }

  // Group by message ID
  const map = new Map<string, Verification[]>();
  for (const db of data || []) {
    const v = mapVerificationFromDb(db);
    const existing = map.get(v.messageId) || [];
    existing.push(v);
    map.set(v.messageId, existing);
  }

  return map;
}

/**
 * Rates a verification (author rates the paraphrase).
 * If not accepting, can provide correction text for retry.
 * @param verificationId - The verification UUID
 * @param rating - Accuracy rating 0-100
 * @param accept - Whether to accept this as understood
 * @param correctionText - Optional feedback if not accepting (what was missed)
 * @returns Updated verification
 */
export async function rateVerification(
  verificationId: string,
  rating: number,
  accept: boolean,
  correctionText?: string
): Promise<Verification> {
  // First get the verification to calculate calibration gap
  const { data: existing } = await supabase
    .from('clarity_verifications')
    .select('self_rating')
    .eq('id', verificationId)
    .single();

  const calibrationGap = existing?.self_rating !== undefined
    ? rating - existing.self_rating
    : undefined;

  // Determine status: accepted if finalized, needs_retry if requesting another round
  let status: 'accepted' | 'needs_retry' | 'pending' = 'pending';
  if (accept) {
    status = 'accepted';
  } else {
    // Not accepting = requesting another round (correction text is optional)
    status = 'needs_retry';
  }

  const { data, error } = await supabase
    .from('clarity_verifications')
    .update({
      accuracy_rating: rating,
      calibration_gap: calibrationGap,
      status,
      correction_text: correctionText || null,
    })
    .eq('id', verificationId)
    .select()
    .single();

  if (error) {
    console.error('Error rating verification:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Rated verification:', data);
  return mapVerificationFromDb(data);
}

/**
 * Sets position on a verification (verifier states agree/disagree after acceptance).
 * @param verificationId - The verification UUID
 * @param position - The position to set
 * @returns Updated verification
 */
export async function setVerificationPosition(
  verificationId: string,
  position: ChatPosition
): Promise<Verification> {
  const { data, error } = await supabase
    .from('clarity_verifications')
    .update({ position })
    .eq('id', verificationId)
    .select()
    .single();

  if (error) {
    console.error('Error setting position:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Set position:', data);
  return mapVerificationFromDb(data);
}

/**
 * Requests an explanation (paraphrase) on a message.
 * Only the message author can request this.
 * Auto-cancels any existing request by the same author on other messages.
 * @param messageId - The message UUID to request explanation for
 * @param sessionId - The session UUID (for auto-canceling other requests)
 * @param authorName - The name of the message author (for validation)
 * @returns The updated message
 */
export async function requestExplanation(
  messageId: string,
  sessionId: string,
  authorName: string
): Promise<ChatMessage> {
  // First, verify this is the author's own message
  const { data: message, error: fetchError } = await supabase
    .from('clarity_chat_messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (fetchError || !message) {
    throw new Error('Message not found');
  }

  if (message.author_name !== authorName) {
    throw new Error('Only message author can request explanation');
  }

  // Auto-cancel any existing requests by this author in this session
  // (implements the auto-swap behavior)
  await supabase
    .from('clarity_chat_messages')
    .update({ explanation_requested_at: null })
    .eq('session_id', sessionId)
    .eq('author_name', authorName)
    .not('explanation_requested_at', 'is', null);

  // Set the request on the target message
  const { data, error } = await supabase
    .from('clarity_chat_messages')
    .update({ explanation_requested_at: new Date().toISOString() })
    .eq('id', messageId)
    .select()
    .single();

  if (error) {
    console.error('Error requesting explanation:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Requested explanation for message:', messageId);
  return mapChatMessageFromDb(data);
}

/**
 * Cancels an explanation request on a message.
 * Only the message author can cancel their request.
 * @param messageId - The message UUID
 * @param authorName - The name of the message author (for validation)
 * @returns The updated message
 */
export async function cancelExplanationRequest(
  messageId: string,
  authorName: string
): Promise<ChatMessage> {
  // Verify ownership
  const { data: message, error: fetchError } = await supabase
    .from('clarity_chat_messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (fetchError || !message) {
    throw new Error('Message not found');
  }

  if (message.author_name !== authorName) {
    throw new Error('Only message author can cancel explanation request');
  }

  const { data, error } = await supabase
    .from('clarity_chat_messages')
    .update({ explanation_requested_at: null })
    .eq('id', messageId)
    .select()
    .single();

  if (error) {
    console.error('Error canceling explanation request:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Canceled explanation request for message:', messageId);
  return mapChatMessageFromDb(data);
}

/**
 * Subscribes to chat message updates in a session.
 * Used to detect explanation request changes.
 * @param sessionId - The session UUID
 * @param onUpdate - Callback when a message is updated
 * @returns Unsubscribe function
 */
export function subscribeToChatMessageUpdates(
  sessionId: string,
  onUpdate: (message: ChatMessage) => void
): () => void {
  const channel = supabase
    .channel(`chat_message_updates:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'clarity_chat_messages',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        console.log('📡 Chat message updated:', payload);
        if (payload.new) {
          onUpdate(mapChatMessageFromDb(payload.new as DbChatMessage));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to verification updates for a session.
 * @param sessionId - The session UUID
 * @param onUpdate - Callback when verification is created or updated
 * @returns Unsubscribe function
 */
export function subscribeToVerifications(
  sessionId: string,
  onUpdate: (verification: Verification, event: 'INSERT' | 'UPDATE') => void
): () => void {
  // We need to listen to all verifications, then filter by session
  // This is a limitation - ideally we'd filter by session_id directly
  // but verifications don't have session_id, they have message_id
  const channel = supabase
    .channel(`verifications:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'clarity_verifications',
      },
      async (payload) => {
        console.log('📡 Verification update:', payload);
        if (payload.new && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')) {
          const v = mapVerificationFromDb(payload.new as DbVerification);
          // Check if this verification belongs to this session
          const { data: msg } = await supabase
            .from('clarity_chat_messages')
            .select('session_id')
            .eq('id', v.messageId)
            .single();

          if (msg?.session_id === sessionId) {
            onUpdate(v, payload.eventType);
          }
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// IDEA FEED API (P19.3 - Orphan Ideas)
// ============================================================================

/**
 * Maps database feed idea to frontend type.
 */
function mapFeedIdeaFromDb(db: DbFeedIdea): FeedIdea {
  return {
    id: db.id,
    content: db.content,
    originatorName: db.originator_name,
    originatorSessionId: db.originator_session_id,
    provenanceType: db.provenance_type,
    sourceSessionId: db.source_session_id,
    sourceMessageId: db.source_message_id,
    sourceCommentId: db.source_comment_id,
    visibility: db.visibility,
    createdAt: db.created_at,
  };
}

/**
 * Maps database vote to frontend type.
 */
function mapIdeaVoteFromDb(db: DbIdeaVote): IdeaVote {
  return {
    id: db.id,
    ideaId: db.idea_id,
    voterSessionId: db.voter_session_id,
    voterName: db.voter_name,
    vote: db.vote,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Maps database comment to frontend type.
 */
function mapIdeaCommentFromDb(db: DbIdeaComment): IdeaComment {
  return {
    id: db.id,
    ideaId: db.idea_id,
    authorSessionId: db.author_session_id,
    authorName: db.author_name,
    content: db.content,
    elevatedToIdeaId: db.elevated_to_idea_id,
    createdAt: db.created_at,
  };
}

// In-memory fallback for when localStorage is unavailable
let inMemorySessionId: string | null = null;
let inMemoryUserName: string | null = null;
let isUsingInMemoryFallback = false;

/**
 * Checks if the app is running in a storage-limited mode (e.g., private browsing).
 * When true, votes and identity will not persist across page refreshes.
 */
export function isPrivateBrowsingMode(): boolean {
  return isUsingInMemoryFallback;
}

/**
 * Gets or creates an anonymous session ID for the feed.
 * Stored in localStorage, used to track votes and authorship.
 * Falls back to in-memory storage if localStorage is unavailable
 * (e.g., Safari private mode, storage quota exceeded).
 *
 * WARNING: In private browsing mode, refreshing the page will create a new session ID,
 * causing the user to appear as a new voter. This is a known limitation.
 */
export function getFeedSessionId(): string {
  const STORAGE_KEY = 'clarity_feed_session_id';

  try {
    let sessionId = localStorage.getItem(STORAGE_KEY);

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, sessionId);
      // Verify write succeeded (Safari private mode may silently fail)
      if (localStorage.getItem(STORAGE_KEY) !== sessionId) {
        throw new Error('localStorage write failed');
      }
    }

    isUsingInMemoryFallback = false;
    return sessionId;
  } catch {
    // localStorage unavailable - use in-memory fallback
    isUsingInMemoryFallback = true;
    if (!inMemorySessionId) {
      inMemorySessionId = crypto.randomUUID();
      console.warn('⚠️ Private browsing detected: votes will not persist across page refreshes');
    }
    return inMemorySessionId;
  }
}

/**
 * Gets or creates a user name for the feed.
 * Prompts for name on first use, stores in localStorage.
 * Falls back to in-memory storage if localStorage is unavailable.
 */
export function getFeedUserName(): string | null {
  const STORAGE_KEY = 'clarity_feed_user_name';
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return inMemoryUserName;
  }
}

/**
 * Sets the user name for the feed.
 * Falls back to in-memory storage if localStorage is unavailable.
 */
export function setFeedUserName(name: string): void {
  const STORAGE_KEY = 'clarity_feed_user_name';
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    inMemoryUserName = name;
  }
}

/**
 * Gets public feed ideas with vote counts.
 * @param limit - Max number of ideas to fetch
 * @param offset - Number of ideas to skip (for pagination)
 * @returns Array of feed ideas with counts
 */
export async function getFeedIdeas(
  limit: number = 20,
  offset: number = 0
): Promise<FeedIdea[]> {
  const sessionId = getFeedSessionId();

  // Fetch ideas
  const { data: ideas, error } = await supabase
    .from('clarity_feed_ideas')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching feed ideas:', error.message);
    return [];
  }

  if (!ideas || ideas.length === 0) {
    return [];
  }

  // Fetch vote counts and user votes in parallel
  const ideaIds = ideas.map((i) => i.id);

  const [votesResult, userVotesResult, commentsResult] = await Promise.all([
    // Get all votes for vote counts
    supabase
      .from('clarity_idea_votes')
      .select('idea_id, vote')
      .in('idea_id', ideaIds),
    // Get current user's votes
    supabase
      .from('clarity_idea_votes')
      .select('idea_id, vote')
      .in('idea_id', ideaIds)
      .eq('voter_session_id', sessionId),
    // Get comment counts
    supabase
      .from('clarity_idea_comments')
      .select('idea_id')
      .in('idea_id', ideaIds),
  ]);

  // Compute vote counts per idea
  const voteCounts: Record<string, { agree: number; disagree: number; dont_know: number }> = {};
  (votesResult.data || []).forEach((v) => {
    if (!voteCounts[v.idea_id]) {
      voteCounts[v.idea_id] = { agree: 0, disagree: 0, dont_know: 0 };
    }
    voteCounts[v.idea_id][v.vote as FeedVote]++;
  });

  // Get user's votes per idea
  const userVotes: Record<string, FeedVote> = {};
  (userVotesResult.data || []).forEach((v) => {
    userVotes[v.idea_id] = v.vote as FeedVote;
  });

  // Get comment counts per idea
  const commentCounts: Record<string, number> = {};
  (commentsResult.data || []).forEach((c) => {
    commentCounts[c.idea_id] = (commentCounts[c.idea_id] || 0) + 1;
  });

  return ideas.map((db) => {
    const idea = mapFeedIdeaFromDb(db);
    const counts = voteCounts[db.id] || { agree: 0, disagree: 0, dont_know: 0 };
    return {
      ...idea,
      agreeCount: counts.agree,
      disagreeCount: counts.disagree,
      dontKnowCount: counts.dont_know,
      commentCount: commentCounts[db.id] || 0,
      userVote: userVotes[db.id],
    };
  });
}

/**
 * Gets a single feed idea by ID with full data.
 * @param ideaId - The idea UUID
 * @returns The idea or null if not found
 */
export async function getFeedIdea(ideaId: string): Promise<FeedIdea | null> {
  const sessionId = getFeedSessionId();

  const { data, error } = await supabase
    .from('clarity_feed_ideas')
    .select('*')
    .eq('id', ideaId)
    .single();

  if (error || !data) {
    console.error('Error fetching feed idea:', error?.message);
    return null;
  }

  // Get vote counts
  const { data: votes } = await supabase
    .from('clarity_idea_votes')
    .select('vote')
    .eq('idea_id', ideaId);

  const voteCounts = { agree: 0, disagree: 0, dont_know: 0 };
  (votes || []).forEach((v) => {
    voteCounts[v.vote as FeedVote]++;
  });

  // Get user's vote
  const { data: userVote } = await supabase
    .from('clarity_idea_votes')
    .select('vote')
    .eq('idea_id', ideaId)
    .eq('voter_session_id', sessionId)
    .single();

  // Get comment count
  const { count: commentCount } = await supabase
    .from('clarity_idea_comments')
    .select('*', { count: 'exact', head: true })
    .eq('idea_id', ideaId);

  const idea = mapFeedIdeaFromDb(data);
  return {
    ...idea,
    agreeCount: voteCounts.agree,
    disagreeCount: voteCounts.disagree,
    dontKnowCount: voteCounts.dont_know,
    commentCount: commentCount || 0,
    userVote: userVote?.vote as FeedVote | undefined,
  };
}

/**
 * Creates a new feed idea.
 * @param content - The idea text
 * @param originatorName - Name of the person creating the idea
 * @param provenance - Where the idea came from
 * @returns The created idea
 */
export async function createFeedIdea(
  content: string,
  originatorName: string,
  provenance: {
    type: ProvenanceType;
    sourceSessionId?: string;
    sourceMessageId?: string;
    sourceCommentId?: string;
  } = { type: 'direct' }
): Promise<FeedIdea> {
  // Validate inputs
  const validatedContent = validateContentLength(content, MAX_IDEA_LENGTH, 'Idea content');
  const validatedName = validateContentLength(originatorName, MAX_NAME_LENGTH, 'Name');

  const sessionId = getFeedSessionId();

  const { data, error } = await supabase
    .from('clarity_feed_ideas')
    .insert({
      content: validatedContent,
      originator_name: validatedName,
      originator_session_id: sessionId,
      provenance_type: provenance.type,
      source_session_id: provenance.sourceSessionId,
      source_message_id: provenance.sourceMessageId,
      source_comment_id: provenance.sourceCommentId,
      visibility: 'public',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating feed idea:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Created feed idea:', data);
  return {
    ...mapFeedIdeaFromDb(data),
    agreeCount: 0,
    disagreeCount: 0,
    dontKnowCount: 0,
    commentCount: 0,
  };
}

/**
 * Votes on a feed idea (creates or updates vote).
 * Records vote history when changing vote.
 * @param ideaId - The idea UUID
 * @param vote - The vote to cast
 * @param voterName - Name of the voter
 * @returns The vote record
 */
export async function voteOnIdea(
  ideaId: string,
  vote: FeedVote,
  voterName: string
): Promise<IdeaVote> {
  // Validate inputs
  const validatedName = validateContentLength(voterName, MAX_NAME_LENGTH, 'Name');

  const sessionId = getFeedSessionId();

  // Check if user already voted
  const { data: existingVote } = await supabase
    .from('clarity_idea_votes')
    .select('*')
    .eq('idea_id', ideaId)
    .eq('voter_session_id', sessionId)
    .single();

  if (existingVote) {
    // Record history if changing vote
    if (existingVote.vote !== vote) {
      await supabase.from('clarity_idea_vote_history').insert({
        vote_id: existingVote.id,
        idea_id: ideaId,
        voter_session_id: sessionId,
        voter_name: existingVote.voter_name,
        vote: existingVote.vote,
      });
    }

    // Update existing vote
    const { data, error } = await supabase
      .from('clarity_idea_votes')
      .update({ vote, updated_at: new Date().toISOString() })
      .eq('id', existingVote.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating vote:', error.message);
      throw new Error(error.message);
    }

    console.log('✅ Updated vote:', data);
    return mapIdeaVoteFromDb(data);
  }

  // Create new vote
  const { data, error } = await supabase
    .from('clarity_idea_votes')
    .insert({
      idea_id: ideaId,
      voter_session_id: sessionId,
      voter_name: validatedName,
      vote,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating vote:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Created vote:', data);
  return mapIdeaVoteFromDb(data);
}

/**
 * Gets all voters for an idea.
 * @param ideaId - The idea UUID
 * @returns Array of votes
 */
export async function getIdeaVoters(ideaId: string): Promise<IdeaVote[]> {
  const { data, error } = await supabase
    .from('clarity_idea_votes')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching voters:', error.message);
    return [];
  }

  return (data || []).map(mapIdeaVoteFromDb);
}

/**
 * Gets vote history for a specific vote.
 * @param voteId - The vote UUID
 * @returns Array of vote history entries
 */
export async function getVoteHistory(voteId: string): Promise<IdeaVoteHistory[]> {
  const { data, error } = await supabase
    .from('clarity_idea_vote_history')
    .select('*')
    .eq('vote_id', voteId)
    .order('changed_at', { ascending: true })
    .limit(100); // Prevent unbounded queries

  if (error) {
    console.error('Error fetching vote history:', error.message);
    return [];
  }

  // Map to IdeaVoteHistory format
  return (data || []).map((db) => ({
    id: db.id,
    voteId: db.vote_id,
    ideaId: db.idea_id,
    voterSessionId: db.voter_session_id,
    voterName: db.voter_name,
    vote: db.vote as FeedVote,
    changedAt: db.changed_at,
  }));
}

/**
 * Gets comments for an idea.
 * @param ideaId - The idea UUID
 * @returns Array of comments
 */
export async function getIdeaComments(ideaId: string): Promise<IdeaComment[]> {
  const { data, error } = await supabase
    .from('clarity_idea_comments')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching comments:', error.message);
    return [];
  }

  return (data || []).map(mapIdeaCommentFromDb);
}

/**
 * Adds a comment to an idea.
 * @param ideaId - The idea UUID
 * @param authorName - Name of the commenter
 * @param content - Comment text
 * @returns The created comment
 */
export async function addIdeaComment(
  ideaId: string,
  authorName: string,
  content: string
): Promise<IdeaComment> {
  // Validate inputs
  const validatedContent = validateContentLength(content, MAX_COMMENT_LENGTH, 'Comment');
  const validatedName = validateContentLength(authorName, MAX_NAME_LENGTH, 'Name');

  const sessionId = getFeedSessionId();

  const { data, error } = await supabase
    .from('clarity_idea_comments')
    .insert({
      idea_id: ideaId,
      author_session_id: sessionId,
      author_name: validatedName,
      content: validatedContent,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding comment:', error.message);
    throw new Error(error.message);
  }

  console.log('✅ Added comment:', data);
  return mapIdeaCommentFromDb(data);
}

/**
 * Elevates a comment to a new idea.
 * @param commentId - The comment UUID
 * @param authorName - Name for the new idea
 * @returns The new feed idea
 */
export async function elevateCommentToIdea(
  commentId: string,
  authorName: string
): Promise<FeedIdea> {
  // Get the comment
  const { data: comment, error: commentError } = await supabase
    .from('clarity_idea_comments')
    .select('*')
    .eq('id', commentId)
    .single();

  if (commentError || !comment) {
    throw new Error('Comment not found');
  }

  // Create new idea from comment
  const newIdea = await createFeedIdea(comment.content, authorName, {
    type: 'elevated_comment',
    sourceCommentId: commentId,
  });

  // Link the comment to the new idea
  await supabase
    .from('clarity_idea_comments')
    .update({ elevated_to_idea_id: newIdea.id })
    .eq('id', commentId);

  return newIdea;
}

/**
 * Subscribes to realtime feed updates (new ideas, votes, comments).
 * @param onNewIdea - Callback for new ideas
 * @param onVoteChange - Callback for vote changes
 * @returns Unsubscribe function
 */
export function subscribeToFeed(
  onNewIdea?: (idea: FeedIdea) => void,
  onVoteChange?: (ideaId: string) => void
): () => void {
  const channels: ReturnType<typeof supabase.channel>[] = [];

  // Subscribe to new ideas
  if (onNewIdea) {
    const ideasChannel = supabase
      .channel('feed_ideas')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'clarity_feed_ideas',
          filter: 'visibility=eq.public',
        },
        (payload) => {
          console.log('📡 New feed idea:', payload);
          if (payload.new) {
            const idea = mapFeedIdeaFromDb(payload.new as DbFeedIdea);
            onNewIdea({
              ...idea,
              agreeCount: 0,
              disagreeCount: 0,
              dontKnowCount: 0,
              commentCount: 0,
            });
          }
        }
      )
      .subscribe();
    channels.push(ideasChannel);
  }

  // Subscribe to vote changes
  if (onVoteChange) {
    const votesChannel = supabase
      .channel('feed_votes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clarity_idea_votes',
        },
        (payload) => {
          console.log('📡 Vote change:', payload);
          const ideaId = (payload.new as DbIdeaVote)?.idea_id || (payload.old as DbIdeaVote)?.idea_id;
          if (ideaId) {
            onVoteChange(ideaId);
          }
        }
      )
      .subscribe();
    channels.push(votesChannel);
  }

  return () => {
    channels.forEach((channel) => supabase.removeChannel(channel));
  };
}

// ============================================================================
// LIVE CLARITY MEETINGS API (P23)
// ============================================================================

import type { LiveTurn, DbLiveTurn } from '@/app/types';

// Re-export live types
export type { LiveTurn, LiveFlag } from '@/app/types';

/**
 * Maps database live turn to frontend type.
 */
function mapLiveTurnFromDb(db: DbLiveTurn): LiveTurn {
  return {
    id: db.id,
    sessionId: db.session_id,
    ideaId: db.idea_id,
    speakerName: db.speaker_name,
    listenerName: db.listener_name,
    actorName: db.actor_name,
    role: db.role,
    transcript: db.transcript,
    selfRating: db.self_rating,
    otherRating: db.other_rating,
    flag: db.flag,
    roundNumber: db.round_number,
    createdAt: db.created_at,
  };
}

/**
 * Saves a live turn to the database.
 * @param turn - The turn data to save
 * @returns The saved turn with ID
 */
export async function saveLiveTurn(
  turn: Omit<LiveTurn, 'id' | 'createdAt'>
): Promise<LiveTurn> {
  console.log('[Live API] Saving live turn:', turn);

  const { data, error } = await supabase
    .from('clarity_live_turns')
    .insert({
      session_id: turn.sessionId,
      idea_id: turn.ideaId,
      speaker_name: turn.speakerName,
      listener_name: turn.listenerName,
      actor_name: turn.actorName,
      role: turn.role,
      transcript: turn.transcript,
      self_rating: turn.selfRating,
      other_rating: turn.otherRating,
      flag: turn.flag,
      round_number: turn.roundNumber,
    })
    .select()
    .single();

  if (error) {
    console.error('[Live API] Error saving live turn:', error.message, error.code, error.details);
    // Check if table doesn't exist
    if (error.message.includes('relation') || error.code === '42P01') {
      throw new Error('Database migration required: run supabase/migrations/20251223_p23_live_clarity_meetings.sql');
    }
    throw new Error(error.message);
  }

  console.log('[Live API] Saved live turn:', data);
  return mapLiveTurnFromDb(data);
}

/**
 * Gets all live turns for a session.
 * @param sessionId - The session UUID
 * @returns Array of live turns ordered by creation time
 */
export async function getLiveTurns(sessionId: string): Promise<LiveTurn[]> {
  const { data, error } = await supabase
    .from('clarity_live_turns')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching live turns:', error.message);
    return [];
  }

  return (data || []).map(mapLiveTurnFromDb);
}

/**
 * Subscribes to realtime live turn updates for a session.
 * @param sessionId - The session UUID
 * @param onNewTurn - Callback when a new turn is saved
 * @returns Unsubscribe function
 */
export function subscribeToLiveTurns(
  sessionId: string,
  onNewTurn: (turn: LiveTurn) => void
): () => void {
  const channel = supabase
    .channel(`live_turns:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'clarity_live_turns',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        console.log('📡 New live turn:', payload);
        if (payload.new) {
          onNewTurn(mapLiveTurnFromDb(payload.new as DbLiveTurn));
        }
      }
    )
    .subscribe();

  return () => {
    console.log('📡 Unsubscribing from live turns:', sessionId);
    supabase.removeChannel(channel);
  };
}
