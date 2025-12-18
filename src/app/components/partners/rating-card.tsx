/**
 * @file rating-card.tsx
 * @description Rating UI for the paraphrase loop.
 * Speaker rates understanding, Listener self-assesses, both see calibration gap.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

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
  /** Called when speaker accepts understanding (even if < 100) */
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
  // isWaiting is available for future use when we show waiting states
  isWaiting: _isWaiting = false,
  otherRating,
  myRating,
  correctionText,
  roundNumber,
  disabled = false,
}: RatingCardProps) {
  const [rating, setRating] = useState(50);
  const [correction, setCorrection] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(myRating !== undefined);

  const isSpeaker = role === 'speaker';
  const bothRated = myRating !== undefined && otherRating !== undefined;
  const calibrationGap = bothRated ? (myRating - otherRating) : null;

  // Silence unused variable warning - isWaiting reserved for future waiting UI enhancements
  void _isWaiting;

  const handleSubmit = () => {
    setHasSubmitted(true);
    onSubmitRating(rating, isSpeaker ? correction : undefined);
  };

  const getRatingLabel = (value: number): string => {
    if (value === 100) return 'Perfect understanding';
    if (value >= 80) return 'Very close';
    if (value >= 60) return 'Getting there';
    if (value >= 40) return 'Partially understood';
    if (value >= 20) return 'Needs work';
    return 'Not quite';
  };

  const getGapLabel = (gap: number): { text: string; color: string } => {
    const absGap = Math.abs(gap);
    if (absGap <= 10) {
      return { text: 'Well calibrated!', color: 'text-green-600' };
    }
    if (gap > 0) {
      // Speaker rated higher than listener expected
      return { text: `${listenerName} underestimated (+${gap})`, color: 'text-amber-600' };
    }
    // Speaker rated lower than listener expected
    return { text: `${listenerName} overestimated (${gap})`, color: 'text-red-600' };
  };

  // Show results view when both have rated
  if (bothRated) {
    const gapInfo = getGapLabel(calibrationGap!);

    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Round {roundNumber} Results</p>
          <h3 className="font-medium">Calibration Check</h3>
        </div>

        {/* Both ratings displayed */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-3 bg-background rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{speakerName}'s Rating</p>
            <p className="text-2xl font-bold">{myRating}/100</p>
          </div>
          <div className="p-3 bg-background rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{listenerName}'s Self-Assessment</p>
            <p className="text-2xl font-bold">{otherRating}/100</p>
          </div>
        </div>

        {/* Calibration gap */}
        <div className="text-center p-3 bg-background rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Calibration Gap</p>
          <p className={`font-medium ${gapInfo.color}`}>{gapInfo.text}</p>
        </div>

        {/* Correction text if provided */}
        {correctionText && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800 mb-1">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              What I meant:
            </p>
            <p className="text-amber-900">{correctionText}</p>
          </div>
        )}

        {/* Actions - only speaker can accept or continue */}
        {isSpeaker && myRating < 100 && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                // Reset for another round
                setHasSubmitted(false);
                setRating(50);
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

        {isSpeaker && myRating === 100 && (
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
          <p className="text-2xl font-bold mt-2">Your rating: {myRating}/100</p>
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

      {/* Rating slider */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Understanding</span>
          <span className="text-lg font-bold">{rating}/100</span>
        </div>
        <Slider
          value={[rating]}
          onValueChange={([value]) => setRating(value)}
          min={0}
          max={100}
          step={10}
          disabled={disabled}
          className="py-4"
        />
        <p className="text-center text-sm text-muted-foreground">
          {getRatingLabel(rating)}
        </p>
      </div>

      {/* Correction field (speaker only, if rating < 100) */}
      {isSpeaker && rating < 100 && (
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
        disabled={disabled}
        className="w-full"
        size="lg"
      >
        Submit Rating
      </Button>
    </div>
  );
}
