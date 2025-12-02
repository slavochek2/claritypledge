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
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { LoaderIcon } from "lucide-react";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing authentication...");
  const { user, session, isLoading } = useAuth();

  useEffect(() => {
    console.log('🔄 AuthCallback useEffect triggered:', { isLoading, hasSession: !!session, hasUser: !!user });

    if (isLoading) {
      console.log('⏳ Still loading, waiting...');
      return;
    }

    const processAuth = async () => {
      if (!session) {
        setStatus("Authentication error. Please try again.");
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

      const upsertData = {
        id: authUser.id,
        email: authUser.email!,
        name: user?.name || user_metadata.name || 'Anonymous',
        slug: user?.slug || user_metadata.slug,
        role: user?.role || user_metadata.role,
        linkedin_url: user?.linkedinUrl || user_metadata.linkedin_url,
        reason: user?.reason || user_metadata.reason,
        avatar_color: user?.avatarColor || user_metadata.avatar_color,
        is_verified: true,
      };

      console.log('🔄 Profile data to save:', upsertData);
      console.log('🔄 Auth user ID:', authUser.id);
      console.log('🔄 Existing user from useAuth:', user);

      // Always upsert the FULL profile data to handle:
      // 1. New users: creates profile with all fields
      // 2. Existing users: updates all fields including any changes made in the form
      // 3. Race condition: trigger may have created profile with is_verified=false
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(upsertData, { onConflict: 'id' });

      if (upsertError) {
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
      console.log('✅ Profile upsert successful!');

      // Redirect to profile page.
      setStatus("Redirecting...");
      const slug = user?.slug || user_metadata.slug;
      navigate(`/p/${slug}`, { replace: true });
    };

    processAuth();
  }, [isLoading, session, user, navigate]);

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
