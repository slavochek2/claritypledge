/**
 * @file AuthCallbackPage.tsx
 * @module auth
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Writer for auth system. Creates profiles after magic link verification.
 * This is the ONLY place profiles are created (not in hooks or triggers).
 *
 * This page is the "Writer" of the authentication system.
 * It is responsible for the critical transaction of:
 * 1. Verifying the incoming auth session
 * 2. Upserting the user profile with is_verified=true (handles both new and existing users)
 * 3. Redirecting the user to their profile
 *
 * NOTE: Always upserts to handle race condition where database trigger creates
 * profile before this callback, leaving is_verified=false.
 *
 * This logic is isolated here to prevent race conditions.
 * DO NOT move this logic to a global hook or context.
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { LoaderIcon, AlertCircleIcon } from "lucide-react";
import { generateSlug, getProfile } from "@/app/data/api";
import * as Sentry from "@sentry/react";
import { analytics } from "@/lib/mixpanel";

/** Maximum retry attempts for slug conflicts before using timestamp fallback */
const MAX_SLUG_RETRIES = 3;

/** Escape special characters for use in regex patterns */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape special characters for use in PostgreSQL LIKE patterns */
function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing authentication...");
  const { user, session, isLoading, sessionChecked, refreshProfile } = useAuth();

  useEffect(() => {
    console.log('🔄 AuthCallback useEffect triggered:', { isLoading, sessionChecked, hasSession: !!session, hasUser: !!user });

    // Wait for session check to complete before deciding if there's an error
    if (!sessionChecked || isLoading) {
      console.log('⏳ Still loading, waiting...');
      return;
    }

    const processAuth = async () => {
      if (!session) {
        // Log to Sentry for debugging production auth failures
        Sentry.captureMessage('Auth callback: No session found', {
          level: 'warning',
          tags: { component: 'AuthCallbackPage' },
          extra: {
            isLoading,
            sessionChecked,
            hasUser: !!user,
            url: window.location.href
          }
        });
        analytics.track('auth_callback_failed', { reason: 'no_session' });
        setStatus("auth_error");
        console.error("No session found after loading.");
        return;
      }

      const { user: authUser } = session;
      const { user_metadata } = authUser;
      const isReturningUser = !!user;

      // Always upsert to ensure is_verified is set to true.
      // This handles the race condition where the database trigger creates the profile
      // before this callback runs, leaving is_verified as false.
      setStatus(isReturningUser ? "Verifying..." : "Creating your profile...");

      // P50: Detect registration source from URL params
      // - source=pledge → user signed up via /sign-pledge (pledger)
      // - source=live → user signed up via /live (non-pledger) - currently not used as /live uses anonymous auth
      // - no source → existing login flow (preserve existing has_pledged status)
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get('source');
      const isLiveRegistration = source === 'live';

      // For returning users, the profile from useAuth might not be loaded yet.
      // Fetch directly to ensure we preserve existing slugs for returning users.
      // This prevents generating a new slug when an existing user re-verifies.
      let existingProfile = user;
      if (!existingProfile) {
        existingProfile = await getProfile(authUser.id);
      }

      // Handle /live user migration: If no profile found by ID, check by email.
      // This handles the case where a /live user (anonymous auth) logs in via magic link
      // and gets a NEW auth ID. Their old profile exists under the anonymous ID.
      if (!existingProfile && authUser.email) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', authUser.email)
          .single();

        if (profileByEmail && profileByEmail.id !== authUser.id) {
          console.log('🔄 Found profile by email with different ID (migrating /live user):', {
            oldId: profileByEmail.id,
            newId: authUser.id,
            email: authUser.email,
          });

          // Check for witnesses before migration (defensive - /live users shouldn't have any)
          const { data: witnessCheck } = await supabase
            .from('witnesses')
            .select('id')
            .eq('profile_id', profileByEmail.id)
            .limit(1);

          if (witnessCheck && witnessCheck.length > 0) {
            console.warn('⚠️ Profile being migrated has witnesses - this is unexpected for /live users');
            // Continue anyway but log for debugging
          }

          // Delete old profile - it was created with anonymous auth ID
          // The new upsert will create fresh profile with correct auth ID
          // CAUTION: If upsert fails after this, user data is lost. However:
          // - /live users typically have no witnesses (we just checked)
          // - Profile data is copied to local var before delete
          // - Magic link can be resent if something goes wrong
          const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', profileByEmail.id);

          if (deleteError) {
            console.error('❌ Failed to delete old profile during migration:', deleteError);
            // Continue anyway - the upsert might still work or give clearer error
          } else {
            console.log('✅ Old anonymous profile deleted, proceeding with new profile creation');
          }

          // Use data from old profile for the new one
          existingProfile = {
            id: authUser.id, // Will be overwritten, but keeps TypeScript happy
            slug: profileByEmail.slug,
            name: profileByEmail.name,
            email: profileByEmail.email,
            role: profileByEmail.role,
            linkedinUrl: profileByEmail.linkedin_url,
            reason: profileByEmail.reason,
            avatarColor: profileByEmail.avatar_color,
            isVerified: false, // Will be set to true
            hasPledged: profileByEmail.has_pledged,
            signedAt: profileByEmail.created_at,
            witnesses: [],
            reciprocations: 0,
            pledgeVersion: profileByEmail.pledge_version,
          };
        }
      }

      // Generate slug at profile creation time to prevent race conditions.
      // If we generated in createProfile (before email verification), two users
      // signing up simultaneously with the same name would both get the same slug
      // since neither profile exists yet when they query.
      // P63: Prefer Google's full_name for new users, fallback to existing patterns
      const name = existingProfile?.name || user_metadata.full_name || user_metadata.name || 'Anonymous';

      // P50: For /live registrations, don't generate slug (they're not pledgers)
      // For existing users, preserve their slug
      // For new pledge signups, generate slug as usual
      let slug: string | null = existingProfile?.slug || null;
      if (!isLiveRegistration && !slug) {
        slug = generateSlug(name);
      }

      // Validate email exists (should always be present from auth, but be defensive)
      const email = authUser.email;
      if (!email) {
        setStatus("Error: No email found. Please contact support.");
        console.error("❌ Auth user has no email:", authUser.id);
        return;
      }

      // P50: Determine has_pledged status
      // - Preserve existing status for returning users
      // - For new users: false if source=live, true otherwise (source=pledge or no source)
      const hasPledged = existingProfile?.hasPledged ?? !isLiveRegistration;

      // P63: Capture Google OAuth avatar if user authenticated via Google
      // Note: app_metadata.provider shows ORIGINAL signup method, not current login method
      // For linked accounts (email user who later logs in with Google), we detect Google
      // by checking for Google-specific fields in user_metadata (picture, iss containing google)
      const googleAvatarUrl = user_metadata?.picture || user_metadata?.avatar_url;
      const hasGoogleMetadata = !!(user_metadata?.picture || user_metadata?.iss?.includes('google'));
      const isGoogleAuth = hasGoogleMetadata;


      // P63: Determine avatar fields
      // - If Google auth: use Google avatar URL, set provider to 'google'
      // - If existing profile has avatar: preserve it (unless re-authenticating with Google)
      // - Otherwise: use generated avatar with color
      let avatarUrl = existingProfile?.avatarUrl;
      let avatarProvider = existingProfile?.avatarProvider;
      let avatarColor = existingProfile?.avatarColor || user_metadata.avatar_color;

      if (isGoogleAuth && googleAvatarUrl) {
        // User authenticated with Google - use their Google avatar
        // This also handles the "auto-update on re-login" decision (Option A from spec)
        avatarUrl = googleAvatarUrl;
        avatarProvider = 'google';
        avatarColor = undefined; // Google users don't need generated color
      } else if (!avatarProvider) {
        // New user without Google auth - will use generated avatar
        avatarProvider = 'generated';
      }

      const upsertData = {
        id: authUser.id,
        email,
        name,
        slug,
        role: existingProfile?.role || user_metadata.role,
        linkedin_url: existingProfile?.linkedinUrl || user_metadata.linkedin_url,
        reason: existingProfile?.reason || user_metadata.reason,
        avatar_color: avatarColor,
        avatar_url: avatarUrl, // P63: Google avatar URL
        avatar_provider: avatarProvider, // P63: Avatar source
        is_verified: true,
        // Preserve existing pledge version for returning users, default to v2 for new signups
        pledge_version: existingProfile?.pledgeVersion || 2,
        // P50: Track whether user explicitly signed the pledge
        has_pledged: hasPledged,
      };

      console.log('🔄 Profile data to save:', upsertData);
      console.log('🔄 Auth user ID:', authUser.id);
      console.log('🔄 Existing user from useAuth:', user);

      // Try to upsert with retry logic for slug conflicts
      let upsertError = null;
      let retries = 0;

      while (retries < MAX_SLUG_RETRIES) {
        const { error } = await supabase
          .from('profiles')
          .upsert(upsertData, { onConflict: 'id' });

        if (!error) {
          console.log('✅ Profile upsert successful!');
          break;
        }

        // Check if this is a slug uniqueness constraint violation
        // Postgres unique violation code is 23505
        if (error.code === '23505' && error.message?.includes('slug')) {
          retries++;
          console.log(`⚠️ Slug conflict detected, retry ${retries}/${MAX_SLUG_RETRIES}`);

          // Query for existing slugs to find next available number
          // This gives users short, memorable slugs like john-doe-2
          const baseSlug = generateSlug(name);
          // Escape special chars for LIKE pattern (%, _, \)
          const escapedSlug = escapeLikePattern(baseSlug);
          const { data: similarSlugs } = await supabase
            .from('profiles')
            .select('slug')
            .or(`slug.eq.${baseSlug},slug.like.${escapedSlug}-%`);

          // Find highest existing number (base slug counts as 1)
          // Escape regex metacharacters to prevent ReDoS and incorrect matches
          const escapedRegex = escapeRegex(baseSlug);
          const existingNumbers = (similarSlugs || [])
            .map(s => {
              if (s.slug === baseSlug) return 1;
              const match = s.slug.match(new RegExp(`^${escapedRegex}-(\\d+)$`));
              return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);

          const nextNumber = existingNumbers.length > 0
            ? Math.max(...existingNumbers) + 1
            : 2;

          slug = `${baseSlug}-${nextNumber}`;
          upsertData.slug = slug;
          console.log('🔄 Trying new slug:', slug);
        } else {
          // Different error, don't retry
          upsertError = error;
          break;
        }
      }

      // If we exhausted retries, use timestamp fallback to guarantee uniqueness
      if (retries >= MAX_SLUG_RETRIES && !upsertError) {
        slug = `${generateSlug(name)}-${Date.now()}`;
        upsertData.slug = slug;
        console.log('🔄 Final fallback slug:', slug);

        const { error: finalError } = await supabase
          .from('profiles')
          .upsert(upsertData, { onConflict: 'id' });

        if (finalError) {
          upsertError = finalError;
        } else {
          console.log('✅ Profile upsert successful with fallback slug!');
        }
      }

      if (upsertError) {
        analytics.track('auth_callback_failed', { reason: 'profile_upsert_failed' });
        setStatus("Error creating profile. Please contact support.");
        console.error("❌ Error upserting profile:", upsertError);
        console.error("❌ Error details:", {
          message: upsertError.message,
          code: upsertError.code,
          details: upsertError.details,
          hint: upsertError.hint,
        });
        return;
      }

      // Identify user and track successful auth
      // P50: Include has_pledged and registration_source for user segmentation
      const registrationSource = source || (isReturningUser ? 'returning' : 'pledge');
      analytics.identify(authUser.id);
      analytics.setUserProperties({
        email: authUser.email,
        name,
        has_role: !!upsertData.role,
        has_linkedin: !!upsertData.linkedin_url,
        profile_slug: slug,
        created_at: new Date().toISOString(),
        // P50: User segmentation properties
        has_pledged: hasPledged,
        registration_source: registrationSource,
      });
      analytics.track(isReturningUser ? 'login_complete' : 'profile_created', {
        slug,
        has_role: !!upsertData.role,
        has_linkedin: !!upsertData.linkedin_url,
        has_reason: !!upsertData.reason,
        // P50: Include source in event tracking
        registration_source: registrationSource,
        has_pledged: hasPledged,
      });

      // Refresh profile in auth context so nav/header shows correct user data
      // This fixes race condition where initial fetch happened before upsert completed
      await refreshProfile();
      console.log('✅ Profile refreshed in auth context');

      // Clear pending verification email now that user is verified
      sessionStorage.removeItem('pendingVerificationEmail');

      // P50: Redirect based on has_pledged status
      // - Pledgers → certificate page (/p/:slug/pledge)
      // - Non-pledgers → profile page (/p/:slug)
      setStatus("Redirecting...");
      if (hasPledged) {
        navigate(`/p/${slug}/pledge`, { replace: true });
      } else {
        navigate(`/p/${slug}`, { replace: true });
      }
    };

    processAuth();
  }, [isLoading, sessionChecked, session, user, navigate, refreshProfile]);

  // Error state - show helpful recovery options
  if (status === "auth_error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <div className="h-16 w-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <AlertCircleIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Link Expired or Invalid</h1>
            <p className="text-lg text-muted-foreground">
              Magic links are valid for 1 hour. Please request a new one.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link
              to="/sign-pledge"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white"
            >
              Request New Link
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 rounded-md px-6 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading/processing state
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <LoaderIcon className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Completing Verification</h1>
          <p className="text-lg text-muted-foreground">{status}</p>
        </div>
      </div>
    </div>
  );
}
