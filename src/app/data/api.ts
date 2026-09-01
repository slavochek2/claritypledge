/**
 * @file api.ts
 * CRITICAL DATA LAYER
 * -------------------
 * This file handles data transport.
 * The `createProfile` function here is an "Initiator" - it only sends the email.
 * It DOES NOT write to the database. Do not add database writes to the signup flow here.
 */
import { supabase } from '@/lib/supabase';
import { earCountOf } from './ear-count';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { CURRENT_PLEDGE_VERSION } from '@/app/content/pledge-text';
import * as Sentry from '@sentry/react';
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
  Event,
  EventWithHost,
  EventAttendee,
  DbEvent,
  SessionTranscript,
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

// Extract a human-readable detail string from an HTTP error body.
// Tries JSON `error` (edge function shape) first, then `message` (Supabase
// gateway shape, e.g. `{ message: 'JWT expired' }`), then falls back to the
// raw text truncated. Returns empty string for empty input.
export function extractErrorDetail(bodyText: string): string {
  if (!bodyText) return '';
  try {
    const j = JSON.parse(bodyText);
    if (typeof j?.error === 'string' && j.error) return j.error;
    if (typeof j?.message === 'string' && j.message) return j.message;
  } catch {
    // not JSON — fall through to raw text
  }
  return bodyText.slice(0, 200);
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
    // P877: profiles.email/linkedin_url/reason are revoked from anon+authenticated.
    // Read through the SECURITY DEFINER accessor: it returns the row owner's email
    // only to the owner, and linkedin_url/reason only for verified+pledged users
    // (public by design) or the owner. Returns NULL (not an error) when no row.
    const { data: profile, error: profileError } = await supabase
      .rpc('get_profile_by_id', { p_id: id });

    if (profileError) {
      console.error('Error fetching profile:', profileError.message);
      return { success: false, error: 'server_error', message: profileError.message };
    }

    if (!profile) {
      return { success: false, error: 'not_found' };
    }

    const { witnesses, reciprocationsCount } = await enrichProfileWithRelations(profile as DbProfile);

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
    // P877: linkedin_url/reason are revoked from anon on the profiles table.
    // get_featured_profiles (SECURITY DEFINER) returns the verified+pledged,
    // non-test set — where those fields are public by design — and never email.
    // p_limit caps the set; the client still sorts reasons-first and enriches
    // with witness counts below. Filters (verified/pledged/test) live in the RPC.
    const { data: profiles, error: profilesError } = await supabase
      .rpc('get_featured_profiles', { p_limit: MAX_FEATURED_PROFILES * 3 }) as
        { data: DbProfileSummary[] | null; error: { message: string } | null };

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

    // mapProfileSummaryFromDb has fallback logic for slug, so all results have valid slugs
    return combined.map(p => mapProfileSummaryFromDb(p, witnessCounts[p.id] || 0, reciprocationCounts[p.id] || 0));
  } catch (err) {
    console.error('Unexpected error in getFeaturedProfiles:', err);
    return [];
  }
}

/**
 * Gets the count of verified profiles.
 * Used for social proof display (e.g., "Join 47 pledgers who've taken the pledge").
 * @returns The count of verified profiles.
 */
export async function getVerifiedProfileCount(): Promise<number> {
  try {
    // P50: Only count verified users who have explicitly signed the pledge
    // P877: count on 'id' (not '*') — '*' would touch the revoked email column.
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_verified', true)
      .eq('has_pledged', true) // P50: Filter out non-pledgers
      .eq('is_test_account', false); // P571: Hide test accounts from count

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
 * This is used to populate the "Pledgers" page, showcasing all users who have completed the pledge process.
 * The function also fetches and attaches all witnesses for each profile.
 * Profiles with reasons are shown first, then those without.
 * @returns A promise that resolves to an array of verified profile objects.
 */
export async function getVerifiedProfiles(): Promise<Profile[]> {
  try {
    // P877: same SECURITY DEFINER accessor as getFeaturedProfiles, with no limit —
    // returns the full verified+pledged, non-test set (linkedin_url/reason public by
    // design for this set; never email). Replaces the direct select('*').
    const { data: profiles, error: profilesError } = await supabase
      .rpc('get_featured_profiles', { p_limit: null }) as
        { data: DbProfile[] | null; error: { message: string } | null };

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

    // Map to Profile objects and filter out any with null slugs (defensive)
    // Verified + pledged users should always have slugs, but filter as safety
    return profilesWithWitnesses
      .map(p => mapProfileFromDb(p))
      .filter((p): p is Profile & { slug: string } => p.slug !== null);
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

  // P50: Add source=pledge param so AuthCallbackPage knows this is a pledge signup
  const redirectUrl = `${window.location.origin}/auth/callback?source=pledge`;

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
export async function signInWithEmail(
  email: string,
  source?: 'signup' | 'pledge' | 'login',
  options?: { redirect?: string; action?: string; name?: string; extraParams?: Record<string, string> }
): Promise<{ error: AuthError | null }> {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (options?.redirect) params.set('redirect', options.redirect);
  if (options?.action) params.set('action', options.action);
  // P458: Forward auth-gate params (pointId, position, pointTitle) through callback URL
  if (options?.extraParams) {
    for (const [key, value] of Object.entries(options.extraParams)) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();
  const redirectUrl = queryString
    ? `${window.location.origin}/auth/callback?${queryString}`
    : `${window.location.origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      // Pass user metadata for signup flow (name for profile creation)
      data: options?.name ? { name: options.name, avatar_color: getRandomColor() } : undefined,
    },
  });
  return { error };
}

/**
 * P64: Check if an email already exists in the profiles table.
 * Used by login form to validate before sending magic link.
 * @param email - The email address to check
 * @returns True if a profile with this email exists, false otherwise
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  // P877: filtering on profiles.email requires column SELECT priv, which is revoked
  // from anon (this runs pre-auth on the login form). email_exists (SECURITY DEFINER)
  // returns only a boolean — the same existence signal, no PII.
  const { data } = await supabase
    .rpc('email_exists', { p_email: email.toLowerCase().trim() });
  return data === true;
}

/**
 * P63/P64: Initiates Google OAuth sign-in flow.
 * User will be redirected to Google's consent screen, then back to /auth/callback.
 * The AuthCallbackPage will handle profile creation/update with Google avatar.
 * @param source - The source of the auth request: 'login', 'signup', or 'pledge'
 * @returns A promise that resolves when the OAuth redirect is initiated.
 */
export async function signInWithGoogle(
  source?: 'login' | 'signup' | 'pledge',
  options?: { redirect?: string; action?: string; extraParams?: Record<string, string> }
): Promise<{ error: AuthError | null }> {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (options?.redirect) params.set('redirect', options.redirect);
  if (options?.action) params.set('action', options.action);
  // P458: Forward auth-gate params (pointId, position, pointTitle) through callback URL
  if (options?.extraParams) {
    for (const [key, value] of Object.entries(options.extraParams)) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();
  const redirectUrl = queryString
    ? `${window.location.origin}/auth/callback?${queryString}`
    : `${window.location.origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        // Let user pick account but skip consent if already granted
        prompt: 'select_account',
      },
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
export async function signOut(options: { scope?: 'global' | 'local' } = {}) {
  await supabase.auth.signOut(options.scope ? { scope: options.scope } : undefined);
}

/**
 * P520: erase the calling user's account — own content deleted, community data
 * (points, events) orphaned, counterparties' rows anonymised, then the auth.users row.
 *
 * The RPC has NO target parameter: it acts only on auth.uid(). After it resolves the
 * server session is already gone, so the caller must sign out with scope 'local' — a
 * global sign-out would round-trip to GoTrue for a user that no longer exists.
 *
 * @returns the RPC's per-step row counts (e.g. `stories_deleted`, `points_orphaned`),
 *   or an error. A non-null error means NOTHING was erased — the function is one
 *   transaction.
 */
export async function eraseMyAccount(): Promise<{ counts: Record<string, unknown> | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('erase_my_account');
  if (error) {
    console.error('Error in erase_my_account:', error.message);
    return { counts: null, error: new Error(error.message) };
  }
  return { counts: (data as Record<string, unknown> | null) ?? null, error: null };
}

/**
 * Maps a partial database profile (without email/witnesses) to ProfileSummary.
 * Used for list views like featured profiles and pledgers page.
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
    avatarUrl: dbProfile.avatar_url, // P63: Google OAuth avatar
    avatarProvider: dbProfile.avatar_provider, // P63: Avatar source
    witnessCount,
    reciprocations,
  };
}

/**
 * Maps data from the database (snake_case) to the frontend-friendly `Profile` interface (camelCase).
 * It also ensures a valid slug exists, generating one from the user's name if necessary.
 * Applies zero validation — feed it output from the P877 SECURITY DEFINER accessors
 * (get_profile_by_id, get_profile_by_slug, etc.), never a raw `profiles.select()` row;
 * those column-gated rows won't carry email, and this function will silently coalesce
 * it to ''.
 * @param dbProfile - The database profile row
 * @param reciprocations - Count of profiles where this user is a witness (how many people they've inspired)
 */
// P1133: exported (was module-private) so isTestAccount plumbing can be
// unit-tested as a pure function, without mocking Supabase (see
// src/tests/events-api.test.ts's precedent for why). Test-only export — no other
// caller exists in src/, e2e/, or scripts/ as of this writing.
export function mapProfileFromDb(dbProfile: DbProfile, reciprocations: number = 0): Profile {
  // P50: Preserve null slugs for /live users who haven't verified yet
  // Only use DB slug - do NOT auto-generate from name
  // Null slug means user hasn't completed verification/pledge flow
  const slug = dbProfile.slug && dbProfile.slug.trim() !== '' ? dbProfile.slug : null;

  return {
    id: dbProfile.id,
    slug,
    name: dbProfile.name || 'Anonymous',
    // P877: email is omitted by the public accessors (only the owner's own row carries
    // it). Coalesce to '' so list/other-user profiles satisfy the required string type.
    email: dbProfile.email ?? '',
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
    avatarUrl: dbProfile.avatar_url, // P63: Google OAuth avatar
    avatarProvider: dbProfile.avatar_provider, // P63: Avatar source
    pledgeVersion: dbProfile.pledge_version ?? CURRENT_PLEDGE_VERSION,
    hasPledged: dbProfile.has_pledged ?? true, // P50: Default true for existing users
    bio: dbProfile.bio ?? null, // P414: Short self-description
    bannerUrl: dbProfile.banner_url ?? undefined, // P504: AI-generated profile banner
    bannerGenerationAttempted: dbProfile.banner_generation_attempted ?? false, // P504
    isTestAccount: dbProfile.is_test_account ?? false, // P1133: Mixpanel is_internal tagging
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
    // P985: fold Latin diacritics to ASCII (José → Jose) so slugs stay clean.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .toLowerCase()
    .trim()
    // P985: keep letters/numbers of ANY script (Unicode-aware). The old ASCII-only
    // `\w` stripped non-Latin names (e.g. Chinese) down to "", persisting slug="".
    // Non-Latin scripts survive here as a non-empty fallback; the persisted slug is
    // romanized separately via slugifyName() below.
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // Remove special characters (Unicode-aware)
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/--+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens (P985)
}

/**
 * P985: Romanized slug for persistence. Transliterates any script to ASCII
 * (李明 → "li-ming", José García → "jose-garcia", Анна → "anna") so profile URLs
 * are clean and shareable regardless of the name's script.
 *
 * The `transliteration` package (~186 KB with the full CJK charmap) is dynamically
 * imported so it stays OUT of the initial bundle — it loads only on the signup/slug
 * path, which is already async. Returns "" for a name with no romanizable characters
 * (e.g. all-emoji); callers fall back to a `user-<timestamp>` slug in that case.
 */
export async function slugifyName(name: string): Promise<string> {
  const { slugify } = await import('transliteration');
  return slugify(name);
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
    // P880: has_pledged is NO LONGER writable here — the profiles guard trigger pins
    // is_verified/has_pledged on client-role writes. Use setMyPledge() (below), which
    // routes through the server-controlled set_my_pledge() accessor.
    // P930: pledge_version IS client-writable (not a P880 trust column; the P571 UPDATE
    // policy WITH CHECK pins only is_test_account). The pledge ACTION writes CURRENT here.
    pledge_version?: number;
    bio?: string; // P414: Short self-description, max 160 chars
    banner_url?: string | null; // P504: AI-generated profile banner
    banner_generation_attempted?: boolean; // P504: Whether banner generation was attempted
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
 * P880: Marks the current authenticated caller as verified, server-side.
 *
 * `profiles.is_verified` is a trust field pinned by a DB guard trigger — clients cannot
 * write it directly. This routes through the `mark_self_verified()` SECURITY DEFINER
 * accessor, which only flips is_verified to true when Supabase Auth reports the caller's
 * email as confirmed (an unconfirmed / anonymous session cannot self-verify).
 *
 * @returns `verified: true` when the caller is now verified; `false` when the email was
 *   not confirmed. `error` is set only on an unexpected RPC failure.
 */
export async function markSelfVerified(): Promise<{ verified: boolean; error: Error | null }> {
  const { data, error } = await supabase.rpc('mark_self_verified');
  if (error) {
    console.error('Error in mark_self_verified:', error.message);
    return { verified: false, error: new Error(error.message) };
  }
  return { verified: data === true, error: null };
}

/**
 * P1093: Replays the caller's staged letter positions into the live `point_positions`
 * store.
 *
 * A reader who answers a letter before verifying has their positions written to the
 * `letter_point_responses` staging buffer only — the `point_positions` write fails RLS
 * (`is_verified = true` required) and is deliberately swallowed at that point (P705).
 * This lifts those staged rows once the caller becomes verified.
 *
 * Takes no arguments by design. The RPC derives the caller from `auth.uid()`, their
 * deliveries from `receiver_profile_id`, and the positions from rows already staged
 * against those deliveries — so there is no payload a caller could forge. The writer
 * this replaces accepted all of it from the client and checked none of it.
 *
 * @returns `replayed` — how many staged positions became live on this call. Zero is the
 *   normal result for a caller with nothing staged, and is not an error.
 */
export async function replayLetterPositions(): Promise<{ replayed: number; error: Error | null }> {
  const { data, error } = await supabase.rpc('replay_letter_positions');
  if (error) {
    console.error('Error in replay_letter_positions:', error.message);
    return { replayed: 0, error: new Error(error.message) };
  }
  return { replayed: typeof data === 'number' ? data : 0, error: null };
}

/**
 * P880: Sets the current authenticated caller's pledge state, server-side.
 *
 * `profiles.has_pledged` is a trust field pinned by a DB guard trigger — clients cannot
 * write it directly. This routes through the `set_my_pledge()` SECURITY DEFINER accessor.
 * Pledging (`pledged: true`) requires the caller to already be verified; withdrawal
 * (`pledged: false`) always succeeds for the owner.
 *
 * @returns `applied: true` when the transition was applied; `false` when a `true`
 *   transition was rejected because the caller is not yet verified.
 */
export async function setMyPledge(pledged: boolean): Promise<{ applied: boolean; error: Error | null }> {
  const { data, error } = await supabase.rpc('set_my_pledge', { p_pledged: pledged });
  if (error) {
    console.error('Error in set_my_pledge:', error.message);
    return { applied: false, error: new Error(error.message) };
  }
  return { applied: data === true, error: null };
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
    // P877: read via the SECURITY DEFINER accessor (column REVOKE on profiles).
    // Returns NULL (not an error) when no row matches the slug.
    const { data: profile, error: profileError } = await supabase
      .rpc('get_profile_by_slug', { p_slug: slug });

    if (profileError) {
      console.error('Error fetching profile by slug:', profileError.message);
      return { success: false, error: 'server_error', message: profileError.message };
    }

    if (!profile) {
      return { success: false, error: 'not_found' };
    }

    const { witnesses, reciprocationsCount } = await enrichProfileWithRelations(profile as DbProfile);

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

// P1097: the room code is no longer minted here. It is a bearer capability (P1053), and a
// client-side Math.random() draw is the wrong class of generator for one. The database
// mints it on INSERT (BEFORE INSERT trigger → mint_clarity_room_code(), CSPRNG over the
// same 32-char alphabet) and the client cannot supply one — Migration B revokes INSERT on
// the column. createClaritySession learns the minted code via get_room_code_for_invite.

/**
 * Maps database session to frontend ClaritySession type.
 *
 * P1057: `knownCode` is REQUIRED, and that is the entire point of this signature.
 *
 * After the column-level SELECT gate, no row read by anon/authenticated carries `code`.
 * Every caller of the code-keyed reads already holds the code (it came from the URL, the
 * join form, sessionStorage, or was minted locally), so the value is spliced back in here —
 * at ONE place rather than at each of the six call sites.
 *
 * The parameter is required rather than optional because the failure mode of a missed
 * splice is silent, not loud: `code: undefined` sends GCS audio chunks to a path segment of
 * '' (clarity-live-page uploadSingleChunk) and navigates the creator to /live/undefined.
 * Nothing throws. Making it required converts every miss into a build-time type error —
 * the compiler enumerates the call sites so a human does not have to.
 *
 * Pass '' explicitly, never by omission, where a caller genuinely has no code.
 */
function mapSessionFromDb(dbSession: DbClaritySession, knownCode: string): ClaritySession {
  return {
    id: dbSession.id,
    // Rows from SECURITY DEFINER functions (claim_joiner_seat) still carry `code` because
    // they run as owner; direct reads no longer do. Prefer the row, fall back to the splice.
    code: dbSession.code ?? knownCode,
    creatorName: dbSession.creator_name,
    creatorNote: dbSession.creator_note,
    joinerName: dbSession.joiner_name,
    creatorProfileId: dbSession.creator_profile_id,
    joinerProfileId: dbSession.joiner_profile_id,
    state: dbSession.state,
    demoStatus: dbSession.demo_status,
    partnershipStatus: dbSession.partnership_status,
    createdAt: dbSession.created_at,
    expiresAt: dbSession.expires_at,
    endedAt: dbSession.ended_at,
    // P23: Live Clarity Meetings
    mode: dbSession.mode,
    liveState: dbSession.live_state,
    // P160: Private session mode
    isPrivate: dbSession.is_private ?? false,
    // P511: Last heartbeat timestamp (for zombie session detection)
    lastActivityAt: dbSession.last_activity_at ?? null,
    // P703: Letter-sourced session fields
    sourceLetterId: dbSession.source_letter_id ?? null,
    sourceStoryId: dbSession.source_story_id ?? null,
    targetListenerId: dbSession.target_listener_id ?? null,
    status: dbSession.status ?? null,
  };
}

/**
 * P1057: the explicit read column set for clarity_sessions — every column EXCEPT `code`.
 *
 * A bare `.select()` and `.select('*')` both compile to `select=*`, which raises 42501 once
 * the column-level grant drops `code` (it does NOT silently narrow — P886 is the empirical
 * proof on this codebase: a deployed bundle whose reads used `select('*')` returned 403 for
 * ~1.5h once the equivalent gate applied to `profiles`).
 *
 * Kept in one constant so a future ADD COLUMN is added here once, not at each read site.
 * Must stay in sync with the GRANT SELECT list in the P1057 revoke migration.
 */
const CLARITY_SESSION_COLUMNS =
  'id, creator_name, creator_note, joiner_name, joiner_profile_id, creator_profile_id, ' +
  'state, demo_status, partnership_status, created_at, expires_at, ended_at, mode, ' +
  'live_state, is_private, last_activity_at, source_letter_id, source_story_id, ' +
  'target_listener_id, status, joiner_seat_claimed_at';

/** P703: Optional letter-sourced fields for createClaritySession. */
export interface LetterSessionOpts {
  sourceLetterId: string;
  sourceStoryId: string;
  targetListenerId: string;
}

/**
 * Creates a new Clarity Partners session.
 * @param creatorName - Name of the session creator
 * @param creatorProfileId - Optional profile ID of the authenticated creator
 * @param isPrivate - When true, session skips audio/events upload for ML training
 * @param creatorNote - Optional note explaining why the partner is being invited
 * @param letterOpts - P703: Letter-sourced session opts (pre-loaded /live)
 * @returns The created session, with its server-minted code (P1097)
 *
 * P1097: `creatorProfileId` must be the CURRENT user's id for the code to be returned —
 * the minted code is revealed through the creator-bound get_room_code_for_invite RPC.
 */
export async function createClaritySession(
  creatorName: string,
  creatorProfileId?: string,
  isPrivate = false,
  creatorNote?: string,
  letterOpts?: LetterSessionOpts
): Promise<ClaritySession> {
  // P1097: no `code` in the payload. The server mints it; the retry loop stays for the
  // narrow concurrent case where two inserts draw the same free code in the same instant
  // and the UNIQUE constraint rejects the second — re-running the insert re-draws.
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const letterFields = letterOpts
      ? {
          source_letter_id: letterOpts.sourceLetterId,
          source_story_id: letterOpts.sourceStoryId,
          target_listener_id: letterOpts.targetListenerId,
        }
      : {};
    const { data, error } = await supabase
      .from('clarity_sessions')
      .insert({
        creator_name: creatorName,
        creator_note: creatorNote,
        creator_profile_id: creatorProfileId ?? null,
        state: {},
        demo_status: 'waiting',
        partnership_status: 'pending',
        is_private: isPrivate,
        ...letterFields,
      })
      // P1057: was a bare `.select()` — which is `select=*`, and INSERT … RETURNING *
      // requires SELECT on every returned column. After the gate that 42501s and throws
      // below (the retry loop only catches 23505), taking all three creator entry points
      // down. `code` is not in this list and cannot be: the column is SELECT-revoked.
      .select(CLARITY_SESSION_COLUMNS)
      .single();

    if (!error && data) {
      const sessionId = (data as { id: string }).id;
      // P1097: learn the server-minted code. get_room_code_for_invite (P1057) returns it
      // only to the row's creator_profile_id (or an open invitee) — NULL otherwise, which
      // is why every production caller passes the current user's own id as
      // creatorProfileId. A NULL here is a contract violation, not a soft miss: without
      // the code the creator would be navigated to /live/undefined, silently.
      const { data: mintedCode, error: codeError } = await supabase.rpc('get_room_code_for_invite', {
        p_session_id: sessionId,
      });
      if (codeError || typeof mintedCode !== 'string' || mintedCode.length === 0) {
        console.error('Session created but its code could not be retrieved:', codeError?.message);
        throw new Error(
          codeError?.message ||
            'Session created but its code could not be retrieved — createClaritySession needs the creator profile id'
        );
      }
      // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
      if (import.meta.env.DEV) console.log('✅ Created clarity session:', mintedCode);
      // Splice the code onto the row (the row itself cannot carry it — see mapSessionFromDb).
      // The cast is required because CLARITY_SESSION_COLUMNS is a runtime string, so
      // PostgREST cannot infer the row shape from it (this client has no generated types).
      return mapSessionFromDb(data as unknown as DbClaritySession, mintedCode);
    }

    // Unique violation: a concurrent insert won the same draw. Re-run; the server re-draws.
    if (error?.code === '23505') {
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
 * @param joinerProfileId - Optional profile ID of the authenticated joiner
 * @returns The updated session or null if not found
 */
export async function joinClaritySession(
  code: string,
  joinerName: string,
  joinerProfileId?: string
): Promise<ClaritySession | null> {
  const normalizedCode = code.toUpperCase().trim();

  // First check if session exists and is joinable.
  //
  // P1057: was `.select('*').eq('code', …)`. Both halves break once `code` is ungranted —
  // referencing a column in WHERE requires SELECT privilege on it, so the filter fails even
  // though the projection is what people notice. get_session_by_code is SECURITY DEFINER and
  // resolves the code server-side; it deliberately does NOT filter out ended rooms, because
  // the P921 guard below needs to SEE an ended session to route to the right screen.
  const { data: preflight, error: fetchError } = await supabase.rpc('get_session_by_code', {
    p_code: normalizedCode,
  });

  // RETURNS TABLE — PostgREST delivers an array.
  const existing = (Array.isArray(preflight) ? preflight[0] : preflight) as
    | DbClaritySession
    | undefined;

  if (fetchError || !existing) {
    return null;
  }

  // P921: Never (re)join an already-ended session. Without this guard a cold
  // link to a dead room writes joiner_name and returns it, so the page routes
  // join → live → PartnerLeftScreen. Return the row WITHOUT writing so the
  // caller can detect the ended state and route to SessionEndedScreen instead.
  const existingLiveState = existing.live_state as Record<string, unknown> | null;
  if (existingLiveState?.sessionEnded === true || existingLiveState?.joinerEnded === true) {
    return mapSessionFromDb(existing, normalizedCode);
  }

  // P1053: the occupancy check and the name-equality rejoin that used to live here are
  // GONE, deliberately.
  //
  // The occupancy check was client-side JavaScript — the only thing standing between any
  // caller and a stranger's joiner seat. It now lives inside claim_joiner_seat, which holds
  // a row lock while it checks, so two racing claimers cannot both win.
  //
  // The name-equality rejoin (`existing.joiner_name === joinerName`) is removed because
  // joiner_name is readable by anon: anyone holding the code could read the seated joiner's
  // name, resubmit it, and be handed the session. Rejoin is now decided server-side by
  // auth.uid() matching joiner_profile_id.
  //
  // joinerProfileId is intentionally NOT sent. The RPC derives the participant from
  // auth.uid() inside SECURITY DEFINER, so a caller can no longer nominate who occupies the
  // seat — that is the whole exploit. The parameter is retained for call-site compatibility
  // and telemetry only.
  const { data, error } = await supabase.rpc('claim_joiner_seat', {
    p_code: normalizedCode,
    p_joiner_name: joinerName,
  });

  // RETURNS SETOF clarity_sessions — PostgREST delivers an array.
  const claimed = Array.isArray(data) ? data[0] : data;

  if (error || !claimed) {
    console.error('Error joining session:', error?.message, error?.code);
    // P1047/P1053: this is the sole enforcement point on the join path, and its failure is
    // indistinguishable from a full room at the UI layer — the caller renders "Session not
    // found or already full" (clarity-live-page.tsx), after the mic prompt was already
    // granted. Without this capture a 42501 produces zero telemetry. Matches the P525
    // pattern used by updateLiveState and patchLiveState below.
    //
    // P1053 Security Review: the room code is now the authorization capability (it is the
    // bearer token claim_joiner_seat accepts), so sending it to Sentry in cleartext — on
    // precisely the error path this change makes more common — is credential logging.
    // Report a non-reversible discriminator instead; the capture itself stays, because it
    // is the only telemetry on this path.
    try {
      Sentry.captureException(
        new Error(`[Join API] joinClaritySession: ${error?.message ?? 'no row returned'}`),
        { extra: { code: error?.code, details: error?.details, codeLength: normalizedCode.length, hasProfileId: joinerProfileId != null } }
      );
    } catch { /* */ }
    return null;
  }

  return mapSessionFromDb(claimed, normalizedCode);
}

/**
 * Gets a Clarity Partners session by room code.
 * @param code - The 6-character room code
 * @returns The session or null if not found
 */
export async function getClaritySession(code: string): Promise<ClaritySession | null> {
  const normalizedCode = code.toUpperCase().trim();

  // P1057: `code` is no longer client-readable, so neither the projection nor the `.eq`
  // filter survives — both need SELECT privilege on the column. Resolved server-side.
  const { data, error } = await supabase.rpc('get_session_by_code', {
    p_code: normalizedCode,
  });

  const row = (Array.isArray(data) ? data[0] : data) as DbClaritySession | undefined;

  if (error || !row) {
    return null;
  }

  return mapSessionFromDb(row, normalizedCode);
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

  const { error } = await supabase
    .from('clarity_sessions')
    .update({ live_state: liveState, mode: 'live' })
    .eq('id', sessionId);

  if (error) {
    console.error('[Live API] Error updating live state:', error.message, error.code, error.details);
    // P525: Capture in Sentry for visibility
    try { Sentry.captureException(new Error(`[Live API] updateLiveState: ${error.message}`), { extra: { code: error.code, details: error.details, sessionId } }); } catch { /* */ }
    // Check if this might be a missing column error
    if (error.message.includes('column') || error.code === '42703') {
      throw new Error('Database migration required: run supabase/migrations/20251223_p23_live_clarity_meetings.sql');
    }
    throw new Error(error.message);
  }
}

/**
 * P399: Atomically merges partial updates into the live_state JSON column.
 *
 * Uses the patch_live_state Postgres function (jsonb || merge) so only the
 * provided keys are written. All other live_state fields — including
 * selectedStoryData set by the partner — are preserved even when the caller's
 * local confirmedLiveStateRef is stale.
 *
 * Use this for writes that do NOT intentionally set or clear story/content
 * fields (e.g. ratings, celebrationAcknowledgedBy).
 *
 * @param sessionId - The session UUID
 * @param patch - The fields to merge (undefined values are serialized away and therefore ignored)
 */
export async function patchClaritySessionLiveState(
  sessionId: string,
  patch: Record<string, unknown>
): Promise<void> {

  const { error } = await supabase.rpc('patch_live_state', {
    p_session_id: sessionId,
    p_patch: patch,
  });

  if (error) {
    console.error('[Live API] Error patching live state:', error.message, error.code, error.details);
    // P525: Capture in Sentry for visibility
    try { Sentry.captureException(new Error(`[Live API] patchLiveState: ${error.message}`), { extra: { code: error.code, details: error.details, sessionId } }); } catch { /* */ }
    throw new Error(error.message);
  }
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

// ============================================================================
// P511: Session Resilience — Heartbeat & Active Session Query
// ============================================================================

/**
 * Grace period in seconds — session is "active" if heartbeat within this window.
 *
 * P1057: this constant is now DISPLAY-ONLY (clarity-live-page renders the countdown from
 * it). The value that actually decides activeness lives in get_active_session_by_code as a
 * SQL literal, because the decision moved server-side with the code-keyed lookup. Changing
 * one without the other desynchronises the countdown from the rule it describes — change
 * both, in the same commit.
 */
export const SESSION_GRACE_PERIOD_SECONDS = 120;

/**
 * Sends a heartbeat to keep the session alive.
 * Calls the `update_last_activity` RPC to update `last_activity_at`.
 * Errors are silently swallowed — heartbeat failure must never crash the session.
 * @param sessionId - The session UUID
 */
export async function updateSessionLastActivity(sessionId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_last_activity', {
      p_session_id: sessionId,
    });

    if (error) {
      // Silent — heartbeat failure is non-fatal
      console.warn('[Heartbeat] Failed to update last activity:', error.message);
    }
  } catch {
    // Silent — network errors during heartbeat are expected (offline, tab throttled)
    console.warn('[Heartbeat] Network error updating last activity');
  }
}

/**
 * Gets an active session by room code — only if within the grace period.
 * A session is "active" if:
 *   1. `sessionEnded` is not true in `live_state`, AND
 *   2. `last_activity_at` is within the last SESSION_GRACE_PERIOD_SECONDS, OR
 *      `last_activity_at` is null (pre-migration sessions — treat as active).
 *
 * @param code - The 6-character room code
 * @returns The session if active, null if expired or not found
 */
export async function getActiveSessionByCode(code: string): Promise<ClaritySession | null> {
  const normalizedCode = code.toUpperCase().trim();

  // P1057: the ended-check and the grace-window comparison that used to live here are now
  // inside get_active_session_by_code, verbatim in behaviour — the function returns no row
  // when live_state.sessionEnded/joinerEnded is true, or when
  // COALESCE(last_activity_at, created_at) is older than the 120s window.
  //
  // They had to move with the lookup rather than stay here: the filter is keyed on `code`,
  // and referencing an ungranted column in WHERE fails regardless of the projection.
  //
  // All three refusals (unknown code, ended, expired) return the SAME empty result — never a
  // distinguishable error. That is deliberate: today all three collapse to `return null`
  // here, and a server-side `RAISE EXCEPTION 'session expired'` would create an existence
  // oracle that does not exist now.
  const { data, error } = await supabase.rpc('get_active_session_by_code', {
    p_code: normalizedCode,
  });

  const row = (Array.isArray(data) ? data[0] : data) as DbClaritySession | undefined;

  if (error || !row) {
    return null;
  }

  return mapSessionFromDb(row, normalizedCode);
}

/**
 * Clears the joiner from a session (joiner clicked "End Session").
 * Sets joinerEnded flag in live_state so the creator skips the grace period
 * and sees the immediate session-ended screen (same pattern as endClaritySession).
 * Only called from the explicit "End Session" button path — NOT from pagehide.
 * (P511: pagehide no longer clears the joiner; the grace period handles departures.)
 * @param sessionId - The session UUID
 */
export async function clearSessionJoiner(sessionId: string): Promise<void> {

  // P1053: one RPC replaces the read-modify-write above.
  //
  // The old shape SELECTed live_state, spread it in JS, and wrote the whole object back —
  // a lost-update window the P399 contract in docs/technical/database.md warns about: any
  // concurrent live_state write between the read and the write was silently discarded.
  // release_joiner_seat merges server-side with `||`, so only the two joinerEnded keys are
  // touched and nothing else in live_state can be clobbered.
  //
  // It also clears joiner_seat_claimed_at — the actual vacancy signal — while deliberately
  // LEAVING joiner_profile_id set, so the departing participant keeps access to their own
  // transcript, transcription jobs and session history. Nulling it here is the naive fix
  // this design exists to avoid.
  const { error } = await supabase.rpc('release_joiner_seat', { p_session_id: sessionId });

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

type SessionUpdateHandler = (session: ClaritySession) => void;

interface SessionChannelEntry {
  channel: ReturnType<(typeof supabase)['channel']> | null;
  handlers: SessionUpdateHandler[];
  cancelled: boolean;
  /**
   * P1057: the room code to splice into every re-fetched row (rows no longer carry it).
   * Lives on the ENTRY, not in the channel closure, because the channel is ref-counted per
   * sessionId and shared: whichever subscriber arrives first would otherwise freeze its own
   * value — including '' — for every later subscriber of the same session.
   */
  knownCode: string;
}

const claritySessionChannels = new Map<string, SessionChannelEntry>();

/** Resets subscription registry between tests — do not call in production. */
export function _clearSessionChannelRegistryForTesting(): void {
  claritySessionChannels.clear();
}

/**
 * Subscribes to realtime changes for a session.
 * Channel is ref-counted per sessionId: only one Supabase channel is created per
 * session regardless of how many components call this. Removed when the last
 * subscriber unsubscribes.
 * @param sessionId - The session UUID
 * @param knownCode - P1057: the room code the caller already holds, spliced into every
 *   re-fetched row. REQUIRED and positioned second so the compiler names every call site
 *   rather than letting one default to undefined. Pass '' explicitly where a caller has no
 *   code — visibly, not by omission.
 * @param onUpdate - Callback when session updates
 * @returns Unsubscribe function
 */
export function subscribeToClaritySession(
  sessionId: string,
  knownCode: string,
  onUpdate: SessionUpdateHandler,
  onStatusChange?: (status: string) => void
): () => void {
  let entry = claritySessionChannels.get(sessionId);

  // A later subscriber that DOES hold a code upgrades a channel opened by one that did not.
  if (entry && !entry.knownCode && knownCode) entry.knownCode = knownCode;

  if (!entry) {
    const handlers: SessionUpdateHandler[] = [];
    const newEntry: SessionChannelEntry = { channel: null, handlers, cancelled: false, knownCode };

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
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;
          supabase
            .from('clarity_sessions')
            // P1057: was `select('*')`. This is the highest-risk projection in the product —
            // it re-fetches on EVERY update for BOTH participants, and its only failure
            // handling is the console.error below, so a 42501 here kills live state sync
            // silently, minutes into a call, on a path with no happy-path signal.
            .select(CLARITY_SESSION_COLUMNS)
            .eq('id', id)
            .single()
            .then(({ data, error }) => {
              if (newEntry.cancelled) return;
              if (error) {
                console.error('📡 Re-fetch failed:', error);
                return;
              }
              if (data) newEntry.handlers.forEach(h => h(mapSessionFromDb(data as unknown as DbClaritySession, newEntry.knownCode)));
            });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onStatusChange?.(status);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[clarity_session_sub] ${status} for session ${sessionId}`);
        }
      });

    newEntry.channel = channel;
    claritySessionChannels.set(sessionId, newEntry);
    entry = newEntry;
  }

  entry.handlers.push(onUpdate);

  return () => {
    if (!entry) return;
    const idx = entry.handlers.indexOf(onUpdate);
    if (idx >= 0) entry.handlers.splice(idx, 1);
    if (entry.handlers.length === 0) {
      entry.cancelled = true;
      if (entry.channel) supabase.removeChannel(entry.channel);
      claritySessionChannels.delete(sessionId);
    }
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
    // P275: positions set during the round
    ...(db.point_positions ? { pointPositions: db.point_positions } : {}),
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
      // P275: positions set during the round (safe for unverified guests)
      ...(turn.pointPositions ? { point_positions: turn.pointPositions } : {}),
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
        if (payload.new) {
          onNewTurn(mapLiveTurnFromDb(payload.new as DbLiveTurn));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// ML TRAINING DATA CAPTURE API (P28.1)
// ============================================================================

import type { MLEvent, MLTrainingEvents } from '@/lib/session-events-collector';
import { devRecordingFilenamePrefix } from '@/lib/dev-recording';
// P1223: shared with the gcs-signed-url edge function — the server re-derives this name to
// decide whether a requested object belongs to the caller, so the two sanitisers must be one.
import { sanitizeParticipantName } from '../../../supabase/functions/_shared/participant-name.ts';

// Re-export types for convenience
export type { MLEvent, MLTrainingEvents } from '@/lib/session-events-collector';

/** Supabase edge function URL for getting signed upload URLs (proxies to GCS Cloud Function) */
const GCS_SIGNED_URL_EDGE_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/gcs-signed-url`;

/**
 * Retry helper with exponential backoff for network requests.
 * Used for GCS uploads which can fail on mobile networks.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; operation?: string } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, operation = 'operation' } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on non-network errors (4xx responses that aren't rate limits)
      const isRateLimited = lastError.message.includes('429');
      if (lastError.message.includes('Failed to get signed URL:') && !isRateLimited) {
        throw lastError;
      }
      // GCS SignatureDoesNotMatch: signed URL parameters don't match PUT headers —
      // this is deterministic, retrying against the same signed URL will always fail
      if (lastError.message.includes('SignatureDoesNotMatch')) {
        throw lastError;
      }

      if (attempt < maxAttempts) {
        // Use Retry-After hint if available (attached by uploadToGCS), otherwise exponential backoff
        const retryAfterMs = 'retryAfterMs' in lastError ? (lastError as Error & { retryAfterMs: number }).retryAfterMs : 0;
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        const jitterMs = Math.random() * 500; // 0-500ms jitter to avoid thundering herd
        const delayMs = Math.max(retryAfterMs, backoffMs) + jitterMs;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Log final failure for debugging mobile network issues
  console.error(`[ML Upload] ${operation} failed after ${maxAttempts} attempts:`, lastError?.message);
  throw lastError;
}

/** Metadata for a session recording */
export interface SessionMetadata {
  sessionStartedAt: number; // Unix ms from collector.getStartTime()
  sessionEndedAt: number; // Unix ms (Date.now() at upload)
  durationMs: number; // From collector.getDurationMs()
  participants: { name: string; role: 'creator' | 'joiner' }[];
  /** Uploader's auth info for Mixpanel correlation (P28.2) */
  uploader?: { supabaseUserId?: string; email?: string; name: string };
}

/**
 * Gets a signed URL for uploading to GCS.
 * Includes retry logic for network failures on mobile.
 */
async function getSignedUploadUrl(
  sessionCode: string,
  fileName: string,
  contentType: string
): Promise<{ uploadUrl: string; filePath: string }> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Get the current user's JWT for edge function auth
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(GCS_SIGNED_URL_EDGE_FUNCTION, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionCode, fileName, contentType }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Read body as text first so we surface the gateway shape
        // (`{ message: 'JWT expired' }`) when the request never reaches
        // the edge function. Status code clusters Sentry events by failure
        // mode (401 vs 503) and prevents the previous "undefined" suffix.
        const bodyText = await response.text().catch(() => '');
        const detail = extractErrorDetail(bodyText);
        throw new Error(
          `Failed to get signed URL: ${response.status} ${response.statusText}${detail ? ' — ' + detail : ''}`
        );
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }, { operation: 'getSignedUploadUrl' });
}

/**
 * Uploads a file to GCS using a signed URL.
 * Includes retry logic for network failures on mobile.
 */
async function uploadToGCS(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        // P812: ONLY send headers the Cloud Function includes in its canonical
        // signed request. The ml-training signer does NOT sign
        // x-goog-content-length-range, so including it causes GCS to reject
        // the PUT with MalformedSecurityHeader. Content-Type IS signed.
        // See scripts/probe-gcs-upload*.mjs for the disproof.
        headers: {
          'Content-Type': contentType,
        },
        body: blob,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      // For 403s, read body to surface SignatureDoesNotMatch (deterministic — never worth retrying)
      const bodyText = response.status === 403
        ? await response.text().catch(() => '')
        : '';
      const error = new Error(
        `GCS upload failed: ${response.status} ${response.statusText}${bodyText ? ' — ' + bodyText.slice(0, 500) : ''}`
      );
      // Attach Retry-After hint for 429 responses so withRetry can respect it
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          (error as Error & { retryAfterMs: number }).retryAfterMs = isNaN(seconds)
            ? Math.max(0, new Date(retryAfter).getTime() - Date.now())
            : seconds * 1000;
        }
      }
      throw error;
    }
  }, { operation: 'uploadToGCS' });
}

/**
 * Uploads a single audio chunk to GCS.
 * Used by chunked recording mode for reliable capture.
 *
 * Creates files at:
 * ```
 * gs://claritypledge-ml-training/sessions/{session_code}/
 * └── {user_name}_chunk_{NNN}.webm   # Audio chunk (000, 001, 002, etc.)
 * ```
 *
 * @param sessionCode - The 6-character session code
 * @param userName - Name of the user
 * @param chunkBlob - The audio chunk blob
 * @param chunkNumber - Zero-based chunk index
 * @param isLastChunk - Whether this is the final chunk
 */
export async function uploadAudioChunk(
  sessionCode: string,
  userName: string,
  chunkBlob: Blob,
  chunkNumber: number,
  isLastChunk: boolean,
): Promise<void> {
  // Sanitize username for filename
  const sanitizedName = sanitizeParticipantName(userName);

  // Zero-pad chunk number (e.g., 001, 002, ...)
  const paddedChunkNum = String(chunkNumber).padStart(3, '0');
  const devPrefix = devRecordingFilenamePrefix(); // P809: `_dev_` on non-prod with URL flag
  const chunkFileName = `${devPrefix}${sanitizedName}_chunk_${paddedChunkNum}.webm`;
  const contentType = chunkBlob.type || 'audio/webm';

  try {
    const { uploadUrl } = await getSignedUploadUrl(
      sessionCode,
      chunkFileName,
      contentType
    );

    await uploadToGCS(uploadUrl, chunkBlob, contentType);

    // If this is the last chunk, record in DB for tracking
    if (isLastChunk) {
      // chunkNumber is 0-indexed, so total chunks = chunkNumber + 1
      // Each chunk is 30 seconds
      const totalChunks = chunkNumber + 1;
      const durationMs = totalChunks * 30000;

      const { error: dbError } = await supabase.from('ml_training_sessions').insert({
        session_code: sessionCode,
        user_name: userName,
        audio_path: `gs://claritypledge-ml-training/sessions/${sessionCode}/${devPrefix}${sanitizedName}_chunk_*.webm`,
        duration_ms: durationMs,
        chunk_count: totalChunks,
      });

      if (dbError) {
        console.warn('[ML Upload] DB record failed (non-fatal):', dbError.message);
      }
    }
  } catch (err) {
    console.error(`[ML Upload] Chunk ${chunkNumber} upload failed:`, err);
    // Capture to Sentry for monitoring ML data loss
    Sentry.captureException(err, {
      tags: { feature: 'ml_training', operation: 'chunk_upload' },
      extra: { sessionCode, chunkNumber, isLastChunk, blobSize: chunkBlob.size },
    });
    throw err;
  }
}

/**
 * P566: Uploads a single audio chunk to GCS without error handling or DB writes.
 * Errors propagate to the caller (the upload queue handles retries).
 *
 * @param sessionCode - The 6-character session code
 * @param userName - Name of the user
 * @param chunkBlob - The audio chunk blob
 * @param chunkNumber - Zero-based chunk index
 */
export async function uploadSingleChunk(
  sessionCode: string,
  userName: string,
  chunkBlob: Blob,
  chunkNumber: number,
): Promise<void> {
  const sanitizedName = sanitizeParticipantName(userName);

  const paddedChunkNum = String(chunkNumber).padStart(3, '0');
  const devPrefix = devRecordingFilenamePrefix(); // P809
  const chunkFileName = `${devPrefix}${sanitizedName}_chunk_${paddedChunkNum}.webm`;
  const contentType = chunkBlob.type || 'audio/webm';

  const { uploadUrl } = await getSignedUploadUrl(
    sessionCode,
    chunkFileName,
    contentType
  );

  await uploadToGCS(uploadUrl, chunkBlob, contentType);
}

/**
 * P566: Records that chunk uploads are complete in the DB.
 * Extracted from uploadAudioChunk so the queue can call it after all chunks drain.
 */
export async function recordChunkUploadComplete(
  sessionCode: string,
  userName: string,
  chunkCount: number,
  durationMs: number,
): Promise<void> {
  const sanitizedName = sanitizeParticipantName(userName);

  const devPrefix = devRecordingFilenamePrefix(); // P809
  const { error: dbError } = await supabase.from('ml_training_sessions').insert({
    session_code: sessionCode,
    user_name: userName,
    audio_path: `gs://claritypledge-ml-training/sessions/${sessionCode}/${devPrefix}${sanitizedName}_chunk_*.webm`,
    duration_ms: durationMs,
    chunk_count: chunkCount,
  });

  if (dbError) {
    console.warn('[ML Upload] DB record failed (non-fatal):', dbError.message);
  }
}

/**
 * P1149 (A3): builds the room-scoped GCS path segments for one participant's audio.
 *
 * `sessions/{code}/` (see recordChunkUploadComplete above) is a literal string this
 * codebase concatenates when calling the signed-url plumbing — the actual object-key
 * assembly happens server-side in an out-of-repo Cloud Function (see
 * supabase/functions/gcs-signed-url/index.ts), so this repo cannot directly prove where
 * an upload physically lands. Passing a multi-segment `gcsPathPrefix` (`rooms/{code}/{who}`)
 * as the signed-url call's first argument, instead of a bare clarity_sessions code, is the
 * only lever this repo has to keep room audio out of the `sessions/` prefix. Whether the
 * external function honors that is unverified here by design — P1152's physical
 * bucket-listing check is the live proof; this function is pure so its OWN construction is
 * unit-testable independent of that external unknown (src/tests/p1149-gcs-prefix.test.ts).
 */
export function buildRoomAudioPathSegments(
  roomCode: string,
  participantName: string,
  memberId: string,
): { gcsPathPrefix: string; sanitizedParticipant: string } {
  const sanitizedParticipant = sanitizeParticipantName(participantName);
  // memberId disambiguates same/similar display names in one room — the sanitized name
  // alone collided (two "Alex"es, or differently-cased names sanitizing identically),
  // silently overwriting each other's uploaded chunks.
  return {
    gcsPathPrefix: `rooms/${roomCode}/${sanitizedParticipant}-${memberId}`,
    sanitizedParticipant,
  };
}

/**
 * P1149 (A3): uploads one participant's audio chunk under the room-scoped `rooms/`
 * prefix, via the exact same signed-url / GCS plumbing `uploadAudioChunk` uses for
 * `/live` — only the path segments differ. Never touches the `sessions/` prefix.
 */
export async function uploadRoomAudioChunk(
  roomCode: string,
  participantName: string,
  memberId: string,
  chunkBlob: Blob,
  chunkNumber: number,
  isLastChunk: boolean,
): Promise<void> {
  const { gcsPathPrefix, sanitizedParticipant } = buildRoomAudioPathSegments(roomCode, participantName, memberId);
  const paddedChunkNum = String(chunkNumber).padStart(3, '0');
  const devPrefix = devRecordingFilenamePrefix(); // P809
  const chunkFileName = `${devPrefix}chunk_${paddedChunkNum}.webm`;
  const contentType = chunkBlob.type || 'audio/webm';

  try {
    const { uploadUrl } = await getSignedUploadUrl(gcsPathPrefix, chunkFileName, contentType);
    await uploadToGCS(uploadUrl, chunkBlob, contentType);

    if (isLastChunk) {
      const totalChunks = chunkNumber + 1;
      const durationMs = totalChunks * 30000;
      const { error: dbError } = await supabase.from('ml_training_sessions').insert({
        session_code: roomCode,
        user_name: participantName,
        audio_path: `gs://claritypledge-ml-training/${gcsPathPrefix}/${devPrefix}chunk_*.webm`,
        duration_ms: durationMs,
        chunk_count: totalChunks,
      });
      if (dbError) {
        console.warn('[ML Upload] Room DB record failed (non-fatal):', dbError.message);
      }
    }
  } catch (err) {
    console.error(`[ML Upload] Room chunk ${chunkNumber} upload failed:`, err);
    Sentry.captureException(err, {
      tags: { feature: 'transcribe_room', operation: 'room_chunk_upload' },
      extra: { roomCode, sanitizedParticipant, chunkNumber, isLastChunk, blobSize: chunkBlob.size },
    });
    throw err;
  }
}

/**
 * Uploads an events snapshot alongside audio chunks.
 * Called every 30 seconds to ensure events are saved even if user closes browser.
 *
 * Creates files at:
 * ```
 * gs://claritypledge-ml-training/sessions/{session_code}/
 * ├── slava_events_000.json   # Slava's events at 0-30s
 * ├── slava_events_001.json   # Slava's events at 0-60s (cumulative)
 * ├── gosha_events_000.json   # Gosha's events at 0-30s
 * └── gosha_events_001.json   # Gosha's events at 0-60s (cumulative)
 * ```
 *
 * The highest-numbered {user}_events_XXX.json contains all events up to that point.
 * Each user uploads their own events file to avoid overwrites.
 *
 * @param sessionCode - The 6-character session code
 * @param userName - The name of the user uploading (for file prefix)
 * @param chunkNumber - Zero-based chunk index (matches audio chunk number)
 * @param collector - The SessionEventsCollector instance
 * @param participants - Session participants for metadata
 * @param uploader - Optional uploader info for Mixpanel correlation
 */
export async function uploadEventsSnapshot(
  sessionCode: string,
  userName: string,
  chunkNumber: number,
  collector: import('@/lib/session-events-collector').SessionEventsCollector,
  participants: { name: string; role: 'creator' | 'joiner' }[],
  uploader?: { supabaseUserId?: string; email?: string; name: string },
): Promise<void> {
  const events = collector.getEvents();
  const sessionStartedAt = collector.getStartTime();

  // Sanitize username for filename (same pattern as audio chunks)
  const sanitizedName = sanitizeParticipantName(userName);

  // Zero-pad chunk number to match audio chunks (e.g., 000, 001, 002)
  const paddedChunkNum = String(chunkNumber).padStart(3, '0');
  const devPrefix = devRecordingFilenamePrefix(); // P809
  const fileName = `${devPrefix}${sanitizedName}_events_${paddedChunkNum}.json`;

  const payload: MLTrainingEvents = {
    sessionCode,
    capturedAt: new Date().toISOString(),
    sessionStartedAt,
    sessionEndedAt: Date.now(), // Current time (not final)
    durationMs: Date.now() - sessionStartedAt,
    participants,
    events,
    uploader, // For Mixpanel correlation (userId, email, name)
  };

  try {
    const { uploadUrl } = await getSignedUploadUrl(sessionCode, fileName, 'application/json');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    await uploadToGCS(uploadUrl, blob, 'application/json');
  } catch (err) {
    console.error(`[ML Upload] Events snapshot ${chunkNumber} upload failed:`, err);
    // Capture to Sentry for monitoring ML data loss
    Sentry.captureException(err, {
      tags: { feature: 'ml_training', operation: 'events_snapshot_upload' },
      extra: { sessionCode, chunkNumber, eventCount: events.length },
    });
    // Don't throw - recording failure shouldn't break the session
  }
}

/**
 * Uploads session recording data for ML training to Google Cloud Storage.
 *
 * Creates a bundle at:
 * ```
 * gs://claritypledge-ml-training/sessions/{session_code}/
 * ├── {user_name}.webm         # Audio file
 * └── events.json              # Snapshot of session events (first uploader only)
 * ```
 *
 * @param sessionCode - The 6-character session code
 * @param userName - Name of the user (used for audio filename)
 * @param audioBlob - The recorded audio blob
 * @param events - Array of captured ML events
 * @param metadata - Session metadata
 */
export async function uploadSessionRecording(
  sessionCode: string,
  userName: string,
  audioBlob: Blob,
  events: MLEvent[],
  metadata: SessionMetadata,
): Promise<void> {
  // Sanitize username for filename (replace spaces and special chars)
  const sanitizedName = sanitizeParticipantName(userName);

  // Skip upload entirely when there's no meaningful data (0 events + no audio)
  if (events.length === 0 && audioBlob.size === 0) {
    return;
  }

  try {
    let audioPath = '';

    const devPrefix = devRecordingFilenamePrefix(); // P809

    // 1. Upload audio file to GCS (skip if empty blob - used when only uploading events in chunked mode)
    if (audioBlob.size > 0) {
      const audioFileName = `${devPrefix}${sanitizedName}.webm`;
      const audioContentType = audioBlob.type || 'audio/webm';

      const { uploadUrl: audioUrl, filePath } = await getSignedUploadUrl(
        sessionCode,
        audioFileName,
        audioContentType
      );
      audioPath = filePath;

      await uploadToGCS(audioUrl, audioBlob, audioContentType);
    }

    // 2. Upload events.json to GCS (always upload - GCS handles dedup via overwrite)
    const eventsPayload: MLTrainingEvents = {
      sessionCode,
      capturedAt: new Date().toISOString(),
      sessionStartedAt: metadata.sessionStartedAt,
      sessionEndedAt: metadata.sessionEndedAt,
      durationMs: metadata.durationMs,
      participants: metadata.participants,
      events,
      uploader: metadata.uploader, // P28.2: For Mixpanel correlation
    };

    const eventsBlob = new Blob([JSON.stringify(eventsPayload, null, 2)], {
      type: 'application/json',
    });

    const { uploadUrl: eventsUrl } = await getSignedUploadUrl(
      sessionCode,
      `${devPrefix}events.json`,
      'application/json'
    );

    await uploadToGCS(eventsUrl, eventsBlob, 'application/json');

    // 3. Create DB record for tracking (only if we uploaded audio, skip for events-only upload)
    if (audioPath) {
      // P809: reconstruct audio_path from locally-known pieces (sessionCode,
      // devPrefix, sanitizedName) so dev-prefix accuracy doesn't depend on the
      // external Cloud Function echoing the filename back. Matches the pattern
      // used by uploadAudioChunk / recordChunkUploadComplete.
      const audioPathValue = `gs://claritypledge-ml-training/sessions/${sessionCode}/${devPrefix}${sanitizedName}.webm`;
      const { error: dbError } = await supabase.from('ml_training_sessions').insert({
        session_code: sessionCode,
        user_name: userName,
        audio_path: audioPathValue,
        duration_ms: metadata.durationMs,
      });

      if (dbError) {
        console.warn('[ML Upload] DB record failed (non-fatal):', dbError.message);
      }
    }

  } catch (err) {
    console.error('[ML Upload] Upload failed:', err);
    // Capture to Sentry for monitoring ML data loss
    Sentry.captureException(err, {
      tags: { feature: 'ml_training', operation: 'session_recording_upload' },
      extra: { sessionCode, eventCount: events.length, durationMs: metadata.durationMs },
    });
    // Don't throw - recording failure shouldn't break the session
  }
}

// ============================================================================
// P37.2a: Consent Mechanism API Functions
// ============================================================================

/** UUID v4 regex for input validation */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validates that a string is a valid UUID v4 */
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Check if user needs to accept updated terms.
 * @param userId - The user's UUID
 * @returns true if user needs to accept terms, false if current
 */
export async function needsTermsAcceptance(userId: string): Promise<boolean> {
  if (!isValidUUID(userId)) {
    console.error('Invalid userId format:', userId);
    return true; // Fail safe - require acceptance if invalid
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('accepted_terms_version')
    .eq('id', userId)
    .single();

  if (error || !data) return true;

  return data.accepted_terms_version !== CURRENT_TERMS_VERSION;
}

/**
 * Record terms acceptance for a user.
 * Updates profile and creates audit trail entry.
 * @param userId - The user's UUID
 */
export async function recordTermsAcceptance(userId: string): Promise<void> {
  if (!isValidUUID(userId)) {
    throw new Error('Invalid userId format');
  }

  const ipHash = await hashIP();

  // Update profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ accepted_terms_version: CURRENT_TERMS_VERSION })
    .eq('id', userId);

  if (profileError) {
    console.error('Failed to update profile terms version:', profileError);
    throw new Error('Failed to record terms acceptance');
  }

  // Insert audit record
  const { error: auditError } = await supabase
    .from('terms_acceptances')
    .insert({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      ip_hash: ipHash,
      user_agent: navigator.userAgent,
    });

  if (auditError) {
    console.error('Failed to insert terms acceptance audit:', auditError);
    // Don't throw - profile was updated, audit is secondary
  }

}

/**
 * Record session consent (per-session audit trail).
 * @param sessionId - The Live Meeting session code
 * @param userId - The user's UUID
 */
export async function recordSessionConsent(
  sessionId: string,
  userId: string
): Promise<void> {
  // Session codes are exactly 6 alphanumeric characters
  if (!sessionId || sessionId.length !== 6 || !/^[A-Z0-9]{6}$/i.test(sessionId)) {
    throw new Error('Invalid sessionId format');
  }
  if (!isValidUUID(userId)) {
    throw new Error('Invalid userId format');
  }

  const ipHash = await hashIP();

  const { error } = await supabase
    .from('session_consents')
    .insert({
      session_id: sessionId,
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      ip_hash: ipHash,
      user_agent: navigator.userAgent,
    });

  if (error) {
    console.error('Failed to record session consent:', error);
    throw new Error('Failed to record consent');
  }

}

/**
 * Verify consent exists for a session before uploading recordings.
 * @param sessionId - The Live Meeting session code
 * @param userId - The user's UUID
 * @returns true if consent exists, false otherwise
 */
export async function verifySessionConsent(
  sessionId: string,
  userId: string
): Promise<boolean> {
  if (!sessionId || !isValidUUID(userId)) {
    return false; // Fail safe - no consent if invalid inputs
  }

  const { data, error } = await supabase
    .from('session_consents')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Consent verification failed:', error);
    return false;
  }

  return true;
}

/**
 * Hash IP address for audit trail (with timeout).
 * Falls back gracefully if IP lookup fails or times out.
 * @returns Hashed IP or fallback identifier
 */
async function hashIP(): Promise<string> {
  try {
    // 3 second timeout to prevent blocking join flow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const { ip } = await response.json();

    const encoder = new TextEncoder();
    const data = encoder.encode(ip);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback: use random identifier (still unique per request)
    return `browser_${crypto.randomUUID()}`;
  }
}

// ============================================================================
// EVENTS API (P61)
// ============================================================================

// Re-export event types
export type { Event, EventWithHost, EventAttendee, EventStatus } from '@/app/types';

/**
 * Maps a database event row to the Event type (snake_case → camelCase)
 */
function mapEventFromDb(dbEvent: DbEvent): Event {
  return {
    id: dbEvent.id,
    slug: dbEvent.slug,
    title: dbEvent.title,
    description: dbEvent.description,
    datetime: dbEvent.datetime,
    durationMinutes: dbEvent.duration_minutes,
    timezone: dbEvent.timezone,
    location: dbEvent.location,
    hostId: dbEvent.host_id,
    maxAttendees: dbEvent.max_attendees ?? undefined,
    createdAt: dbEvent.created_at,
    status: dbEvent.status,
  };
}

/**
 * Maps a database event with joined host profile to EventWithHost
 */
function mapEventWithHostFromDb(
  dbEvent: DbEvent & { profiles: { name?: string; slug?: string; role?: string; avatar_color?: string; avatar_url?: string; has_pledged?: boolean; ears_count?: number | null } }
): EventWithHost {
  return {
    ...mapEventFromDb(dbEvent),
    hostName: dbEvent.profiles?.name || 'Unknown',
    hostSlug: dbEvent.profiles?.slug || '',
    hostRole: dbEvent.profiles?.role,
    hostAvatarColor: dbEvent.profiles?.avatar_color,
    hostAvatarUrl: dbEvent.profiles?.avatar_url,
    hostHasPledged: dbEvent.profiles?.has_pledged ?? false,
    hostEarCount: earCountOf(dbEvent.profiles),
  };
}

/**
 * Fetches upcoming events (status = 'upcoming' or 'cancelled')
 * Includes host profile data for display
 */
export async function getUpcomingEvents(): Promise<EventWithHost[]> {

  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      profiles:host_id (name, slug, role, avatar_color, avatar_url, has_pledged, ears_count)
    `)
    .in('status', ['upcoming', 'cancelled'])
    .order('datetime', { ascending: true });

  if (error) {
    console.error('[Events API] Error fetching upcoming events:', error);
    return [];
  }

  return (data || []).map(mapEventWithHostFromDb);
}

/**
 * Fetches past events (status = 'completed')
 * Sorted newest first
 */
export async function getPastEvents(): Promise<EventWithHost[]> {

  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      profiles:host_id (name, slug, role, avatar_color, avatar_url, has_pledged, ears_count)
    `)
    .eq('status', 'completed')
    .order('datetime', { ascending: false });

  if (error) {
    console.error('[Events API] Error fetching past events:', error);
    return [];
  }

  return (data || []).map(mapEventWithHostFromDb);
}

/**
 * Fetches a single event by its slug
 * Returns null if not found
 */
export async function getEventBySlug(slug: string): Promise<EventWithHost | null> {

  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      profiles:host_id (name, slug, role, avatar_color, avatar_url, has_pledged, ears_count)
    `)
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[Events API] Error fetching event:', error);
    return null;
  }

  return mapEventWithHostFromDb(data);
}

/**
 * Fetches attendees for an event
 * Returns profile data for display
 */
export async function getEventAttendees(eventId: string): Promise<EventAttendee[]> {

  const { data, error } = await supabase
    .from('event_rsvps')
    .select(`
      profile_id,
      profiles:profile_id (name, slug, avatar_color, avatar_url, has_pledged, ears_count)
    `)
    .eq('event_id', eventId);

  if (error) {
    console.error('[Events API] Error fetching attendees:', error);
    return [];
  }

  return (data || []).map((rsvp) => {
    const p = rsvp.profiles as { name?: string; slug?: string; avatar_color?: string; avatar_url?: string; has_pledged?: boolean; ears_count?: number | null } | null;
    return {
      profileId: rsvp.profile_id,
      name: p?.name || 'Unknown',
      slug: p?.slug || '',
      avatarColor: p?.avatar_color,
      avatarUrl: p?.avatar_url,
      hasPledged: p?.has_pledged ?? false,
      earCount: earCountOf(p),
    };
  });
}

/**
 * Gets the count of attendees for an event
 */
export async function getEventAttendeeCount(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from('event_rsvps')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (error) {
    console.error('[Events API] Error counting attendees:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Checks if a user has RSVP'd to an event
 */
export async function isUserRsvpd(eventId: string, profileId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[Events API] Error checking RSVP:', error);
  }

  return !!data;
}

/**
 * Generates a URL-safe slug from an event title
 * Appends timestamp suffix to ensure uniqueness
 */
export function generateEventSlug(title: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Add date suffix for uniqueness
  const dateSuffix = new Date().toISOString().split('T')[0];
  return `${baseSlug}-${dateSuffix}`;
}

interface CreateEventInput {
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number;
  timezone: string;
  location: string;
  hostId: string;
  maxAttendees?: number;
}

/**
 * Creates a new event
 * Generates slug automatically from title
 * Retries with timestamp suffix on slug conflict
 */
export async function createEvent(input: CreateEventInput): Promise<Event | null> {

  let slug = generateEventSlug(input.title);
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        slug,
        title: input.title,
        description: input.description,
        datetime: input.datetime,
        duration_minutes: input.durationMinutes,
        timezone: input.timezone,
        location: input.location,
        host_id: input.hostId,
        max_attendees: input.maxAttendees,
        status: 'upcoming',
      })
      .select()
      .single();

    if (error) {
      // Slug conflict - add timestamp and retry
      if (error.code === '23505') {
        retries++;
        slug = `${generateEventSlug(input.title)}-${Date.now()}`;
        continue;
      }
      console.error('[Events API] Error creating event:', error);
      return null;
    }

    return mapEventFromDb(data);
  }

  console.error('[Events API] Failed to create event after retries');
  return null;
}

/**
 * RSVPs a user to an event
 * Checks capacity before inserting
 * Returns false if event is full or already RSVP'd
 */
export async function rsvpToEvent(eventId: string, profileId: string): Promise<boolean> {

  // Check if already RSVP'd
  const alreadyRsvpd = await isUserRsvpd(eventId, profileId);
  if (alreadyRsvpd) {
    return true;
  }

  // Check capacity
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('max_attendees, status')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    console.error('[Events API] Event not found:', eventError);
    return false;
  }

  if (event.status !== 'upcoming') {
    return false;
  }

  if (event.max_attendees) {
    const currentCount = await getEventAttendeeCount(eventId);
    if (currentCount >= event.max_attendees) {
      return false;
    }
  }

  // Insert RSVP
  const { error } = await supabase
    .from('event_rsvps')
    .insert({
      event_id: eventId,
      profile_id: profileId,
    });

  if (error) {
    console.error('[Events API] Error creating RSVP:', error);
    return false;
  }

  return true;
}

/**
 * Cancels a user's RSVP to an event
 */
export async function cancelRsvp(eventId: string, profileId: string): Promise<boolean> {

  const { error } = await supabase
    .from('event_rsvps')
    .delete()
    .eq('event_id', eventId)
    .eq('profile_id', profileId);

  if (error) {
    console.error('[Events API] Error canceling RSVP:', error);
    return false;
  }

  return true;
}

interface UpdateEventInput {
  title?: string;
  description?: string;
  datetime?: string;
  durationMinutes?: number;
  timezone?: string;
  location?: string;
  maxAttendees?: number | null;
}

/**
 * Updates an event (host only - RLS enforced + explicit ownership check)
 */
export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<Event | null> {

  // Defense-in-depth: verify caller is the event host
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[Events API] Cannot update event: not authenticated');
    return null;
  }

  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    console.error('[Events API] Cannot update event: event not found', fetchError);
    return null;
  }

  if (event.host_id !== user.id) {
    console.error('[Events API] Cannot update event: caller is not the host');
    return null;
  }

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.datetime !== undefined) updateData.datetime = input.datetime;
  if (input.durationMinutes !== undefined) updateData.duration_minutes = input.durationMinutes;
  if (input.timezone !== undefined) updateData.timezone = input.timezone;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.maxAttendees !== undefined) updateData.max_attendees = input.maxAttendees;

  const { data, error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    console.error('[Events API] Error updating event:', error);
    return null;
  }

  return mapEventFromDb(data);
}

/**
 * Cancels an event (sets status to 'cancelled')
 * Host only - RLS enforced + explicit ownership check
 */
export async function cancelEvent(eventId: string): Promise<boolean> {

  // Defense-in-depth: verify caller is the event host
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[Events API] Cannot cancel event: not authenticated');
    return false;
  }

  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    console.error('[Events API] Cannot cancel event: event not found', fetchError);
    return false;
  }

  if (event.host_id !== user.id) {
    console.error('[Events API] Cannot cancel event: caller is not the host');
    return false;
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId);

  if (error) {
    console.error('[Events API] Error canceling event:', error);
    return false;
  }

  return true;
}

// ============================================================================
// TRANSCRIPTION API (P495)
// ============================================================================

/**
 * Fetch the transcript for a session (if it exists and is completed).
 */
export async function fetchSessionTranscript(sessionId: string): Promise<SessionTranscript | null> {
  const { data, error } = await supabase
    .from('session_transcripts')
    .select('id, session_id, session_code, language, segments, speaker_map, model_version, processing_time_ms, created_at')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[Transcription API] Error fetching transcript:', error);
    return null;
  }

  return data as SessionTranscript | null;
}

/**
 * Retry a failed transcription by calling the retry_transcription RPC.
 */
export async function retryTranscription(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('retry_transcription', {
    p_session_id: sessionId,
  });

  if (error) {
    console.error('[Transcription API] Error retrying transcription:', error);
    throw error;
  }
}

/**
 * Create a transcription job after session recording upload.
 */
export async function createTranscriptionJob(_sessionCode: string, sessionId: string): Promise<void> {
  const { error } = await supabase
    .rpc('create_transcription_job', { p_session_id: sessionId });

  if (error) {
    // Don't throw — transcription job creation failure shouldn't block session end
    console.error('[Transcription API] Error creating transcription job:', error);
  }
}

// ============================================================================
// P703: Letter-sourced /live API functions
// ============================================================================

export interface LiveInviteRecord {
  id: string;
  sessionId: string;
  code: string;
  targetUserId: string;
  createdAt: string;
  closedAt: string | null;
  authorName: string;
  storyTitle: string;
  // P745: inviter avatar + delivery context
  inviterPhotoUrl: string | null;
  inviterAvatarColor: string | null;
  inviterIsPledger: boolean;
  deliveryId: string | null;
}

export interface BaselineRatings {
  speakerRating: number | null;
  listenerRating: number | null;
}

/**
 * Inserts a clarity_live_invites row for the target listener.
 * Returns the invite id.
 */
export async function createLiveInvite(
  sessionId: string,
  targetUserId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('clarity_live_invites')
    .insert({ session_id: sessionId, target_user_id: targetUserId })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[P703] Error creating live invite:', error?.message);
    throw new Error(error?.message || 'Failed to create live invite');
  }
  return data.id;
}

/**
 * Fetches the current user's open live invite (if any).
 * Returns null if no open invite.
 */
export async function getOpenLiveInviteForUser(
  userId: string
): Promise<LiveInviteRecord | null> {
  const { data, error } = await supabase
    .from('clarity_live_invites')
    // P1057: `code` dropped from the embed. A PostgREST FK embed compiles to a lateral
    // subquery executed as the request role, so column ACLs apply exactly as on a direct
    // select — this projection 42501s after the gate even though it never names
    // .from('clarity_sessions'). The code is resolved below via an identity-gated accessor
    // instead, which is also a strengthening: today ANY authenticated caller who can read a
    // clarity_live_invites row reads the code embedded beside it.
    .select(
      'id, session_id, target_user_id, created_at, closed_at, clarity_sessions(creator_name, source_letter_id, profiles!clarity_sessions_creator_profile_id_fkey(avatar_url, avatar_color, has_pledged), stories!clarity_sessions_source_story_id_fkey(content))'
    )
    .eq('target_user_id', userId)
    .is('closed_at', null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const sessionData = data.clarity_sessions as {
    creator_name: string | null;
    source_letter_id: string | null;
    profiles: { avatar_url: string | null; avatar_color: string | null; has_pledged: boolean | null } | null;
    stories: { content: string } | null;
  } | null;
  const rawStoryContent = sessionData?.stories?.content ?? '';
  const storyTitle = rawStoryContent ? rawStoryContent.split('\n')[0].substring(0, 60) : '';

  // P1057: the invitee learns the code from an accessor gated on auth.uid() being the
  // invite's target (while it is open) or the session's creator — being invited IS the
  // capability grant. Returns null rather than a distinguishable error when it is neither.
  const { data: inviteCode } = await supabase.rpc('get_room_code_for_invite', {
    p_session_id: data.session_id,
  });

  // Secondary lookup: find the delivery for this receiver + letter.
  // Use limit(1) not maybeSingle() — maybeSingle() returns 406 on >1 rows.
  let deliveryId: string | null = null;
  if (sessionData?.source_letter_id) {
    const { data: deliveries } = await supabase
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', sessionData.source_letter_id)
      .eq('receiver_profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    deliveryId = deliveries?.[0]?.id ?? null;
  }

  return {
    id: data.id,
    sessionId: data.session_id,
    code: (inviteCode as string | null) ?? '',
    targetUserId: data.target_user_id,
    createdAt: data.created_at,
    closedAt: data.closed_at ?? null,
    authorName: sessionData?.creator_name ?? '',
    storyTitle,
    inviterPhotoUrl: sessionData?.profiles?.avatar_url ?? null,
    inviterAvatarColor: sessionData?.profiles?.avatar_color ?? null,
    inviterIsPledger: sessionData?.profiles?.has_pledged ?? false,
    deliveryId,
  };
}

/**
 * Fetches baseline ratings for a letter-sourced /live session (AD3).
 * Returns { speakerRating, listenerRating } or null if either row is missing.
 *
 * speakerRating ← letter_predictions.prediction
 * listenerRating ← story_verifications.listener_rating (source='letter')
 */
export async function getLetterBaselineRatings(
  sourceLetterId: string,
  sourceStoryId: string,
  senderId: string,
  receiverId: string
): Promise<BaselineRatings | null> {
  const [predictionsResult, verificationsResult] = await Promise.all([
    supabase
      .from('letter_predictions')
      .select('prediction')
      .eq('letter_id', sourceLetterId)
      .eq('story_id', sourceStoryId)
      .limit(1),
    supabase
      .from('story_verifications')
      .select('listener_rating')
      .eq('story_id', sourceStoryId)
      .eq('source', 'letter')
      .eq('speaker_id', senderId)
      .eq('listener_id', receiverId)
      .limit(1),
  ]);

  const predictionRow = predictionsResult.data?.[0];
  const verificationRow = verificationsResult.data?.[0];

  if (!predictionRow || !verificationRow) return null;

  return {
    speakerRating: predictionRow.prediction ?? null,
    listenerRating: verificationRow.listener_rating ?? null,
  };
}

// ─── Live invite channel registry ────────────────────────────────────────────
// Multiple components (nav, letters-page) each call useOpenLiveInvite(), which
// calls subscribeToLiveInvites(). If each call created its own channel and called
// .subscribe(), the second .subscribe() on the same-named channel would throw
// (channel is already in JOINING state) → CHANNEL_ERROR. We avoid this by
// keeping a single channel per userId and multiplexing all callbacks through it.
type InviteHandler = {
  onInsert: (payload: Record<string, unknown>) => void;
  onUpdate: (payload: Record<string, unknown>) => void;
};

const liveInviteChannels = new Map<
  string,
  { channel: ReturnType<(typeof supabase)['channel']>; handlers: InviteHandler[] }
>();

/**
 * Subscribes to the current user's live invites via Supabase realtime (AD4).
 * Fires onInsert for new invites and onUpdate for closed invites.
 * Returns an unsubscribe function.
 *
 * Channel is ref-counted per userId: only one Supabase channel is created per
 * user regardless of how many components call this. Removed when the last
 * subscriber unsubscribes.
 *
 * UPDATE events require REPLICA IDENTITY FULL on clarity_live_invites.
 * Applied by migration 20260415140000_p703_invites_replica_identity.sql.
 */
export function subscribeToLiveInvites(
  userId: string,
  onInsert: (payload: Record<string, unknown>) => void,
  onUpdate: (payload: Record<string, unknown>) => void
): () => void {
  let entry = liveInviteChannels.get(userId);

  if (!entry) {
    const handlers: InviteHandler[] = [];
    const channel = supabase
      .channel(`live_invites:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'clarity_live_invites',
          filter: `target_user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) {
            const raw = payload.new as Record<string, unknown>;
            handlers.forEach((h) => h.onInsert(raw));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clarity_live_invites',
          filter: `target_user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) {
            const raw = payload.new as Record<string, unknown>;
            handlers.forEach((h) => h.onUpdate(raw));
          }
        }
      )
      .subscribe((status) => {
        // Log errors and timeouts; suppress SUBSCRIBED/CLOSED noise in production
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[live_invites_sub] ${status} for user ${userId}`);
        }
      });

    entry = { channel, handlers };
    liveInviteChannels.set(userId, entry);
  }

  const handler: InviteHandler = { onInsert, onUpdate };
  entry.handlers.push(handler);

  return () => {
    if (!entry) return;
    // Splice in-place so channel callbacks (which close over the same array reference)
    // immediately stop seeing this handler. filter+reassign would create a new array and
    // break the closure — removed handlers would still fire, new pushes would be invisible.
    const idx = entry.handlers.indexOf(handler);
    if (idx >= 0) entry.handlers.splice(idx, 1);
    if (entry.handlers.length === 0) {
      supabase.removeChannel(entry.channel);
      liveInviteChannels.delete(userId);
    }
  };
}

/**
 * P703: Returns true if an open (closed_at IS NULL) invite exists for the given receiver.
 * Used by StartClaritySessionButton to disable the button when an invite is already pending.
 * RLS allows the session creator to see their own invites.
 */
export async function checkOpenInviteForReceiver(receiverId: string): Promise<boolean> {
  const { data } = await supabase
    .from('clarity_live_invites')
    .select('id')
    .eq('target_user_id', receiverId)
    .is('closed_at', null)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export interface OpenInviteDetails {
  sessionId: string;
  code: string;
}

/**
 * P735: Returns the open invite (closed_at IS NULL) for a given receiver,
 * including the joined session code. Used by StartClaritySessionButton to
 * render Rejoin + End instead of a disabled Start.
 *
 * RLS: Visible to the session creator via live_invites_creator_select policy.
 * Returns null for unauthenticated callers, non-creators, or when no open invite exists.
 */
export async function getOpenInviteForSender(
  receiverId: string
): Promise<OpenInviteDetails | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // P1057: `clarity_sessions!inner(code)` dropped — an embed is column-ACL'd exactly like a
  // direct select. `!inner` was doing real work beyond the projection (it filtered out
  // invites whose session row is unreadable), so the join is kept without the code column.
  const { data, error } = await supabase
    .from('clarity_live_invites')
    .select('session_id, clarity_sessions!inner(id)')
    .eq('target_user_id', receiverId)
    .is('closed_at', null)
    .maybeSingle();

  if (error) {
    console.warn('[P735] getOpenInviteForSender:', error.message);
    return null;
  }
  if (!data) return null;

  // The caller here is the session CREATOR (this control renders on the sender's side), which
  // is the second principal get_room_code_for_invite authorizes.
  const { data: code } = await supabase.rpc('get_room_code_for_invite', {
    p_session_id: data.session_id,
  });
  if (!code) return null;

  return { sessionId: data.session_id, code: code as string };
}

/**
 * Closes the invite for a session without completing the session itself.
 * Used when the facilitator cancels the room before the listener joins.
 */
export async function cancelLiveInvite(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('clarity_live_invites')
    .update({ closed_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('closed_at', null);
  if (error) {
    throw error;
  }
}

/**
 * Atomically marks the session completed and closes linked invite (AD5).
 */
export async function completeClaritySession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_clarity_session', {
    p_session_id: sessionId,
  });
  if (error) {
    console.error('[P703] Error completing clarity session:', error?.message);
    throw new Error(error?.message || 'Failed to complete session');
  }
}

/**
 * P921 Cause 3: nav-surviving variant of completeClaritySession. The partner is
 * notified a session ended ONLY by the live_state.sessionEnded write this RPC
 * performs. When the creator clicks End Session and then IMMEDIATELY navigates
 * away (clicks a nav link / closes the tab) before the request completes, a
 * regular supabase.rpc() fetch is aborted by the navigation and the partner is
 * never notified. `keepalive: true` lets the in-flight request outlive the page
 * that issued it — the supported browser mechanism for "send on the way out".
 * (Distinct from the pagehide path, which was removed because firing DURING
 * unload is unreliable; here the request is issued while the page is still alive.)
 *
 * The caller passes the creator's `accessToken` (read synchronously from the
 * AuthContext session ref) so this function performs NO await before `fetch` —
 * the request is issued in the same tick as the End-Session click, before any
 * navigation can run. The RPC's auth.uid() check requires the creator's JWT, so
 * a missing token throws (the caller logs + swallows; local teardown already ran).
 * In the normal path (creator stays on /live) this resolves like any fetch;
 * `keepalive` only matters when an immediate navigation would otherwise abort it.
 */
export async function completeClaritySessionKeepalive(
  sessionId: string,
  accessToken: string | undefined,
): Promise<void> {
  if (!accessToken) {
    throw new Error('complete_clarity_session keepalive: missing access token (creator not authenticated)');
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/complete_clarity_session`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ p_session_id: sessionId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`complete_clarity_session keepalive failed: ${res.status} ${detail}`);
  }
}

/**
 * P703: Returns true if the session with the given code requires authentication
 * before joining (i.e., it is letter-sourced with a target_listener_id).
 * Callable by unauthenticated users — uses a SECURITY DEFINER RPC.
 */
export async function checkSessionRequiresAuth(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_session_requires_auth', {
    p_code: code,
  });
  if (error) {
    console.warn('[P703] check_session_requires_auth error:', error?.message);
    return false; // Fail open: don't block public sessions on RPC error
  }
  return !!data;
}
