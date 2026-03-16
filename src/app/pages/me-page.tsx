/**
 * @file me-page.tsx
 * @description Smart redirect page for "View My Profile"
 * Handles users with and without slugs (e.g., /live users)
 *
 * Route: /me
 *
 * Behavior:
 * - User has slug → redirect to /p/:slug (profile page handles verification)
 * - User has no slug (e.g., /live user) → show verification prompt
 * - Not logged in → redirect to /login
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { MailIcon, CheckCircleIcon, Loader2Icon } from "lucide-react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { Button } from "@/components/ui/button";
import { SEO } from "@/app/components/seo";
import { supabase } from "@/lib/supabase";

export function MePage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // P50: Send verification email directly (no pledge form for /live users)
  const handleSendVerificationEmail = async () => {
    if (!user?.email) return;

    setIsSending(true);
    setError(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (otpError) {
        console.error('[MePage] Error sending verification email:', otpError);
        setError(otpError.message);
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      console.error('[MePage] Unexpected error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!sessionChecked || isLoading) return;

    // Not logged in → redirect to login
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    // User has slug → redirect to their profile page
    if (user.slug) {
      navigate(`/p/${user.slug}`, { replace: true });
      return;
    }

    // User has no slug (e.g., /live user, unverified) → stay here and show verification prompt
  }, [user, isLoading, sessionChecked, navigate]);

  // Loading state
  if (!sessionChecked || isLoading) {
    return <ClarityPageLoader />;
  }

  // Not logged in (while redirecting)
  if (!user) {
    return null;
  }

  // User has slug (while redirecting)
  if (user.slug) {
    return null;
  }

  // User has no slug → show verification prompt
  return (
    <>
      <SEO
        title="Verify Your Email"
        description="Verify your email to access your Clarity Pledge profile"
        url="/me"
      />
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <div className="container mx-auto max-w-lg">
          <div className="bg-card border rounded-lg shadow-sm p-8 text-center space-y-6">
            {/* Icon - changes based on state */}
            <div className="flex justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                emailSent
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-blue-100 dark:bg-blue-900/30"
              }`}>
                {emailSent ? (
                  <CheckCircleIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
                ) : (
                  <MailIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                )}
              </div>
            </div>

            {/* Heading - changes based on state */}
            <div>
              {emailSent ? (
                <>
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    Check Your Email
                  </h1>
                  <p className="text-muted-foreground">
                    We've sent a verification link to your email. Click the link to complete your registration.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-foreground mb-2">
                    Complete Your Registration
                  </h1>
                  <p className="text-muted-foreground">
                    To create your profile, please verify your email address.
                  </p>
                </>
              )}
            </div>

            {/* Email Display */}
            {user.email && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">
                  {emailSent ? "Verification sent to:" : "Your email:"}
                </p>
                <p className="text-base font-medium text-foreground">
                  {user.email}
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* CTA */}
            <div className="space-y-3">
              {emailSent ? (
                <Button
                  onClick={handleSendVerificationEmail}
                  variant="outline"
                  className="w-full"
                  disabled={isSending}
                >
                  {isSending ? (
                    <>
                      <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Resend Verification Email"
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleSendVerificationEmail}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                  disabled={isSending}
                >
                  {isSending ? (
                    <>
                      <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Verify My Email"
                  )}
                </Button>
              )}
            </div>

            {/* Help Text */}
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {emailSent
                  ? "Didn't receive the email? Check your spam folder or click resend above."
                  : "Verifying your email will create your public profile page."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
