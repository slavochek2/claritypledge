/**
 * @file signup-page.tsx
 * @description P64: Standalone signup page for creating an account without pledging.
 * Users who just want to try /live or explore the platform can create an account here.
 * This creates a profile with has_pledged=false.
 */
import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2Icon, InfoIcon, RefreshCwIcon } from "lucide-react";
import { signInWithEmail } from "@/app/data/api";
import { requestLetterResponseSignin, submitLetterResponseAuthenticated } from "@/app/data/letters-service";
import { CURRENT_TERMS_VERSION } from "@/lib/constants";
import { POSITION_VALUES, type PositionType } from "@/app/types";
import { analytics } from "@/lib/mixpanel";
import { getPositionVerb } from "@/lib/auth-gate-utils";
import { GoogleAuthButton } from "@/app/components/auth/google-auth-button";
import { useAuth } from "@/auth";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";

export function SignupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");

  // Check for message param (e.g., redirected from login with no account)
  const searchParams = new URLSearchParams(location.search);
  const message = searchParams.get('message');
  // P76: Read redirect and action params for post-auth navigation
  const redirectParam = searchParams.get('redirect');
  const actionParam = searchParams.get('action');

  // P458 / P684: Collect auth-gate params to forward through OAuth/magic-link callback
  const authGateExtraParams: Record<string, string> = {};
  for (const key of ['pointId', 'position', 'pointTitle', 'letterId']) {
    const val = searchParams.get(key);
    if (val) authGateExtraParams[key] = val;
  }

  useEffect(() => {
    analytics.track('signup_page_viewed', {
      referrer: document.referrer || 'direct',
      has_message: !!message,
      message_type: message,
    });
  }, [message]);

  // P935: An authenticated user must never see the anonymous "Save your responses"
  // gate. login-page.tsx bounces logged-in users out of /login; this is the /signup
  // equivalent. For a letter-response gate, submit the buffered draft directly
  // (mirrors letter-reading-page's authenticated path) and forward to the confirm
  // page — never re-render the create-account form, which would silently drop the
  // user's responses. create_letter_delivery is idempotent (P707), so a StrictMode
  // double-invoke is safe.
  useEffect(() => {
    if (!sessionChecked || isLoading || !user) return;
    const params = new URLSearchParams(location.search);

    if (params.get('source') === 'letter-response') {
      const letterId = params.get('letterId') ?? '';
      const confirmRedirect = letterId ? `/letter/${letterId}/confirm` : '/';
      const draftJson = letterId
        ? sessionStorage.getItem(`letter-response-draft-${letterId}`)
        : null;

      if (!draftJson) {
        // Nothing buffered (already submitted, or stale link) — just forward.
        navigate(confirmRedirect, { replace: true });
        return;
      }

      let draft: {
        letterId?: string; // present in the stored shape (letter-reading-page) but unused here
        ratings: Array<{ storyId: string; rating: number }>;
        positions: Array<{ pointId: string; position: string }>;
      };
      try {
        draft = JSON.parse(draftJson);
      } catch {
        navigate(confirmRedirect, { replace: true });
        return;
      }

      // Draft stores the string PositionType (not numeric) — pass it through as-is,
      // exactly like letter-reading-page's authenticated onComplete path.
      submitLetterResponseAuthenticated(
        letterId,
        draft.ratings,
        draft.positions.map((p) => ({ pointId: p.pointId, position: p.position })),
        CURRENT_TERMS_VERSION,
      )
        .then(() => {
          sessionStorage.removeItem(`letter-response-draft-${letterId}`);
          navigate(confirmRedirect, { replace: true });
        })
        .catch((err: unknown) => {
          console.error('[signup-page] submitLetterResponseAuthenticated error:', err);
          // Draft intentionally NOT cleared on error — forward to the confirm page,
          // which can re-submit it from sessionStorage. create_letter_delivery is
          // idempotent (P707), so a re-attempt is safe.
          navigate(confirmRedirect, { replace: true });
        });
      return;
    }

    // Non-letter signup: bounce out the same way login-page.tsx does.
    const redirect = params.get('redirect');
    const safeRedirect =
      redirect && !redirect.startsWith('/login') && !redirect.startsWith('/signup')
        ? redirect
        : user.slug ? `/p/${user.slug}` : '/';
    navigate(safeRedirect, { replace: true });
  }, [user, sessionChecked, isLoading, location.search, navigate]);

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

    // P955 (P1229 D8): the submit button is always enabled, so every incomplete state has
    // to name itself here — a bare `return` would look like a dead button.
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!termsAccepted) {
      setError("Please accept the Terms and Privacy Policy to continue");
      return;
    }

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

    // P684: Letter-response path uses the edge function (admin generateLink → OTP, cross-browser).
    // Standard PKCE magic links fail when email opens in a different browser from the signup tab.
    const isLetterResponse = searchParams.get('source') === 'letter-response';

    try {
      if (isLetterResponse) {
        const letterId = searchParams.get('letterId') ?? '';
        const draftJson = sessionStorage.getItem(`letter-response-draft-${letterId}`);
        const draft = draftJson
          ? (JSON.parse(draftJson) as {
              ratings: Array<{ storyId: string; rating: number }>;
              positions: Array<{ pointId: string; position: string }>;
            })
          : { ratings: [], positions: [] };

        await requestLetterResponseSignin({
          letterId,
          name: name.trim(),
          email: email.trim(),
          termsAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
          ratings: draft.ratings,
          positions: draft.positions.map((p) => ({
            pointId: p.pointId,
            position: POSITION_VALUES[p.position as PositionType] ?? 0,
          })),
        });

        analytics.track('signup_magic_link_sent', { source: 'letter-response' });
        setIsSubmitting(false);
        setIsSubmitted(true);
      } else {
        // Standard signup: PKCE magic link
        const { error } = await signInWithEmail(email, 'signup', {
          redirect: redirectParam || undefined,
          action: actionParam || undefined,
          name: name.trim(),
          extraParams: Object.keys(authGateExtraParams).length > 0 ? authGateExtraParams : undefined,
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
      }
    } catch (err: unknown) {
      analytics.track('signup_magic_link_error', { error_type: 'network_error' });
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleResendLink = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    setResendError("");
    setResendSuccess(false);
    try {
      const { error } = await signInWithEmail(email, 'signup', {
        redirect: redirectParam || undefined,
        action: actionParam || undefined,
        name: name.trim(),
        extraParams: Object.keys(authGateExtraParams).length > 0 ? authGateExtraParams : undefined,
      });
      if (error) {
        setResendError("Failed to send. Please try again.");
      } else {
        analytics.track('signup_magic_link_resent');
        setResendSuccess(true);
      }
    } catch {
      setResendError("An error occurred. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // P935: An authenticated user is being redirected by the guard effect above —
  // render a loader instead of the anonymous gate so the create-account form never
  // flashes (and a logged-in user never sees a "Continue with Google" prompt).
  if (sessionChecked && !isLoading && user) {
    return <ClarityPageLoader />;
  }

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
            <div className="bg-muted/30 rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm text-muted-foreground">Didn't receive the email?</p>
              {resendSuccess ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2Icon className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-600">New link sent!</span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleResendLink}
                  disabled={isResending}
                  className="w-full"
                >
                  <RefreshCwIcon className={`w-4 h-4 mr-2 ${isResending ? "animate-spin" : ""}`} />
                  {isResending ? "Sending..." : "Resend Link"}
                </Button>
              )}
              {resendError && (
                <p className="text-sm text-red-600 text-center">{resendError}</p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setIsSubmitted(false);
                setResendSuccess(false);
                setResendError("");
              }}
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
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">
          {searchParams.get('source') === 'letter-response' ? 'Save your responses' : 'Create Account'}
        </h1>
        {searchParams.get('source') === 'letter-response' && (
          <p className="text-sm text-muted-foreground text-center mb-6">
            {searchParams.get('senderName') ? (
              <>One last step so <strong className="text-foreground">{searchParams.get('senderName')}</strong> can see your responses.</>
            ) : (
              'One last step so the sender can see your responses.'
            )}
          </p>
        )}

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
              You were about to {getPositionVerb(searchParams.get('position') || '')}: <strong>{searchParams.get('pointTitle') || 'a point'}</strong>. Create an account to save your position.
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
            extraParams={Object.keys(authGateExtraParams).length > 0 ? authGateExtraParams : undefined}
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

          {/* Email form.
              P1229 D8: noValidate — the inputs keep `required` for assistive tech, but native
              constraint validation must not intercept submit. It did: the browser blocked the
              event on an empty form and showed its own "Please fill out this field." bubble, so
              the handler's empty-name and empty-email branches never ran. handleSubmit already
              checks presence, name length and email format, so nothing is lost by routing every
              incomplete state through the one inline error the rest of the form uses. */}
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : searchParams.get('source') === 'letter-response' ? "Save my responses" : "Create Account"}
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
