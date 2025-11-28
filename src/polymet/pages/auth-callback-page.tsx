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
import { useUser } from "@/hooks/use-user";
import { LoaderIcon } from "lucide-react";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Finalizing authentication...");
  const { user, session, isLoading } = useUser();

  useEffect(() => {
    if (isLoading) return;

    const processAuth = async () => {
      if (!session) {
        setStatus("Authentication error. Please try again.");
        console.error("No session found after loading.");
        return;
      }

      // If a profile already exists, the user is just logging in.
      // We can redirect them to their profile page.
      if (user) {
        setStatus("Redirecting...");
        navigate(`/p/${user.slug}`, { replace: true });
        return;
      }

      // If no profile exists, this is a new user signing up.
      // We'll create their profile now.
      setStatus("Creating your profile...");
      const { user: authUser } = session;
      const { user_metadata } = authUser;
      
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: authUser.id,
          email: authUser.email!,
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
