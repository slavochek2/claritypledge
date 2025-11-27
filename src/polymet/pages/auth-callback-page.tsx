import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { LoaderIcon } from "lucide-react";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('🚀 AuthCallbackPage mounted');
    
    const handleAuthCallback = async () => {
      try {
        console.log('🔐 Starting auth callback handling...');
        
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Auth error:", sessionError);
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          const params = new URLSearchParams(location.search);
          const slugFromQuery = params.get('slug');
          const isFirstTime = !!slugFromQuery;

          // SAFETY NET: Always fetch the profile from the database to get the authoritative slug
          // This ensures we redirect to the correct URL even if the backend had to rename
          // the slug due to a collision (e.g., john-doe -> john-doe-1)
          const userId = data.session.user.id;
          const { getProfile, verifyProfile } = await import("@/polymet/data/api");
          const profile = await getProfile(userId);

          if (!profile || !profile.slug) {
            console.error('❌ Profile not found or missing slug. User ID:', userId);
            setError('Profile not found. Please try signing up again.');
            return;
          }

          console.log(`✅ Profile fetched from database. Slug: ${profile.slug}`);

          // Log if slug differs from URL param (helps debug collisions)
          if (slugFromQuery && slugFromQuery !== profile.slug) {
            console.warn(
              `⚠️ Slug collision detected! URL had "${slugFromQuery}" but database has "${profile.slug}"`
            );
          }

          // If this is a first-time login, mark the profile as verified
          if (isFirstTime) {
            console.log(`🔀 New user detected. Verifying profile for: ${profile.name}`);
            const { error: verifyError } = await verifyProfile(userId);

            if (verifyError) {
              console.error("❌ Error verifying profile:", verifyError);
              // Even if verification fails, proceed to profile page
            }

            navigate(`/p/${profile.slug}?firstTime=true`, { replace: true });
          } else {
            console.log(`🔀 Returning user detected. Redirecting to: /p/${profile.slug}`);
            navigate(`/p/${profile.slug}`, { replace: true });
          }
        } else {
          setError("No session found. Please try signing in again.");
        }
      } catch (err) {
        console.error("Error handling auth callback:", err);
        setError("An unexpected error occurred.");
      }
    };

    handleAuthCallback();
  }, [navigate, location]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Authentication Error</h1>
            <p className="text-lg text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground mt-4">
              Please try signing the pledge again from the homepage.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <LoaderIcon className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Completing Verification</h1>
          <p className="text-lg text-muted-foreground">
            Just a moment while we set up your profile...
          </p>
        </div>
      </div>
    </div>
  );
}

