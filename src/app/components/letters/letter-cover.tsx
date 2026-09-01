/**
 * @file letter-cover.tsx
 * @description P581 Task 7 + P683: Letter cover with GDPR-compliant TOS consent for unauthenticated recipients.
 */

import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { LetterParticipantRow } from './letter-participant-row';
import type { LetterMode } from '@/app/types';

interface LetterCoverProps {
  senderName: string;
  /** P725: public handle of the sender profile — enables /p/:slug link on the cover. */
  senderSlug?: string | null;
  /** P725: sender avatar url / color / pledge state — surfaced by the reading RPC. */
  senderAvatarUrl?: string | null;
  senderAvatarColor?: string;
  senderHasPledged?: boolean;
  receiverName: string;
  storyCount: number;
  pointCount: number;
  estimatedMinutes: number;
  mode: LetterMode;
  onOpen: () => void;
  isAuthenticated?: boolean;
  isEmailDelivery?: boolean;
  isAuthenticating?: boolean;
  authDelayed?: boolean;
  errorMessage?: string | null;
  /** P852: Optional calm microcopy displayed below the consent block. */
  microcopy?: string;
}

const HINT_ID = 'letter-cover-open-hint';

export function LetterCover({
  senderName,
  senderSlug,
  senderAvatarUrl,
  senderAvatarColor,
  senderHasPledged,
  receiverName,
  storyCount,
  pointCount,
  estimatedMinutes,
  onOpen,
  isAuthenticated = false,
  isEmailDelivery = false,
  isAuthenticating = false,
  authDelayed = false,
  errorMessage = null,
  microcopy,
}: LetterCoverProps) {
  // P715: TOS consent fires for any email delivery (token present) to an unauthenticated
  // recipient, regardless of letter privacy type. Previously gated on mode === 'one-to-one'
  // which skipped TOS for public letters delivered by email.
  const needsConsent = isEmailDelivery && !isAuthenticated;
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
        {/* P725: identity row replaces plain-text "From {senderName}" line — links to /p/:slug when available. */}
        <LetterParticipantRow
          name={senderName}
          slug={senderSlug}
          avatarUrl={senderAvatarUrl}
          avatarColor={senderAvatarColor}
          hasPledged={senderHasPledged}
          roleLabel="From"
          className="justify-center"
        />
      </div>

      {/* P852 Phase-3: warm microcopy moves ABOVE the button — emotional context
          before the CTA decision. Bumped to text-base/60 to read as a subtitle, not metadata. */}
      {microcopy && (
        <p className="text-base text-[#1A1A1A]/60 max-w-sm leading-relaxed">
          {microcopy}
        </p>
      )}

      <span id={HINT_ID} className="sr-only">
        {needsConsent
          ? 'By clicking you accept the Terms of Service and Privacy Policy and create an account'
          : 'Click to begin reading'}
      </span>

      <Button
        onClick={handleOpen}
        aria-disabled={isDisabled}
        aria-describedby={HINT_ID}
        className={`w-full max-w-sm bg-[#0044CC] hover:bg-[#0033AA] text-white rounded-full font-bold text-base min-h-14 gap-2 ${
          isDisabled ? 'opacity-60 cursor-not-allowed hover:bg-[#0044CC]' : ''
        }`}
        aria-busy={isAuthenticating}
        aria-label={isAuthenticating ? 'Opening the letter, please wait' : undefined}
      >
        {isAuthenticating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            Opening...
          </>
        ) : (
          <>
            <Mail className="w-5 h-5" aria-hidden="true" />
            Open the Letter
          </>
        )}
      </Button>

      {/* P852 Phase-3: meta line moves BELOW the button — technical footnote
          ("here's what you're getting into") after the CTA decision is visible. */}
      <p className="text-sm text-[#1A1A1A]/50">
        {storyCount} {storyCount === 1 ? 'chapter' : 'chapters'} &middot; {storyCount + pointCount} {storyCount + pointCount === 1 ? 'step' : 'steps'} &middot; ~{estimatedMinutes} {estimatedMinutes === 1 ? 'minute' : 'minutes'}
      </p>

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
