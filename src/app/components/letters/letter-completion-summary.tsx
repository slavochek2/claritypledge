import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { triggerConfetti } from '@/lib/confetti';
import { analytics } from '@/lib/mixpanel';
import { LetterParticipantRow } from './letter-participant-row';

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
  senderSlug,
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
      {/* Back nav — restores navigation suppressed by the focus-route BottomNav hide */}
      <Link
        to="/letters"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-2 px-2 py-3 min-h-[44px] self-start"
        onClick={() => trackExit('letters')}
      >
        <ArrowLeft size={16} />
        Your letters
      </Link>

      <div className="flex flex-col items-center justify-center flex-1 text-center space-y-6">
        <LetterParticipantRow
          name={senderName}
          slug={senderSlug}
          avatarUrl={senderAvatarUrl}
          avatarColor={senderAvatarColor}
          hasPledged={senderHasPledged}
          roleLabel="From"
          className="justify-center"
        />
        <p
          className="text-2xl font-serif text-foreground max-w-sm"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          Your answers are on their way to {senderName}.
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
