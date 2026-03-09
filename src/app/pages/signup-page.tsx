/**
 * @file signup-page.tsx
 * @description P64: Standalone signup page for creating an account without pledging.
 * Users who just want to try /live or explore the platform can create an account here.
 * This creates a profile with has_pledged=false.
 */
import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2Icon, InfoIcon } from "lucide-react";
import { signInWithEmail } from "@/app/data/api";
import { analytics } from "@/lib/mixpanel";
import { GoogleAuthButton } from "@/app/components/auth/google-auth-button";

export function SignupPage() {
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Check for message param (e.g., redirected from login with no account)
  const searchParams = new URLSearchParams(location.search);
  const message = searchParams.get('message');
  // P76: Read redirect and action params for post-auth navigation
  const redirectParam = searchParams.get('redirect');
  const actionParam = searchParams.get('action');

  useEffect(() => {
    analytics.track('signup_page_viewed', {
      referrer: document.referrer || 'direct',
      has_message: !!message,
      message_type: message,
    });
  }, [message]);

  // Reset form state when user navigates to this page
  useEffect(() => {
    setIsSubmitted(false);
    setIsSubmitting(false);
    setName("");
    setEmail("");
    setError("");
    setTermsAccepted(false);
  }, [location.key]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    // Validate name (at least 2 characters)
    if (name.trim().length < 2) {
      setError("Please enter your name");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Send magic link with source=signup so callback knows to set has_pledged=false
      // P76: Include redirect and action params for post-auth navigation
      // Pass name for profile creation
      const { error } = await signInWithEmail(email, 'signup', {
        redirect: redirectParam || undefined,
        action: actionParam || undefined,
        name: name.trim(),
      });

      if (error) {
        analytics.track('signup_magic_link_error', {
          error_type: error.message.includes('rate') ? 'rate_limited' : 'unknown',
        });
        setError(error.message);
        setIsSubmitting(false);
      } else {
        analytics.track('signup_magic_link_sent');
        setIsSubmitting(false);
        setIsSubmitted(true);
      }
    } catch {
      analytics.track('signup_magic_link_error', { error_type: 'network_error' });
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-lg">
        <div className="bg-card border border-border rounded-lg shadow-sm p-6 md:p-8">
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <CheckCircle2Icon className="w-16 h-16 text-green-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Check Your Email</h3>
              <p className="text-sm text-muted-foreground">
                We've sent a verification link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Click the link in your email to create your account.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsSubmitted(false)}
              className="w-full"
            >
              Use Different Email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-lg">
      <div className="bg-card border border-border rounded-lg shadow-sm p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-6">Create Account</h1>

        {/* P64: Show message if redirected from login */}
        {message === 'no-account' && (
          <div className="flex items-start gap-2 p-3 mb-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              No account found with that email. Create one below.
            </p>
          </div>
        )}

        {/* P458: Context banner for position-gate redirects */}
        {actionParam === 'set-position' && searchParams.get('position') && (
          <div role="alert" className="flex items-start gap-2 p-3 mb-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              You were about to {searchParams.get('position') === 'agree' ? 'agree with' : searchParams.get('position') === 'disagree' ? 'disagree with' : 'mark as unsure on'}: <strong>{searchParams.get('pointTitle') || 'a point'}</strong>. Create an account to save your position.
            </p>
          </div>
        )}

        {/* P458: Context banner for start-story redirects */}
        {actionParam === 'start-story' && (
          <div role="alert" className="flex items-start gap-2 p-3 mb-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Create an account to share your story.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Google OAuth button */}
          <GoogleAuthButton
            context="signup"
            source="signup"
            redirect={redirectParam || undefined}
            action={actionParam || undefined}
          />

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or use email</span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name" className="text-sm font-medium">
                  Full Name
                </Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Smith"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  required
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-sm font-medium">
                  Email Address
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  required
                  className="w-full"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md mt-2">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Terms & Privacy checkbox */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="terms-accept"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                aria-describedby="terms-label"
                className="mt-0.5"
              />
              <Label
                id="terms-label"
                htmlFor="terms-accept"
                className="text-sm text-muted-foreground leading-relaxed font-normal cursor-pointer"
              >
                I accept the{' '}
                <Link to="/terms-of-service" className="text-blue-600 hover:underline">
                  Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy-policy" className="text-blue-600 hover:underline">
                  Privacy Policy
                </Link>.
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white"
              size="lg"
              disabled={isSubmitting || !termsAccepted || !name.trim() || !email.trim()}
            >
              {isSubmitting ? "Sending..." : "Create Account"}
            </Button>

            <div className="text-center">
              <Link
                to={`/login${location.search}`}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Already have an account? Log in
              </Link>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
