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
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { AlertCircleIcon } from "lucide-react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { slugifyName, getProfile, getEventBySlug, rsvpToEvent, markSelfVerified, setMyPledge, replayLetterPositions } from "@/app/data/api";
import { CURRENT_TERMS_VERSION } from "@/lib/constants";
import { CURRENT_PLEDGE_VERSION } from "@/app/content/pledge-text";
import { CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import * as Sentry from "@sentry/react";
import { analytics, isInternalAccount } from "@/lib/mixpanel";
import { parseAuthGateIntent, fromAuthGatePosition, isValidPointId, isValidUUID } from "@/lib/auth-gate-utils";
import { pointsService } from "@/app/data/points-service";
import { getAllAnonPositions, clearAllAnonPositions } from "@/app/hooks/useAnonPosition";
import { organizationsService } from "@/app/data/organizations-service";

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
  const location = useLocation();
  const [status, setStatus] = useState("Finalizing authentication...");
  const { user, session, isLoading, sessionChecked, refreshProfile } = useAuth();

  useEffect(() => {
    if (import.meta.env.DEV) console.log('🔄 AuthCallback useEffect triggered:', { isLoading, sessionChecked, hasSession: !!session, hasUser: !!user });

    // Wait for session check to complete before deciding if there's an error
    if (!sessionChecked || isLoading) {
      if (import.meta.env.DEV) console.log('⏳ Still loading, waiting...');
      return;
    }

    const processAuth = async () => {
      if (!session) {
        // P1011: discriminate rather than suppress. `session` comes from useAuth,
        // not from the callback URL, so `!session` is the terminal state for EVERY
        // way this callback can fail — expired link, but also a link opened in a
        // different browser (PKCE verifier lives in the other browser's storage),
        // a misconfigured Supabase Redirect URL (breaks 100% of logins), a GoTrue
        // outage, or a session that fails to hydrate (Safari private mode, ITP).
        // Only the first is expected user behaviour; the rest are defects, and
        // JAVASCRIPT-REACT-2 was reporting all of them under one unresolvable
        // issue (29 events — "0 users impacted" is an artifact of the failure
        // being pre-authentication, not evidence of no impact).
        //
        // Supabase appends its reason to the callback URL — in the hash for the
        // implicit flow, in the query string for PKCE — so read both.
        // Both halves read from `window.location` deliberately: this parses the
        // real callback URL the identity provider redirected to, which is a
        // browser-level fact. Mixing in React Router's `location` would read a
        // different source for the query half than for the hash half.
        const errorParams = new URLSearchParams(
          window.location.hash.replace(/^#/, '') || window.location.search
        );
        const supabaseError =
          errorParams.get('error_code') ?? errorParams.get('error');
        const supabaseErrorDescription = errorParams.get('error_description');

        // `error_code` is read FIRST and this is load-bearing. Supabase sends an
        // expired link as `error=access_denied&error_code=otp_expired`, so the
        // specific code wins the match. The other causes that also use the generic
        // `access_denied` (signups disabled, a banned user, a denied provider
        // consent) carry their OWN error_code — `signups_not_allowed` and friends
        // — so they never match here and are still captured.
        //
        // Only a BARE `access_denied` with no error_code is treated as expected,
        // which decisions.md 2026-03-07 (P483+P488) records as precisely the
        // expired-magic-link redirect this app already handles gracefully on the
        // accept page ("expired links redirect with #error=access_denied").
        const isExpectedExpiredLink =
          supabaseError === 'otp_expired' || supabaseError === 'access_denied';

        if (!isExpectedExpiredLink) {
          // Keeps `url` — the one field that separates the causes above. The
          // Mixpanel event below cannot stand in for it: it carries only the
          // reason string, and analytics.track no-ops entirely when the Mixpanel
          // CDN global is missing (src/lib/mixpanel.ts) — i.e. for every user
          // running a tracker blocker.
          Sentry.captureMessage('Auth callback: no session, unexplained', {
            level: 'error',
            tags: { component: 'AuthCallbackPage' },
            extra: {
              isLoading,
              sessionChecked,
              hasUser: !!user,
              supabaseError,
              url: window.location.href,
            },
          });
        }
        // `description` rides along even on the suppressed path: it is the only
        // remaining way to tell a genuinely-expired link from a bare access_denied
        // arriving for some other reason, now that the Sentry capture is skipped.
        analytics.track('auth_callback_failed', {
          reason: supabaseError ?? 'no_session',
          description: supabaseErrorDescription ?? undefined,
        });
        setStatus("auth_error");
        console.error("No session found after loading.");
        return;
      }

      const { user: authUser } = session;
      const { user_metadata } = authUser;
      // P50/P64: Detect registration source from URL params
      // - source=pledge → user signed up via /sign-pledge (pledger)
      // - source=signup → user signed up via /signup (account only, no pledge)
      // - source=live → user signed up via /live (non-pledger) - currently not used as /live uses anonymous auth
      // - source=login → user logging in (must have existing account)
      // - no source → legacy login flow (treat as login)
      // NOTE: Use location.search (from useLocation) for testability with MemoryRouter
      const urlParams = new URLSearchParams(location.search);
      const source = urlParams.get('source');
      const isLiveRegistration = source === 'live';
      const isLoginSource = source === 'login' || !source;

      // For returning users, the profile from useAuth might not be loaded yet.
      // Fetch directly to ensure we preserve existing slugs for returning users.
      // This prevents generating a new slug when an existing user re-verifies.
      let existingProfile = user;
      if (!existingProfile) {
        existingProfile = await getProfile(authUser.id);
      }

      // P895: derive from the authoritative fetch — context user may be null on
      // transient fetch failures. Live migration finds a profile by email (not id)
      // and still counts as a first authed signup, not a returning login.
      const isReturningUser = !!existingProfile && !isLiveRegistration;
      setStatus(isReturningUser ? "Verifying..." : "Creating your profile...");

      // P832: Read existing accepted_terms_version separately — the Profile type
      // does not expose it. Returning users must keep whatever they previously
      // accepted; only new rows default to CURRENT_TERMS_VERSION. Without this,
      // every OAuth callback silently bumps every returning user to the current
      // version, defeating the TermsAcceptanceGate re-acceptance modal.
      const { data: existingTermsRow } = await supabase
        .from('profiles')
        .select('accepted_terms_version')
        .eq('id', authUser.id)
        .maybeSingle();
      const preservedTermsVersion =
        existingTermsRow?.accepted_terms_version ?? CURRENT_TERMS_VERSION;

      // Handle /live user migration: If no profile found by ID, check by email.
      // This handles the case where a /live user (anonymous auth) logs in via magic link
      // and gets a NEW auth ID. Their old profile exists under the anonymous ID.
      // Only run for /live registrations — other sources don't have anonymous profiles to migrate.
      if (!existingProfile && isLiveRegistration && authUser.email) {
        // P877: profiles.email/linkedin_url/reason are revoked from authenticated.
        // get_my_profile_by_email (SECURITY DEFINER) returns the full row ONLY when the
        // requested email belongs to the authenticated caller — exactly this migration
        // case (old anonymous /live profile, same email, different auth id).
        const { data: profileByEmail } = await supabase
          .rpc('get_my_profile_by_email', { p_email: authUser.email });

        if (profileByEmail && profileByEmail.id !== authUser.id) {
          if (import.meta.env.DEV) console.log('🔄 Found profile by email with different ID (migrating /live user):', {
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

          // Save old profile data for recovery if upsert fails
          const oldProfileBackup = {
            id: profileByEmail.id,
            email: profileByEmail.email,
            name: profileByEmail.name,
            slug: profileByEmail.slug,
            role: profileByEmail.role,
            linkedin_url: profileByEmail.linkedin_url,
            reason: profileByEmail.reason,
            avatar_color: profileByEmail.avatar_color,
            avatar_url: profileByEmail.avatar_url,
            avatar_provider: profileByEmail.avatar_provider,
            is_verified: profileByEmail.is_verified,
            has_pledged: profileByEmail.has_pledged,
            pledge_version: profileByEmail.pledge_version,
            accepted_terms_version: profileByEmail.accepted_terms_version,
            created_at: profileByEmail.created_at,
          };

          // Delete old profile - it was created with anonymous auth ID
          // The new upsert will create fresh profile with correct auth ID
          // If upsert fails, we'll attempt to restore from oldProfileBackup
          const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', profileByEmail.id);

          if (deleteError) {
            console.error('❌ Failed to delete old profile during migration:', deleteError);
            // Continue anyway - the upsert might still work or give clearer error
          } else {
            if (import.meta.env.DEV) console.log('✅ Old anonymous profile deleted, proceeding with new profile creation');
          }

          // Store backup to sessionStorage (survives page reload, unlike window)
          // This enables recovery if upsert fails or page reloads mid-migration
          try {
            sessionStorage.setItem('__profileMigrationBackup', JSON.stringify(oldProfileBackup));
          } catch {
            console.warn('⚠️ Could not store profile backup to sessionStorage');
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
            // P1133: fixes is_internal for THIS login's analytics event only.
            // upsert_my_profile's INSERT column list never includes is_test_account
            // (P571's RLS pins it against ordinary client writes — same trust-column
            // class as is_verified/has_pledged), so the delete+upsert below still
            // persists the new row with is_test_account=false regardless of this
            // value. Every login AFTER this migration reads is_test_account:false
            // from the DB again. A real fix needs a SECURITY DEFINER RPC (like
            // markSelfVerified/setMyPledge below) and is out of scope for P1133's
            // Non-Goals (no schema/RPC changes) — tracked separately, see spec Risks.
            isTestAccount: profileByEmail.is_test_account ?? false,
          };
        }
      }

      // Option B: If login attempt has no account, create it (Google = sign in OR sign up).
      // Magic link login still guards against this in LoginForm (checks email exists before sending link).
      // No redirect needed — just fall through to profile creation below.

      // Generate slug at profile creation time to prevent race conditions.
      // If we generated in createProfile (before email verification), two users
      // signing up simultaneously with the same name would both get the same slug
      // since neither profile exists yet when they query.
      // P63: Prefer Google's full_name for new users, fallback to existing patterns
      const name = existingProfile?.name || user_metadata.full_name || user_metadata.name || 'Anonymous';

      // P736: All authed registrations generate a slug (including /live).
      // For existing users, preserve their slug.
      let slug: string | null = existingProfile?.slug || null;
      // P985: romanize the name to ASCII (李明 → "li-ming"), reused at every slug site
      // below. Computed only when a new slug is needed (signup, or self-heal of a legacy
      // empty slug) — never on a returning-user login that already has a slug — so the
      // lazy-imported transliteration chunk loads only when actually required.
      let romanizedBase = '';
      if (!slug) {
        romanizedBase = await slugifyName(name);
        // P985: defense-in-depth — guarantee a non-empty slug even for a name with
        // no romanizable characters (e.g. all-emoji).
        slug = romanizedBase || `user-${Date.now()}`;
      }

      // Validate email exists (should always be present from auth, but be defensive)
      const email = authUser.email;
      if (!email) {
        setStatus("Error: No email found. Please contact support.");
        console.error("❌ Auth user has no email:", authUser.id);
        return;
      }

      // P50/P64: Determine has_pledged status
      // - source=pledge → ALWAYS true (user is explicitly pledging)
      // - source=signup → ALWAYS false (user just wants an account)
      // - source=live → ALWAYS false (non-pledger)
      // - no source (login) → preserve existing status for returning users, default true for legacy
      // CRITICAL: source=pledge overrides existing false status (non-pledged user taking pledge)
      const isSignupRegistration = source === 'signup';
      const isPledgeSource = source === 'pledge';
      const hasPledged = isPledgeSource
        ? true  // Pledging always sets has_pledged=true, even if they had an account with false
        // For new users: only pledge source sets has_pledged=true. Login/signup/live all default false.
        // For existing users: preserve whatever they had.
        : (existingProfile?.hasPledged ?? (!isLiveRegistration && !isSignupRegistration && !isLoginSource));

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
        // P880: is_verified / has_pledged are NOT written through the upsert anymore —
        // the profiles guard trigger pins them on client-role writes and upsert_my_profile
        // no longer reads them from p_data. They are set below via the server-controlled
        // mark_self_verified() and set_my_pledge() accessors.
        // Preserve existing pledge version for returning users (grandfather);
        // new signups get the current version via the pointer.
        pledge_version: existingProfile?.pledgeVersion ?? CURRENT_PLEDGE_VERSION,
        // P832: Preserve returning user's stored version so a v1.2 row stays v1.2
        // and the TermsAcceptanceGate fires. New rows fall back to CURRENT_TERMS_VERSION.
        accepted_terms_version: preservedTermsVersion,
      };

      if (import.meta.env.DEV) console.log('🔄 Profile data to save:', upsertData);
      if (import.meta.env.DEV) console.log('🔄 Auth user ID:', authUser.id);
      if (import.meta.env.DEV) console.log('🔄 Existing user from useAuth:', user);

      // Try to upsert with retry logic for slug conflicts
      let upsertError = null;
      let retries = 0;

      while (retries < MAX_SLUG_RETRIES) {
        // P877: profiles.email/linkedin_url/reason are revoked from authenticated, so a
        // direct .upsert() (which reads EXCLUDED.email) fails. upsert_my_profile writes
        // the caller's own row server-side (id forced to auth.uid()).
        const { error } = await supabase
          .rpc('upsert_my_profile', { p_data: upsertData });

        if (!error) {
          if (import.meta.env.DEV) console.log('✅ Profile upsert successful!');
          break;
        }

        // Check if this is a slug uniqueness constraint violation
        // Postgres unique violation code is 23505
        if (error.code === '23505' && error.message?.includes('slug')) {
          retries++;
          if (import.meta.env.DEV) console.log(`⚠️ Slug conflict detected, retry ${retries}/${MAX_SLUG_RETRIES}`);

          // Query for existing slugs to find next available number
          // This gives users short, memorable slugs like john-doe-2
          const baseSlug = romanizedBase; // P985: romanized base (non-empty here — a conflict implies a real slug collided)
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
          if (import.meta.env.DEV) console.log('🔄 Trying new slug:', slug);
        } else {
          // Different error, don't retry
          upsertError = error;
          break;
        }
      }

      // If we exhausted retries, use timestamp fallback to guarantee uniqueness
      if (retries >= MAX_SLUG_RETRIES && !upsertError) {
        slug = `${romanizedBase || 'user'}-${Date.now()}`;
        upsertData.slug = slug;
        if (import.meta.env.DEV) console.log('🔄 Final fallback slug:', slug);

        // P877: own-row write via SECURITY DEFINER accessor (see above).
        const { error: finalError } = await supabase
          .rpc('upsert_my_profile', { p_data: upsertData });

        if (finalError) {
          upsertError = finalError;
        } else {
          if (import.meta.env.DEV) console.log('✅ Profile upsert successful with fallback slug!');
        }
      }

      if (upsertError) {
        // Attempt to recover migrated profile if we have a backup
        let backup: Record<string, unknown> | null = null;
        try {
          const backupStr = sessionStorage.getItem('__profileMigrationBackup');
          if (backupStr) {
            backup = JSON.parse(backupStr);
          }
        } catch {
          console.warn('⚠️ Could not read profile backup from sessionStorage');
        }

        if (backup) {
          if (import.meta.env.DEV) console.log('⚠️ Upsert failed after migration delete, attempting to restore old profile...');
          const { error: restoreError } = await supabase
            .from('profiles')
            .insert(backup);

          if (restoreError) {
            console.error('❌ CRITICAL: Failed to restore profile backup:', restoreError);
            Sentry.captureException(new Error('Profile migration recovery failed'), {
              extra: { backup, upsertError, restoreError },
            });
          } else {
            if (import.meta.env.DEV) console.log('✅ Old profile restored successfully');
          }
          // Clean up backup
          sessionStorage.removeItem('__profileMigrationBackup');
        }

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

      // P880: trust columns are server-controlled. After the profile row exists, mark the
      // caller verified (only succeeds once Supabase Auth reports the email confirmed —
      // which it is at this point, since the callback runs after magic-link/OAuth) and
      // apply the computed pledge state. Failures here are non-fatal: the row is created,
      // and a subsequent login re-runs both. mark_self_verified MUST precede set_my_pledge
      // because set_my_pledge(true) requires the caller to already be verified.
      const { error: verifyErr } = await markSelfVerified();
      if (verifyErr) console.warn('⚠️ mark_self_verified failed (non-fatal):', verifyErr.message);
      const { applied: pledgeApplied, error: pledgeErr } = await setMyPledge(hasPledged);
      if (pledgeErr) console.warn('⚠️ set_my_pledge failed (non-fatal):', pledgeErr.message);
      else if (hasPledged && !pledgeApplied) console.warn('⚠️ set_my_pledge(true) was rejected — caller not verified');

      // P1093: the caller is verified as of the line above, so RLS now permits their own
      // point_positions writes. Any letter they answered while unverified left its
      // positions in the staging buffer — lift them now. Non-fatal for the same reason
      // as the two accessors above: the profile row exists either way, and a subsequent
      // login re-runs this. Zero replayed is the normal case, not a failure.
      const { error: replayErr } = await replayLetterPositions();
      if (replayErr) console.warn('⚠️ replay_letter_positions failed (non-fatal):', replayErr.message);

      // Clean up backup on success
      sessionStorage.removeItem('__profileMigrationBackup');

      // Fire analytics async — don't block the redirect on network I/O
      const registrationSource = source || (isReturningUser ? 'returning' : 'pledge');
      analytics.identify(authUser.id);
      // P1133: is_internal needs an async hash lookup (isInternalAccount), so its
      // setUserProperties call is deferred into this detached IIFE — best-effort,
      // never awaited, never allowed to throw into the caller. This file is the
      // only writer of new profiles; a stall here must not strand the user.
      void (async () => {
        let isInternal = false;
        try {
          isInternal = await isInternalAccount(authUser.email, existingProfile?.isTestAccount);
        } catch (err) {
          console.warn('⚠️ isInternalAccount failed (non-fatal):', err);
        }
        analytics.setUserProperties({
          email: authUser.email,
          name,
          has_role: !!upsertData.role,
          has_linkedin: !!upsertData.linkedin_url,
          profile_slug: slug,
          created_at: new Date().toISOString(),
          has_pledged: hasPledged,
          registration_source: registrationSource,
          auth_method: isGoogleAuth ? 'google' : 'magic_link',
          // P1133: exclude known non-customer accounts from funnel numbers
          is_internal: isInternal,
        });
      })();
      analytics.track(isReturningUser ? 'login_complete' : 'profile_created', {
        slug,
        has_role: !!upsertData.role,
        has_linkedin: !!upsertData.linkedin_url,
        has_reason: !!upsertData.reason,
        registration_source: registrationSource,
        has_pledged: hasPledged,
        auth_method: isGoogleAuth ? 'google' : 'magic_link',
      });

      // Refresh profile in auth context so nav/header shows correct user data
      // This fixes race condition where initial fetch happened before upsert completed
      await refreshProfile();
      if (import.meta.env.DEV) console.log('✅ Profile refreshed in auth context');

      // Clear pending verification email now that user is verified
      sessionStorage.removeItem('pendingVerificationEmail');

      // P61: Handle event RSVP action - auto-RSVP after signup
      const action = urlParams.get('action');
      const redirectPath = urlParams.get('redirect');

      if (action === 'rsvp' && redirectPath?.startsWith('/events/')) {
        // Extract event slug from redirect path
        const eventSlug = redirectPath.split('/')[2];
        if (eventSlug) {
          if (import.meta.env.DEV) console.log('📅 Auto-RSVP flow detected for event:', eventSlug);
          setStatus("Confirming your RSVP...");

          try {
            const event = await getEventBySlug(eventSlug);
            if (event) {
              const rsvpSuccess = await rsvpToEvent(event.id, authUser.id);
              if (rsvpSuccess) {
                if (import.meta.env.DEV) console.log('✅ Auto-RSVP successful for event:', eventSlug);
                analytics.track('event_rsvp_auto', {
                  event_slug: eventSlug,
                  event_id: event.id,
                  registration_source: registrationSource,
                });
                navigate(`/events/${eventSlug}/confirm`, { replace: true });
                return;
              } else {
                if (import.meta.env.DEV) console.log('⚠️ Auto-RSVP failed (event may be full), redirecting to event page');
                // Redirect to event page with action param so UI can show toast
                navigate(`/events/${eventSlug}?action=rsvp`, { replace: true });
                return;
              }
            } else {
              if (import.meta.env.DEV) console.log('⚠️ Event not found for auto-RSVP:', eventSlug);
            }
          } catch (error) {
            console.error('❌ Error during auto-RSVP:', error);
          }
          // Fall through to normal redirect if auto-RSVP failed
        }
      }

      // P1076: Handle org invite auto-join action - auto-join after signup, so a
      // visitor who tapped Accept before signing in comes back already a member
      // (seeing the success state), not the terms page awaiting a second tap.
      // Gated on the explicit action param — never on a bare /org redirect, so
      // auto-join can never be a side effect of ordinary navigation (Risk mitigation).
      const [joinOrgPathPart, joinOrgQueryPart] = redirectPath ? redirectPath.split('?') : [undefined, undefined];
      // Match the PATH only (/org/<slug>/join, nothing after) — matching against the
      // raw redirectPath let a crafted redirect like /org/cm?x=/join slip through,
      // since '/join' appearing anywhere in the query string satisfied a substring check.
      if (action === 'join-org' && joinOrgPathPart && /^\/org\/[^/]+\/join$/.test(joinOrgPathPart)) {
        const orgSlug = joinOrgPathPart.split('/')[2];
        if (orgSlug) {
          if (import.meta.env.DEV) console.log('🏛️ Auto-join flow detected for org:', orgSlug);
          setStatus("Joining...");

          try {
            const org = await organizationsService.getOrganizationBySlug(orgSlug);
            if (org) {
              const rawFrom = new URLSearchParams(joinOrgQueryPart ?? '').get('from');
              const invitedBy = rawFrom && isValidUUID(rawFrom) ? rawFrom : undefined;
              const { joined, termsVersion } = await organizationsService.joinOrganization(org.id, invitedBy);
              if (joined) {
                if (import.meta.env.DEV) console.log('✅ Auto-join successful for org:', orgSlug);
                analytics.track('org_joined', {
                  org_slug: org.slug,
                  terms_version: termsVersion ?? CURRENT_COA_VERSION,
                  registration_source: registrationSource,
                });
              }
              // justJoined only on a REAL join — an already-member visitor (idempotent
              // no-op path, joined: false) gets the plain org page, not a congratulation
              // for something that didn't happen (mirrors org-join-page's own guard).
              navigate(`/org/${orgSlug}`, { replace: true, state: joined ? { justJoined: true } : undefined });
              return;
            } else {
              if (import.meta.env.DEV) console.log('⚠️ Org not found for auto-join:', orgSlug);
            }
          } catch (error) {
            console.error('❌ Error during auto-join:', error);
          }
          // Fall through to normal redirect if auto-join failed
        }
      }

      // Allowed redirect prefixes — used by set-position handler and generic redirect
      const ALLOWED_REDIRECT_PREFIXES = ['/events', '/settings', '/me', '/p/', '/about', '/pledgers', '/manifesto', '/live', '/agreements', '/create', '/point/', '/chat', '/letter', '/org'];

      // P502: Batch-restore anonymous positions from localStorage.
      // Runs BEFORE P458 single-position handler so all anon positions are saved
      // even when the user arrived via a CTA "Sign up" link (which carries action=set-position
      // and would return early after saving only that one position).
      const anonPositions = getAllAnonPositions();
      const anonPointIds = Object.keys(anonPositions);
      if (anonPointIds.length > 0) {
        if (import.meta.env.DEV) console.log('📌 P502: Batch-restoring', anonPointIds.length, 'anonymous positions');
        const VALID_POSITIONS = ['strongly_disagree','disagree','somewhat_disagree','unsure','somewhat_agree','agree','strongly_agree'];
        for (const pointId of anonPointIds) {
          if (!isValidPointId(pointId) || !VALID_POSITIONS.includes(anonPositions[pointId])) {
            console.warn('⚠️ P502: Skipping invalid anon position entry', pointId);
            continue;
          }
          try {
            await pointsService.setPosition(pointId, authUser.id, anonPositions[pointId]);
          } catch (err) {
            console.error('⚠️ P502: Failed to restore anon position for', pointId, err);
          }
        }
        clearAllAnonPositions();
        if (import.meta.env.DEV) console.log('✅ P502: Anonymous positions restored and cleared');
      }

      // P581: Persist anonymous letter completion data after registration
      // 1-to-many letters allow anonymous completion; after signup, persist the data
      try {
        const letterKeys = Object.keys(sessionStorage).filter(k => k.startsWith('letterCompletion_'));
        if (letterKeys.length > 0) {
          console.log('📬 P581: Found', letterKeys.length, 'anonymous letter completion(s) to persist');
          for (const key of letterKeys) {
            try {
              const completionData = JSON.parse(sessionStorage.getItem(key) ?? '{}');
              if (completionData.deliveryId) {
                // Update the delivery with the authenticated user's profile ID
                const { error: linkError } = await supabase
                  .from('letter_deliveries')
                  .update({ receiver_profile_id: authUser.id })
                  .eq('id', completionData.deliveryId)
                  .is('receiver_profile_id', null);

                if (linkError) {
                  console.error('⚠️ P581: Failed to link letter delivery:', linkError);
                } else {
                  console.log('✅ P581: Linked letter delivery', completionData.deliveryId);
                }
              }
              sessionStorage.removeItem(key);
            } catch (parseErr) {
              console.error('⚠️ P581: Failed to parse letter completion:', parseErr);
              sessionStorage.removeItem(key);
            }
          }
          analytics.track('letter_completion_persisted', {
            count: letterKeys.length,
            registration_source: registrationSource,
          });
        }
      } catch (letterErr) {
        console.error('⚠️ P581: Letter completion persistence failed:', letterErr);
      }

      // P458: Handle position auto-save after signup via position-gate redirect
      // (The CTA link also carries set-position params for the specific point the user clicked.
      // If that position was already batch-restored above, setPosition upserts — no duplicate.)
      if (action === 'set-position') {
        const intent = parseAuthGateIntent(urlParams);
        if (intent && intent.action === 'set-position') {
          if (import.meta.env.DEV) console.log('📌 Auto-save position flow detected:', intent);
          setStatus("Saving your position...");
          try {
            await pointsService.setPosition(intent.pointId, authUser.id, fromAuthGatePosition(intent.position));
            if (import.meta.env.DEV) console.log('✅ Position auto-saved:', intent.position);
            analytics.track('position_auto_saved', {
              point_id: intent.pointId,
              position: intent.position,
              registration_source: registrationSource,
            });
            analytics.track('auth_gate_completed', { context: 'set-position', redirect_path: intent.redirect });
            // Validate redirect against allowlist before navigating
            const intentRedirect = intent.redirect;
            const isValidIntentRedirect = intentRedirect.startsWith('/')
              && !intentRedirect.startsWith('//')
              && ALLOWED_REDIRECT_PREFIXES.some(p => intentRedirect === p || intentRedirect.startsWith(p + '/') || intentRedirect.startsWith(p + '?'));
            navigate(isValidIntentRedirect ? intentRedirect : `/point/${intent.pointId}`, { replace: true });
            return;
          } catch (error) {
            console.error('❌ Position auto-save failed:', error);
            // Explicit fallback: navigate to the point page so user can click again
            navigate(`/point/${intent.pointId}`, { replace: true });
            return;
          }
        }
      }

      // P458 Scope B: Handle start-story and open-chat actions
      if (action === 'start-story' || action === 'open-chat') {
        const pointId = urlParams.get('pointId');
        if (pointId && isValidPointId(pointId)) {
          analytics.track('auth_gate_completed', { context: action, redirect_path: `/chat?from=position&pointId=${pointId}` });
          navigate(`/chat?from=position&pointId=${pointId}`, { replace: true });
          return;
        }
      }

      // Redirect after auth: validate redirect against allowed prefixes
      setStatus("Redirecting...");
      const isValidRedirect = redirectPath
        && redirectPath.startsWith('/')
        && !redirectPath.startsWith('//')
        && ALLOWED_REDIRECT_PREFIXES.some(prefix => redirectPath === prefix || redirectPath.startsWith(prefix + '/') || redirectPath.startsWith(prefix + '?'));
      const finalRedirect = isValidRedirect ? redirectPath : '/feed';
      navigate(finalRedirect, { replace: true });
    };

    processAuth();
  }, [isLoading, sessionChecked, session, user, navigate, location.search, refreshProfile]);

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

  // Error states (non-auth_error) — show the error text
  if (status.startsWith("Error")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircleIcon className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
          <p className="text-muted-foreground">{status}</p>
        </div>
      </div>
    );
  }

  // Loading/processing state
  // data-status keeps `status` in the render tree so React doesn't skip re-renders
  // triggered by setStatus — without this, the processAuth useEffect fires extra times.
  // P537 memoized useAuth refs but this wrapper is still needed for render-timing stability.
  return (
    <div data-status={status}>
      <ClarityPageLoader />
    </div>
  );
}
