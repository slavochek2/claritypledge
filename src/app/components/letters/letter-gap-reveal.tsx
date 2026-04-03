/**
 * @file letter-gap-reveal.tsx
 * @description P581 Task 9: Dual-number gap reveal after rating submission.
 * Shows receiver rating vs sender prediction side by side with gap text.
 */

interface LetterGapRevealProps {
  receiverRating: number;
  senderPrediction: number;
}

export function LetterGapReveal({ receiverRating, senderPrediction }: LetterGapRevealProps) {
  const gap = Math.abs(receiverRating - senderPrediction);

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex items-center justify-center gap-8">
        {/* Receiver's rating */}
        <div className="text-center">
          <div className="text-4xl font-bold text-[#0044CC]">{receiverRating}</div>
          <div className="text-xs text-[#1A1A1A]/60 mt-1">Your rating</div>
        </div>

        {/* Divider */}
        <div className="text-2xl text-[#1A1A1A]/20 font-light">/</div>

        {/* Sender's prediction */}
        <div className="text-center">
          <div className="text-4xl font-bold text-[#1A1A1A]/70">{senderPrediction}</div>
          <div className="text-xs text-[#1A1A1A]/60 mt-1">Their prediction</div>
        </div>
      </div>

      <p className="text-center text-sm text-[#1A1A1A]/70 italic">
        {gap > 0
          ? `A gap of ${gap} \u2014 both guessing, neither knows yet.`
          : 'No gap \u2014 aligned already.'}
      </p>
    </div>
  );
}
