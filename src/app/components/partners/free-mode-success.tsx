/**
 * @file free-mode-success.tsx
 * @description P600: Success screen for free mode when both participants reach 10/10.
 * Matches guided mode celebration pattern: sparkle + headline + journey + Continue button.
 */
import { Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FreeRoundRecord } from '@/app/types';

function DotBar({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-px text-xs tracking-tight">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < value ? 'text-foreground' : 'text-gray-300'}>●</span>
      ))}
    </span>
  );
}

interface FreeModeSuccessProps {
  partnerName: string;
  isChecker: boolean;
  rounds: FreeRoundRecord[];
  storyTitle?: string;
  /** "Continue" — triggers dual-ack pattern */
  onContinue: () => void;
  /** Whether we're waiting for partner to also click Continue */
  isWaiting?: boolean;
  /** P600: Speaker's re-rated belief after paraphrase */
  freeRerating?: number;
  /** P686: Whether a badge point was earned this round */
  badgePointEarned?: boolean;
  /** P686: Total badge points the listener now has (0–9) */
  badgeCount?: number;
  /** P686: true when badgeCount >= 9 (full badge) */
  isFullBadge?: boolean;
  /** P686: true when the current user is the certifier (not the earner) */
  isCertifier?: boolean;
}

export function FreeModeSuccess({
  partnerName,
  isChecker,
  rounds,
  storyTitle,
  onContinue,
  isWaiting = false,
  freeRerating,
  badgePointEarned,
  badgeCount,
  isFullBadge,
  isCertifier,
}: FreeModeSuccessProps) {
  // Role-aware headline — matches guided mode celebration
  const headline = isChecker
    ? `${partnerName} understood you perfectly!`
    : `You understood ${partnerName} perfectly!`;

  // Rounds message — count includes guided round(s) + free mode rounds
  const totalRounds = rounds.length + 1; // +1 for the final 10/10 round
  const roundsMessage = `Achieved in ${totalRounds} ${totalRounds === 1 ? 'round' : 'rounds'}`;

  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-8 max-w-sm mx-auto w-full">
      {/* P686: Badge headline — shown above celebration when a badge point was earned */}
      {badgePointEarned && (
        <div className="text-center mb-4">
          <Award className="h-6 w-6 text-amber-500 mx-auto mb-1" aria-hidden />
          <h2 className="text-amber-700 font-semibold">
            {isFullBadge
              ? `Full badge earned! 9/9 clarity points verified`
              : `Badge point earned! ${Math.min(badgeCount ?? 0, 9)}/9 clarity points verified`
            }
          </h2>
          {isCertifier && (
            <p className="text-sm text-amber-600 mt-1">
              You verified {partnerName} on a clarity point
            </p>
          )}
        </div>
      )}

      {/* Celebration header — matches guided mode */}
      <div className="text-center space-y-2 mb-4">
        <div className="text-4xl">🎉</div>
        <h2 className="text-xl font-semibold text-green-600">{headline}</h2>
        <p className="text-sm text-muted-foreground">{roundsMessage}</p>
        {storyTitle && (
          <p className="text-sm text-muted-foreground">{storyTitle}</p>
        )}
      </div>

      {/* Journey summary — green success variant */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full mb-6">
        <p className="text-sm text-muted-foreground text-center mb-3">
          {isChecker
            ? <>{partnerName}&apos;s journey to <span className="font-semibold text-foreground">understand you</span></>
            : <>Your journey to <span className="font-semibold text-foreground">understand {partnerName}</span></>
          }
        </p>

        {rounds.map((round, i) => (
          <div key={i} className="space-y-1 mb-2 pb-2 border-b border-green-200/50 last:border-0 last:mb-0 last:pb-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground w-4 text-right mr-2">{round.label}</span>
              <span className="text-muted-foreground flex-1">
                {isChecker ? `${partnerName}'s confidence` : 'Your confidence'}
              </span>
              <DotBar value={round.listenerConfidence} />
              <span className="font-medium tabular-nums w-6 text-right ml-1">{round.listenerConfidence}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="w-4 mr-2" />
              <span className="font-semibold text-foreground flex-1">
                {isChecker ? 'Your belief' : `${partnerName}'s belief`}
              </span>
              <DotBar value={round.speakerBelief} />
              <span className="font-medium tabular-nums w-6 text-right ml-1">{round.speakerBelief}</span>
            </div>
          </div>
        ))}

        {/* P600: Speaker's re-rated belief after paraphrase */}
        {freeRerating !== undefined && (
          <div className="flex items-center justify-between text-sm mb-2 pb-2 border-b border-green-200/50">
            <span className="text-muted-foreground w-4 text-right mr-2">1</span>
            <span className="font-semibold text-foreground flex-1">
              {isChecker ? 'Your belief' : `${partnerName}'s belief`}
            </span>
            <DotBar value={freeRerating} />
            <span className="font-medium tabular-nums w-6 text-right ml-1">{freeRerating}</span>
          </div>
        )}

        {/* Final 10/10 row */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex-1">
              {isChecker ? `${partnerName}'s confidence` : 'Your confidence'}
            </span>
            <DotBar value={10} />
            <span className="font-medium tabular-nums w-6 text-right ml-1">10</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground flex-1">
              {isChecker ? 'Your belief' : `${partnerName}'s belief`}
            </span>
            <DotBar value={10} />
            <span className="font-medium tabular-nums w-6 text-right ml-1">10</span>
          </div>
        </div>
      </div>

      {/* Continue button + dual-ack waiting — matches guided mode */}
      <div className="w-full space-y-3">
        <Button
          size="lg"
          className="bg-blue-500 hover:bg-blue-600 w-full"
          onClick={onContinue}
          disabled={isWaiting}
        >
          Continue
        </Button>
        {isWaiting && (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-sm text-muted-foreground">
              Waiting for {partnerName} to continue…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
