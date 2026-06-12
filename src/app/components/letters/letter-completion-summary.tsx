import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { triggerConfetti } from '@/lib/confetti';
import { analytics } from '@/lib/mixpanel';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';

interface LetterCompletionSummaryProps {
  deliveryId: string;
  letterId: string;
  letterData: {
    snapshots: Array<{ story_id: string }>;
    senderName: string;
    mode: 'one-to-one' | 'one-to-many';
  };
  isAuthenticated: boolean;
  senderName: string;
  senderSlug?: string | null;
  senderAvatarUrl?: string | null;
  senderAvatarColor?: string;
  senderHasPledged?: boolean;
  isRevisit?: boolean;
}

export function LetterCompletionSummary({
  deliveryId,
  letterData,
  isAuthenticated,
  senderName,
  senderAvatarUrl,
  senderAvatarColor,
  senderHasPledged,
}: LetterCompletionSummaryProps) {
  useEffect(() => {
    triggerConfetti();
    analytics.track('letter_completed', {
      delivery_id: deliveryId,
      mode: letterData.mode,
      story_count: letterData.snapshots.length,
      is_authenticated: isAuthenticated,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function trackExit(destination: 'letters' | 'manifesto') {
    analytics.track('letter_completion_exit', {
      delivery_id: deliveryId,
      destination,
    });
  }

  return (
    <div className="flex flex-col min-h-[60vh] px-4">
      <div className="flex flex-col items-center justify-center flex-1 text-center space-y-6">
        {/* Close line with the sender's avatar inline before their name — the name appears
            once. Same GravatarAvatar primitive as the cover (Google photo via
            referrerPolicy="no-referrer", onError→initials, pledger ring). No "From" label:
            on the end screen the direction is receiver→sender, carried by the sentence. */}
        <p
          className="text-2xl font-serif text-foreground max-w-md leading-snug"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          Your answers are on their way to{' '}
          <span className="whitespace-nowrap">
            <span className="inline-block align-middle mr-1.5 -translate-y-px">
              <GravatarAvatar
                name={senderName}
                photoUrl={senderAvatarUrl ?? undefined}
                avatarColor={senderAvatarColor}
                isPledger={senderHasPledged ?? false}
                size="sm"
                className="!w-7 !h-7 !text-[11px]"
              />
            </span>
            {senderName}
          </span>.
        </p>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <Link
            to="/letters"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
            onClick={() => trackExit('letters')}
          >
            Go to your letters
          </Link>
          <Link
            to="/manifesto"
            className="underline underline-offset-4 hover:text-foreground transition-colors"
            onClick={() => trackExit('manifesto')}
          >
            Why this project exists
          </Link>
        </div>
      </div>
    </div>
  );
}
