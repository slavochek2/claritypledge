/**
 * @file pledge-confirmation-page.tsx
 * @description Confirmation page shown after user submits the pledge form.
 * Displays email verification instructions. Accessed via redirect from sign-pledge.
 */
import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MailIcon } from "lucide-react";

export function PledgeConfirmationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get("email");

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

      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Click the link in your email to <strong>complete your pledge</strong>{" "}
        and make your profile public.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => navigate("/")}
          className="text-primary hover:underline font-medium"
        >
          Return to Home
        </button>
        <span className="hidden sm:inline text-muted-foreground">•</span>
        <button
          onClick={() => navigate("/sign-pledge")}
          className="text-muted-foreground hover:text-primary hover:underline font-medium"
        >
          Use different email
        </button>
      </div>
    </div>
  );
}
