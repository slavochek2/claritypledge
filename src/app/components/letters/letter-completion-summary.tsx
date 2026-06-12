import { useEffect } from 'react';
import { Link } from 'react-router-dom';
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

  const totalStoriesRead = letterData.snapshots.length;
  const chapterWord = totalStoriesRead === 1 ? 'chapter' : 'chapters';

  function trackExit(destination: 'letters' | 'manifesto') {
    analytics.track('letter_completion_exit', {
      delivery_id: deliveryId,
      destination,
    });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
      <LetterParticipantRow
        name={senderName}
        slug={senderSlug}
        avatarUrl={senderAvatarUrl}
        avatarColor={senderAvatarColor}
        hasPledged={senderHasPledged}
        roleLabel="From"
        className="justify-center"
      />
      <div className="space-y-3 max-w-sm">
        <p className="text-sm text-[#1A1A1A]/60">
          You read {totalStoriesRead} {chapterWord} and shared your honest read.
        </p>
        <p
          className="text-2xl font-serif text-[#1A1A1A]"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          Your answers are on their way to {senderName}.
        </p>
        <p className="text-sm text-[#1A1A1A]/60">
          You can now continue with these answers in mind.
        </p>
      </div>
      <div className="flex gap-6 text-sm text-[#1A1A1A]/50">
        <Link
          to="/letters"
          className="hover:text-[#1A1A1A] transition-colors underline-offset-2 hover:underline"
          onClick={() => trackExit('letters')}
        >
          Go to your letters
        </Link>
        <Link
          to="/manifesto"
          className="hover:text-[#1A1A1A] transition-colors underline-offset-2 hover:underline"
          onClick={() => trackExit('manifesto')}
        >
          Why this project exists
        </Link>
      </div>
    </div>
  );
}
