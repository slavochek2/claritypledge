/**
 * @file rating-card.tsx
 * @description V2: 0-10 button rating UI for the paraphrase loop.
 * Speaker rates understanding, Listener self-assesses, both see calibration gap.
 *
 * Changes from V1:
 * - Replaced 0-100 slider with 0-10 buttons
 * - Less cognitive load, faster selection
 * - Gap calculation works on 0-10 scale
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { RatingButtons } from './shared';

// Helper to get label for a rating value
function getRatingLabel(value: number): string {
  return `${value}/10`;
}

interface RatingCardProps {
  /** Whether this is the speaker's view (rates understanding) or listener's (self-assess) */
  role: 'speaker' | 'listener';
  /** The idea being discussed */
  ideaText: string;
  /** The paraphrase being rated */
  paraphraseText: string;
  /** Speaker's name (for display) */
  speakerName: string;
  /** Listener's name (for display) */
  listenerName: string;
  /** Called when rating is submitted */
  onSubmitRating: (rating: number, correction?: string) => void;
  /** Called when speaker accepts understanding (even if < 5) */
  onAcceptUnderstanding?: () => void;
  /** Whether waiting for the other person to rate */
  isWaiting?: boolean;
  /** The other person's rating (shown after both rate) */
  otherRating?: number;
  /** This person's submitted rating */
  myRating?: number;
  /** Correction text from speaker (shown to listener) */
  correctionText?: string;
  /** Current round number */
  roundNumber: number;
  /** Whether this is disabled */
  disabled?: boolean;
}

export function RatingCard({
  role,
  ideaText,
  paraphraseText,
  speakerName,
  listenerName,
  onSubmitRating,
  onAcceptUnderstanding,
  isWaiting: _isWaiting = false,
  otherRating,
  myRating,
  correctionText,
  roundNumber,
  disabled = false,
}: RatingCardProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [correction, setCorrection] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(myRating !== undefined);

  const isSpeaker = role === 'speaker';
  const bothRated = myRating !== undefined && otherRating !== undefined;
  const calibrationGap = bothRated ? (myRating - otherRating) : null;

  // Silence unused variable warning
  void _isWaiting;

  const handleSubmit = () => {
    if (rating === null) return;
    setHasSubmitted(true);
    onSubmitRating(rating, isSpeaker ? correction : undefined);
  };

  const getGapLabel = (gap: number): { text: string; color: string } => {
    const absGap = Math.abs(gap);
    if (absGap <= 1) {
      return { text: 'Well calibrated!', color: 'text-green-600' };
    }
    if (gap > 0) {
      return { text: `${listenerName} underestimated (+${gap})`, color: 'text-blue-600' };
    }
    return { text: `${listenerName} overestimated (${gap})`, color: 'text-blue-600' };
  };

  // Show results view when both have rated
  if (bothRated) {
    const gapInfo = getGapLabel(calibrationGap!);

    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Round {roundNumber}</p>
          <h3 className="font-medium">Calibration Check</h3>
        </div>

        {/* Both ratings displayed */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-3 bg-background rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{speakerName}'s Rating</p>
            <p className="text-2xl font-bold">{getRatingLabel(myRating)}</p>
          </div>
          <div className="p-3 bg-background rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{listenerName}'s Self-Assessment</p>
            <p className="text-2xl font-bold">{getRatingLabel(otherRating)}</p>
          </div>
        </div>

        {/* Calibration gap */}
        <div className="text-center p-3 bg-background rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Calibration Gap</p>
          <p className={`font-medium ${gapInfo.color}`}>{gapInfo.text}</p>
        </div>

        {/* Correction text if provided */}
        {correctionText && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-800 mb-1">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              What I meant:
            </p>
            <p className="text-blue-900">{correctionText}</p>
          </div>
        )}

        {/* Actions - only speaker can accept or continue */}
        {isSpeaker && myRating < 10 && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setHasSubmitted(false);
                setRating(null);
                setCorrection('');
              }}
              disabled={disabled}
            >
              Try Again
            </Button>
            <Button
              className="flex-1"
              onClick={onAcceptUnderstanding}
              disabled={disabled}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Accept as Understood
            </Button>
          </div>
        )}

        {isSpeaker && myRating === 10 && (
          <div className="flex items-center justify-center text-green-600">
            <CheckCircle2 className="h-5 w-5 mr-2" />
            <span className="font-medium">Perfect understanding achieved!</span>
          </div>
        )}

        {!isSpeaker && (
          <p className="text-center text-sm text-muted-foreground">
            Waiting for {speakerName} to decide...
          </p>
        )}
      </div>
    );
  }

  // Waiting state
  if (hasSubmitted && !bothRated) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg text-center">
        <div className="animate-pulse">
          <p className="text-muted-foreground">
            Waiting for {isSpeaker ? listenerName : speakerName} to rate...
          </p>
          <p className="text-2xl font-bold mt-2">Your rating: {getRatingLabel(myRating ?? 0)}</p>
        </div>
      </div>
    );
  }

  // Rating input view
  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">Round {roundNumber}</p>
        <h3 className="font-medium">
          {isSpeaker ? 'How well did they understand?' : 'How well do you think you understood?'}
        </h3>
      </div>

      {/* Show what's being rated */}
      <div className="space-y-3">
        <div className="p-3 bg-background rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Original idea:</p>
          <p className="text-sm">{ideaText}</p>
        </div>
        <div className="flex justify-center">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="p-3 bg-background rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Paraphrase:</p>
          <p className="text-sm">{paraphraseText}</p>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="space-y-3">
        <span className="text-sm text-muted-foreground">Understanding:</span>

        <RatingButtons
          selectedValue={rating}
          onSelect={setRating}
          disabled={disabled}
        />
      </div>

      {/* Correction field (speaker only, if rating < 10) */}
      {isSpeaker && rating !== null && rating < 10 && (
        <div className="space-y-2">
          <Label htmlFor="correction">What did they miss? (optional)</Label>
          <Textarea
            id="correction"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Clarify what you meant..."
            disabled={disabled}
            className="min-h-[80px]"
          />
        </div>
      )}

      {/* Submit button */}
      <Button
        onClick={handleSubmit}
        disabled={disabled || rating === null}
        className="w-full"
        size="lg"
      >
        Submit Rating
      </Button>
    </div>
  );
}
