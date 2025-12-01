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
    if (isLoading) return;

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

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: authUser.id,
          email: authUser.email!,
          name: user?.name || user_metadata.name || 'Anonymous',
          slug: user?.slug || user_metadata.slug,
          role: user?.role || user_metadata.role,
          linkedin_url: user?.linkedinUrl || user_metadata.linkedin_url,
          reason: user?.reason || user_metadata.reason,
          avatar_color: user?.avatarColor || user_metadata.avatar_color,
          is_verified: true, // They have verified their email by clicking the magic link.
        }, { onConflict: 'id' });

      if (upsertError) {
        setStatus("Error creating profile. Please contact support.");
        console.error("Error upserting profile:", upsertError);
        return;
      }

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
