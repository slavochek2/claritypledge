/*
 * CRITICAL AUTHENTICATION MODULE - WRITER
 * -----------------------------------------------------------------------------
 * This page is the "Writer" of the authentication system.
 * It is responsible for the critical transaction of:
 * 1. Verifying the incoming auth session
 * 2. Creating the user profile if it doesn't exist (Sign Up)
 * 3. Redirecting the user to their profile (Sign In)
 *
 * This logic is isolated here to prevent race conditions.
 * DO NOT move this logic to a global hook or context.
 * -----------------------------------------------------------------------------
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getProfile } from "@/polymet/data/api";
import { LoaderIcon } from "lucide-react";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing authentication...");

  useEffect(() => {
    const processAuth = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setStatus("Authentication error. Please try again.");
        console.error("Error getting session:", sessionError);
        return;
      }

      const { user } = session;
      const existingProfile = await getProfile(user.id);

      // If a profile already exists, the user is just logging in.
      // We can redirect them to their profile page.
      if (existingProfile) {
        setStatus("Redirecting...");
        navigate(`/p/${existingProfile.slug}`, { replace: true });
        return;
      }

      // If no profile exists, this is a new user signing up.
      // We'll create their profile now.
      setStatus("Creating your profile...");
      const { user_metadata } = user;
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email!,
          name: user_metadata.name || 'Anonymous',
          slug: user_metadata.slug,
          role: user_metadata.role,
          linkedin_url: user_metadata.linkedin_url,
          reason: user_metadata.reason,
          avatar_color: user_metadata.avatar_color,
          is_verified: true, // They have verified their email by clicking the magic link.
        }, { onConflict: 'id' });

      if (upsertError) {
        setStatus("Error creating profile. Please contact support.");
        console.error("Error upserting profile:", upsertError);
        return;
      }

      // Profile created successfully! Redirect to the new profile page.
      setStatus("Redirecting...");
      navigate(`/p/${user_metadata.slug}`, { replace: true });
    };

    processAuth();
  }, [navigate]);

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

