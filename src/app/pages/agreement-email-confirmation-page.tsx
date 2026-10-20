/**
 * @file agreement-email-confirmation-page.tsx
 * @description P476: Full-screen email confirmation page shown to unauthenticated partners
 * after clicking "Seal & Create Account" on the accept agreement page.
 *
 * Route: /agreements/confirm-email
 * Receives state via React Router location.state:
 *   - email: string         — partner's invitation email (displayed prominently)
 *   - agreementId: string   — for localStorage key + resend
 *   - token: string         — for resend (the invitation it re-requests a link for)
 *   - partnerName: string   — re-sent with the resend so auto-accept still fires
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { MailIcon, RefreshCwIcon, CheckCircle2Icon } from 'lucide-react';
import { requestAgreementSignIn } from '@/lib/agreement-signin';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';

interface ConfirmationState {
  email: string;
  agreementId: string;
  token: string;
  partnerName: string;
  isExistingUser?: boolean; // P483: when true, show sign-in copy instead of account-creation copy
  termsVersion?: string; // P1487: the terms version shown when they pressed sign; re-sent as is
}

export function AgreementEmailConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ConfirmationState | null;
  // P1364: back to where the reader came from; a cold arrival goes to the agreement.

  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');

  // Guard: if navigated directly without state, redirect to root
  useEffect(() => {
    if (!state?.email || !state?.agreementId || !state?.token) {
      navigate('/', { replace: true });
    }
  }, [state, navigate]);

  // Show nothing while redirecting
  if (!state?.email || !state?.agreementId || !state?.token) {
    return null;
  }

  const { email, agreementId, token, partnerName, isExistingUser, termsVersion } = state;

  const handleResend = async () => {
    if (isResending) return;

    setIsResending(true);
    setResendError('');
    setResendSuccess(false);

    // Re-set localStorage so auto-accept fires when they return via the new link
    localStorage.setItem(
      `clarity-pending-accept-${agreementId}`,
      JSON.stringify({ partnerName })
    );

    try {
      // P1487: through the server (create-and-sign), never the auth server's own email sign-in —
      // see src/lib/agreement-signin.ts. A refused resend (e.g. rate limit) says why.
      const result = await requestAgreementSignIn({ agreementId, token, partnerName, termsVersion: termsVersion ?? CURRENT_TERMS_VERSION });
      if (!result.ok) {
        localStorage.removeItem(`clarity-pending-accept-${agreementId}`);
        setResendError(result.message);
      } else {
        setResendSuccess(true);
      }
    } catch {
      localStorage.removeItem(`clarity-pending-accept-${agreementId}`);
      setResendError('An error occurred. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      {/* P1512: Back renders in the shell's top bar; P1364: it returns to where the person came from. */}
      <FocusHeader fallback={state?.agreementId ? `/agreements/${state.agreementId}` : '/'} />

      <div className="text-center">
        <div className="mb-8 flex justify-center">
          <div className="h-24 w-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <MailIcon className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold mb-6">
          {isExistingUser ? 'Sign In to Co-Sign' : 'Almost Done!'}
        </h1>

        <div className="bg-muted/50 p-6 rounded-lg mb-8 border border-border">
          <p className="text-xl mb-4">We've sent a sign-in link to:</p>
          <p className="text-2xl font-bold text-primary break-all">{email}</p>
        </div>

        <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
          {isExistingUser
            ? <>Click the link in your email to <strong>sign in and complete signing the Clarity Partner Agreement</strong>.</>
            : <>Click the link to <strong>complete signing the Clarity Partner Agreement</strong>.</>
          }
        </p>

        <p className="text-sm text-muted-foreground mb-8">
          The link expires in <strong>1 hour</strong>. Check your spam folder if you don't see it.
        </p>

        {/* Resend section */}
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
              onClick={handleResend}
              disabled={isResending}
              className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
              {isResending ? 'Sending...' : 'Resend sign-in link'}
            </button>
          )}
          {resendError && (
            <p className="text-sm text-destructive mt-2">{resendError}</p>
          )}
        </div>
      </div>
    </main>
  );
}
