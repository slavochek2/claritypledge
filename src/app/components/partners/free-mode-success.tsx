/**
 * @file free-mode-success.tsx
 * @description P562: Success screen for free mode when both participants reach 10/10.
 * Shows journey summary, starting gap, and action buttons.
 */
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
  /** Partner display name */
  partnerName: string;
  /** Whether current user was the speaker (checker) */
  isChecker: boolean;
  /** Committed rounds for Journey display */
  rounds: FreeRoundRecord[];
  /** Story title if a story was discussed */
  storyTitle?: string;
  /** Return to entry screen for another round */
  onDiscussAnother: () => void;
  /** End the entire session */
  onEndSession: () => void;
  /** P592: Whether we're waiting for partner to also click Continue */
  isWaiting?: boolean;
}

export function FreeModeSuccess({
  partnerName,
  isChecker,
  rounds,
  storyTitle,
  onDiscussAnother,
  onEndSession,
  isWaiting = false,
}: FreeModeSuccessProps) {
  // Calculate starting gap from Round 0
  const startingGap = rounds.length > 0
    ? Math.abs(rounds[0].listenerConfidence - rounds[0].speakerBelief)
    : 0;

  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-8 max-w-sm mx-auto w-full">
      {/* Journey summary */}
      <div className="bg-muted/50 border border-border rounded-lg p-4 w-full mb-4">
        <p className="text-sm text-muted-foreground text-center mb-3">
          {isChecker
            ? <>{partnerName}&apos;s journey to <span className="font-semibold text-foreground">understand you</span></>
            : <>Your journey to <span className="font-semibold text-foreground">understand {partnerName}</span></>
          }
        </p>

        {rounds.map((round, i) => (
          <div key={i} className="space-y-1 mb-2 pb-2 border-b border-border/50 last:border-0 last:mb-0 last:pb-0">
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

      {/* Summary stats */}
      <div className="text-center mb-6 space-y-1">
        <p className="text-green-600 font-semibold text-lg">Mutual understanding reached</p>
        {storyTitle && (
          <p className="text-sm text-muted-foreground">{storyTitle}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Starting gap: {startingGap} {startingGap === 1 ? 'point' : 'points'}
        </p>
        <p className="text-sm text-muted-foreground">
          Final: 10/10 — Well calibrated
        </p>
      </div>

      {/* Actions — P592: dual-ack waiting state */}
      <div className="w-full space-y-3">
        {isWaiting ? (
          <div className="text-center py-3">
            <p className="text-sm text-muted-foreground animate-pulse">
              Waiting for {partnerName} to continue…
            </p>
          </div>
        ) : (
          <Button
            onClick={onDiscussAnother}
            className="w-full bg-blue-500 hover:bg-blue-600"
          >
            Discuss another story
          </Button>
        )}
        <button
          onClick={onEndSession}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          End session
        </button>
      </div>
    </div>
  );
}
