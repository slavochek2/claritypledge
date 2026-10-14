/**
 * @file letter-check-email.tsx
 * @description P1487: shown after "Open the Letter" when the recipient has no account yet.
 *
 * The invitation link is not proof of owning the recipient's mailbox, so opening it never
 * signs anyone in. Instead a one-time sign-in link goes to the address the letter was sent to;
 * opening that link creates the account and returns to the letter, signed in.
 *
 * The address itself is not shown: the reading RPC deliberately withholds it from token
 * holders (P1071). Visual pattern follows agreement-email-confirmation-page.tsx.
 */

import { MailIcon, RefreshCwIcon, CheckCircle2Icon } from 'lucide-react';

interface LetterCheckEmailProps {
  senderName: string;
  /** Asks the server to send the sign-in link again. */
  onResend: () => void;
  isResending: boolean;
  resent: boolean;
  errorMessage?: string | null;
}

export function LetterCheckEmail({ senderName, onResend, isResending, resent, errorMessage }: LetterCheckEmailProps) {
  const from = senderName && senderName !== 'Someone' ? ` from ${senderName}` : '';
  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center" data-testid="letter-check-email">
      <div className="mb-6 flex justify-center">
        <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <MailIcon className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-[#1A1A1A] mb-3">Check your email</h1>

      <p className="text-base text-[#1A1A1A]/70 mb-3 leading-relaxed">
        We sent a sign-in link to the address this letter was sent to. Open it to finish setting
        up your account and read the letter{from}.
      </p>

      <p className="text-sm text-[#1A1A1A]/60 mb-8">
        The link expires in 1 hour. Check your spam folder if you don't see it.
      </p>

      <div className="p-4 bg-muted/30 rounded-lg border border-border">
        <p className="text-sm text-muted-foreground mb-3">Didn't receive the email?</p>
        {resent ? (
          <div className="flex min-h-10 items-center justify-center gap-2 text-green-700 dark:text-green-400" role="status">
            <CheckCircle2Icon className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm font-medium">New link sent. Use the newest email.</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={isResending}
            className="inline-flex items-center justify-center gap-2 min-h-10 px-3 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} aria-hidden="true" />
            {isResending ? 'Sending...' : 'Send the link again'}
          </button>
        )}
        {errorMessage && <p className="text-sm text-destructive mt-2">{errorMessage}</p>}
      </div>
    </div>
  );
}
