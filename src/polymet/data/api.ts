import { supabase } from '@/lib/supabase';
import type { Profile } from '@/polymet/types';

// Re-export types for convenience
export type { Profile, Witness } from '@/polymet/types';

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
 * Check if a slug already exists in the database
 */
export async function checkSlugExists(slug: string): Promise<boolean> {
  if (!slug) {
    return false;
  }
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') { // Ignore 'not found' error
    console.error('Error checking slug:', error);
    return true; // Assume exists on error to be safe
  }
  
  return !!data;
}

// Authentication handles profile creation via trigger
// For Magic Link flow, we use signInWithOtp
export async function createProfile(
  name: string,
  email: string,
  role?: string,
  linkedinUrl?: string,
  reason?: string
): Promise<{ slug: string }> {
  console.log('📧 Creating profile with email:', email);
  
  // Validate inputs
  if (!name || !name.trim()) {
    throw new Error('Name is required');
  }
  if (!email || !email.trim()) {
    throw new Error('Email is required');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  
  // Generate slug from name
  const slug = generateSlug(name);
  console.log('🔤 Generated slug:', slug);
  
  try {
    const redirectUrl = `${window.location.origin}/auth/callback?slug=${slug}`;
    console.log('🔗 Redirect URL:', redirectUrl);
    
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
      console.error('❌ Supabase auth error:', {
        message: error.message,
        code: error.status,
        details: error
      });
      throw error;
    }
    
    // Store email and firstTimePledge flag in local storage
    localStorage.setItem('pendingVerificationEmail', email);
    localStorage.setItem('firstTimePledge', 'true');

    console.log('✅ Magic link sent successfully to:', email);
    return { slug };
  } catch (err) {
    console.error('❌ Error in createProfile:', err);
    throw err;
  }
}

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

export async function getCurrentUser(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  return getProfile(user.id);
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Helper to map DB columns (snake_case) to frontend interface (camelCase)
function mapProfileFromDb(dbProfile: any): Profile {
  // Generate a safe slug if one doesn't exist or is empty
  // Priority: 1) existing slug 2) generate from name 3) use id as fallback
  let safeSlug: string;
  
  if (dbProfile.slug && typeof dbProfile.slug === 'string' && dbProfile.slug.trim() !== '') {
    safeSlug = dbProfile.slug;
  } else if (dbProfile.name && typeof dbProfile.name === 'string' && dbProfile.name.trim() !== '') {
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
    witnesses: (dbProfile.witnesses || []).map((w: any) => ({
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

function getRandomColor() {
  const colors = ["#0044CC", "#002B5C", "#FFD700", "#FF6B6B", "#4ECDC4"];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generate a URL-friendly slug from a name
 * Example: "John Doe" -> "john-doe"
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
 * Ensure slug uniqueness by appending a number if needed
 */
async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 2;
  
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('slug', slug)
      .single();
    
    // If no profile found with this slug, it's unique
    if (error || !data || (excludeId && data.id === excludeId)) {
      return slug;
    }
    
    // Try next variation
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * Get profile by slug (readable URL)
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

/**
 * Update profile information
 */
export async function updateProfile(
  id: string,
  updates: Partial<Pick<Profile, 'name' | 'role' | 'linkedinUrl' | 'reason'>>
): Promise<{ error: any }> {
  // Convert camelCase to snake_case for DB
  const dbUpdates: any = {};
  
  if (updates.name !== undefined) {
    dbUpdates.name = updates.name;
    // Regenerate slug if name changed
    const newSlug = generateSlug(updates.name);
    dbUpdates.slug = await ensureUniqueSlug(newSlug, id);
  }
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.linkedinUrl !== undefined) dbUpdates.linkedin_url = updates.linkedinUrl;
  if (updates.reason !== undefined) dbUpdates.reason = updates.reason;
  
  const { error } = await supabase
    .from('profiles')
    .update(dbUpdates)
    .eq('id', id);
  
  return { error };
}

export async function verifyProfile(id: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_verified: true })
    .eq('id', id);
  
  return { error };
}

export async function verifyEndorsement(
  profileId: string,
  witnessId: string
): Promise<Profile | null> {
  const { data: witness, error } = await supabase
    .from('witnesses')
    .update({ is_verified: true })
    .eq('id', witnessId)
    .eq('profile_id', profileId)
    .select()
    .single();

  if (error || !witness) {
    console.error('Error verifying endorsement:', error);
    return null;
  }
  
  // In this real auth version, we don't auto-create profiles.
  // The user must sign up.
  return null;
}

/**
 * Send an invitation email to endorse someone's pledge
 * Uses Supabase's built-in email sending via Edge Function
 */
export async function sendEndorsementInvitation(
  inviterProfileId: string,
  inviterName: string,
  recipientFirstName: string,
  recipientEmail: string,
  personalMessage: string,
  profileUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // For MVP: Create a special OTP link with custom data
    // The recipient will click the link and be directed to endorse
    const endorsementUrl = `${window.location.origin}${profileUrl}?invited=true&from=${encodeURIComponent(inviterName)}`;
    
    const { error } = await supabase.auth.signInWithOtp({
      email: recipientEmail,
      options: {
        emailRedirectTo: endorsementUrl,
        data: {
          invitation_type: 'endorsement',
          inviter_id: inviterProfileId,
          inviter_name: inviterName,
          recipient_first_name: recipientFirstName,
          personal_message: personalMessage,
        },
      },
    });

    if (error) {
      console.error('Error sending invitation:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error sending invitation:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Failed to send invitation' 
    };
  }
}
