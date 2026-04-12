/**
 * @file letter-cover.tsx
 * @description P581 Task 7 + P683: Letter cover with GDPR-compliant TOS consent for unauthenticated recipients.
 */

import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import type { LetterMode } from '@/app/types';

interface LetterCoverProps {
  senderName: string;
  receiverName: string;
  storyCount: number;
  estimatedMinutes: number;
  mode: LetterMode;
  onOpen: () => void;
  isAuthenticated?: boolean;
  isAuthenticating?: boolean;
  authDelayed?: boolean;
  errorMessage?: string | null;
}

const HINT_ID = 'letter-cover-open-hint';

export function LetterCover({
  senderName,
  receiverName,
  storyCount,
  estimatedMinutes,
  mode,
  onOpen,
  isAuthenticated = false,
  isAuthenticating = false,
  authDelayed = false,
  errorMessage = null,
}: LetterCoverProps) {
  const needsConsent = mode === 'one-to-one' && !isAuthenticated;
  const isDisabled = isAuthenticating;

  const handleOpen = () => {
    if (isDisabled) return;
    onOpen();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 py-10">
      <div className="w-16 h-16 rounded-full bg-[#0044CC]/10 flex items-center justify-center">
        <Mail className="w-8 h-8 text-[#0044CC]" />
      </div>

      <div className={`space-y-2 transition-opacity duration-300 ${isAuthenticating ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-medium">
          A Clarity Letter
        </p>
        <h1
          className="text-2xl md:text-3xl font-serif text-[#1A1A1A]"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          For {receiverName}
        </h1>
        <p className="text-sm text-[#1A1A1A]/60">
          From {senderName}
        </p>
      </div>

      <p className={`text-sm text-[#1A1A1A]/50 transition-opacity duration-300 ${isAuthenticating ? 'opacity-50 pointer-events-none' : ''}`}>
        {storyCount} {storyCount === 1 ? 'story' : 'stories'} &middot; ~{estimatedMinutes} {estimatedMinutes === 1 ? 'minute' : 'minutes'}
      </p>

      <span id={HINT_ID} className="sr-only">
        {needsConsent
          ? 'By clicking you accept the Terms of Service and Privacy Policy and create an account'
          : 'Click to begin reading'}
      </span>

      <Button
        onClick={handleOpen}
        aria-disabled={isDisabled}
        aria-describedby={HINT_ID}
        size="lg"
        className={`bg-[#0044CC] hover:bg-[#0033AA] text-white text-base px-8 py-6 min-h-[48px] ${
          isDisabled ? 'opacity-60 cursor-not-allowed hover:bg-[#0044CC]' : ''
        }`}
        aria-busy={isAuthenticating}
        aria-label={isAuthenticating ? 'Opening the letter, please wait' : undefined}
      >
        {isAuthenticating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
            Opening...
          </>
        ) : (
          'Open the Letter'
        )}
      </Button>

      {authDelayed && (
        <p className="text-xs text-[#1A1A1A]/40 animate-pulse">
          Setting up your access...
        </p>
      )}

      {needsConsent && (
        <p className="text-xs text-[#1A1A1A]/50 leading-relaxed max-w-md">
          By opening, you agree to the{' '}
          <Link
            to="/terms-of-service"
            className="underline hover:text-[#0044CC]"
            onClick={(e) => e.stopPropagation()}
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            to="/privacy-policy"
            className="underline hover:text-[#0044CC]"
            onClick={(e) => e.stopPropagation()}
          >
            Privacy Policy
          </Link>
          . We&rsquo;ll create an account so you can save your responses.
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3 max-w-md"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
