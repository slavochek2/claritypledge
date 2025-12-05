/**
 * @file pledge-confirmation-page.tsx
 * @description Confirmation page shown after user submits the pledge form.
 * Displays email verification instructions. Accessed via redirect from sign-pledge.
 */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MailIcon, RefreshCwIcon, CheckCircle2Icon } from "lucide-react";
import { signInWithEmail } from "@/app/data/api";

export function PledgeConfirmationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get("email");
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState("");

  const handleResendLink = async () => {
    if (!email || isResending) return;

    setIsResending(true);
    setResendError("");
    setResendSuccess(false);

    try {
      const { error } = await signInWithEmail(email);
      if (error) {
        setResendError("Failed to send. Please try again.");
      } else {
        setResendSuccess(true);
      }
    } catch {
      setResendError("An error occurred. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // If no email param, redirect back to sign-pledge (in useEffect to avoid render-time navigation)
  useEffect(() => {
    if (!email) {
      navigate("/sign-pledge", { replace: true });
    }
  }, [email, navigate]);

  // Clear pending email so users aren't trapped on this page if they navigate away
  // They can always re-submit the form to get back here with a fresh magic link
  useEffect(() => {
    if (email) {
      sessionStorage.removeItem('pendingVerificationEmail');
    }
  }, [email]);

  // Show nothing while redirecting
  if (!email) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
      <div className="mb-8 flex justify-center">
        <div className="h-24 w-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <MailIcon className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold mb-6">Almost Done!</h1>

      <div className="bg-muted/50 p-6 rounded-lg mb-8 border border-border">
        <p className="text-xl mb-4">We've sent a verification link to:</p>
        <p className="text-2xl font-bold text-primary break-all">{email}</p>
      </div>

      <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
        Click the link in your email to <strong>complete your pledge</strong>{" "}
        and make your profile public.
      </p>

      <p className="text-sm text-muted-foreground mb-8">
        The link expires in <strong>1 hour</strong>. Check your spam folder if you don't see it.
      </p>

      {/* Resend link section */}
      <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-border">
        <p className="text-sm text-muted-foreground mb-3">
          Didn't receive the email?
        </p>
        {resendSuccess ? (
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2Icon className="w-4 h-4" />
            <span className="text-sm font-medium">New link sent!</span>
          </div>
        ) : (
          <button
            onClick={handleResendLink}
            disabled={isResending}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
            {isResending ? 'Sending...' : 'Resend verification link'}
          </button>
        )}
        {resendError && (
          <p className="text-sm text-destructive mt-2">{resendError}</p>
        )}
      </div>

      <button
        onClick={() => navigate("/sign-pledge")}
        className="text-sm text-muted-foreground hover:text-primary hover:underline"
      >
        Use different email
      </button>
    </div>
  );
}
