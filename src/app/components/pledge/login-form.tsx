import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { signInWithEmail, checkLoginEmail, type LoginEmailCheck } from "@/app/data/api";
import { analytics } from "@/lib/mixpanel";
import { GoogleAuthButton } from "@/app/components/auth/google-auth-button";

interface LoginFormProps {
  onSwitchToSign: () => void;
  /** P76: Redirect URL after auth completes */
  redirect?: string;
  /** P76: Action to perform after auth (e.g., 'rsvp') */
  action?: string;
  /** P458: Extra params to forward through auth callback (pointId, position, etc.) */
  extraParams?: Record<string, string>;
}

export function LoginForm({ onSwitchToSign, redirect, action, extraParams }: LoginFormProps) {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Reset form state when user navigates to this page (e.g., clicking "Log In" again)
  // The location.key changes on each navigation, even to the same route
  useEffect(() => {
    setIsSubmitted(false);
    setIsSubmitting(false);
    setEmail("");
    setError("");
  }, [location.key]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // With noValidate the browser no longer reports the empty `required` field, so say it here.
    if (!email.trim()) {
      setError("Please enter your email address");
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
      // P64: Check if email exists before sending magic link. P1511: the check is limited per IP;
      // a call that throws counts as unavailable, never as "no account".
      const check: LoginEmailCheck = await checkLoginEmail(email).catch(() => 'unavailable' as const);
      if (check === 'absent') {
        analytics.track('login_no_account', { attempted_email: email.toLowerCase().trim() });
        setError("No account found with this email. Sign up instead.");
        setIsSubmitting(false);
        return;
      }

      if (check !== 'found') {
        // P1511: refused or failed check. Send the link without creating an account and show the
        // normal screen whatever the auth server answers — its refusal for an unknown address (and
        // its rate limit, which only known addresses reach) would say what the check refused to
        // say. Only a request that never reached the server (auth-js status 0) reveals nothing and
        // is shown; its 502/503/504 share the error class but come from the server, which may time
        // out sending mail to a known address only.
        const { error: sendError } = await signInWithEmail(email, 'login', {
          redirect, action, extraParams, shouldCreateUser: false,
        });
        if (sendError?.name === 'AuthRetryableFetchError' && sendError.status === 0) throw sendError;
        analytics.track('login_magic_link_sent', { account_check: check });
        setIsSubmitting(false);
        setIsSubmitted(true);
        return;
      }

      // P76: Include redirect and action params for post-auth navigation
      const { error } = await signInWithEmail(email, 'login', { redirect, action, extraParams });

      if (error) {
        analytics.track('login_magic_link_error', {
          error_type: error.message.includes('rate') ? 'rate_limited' : 'unknown',
        });
        setError(error.message);
        setIsSubmitting(false);
      } else {
        // Magic link sent successfully
        analytics.track('login_magic_link_sent');
        setIsSubmitting(false);
        setIsSubmitted(true);
      }
    } catch {
      analytics.track('login_magic_link_error', { error_type: 'network_error' });
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2Icon className="w-16 h-16 text-green-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Check Your Email</h3>
          <p className="text-sm text-muted-foreground">
            We've sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Click the link in your email to access your profile.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsSubmitted(false)}
          className="w-full"
        >
          Send Another Link
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* P63/P64: Google OAuth button - primary option */}
      <GoogleAuthButton context="login" source="login" redirect={redirect} action={action} extraParams={extraParams} />

      {/* P63: Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or use magic link</span>
        </div>
      </div>

      {/* Existing magic link form */}
      {/*
        P1229 D15 follow-up: this form gained type="email" in this same branch, which made the
        browser's native validation intercept submit — so the hand-rolled emailRegex check in
        handleSubmit could never set its styled "Please enter a valid email address" message for
        malformed input. noValidate hands validation back to handleSubmit, matching the treatment
        signup-page.tsx got for D8. The inputs keep `required` for assistive tech.
      */}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email" className="text-sm font-medium">
              Email Address
            </Label>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(""); // Clear error when typing
              }}
              required
              className="w-full"
            />

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive mt-2">
                <AlertCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />

                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending..." : "Send Me a Magic Link"}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToSign}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Don't have an account? Sign up
          </button>
        </div>
      </form>
    </div>
  );
}
