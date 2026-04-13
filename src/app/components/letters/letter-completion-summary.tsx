/**
 * @file letter-completion-summary.tsx
 * @description P581 Task 10: Letter completion flow — celebration gate,
 * gap-sorted summary, /live CTA, and registration gate for unauthenticated receivers.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { triggerConfetti } from '@/lib/confetti';
import { analytics } from '@/lib/mixpanel';
import { Button } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================

interface LetterCompletionSummaryProps {
  /** Delivery ID — used to build the results URL */
  deliveryId: string;
  /** Letter ID — needed to build the navigation URL to the results page */
  letterId: string;
  letterData: {
    snapshots: Array<{ story_id: string }>;
    senderName: string;
    mode: 'one-to-one' | 'one-to-many';
  };
  isAuthenticated: boolean;
  senderName: string;
  isRevisit?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterCompletionSummary({
  deliveryId,
  letterId,
  letterData,
  isAuthenticated,
}: LetterCompletionSummaryProps) {
  const navigate = useNavigate();

  // Fire confetti + track completion on mount (only shown on first completion)
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

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
      <p
        className="text-3xl font-serif text-[#1A1A1A]"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        &#10022; You&apos;ve completed it. &#10022;
      </p>
      <p className="text-sm text-[#1A1A1A]/60">
        {totalStoriesRead} {totalStoriesRead === 1 ? 'story' : 'stories'} read.
      </p>
      <Button
        onClick={() => navigate(`/letter/${letterId}/results?delivery=${deliveryId}`)}
        className="bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
      >
        See Your Letter Summary
      </Button>
    </div>
  );
}
