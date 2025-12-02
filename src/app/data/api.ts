/**
 * @file api.ts
 * CRITICAL DATA LAYER
 * -------------------
 * This file handles data transport.
 * The `createProfile` function here is an "Initiator" - it only sends the email.
 * It DOES NOT write to the database. Do not add database writes to the signup flow here.
 */
import { supabase } from '@/lib/supabase';
import type { Profile, DbProfile, DbWitness } from '@/app/types';

// Re-export types for convenience
export type { Profile, Witness } from '@/app/types';

/**
 * Fetches a single user profile by their UUID.
 * This function retrieves the profile and its associated witnesses.
 * @param {string} id - The UUID of the user profile to fetch.
 * @returns {Promise<Profile | null>} A promise that resolves to the user's profile object or null if not found.
 */
export async function getProfile(id: string): Promise<Profile | null> {
  console.log('🔍 Fetching profile for ID:', id);
  
  try {
    // First, get the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError);
      console.error('Error details:', {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint
      });
      return null;
    }

    if (!profile) {
      console.error('❌ No profile data returned for ID:', id);
      return null;
    }

    console.log('✅ Profile fetched successfully:', profile.name);

    // Then, get witnesses separately
    const { data: witnesses, error: witnessesError } = await supabase
      .from('witnesses')
      .select('*')
      .eq('profile_id', id);

    if (witnessesError) {
      console.warn('⚠️ Error fetching witnesses (non-fatal):', witnessesError);
      // Continue without witnesses
      return mapProfileFromDb({ ...profile, witnesses: [] });
    }

    console.log('✅ Witnesses fetched:', witnesses?.length || 0);
    return mapProfileFromDb({ ...profile, witnesses: witnesses || [] });
  } catch (err) {
    console.error('❌ Unexpected error in getProfile:', err);
    return null;
  }
}

/**
 * Fetches featured verified profiles for the landing page.
 * Returns up to 6 verified profiles, prioritizing those with reasons.
 * Ordering: profiles with reasons first (most recent), then profiles without reasons (most recent).
 * @returns {Promise<Profile[]>} A promise that resolves to an array of up to 6 verified profile objects.
 */
export async function getFeaturedProfiles(): Promise<Profile[]> {
  console.log('🔍 Fetching featured profiles (up to 6, reason-first)...');

  try {
    const selectFields = 'id, slug, name, role, reason, avatar_color, created_at, is_verified';

    // First query: profiles WITH non-empty reasons (prioritized)
    const { data: withReasons, error: withReasonsError } = await supabase
      .from('profiles')
      .select(selectFields)
      .eq('is_verified', true)
      .not('reason', 'is', null)
      .neq('reason', '')
      .order('created_at', { ascending: false })
      .limit(6);

    if (withReasonsError) {
      console.error('❌ Error fetching profiles with reasons:', withReasonsError);
      return [];
    }

    // Filter out whitespace-only reasons
    const validWithReasons = (withReasons || []).filter(
      p => p.reason && p.reason.trim().length > 0
    );

    console.log('✅ Profiles with reasons:', validWithReasons.length);

    // If we have 6 profiles with reasons, we're done
    if (validWithReasons.length >= 6) {
      return validWithReasons.slice(0, 6).map(p => mapProfileFromDb({ ...p, witnesses: [] }));
    }

    // Backfill: fetch profiles WITHOUT reasons to fill remaining slots
    const remaining = 6 - validWithReasons.length;
    const existingIds = validWithReasons.map(p => p.id);

    // Build query - only add exclusion filter if we have IDs to exclude
    // Empty `()` in PostgREST is invalid syntax, so skip when no IDs
    let backfillQuery = supabase
      .from('profiles')
      .select(selectFields)
      .eq('is_verified', true)
      .order('created_at', { ascending: false })
      .limit(remaining);

    if (existingIds.length > 0) {
      backfillQuery = backfillQuery.not('id', 'in', `(${existingIds.join(',')})`);
    }

    const { data: withoutReasons, error: withoutReasonsError } = await backfillQuery;

    if (withoutReasonsError) {
      console.warn('⚠️ Error fetching backfill profiles (non-fatal):', withoutReasonsError);
      // Continue with what we have
    }

    // Filter backfill to only include profiles without valid reasons
    const validWithoutReasons = (withoutReasons || []).filter(
      p => !p.reason || p.reason.trim().length === 0
    );

    const combined = [...validWithReasons, ...validWithoutReasons];
    console.log('✅ Featured profiles fetched:', combined.length, '(with reasons:', validWithReasons.length, ', backfill:', validWithoutReasons.length, ')');

    if (combined.length === 0) {
      console.log('ℹ️ No verified profiles found for featured section');
      return [];
    }

    return combined.map(p => mapProfileFromDb({ ...p, witnesses: [] }));
  } catch (err) {
    console.error('❌ Unexpected error in getFeaturedProfiles:', err);
    return [];
  }
}

/**
 * Fetches all profiles that have been marked as verified.
 * This is used to populate the "Clarity Champions" page, showcasing all users who have completed the pledge process.
 * The function also fetches and attaches all witnesses for each profile.
 * @returns {Promise<Profile[]>} A promise that resolves to an array of verified profile objects.
 */
export async function getVerifiedProfiles(): Promise<Profile[]> {
  console.log('🔍 Fetching verified profiles...');
  
  try {
    // First, fetch profiles only (without nested witnesses query)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_verified', true)
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('❌ Error fetching verified profiles:', profilesError);
      console.error('Error details:', {
        message: profilesError.message,
        code: profilesError.code,
        details: profilesError.details,
        hint: profilesError.hint
      });
      return [];
    }

    console.log('✅ Verified profiles fetched:', profiles?.length || 0);
    console.log('Raw profile data:', profiles);

    if (!profiles || profiles.length === 0) {
      console.warn('⚠️ No verified profiles found in database');
      return [];
    }

    // Then, fetch witnesses for all profiles
    const profileIds = profiles.map(p => p.id);
    const { data: allWitnesses, error: witnessesError } = await supabase
      .from('witnesses')
      .select('*')
      .in('profile_id', profileIds);

    if (witnessesError) {
      console.warn('⚠️ Error fetching witnesses (non-fatal):', witnessesError);
      // Continue without witnesses
      const mapped = profiles.map(p => mapProfileFromDb({ ...p, witnesses: [] }));
      console.log('✅ Mapped profiles (without witnesses):', mapped);
      return mapped;
    }

    console.log('✅ Witnesses fetched:', allWitnesses?.length || 0);

    // Attach witnesses to their profiles
    const profilesWithWitnesses = profiles.map(profile => ({
      ...profile,
      witnesses: (allWitnesses || []).filter(w => w.profile_id === profile.id)
    }));

    const mapped = profilesWithWitnesses.map(mapProfileFromDb);
    console.log('✅ Mapped profiles:', mapped);
    return mapped;
  } catch (err) {
    console.error('❌ Unexpected error in getVerifiedProfiles:', err);
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
  console.log('📧 Sending magic link to:', email);

  // We are simplifying this. The `createProfile` function will ONLY send the magic link.
  // The actual profile creation will be handled on the AuthCallbackPage after the user
  // has verified their email. This is a more robust and reliable flow.

  const redirectUrl = `${window.location.origin}/auth/callback`;
  const slug = `${generateSlug(name)}-${Date.now()}`; // still generating a unique slug to pass along

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        name,
        slug,
        role,
        linkedin_url: linkedinUrl,
        reason,
        avatar_color: getRandomColor(),
      },
    },
  });

  if (error) {
    console.error('❌ Supabase auth error:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      name: error.name,
      code: error.code
    });
    throw error;
  }

  console.log('✅ Magic link sent successfully to:', email);
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
    console.error('Error adding witness:', error);
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
 * A private helper function to map data from the database (snake_case) to the frontend-friendly `Profile` interface (camelCase).
 * It also ensures a valid slug exists, generating one from the user's name if necessary.
 * @param {DbProfile} dbProfile - The raw profile object from the Supabase database.
 * @returns {Profile} The mapped profile object.
 */
function mapProfileFromDb(dbProfile: DbProfile): Profile {
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
    reciprocations: (dbProfile.witnesses || []).length, // Simplified count
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
 * Fetches a single user profile by their unique, URL-friendly slug.
 * This is the primary method for retrieving profiles for public-facing pages.
 * @param {string} slug - The slug of the user profile to fetch.
 * @returns {Promise<Profile | null>} A promise that resolves to the user's profile object or null if not found.
 */
export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  console.log('🔍 Fetching profile for slug:', slug);
  
  try {
    // First, get the profile by slug
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('slug', slug)
      .single();

    if (profileError) {
      console.error('❌ Error fetching profile by slug:', profileError);
      return null;
    }

    if (!profile) {
      console.error('❌ No profile data returned for slug:', slug);
      return null;
    }

    console.log('✅ Profile fetched successfully:', profile.name);

    // Then, get witnesses separately
    const { data: witnesses, error: witnessesError } = await supabase
      .from('witnesses')
      .select('*')
      .eq('profile_id', profile.id);

    if (witnessesError) {
      console.warn('⚠️ Error fetching witnesses (non-fatal):', witnessesError);
      return mapProfileFromDb({ ...profile, witnesses: [] });
    }

    console.log('✅ Witnesses fetched:', witnesses?.length || 0);
    return mapProfileFromDb({ ...profile, witnesses: witnesses || [] });
  } catch (err) {
    console.error('❌ Unexpected error in getProfileBySlug:', err);
    return null;
  }
}
