/**
 * @file api.ts
 * CRITICAL DATA LAYER
 * -------------------
 * This file handles data transport.
 * The `createProfile` function here is an "Initiator" - it only sends the email.
 * It DOES NOT write to the database. Do not add database writes to the signup flow here.
 */
import { supabase } from '@/lib/supabase';
import type { Profile, ProfileSummary, DbProfile, DbProfileSummary, DbWitness } from '@/app/types';

// Re-export types for convenience
export type { Profile, ProfileSummary, Witness } from '@/app/types';

/**
 * Fetches a single user profile by their UUID.
 * This function retrieves the profile and its associated witnesses.
 * @param {string} id - The UUID of the user profile to fetch.
 * @returns {Promise<Profile | null>} A promise that resolves to the user's profile object or null if not found.
 */
export async function getProfile(id: string): Promise<Profile | null> {
  try {
    // First, get the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return null;
    }

    // Then, get witnesses separately
    const { data: witnesses } = await supabase
      .from('witnesses')
      .select('*')
      .eq('profile_id', id);

    // Get reciprocations count (profiles where this user is a witness)
    const { count: reciprocationsCount } = await supabase
      .from('witnesses')
      .select('*', { count: 'exact', head: true })
      .eq('witness_profile_id', id);

    return mapProfileFromDb({ ...profile, witnesses: witnesses || [] }, reciprocationsCount || 0);
  } catch {
    return null;
  }
}

/**
 * Fetches featured verified profiles for the landing page.
 * Returns up to 6 verified profiles, prioritizing those with reasons.
 * Ordering: profiles with reasons first (most recent), then profiles without reasons (most recent).
 * Also fetches witness counts for each profile.
 * @returns A promise that resolves to an array of up to 6 profile summary objects.
 */
export async function getFeaturedProfiles(): Promise<ProfileSummary[]> {
  try {
    const selectFields = 'id, slug, name, role, linkedin_url, reason, avatar_color, created_at, is_verified';

    // Two queries in parallel to guarantee profiles with reasons are included:
    // 1. Profiles WITH reasons (up to 6, most recent)
    // 2. Profiles WITHOUT reasons (up to 6, most recent) - for backfill
    const [withReasonsResult, withoutReasonsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(selectFields)
        .eq('is_verified', true)
        .neq('reason', '')
        .not('reason', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('profiles')
        .select(selectFields)
        .eq('is_verified', true)
        .or('reason.is.null,reason.eq.')
        .order('created_at', { ascending: false })
        .limit(6)
    ]);

    const withReasons = withReasonsResult.data || [];
    const withoutReasons = withoutReasonsResult.data || [];

    // Combine: all profiles with reasons first, then backfill with those without
    const combined = [...withReasons, ...withoutReasons].slice(0, 6);

    if (combined.length === 0) {
      return [];
    }

    // Fetch witness and reciprocation counts in parallel
    const profileIds = combined.map(p => p.id);
    const [witnessResult, reciprocationsResult] = await Promise.all([
      supabase.from('witnesses').select('profile_id').in('profile_id', profileIds),
      supabase.from('witnesses').select('witness_profile_id').in('witness_profile_id', profileIds).not('witness_profile_id', 'is', null)
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
  } catch {
    return [];
  }
}

/**
 * Gets the count of verified profiles.
 * Used for social proof display (e.g., "Join 47 champions who've taken the pledge").
 * @returns {Promise<number>} The count of verified profiles.
 */
export async function getVerifiedProfileCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_verified', true);

    if (error) {
      return 0;
    }

    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Fetches all profiles that have been marked as verified.
 * This is used to populate the "Clarity Champions" page, showcasing all users who have completed the pledge process.
 * The function also fetches and attaches all witnesses for each profile.
 * Profiles with reasons are shown first, then those without.
 * @returns {Promise<Profile[]>} A promise that resolves to an array of verified profile objects.
 */
export async function getVerifiedProfiles(): Promise<Profile[]> {
  try {
    // First, fetch profiles only (without nested witnesses query)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_verified', true)
      .order('created_at', { ascending: false });

    if (profilesError || !profiles || profiles.length === 0) {
      return [];
    }

    // Sort profiles: those with meaningful reasons first, then others
    // Within each group, maintain created_at desc order
    const withReasons = profiles.filter(p => p.reason && p.reason.trim().length > 0);
    const withoutReasons = profiles.filter(p => !p.reason || p.reason.trim().length === 0);
    const sortedProfiles = [...withReasons, ...withoutReasons];

    // Then, fetch witnesses for all profiles
    const profileIds = sortedProfiles.map(p => p.id);
    const { data: allWitnesses } = await supabase
      .from('witnesses')
      .select('*')
      .in('profile_id', profileIds);

    // Attach witnesses to their profiles
    const profilesWithWitnesses = sortedProfiles.map(profile => ({
      ...profile,
      witnesses: (allWitnesses || []).filter(w => w.profile_id === profile.id)
    }));

    return profilesWithWitnesses.map(mapProfileFromDb);
  } catch {
    return [];
  }
}

/**
 * Initiates the user signup process by sending a magic link (One-Time Password) to the user's email.
 * This function handles both new user registration and login for existing users.
 * User metadata (name, role, etc.) is passed in the options and is used to create or update the user's profile
 * via a database trigger when the user clicks the magic link.
 * @param {string} name - The user's full name.
 * @param {string} email - The user's email address.
 * @param {string} [role] - The user's professional role or title.
 * @param {string} [linkedinUrl] - A URL to the user's LinkedIn profile.
 * @param {string} [reason] - The user's reason for taking the pledge.
 * @returns {Promise<void>} A promise that resolves when the magic link has been sent.
 */
export async function createProfile(
  name: string,
  email: string,
  role?: string,
  linkedinUrl?: string,
  reason?: string
): Promise<void> {
  // We are simplifying this. The `createProfile` function will ONLY send the magic link.
  // The actual profile creation will be handled on the AuthCallbackPage after the user
  // has verified their email. This is a more robust and reliable flow.

  const redirectUrl = `${window.location.origin}/auth/callback`;
  // NOTE: Slug is generated at profile creation time in AuthCallbackPage, not here.
  // This prevents race conditions when multiple users with the same name sign up simultaneously.
  // If we generated the slug here, both would query the DB before any profile exists,
  // both would get the same slug, and one would fail with a constraint violation.

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
    throw error;
  }
}

/**
 * Adds a new witness to a user's profile.
 * A witness is someone who has endorsed or acknowledged a user's pledge.
 * @param {string} profileId - The UUID of the profile being witnessed.
 * @param {string} witnessName - The name of the person witnessing the pledge.
 * @param {string} [linkedinUrl] - An optional URL to the witness's LinkedIn profile.
 * @returns {Promise<string | null>} A promise that resolves to the new witness's ID, or null if an error occurred.
 */
export async function addWitness(
  profileId: string,
  witnessName: string,
  linkedinUrl?: string
): Promise<string | null> {
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
    return null;
  }
  return data.id;
}

/**
 * Sends a magic link to a user's email for login.
 * This is a simplified version of `createProfile` used for logging in existing users
 * where no profile data needs to be created or updated.
 * @param {string} email - The email address to send the magic link to.
 * @returns {Promise<{ error: any }>} A promise that resolves with an error object if the sign-in failed.
 */
export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // url to redirect to after clicking magic link
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
 * Updates an existing user profile.
 * Only the profile owner can update their profile (enforced by RLS).
 * @param {string} userId - The UUID of the profile to update.
 * @param {object} updates - The fields to update.
 * @returns {Promise<{ error: Error | null }>} A promise with error if update failed.
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
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Fetches a single user profile by their unique, URL-friendly slug.
 * This is the primary method for retrieving profiles for public-facing pages.
 * @param {string} slug - The slug of the user profile to fetch.
 * @returns {Promise<Profile | null>} A promise that resolves to the user's profile object or null if not found.
 */
export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  try {
    // First, get the profile by slug
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('slug', slug)
      .single();

    if (profileError || !profile) {
      return null;
    }

    // Then, get witnesses separately
    const { data: witnesses } = await supabase
      .from('witnesses')
      .select('*')
      .eq('profile_id', profile.id);

    // Get reciprocations count (profiles where this user is a witness)
    const { count: reciprocationsCount } = await supabase
      .from('witnesses')
      .select('*', { count: 'exact', head: true })
      .eq('witness_profile_id', profile.id);

    return mapProfileFromDb({ ...profile, witnesses: witnesses || [] }, reciprocationsCount || 0);
  } catch {
    return null;
  }
}
