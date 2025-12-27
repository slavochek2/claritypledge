/**
 * @file review-mode-view.tsx
 * @description P23: Review Mode - Shows session summary, ideas discussed, and transcripts.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type ClaritySession, type LiveSessionState, type LiveTurn } from '@/app/types';
import { getLiveTurns } from '@/app/data/api';
import { ArrowLeft, CheckCircle2, XCircle, BarChart3, Flag } from 'lucide-react';

interface ReviewModeViewProps {
  session: ClaritySession;
  liveState: LiveSessionState;
  currentUserName: string;
  partnerName: string;
  onToggleMode: () => void;
}

export function ReviewModeView({
  session,
  liveState,
  currentUserName,
  partnerName,
  onToggleMode,
}: ReviewModeViewProps) {
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load turns from database
  useEffect(() => {
    const loadTurns = async () => {
      setIsLoading(true);
      try {
        const loadedTurns = await getLiveTurns(session.id);
        setTurns(loadedTurns);
      } catch (err) {
        console.error('[Review] Failed to load turns:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadTurns();
  }, [session.id]);

  const understoodPercent =
    liveState.ideasDiscussed > 0
      ? Math.round((liveState.ideasUnderstood / liveState.ideasDiscussed) * 100)
      : 0;

  // Group turns by round for display
  const flagTurns = turns.filter((t) => t.flag);

  // Highlight flags from current user
  const myFlags = flagTurns.filter((t) => t.actorName === currentUserName);
  const partnerFlags = flagTurns.filter((t) => t.actorName === partnerName);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button variant="ghost" size="sm" onClick={onToggleMode}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Live
        </Button>
        <h1 className="font-semibold">Session Review</h1>
        <div className="w-20" /> {/* Spacer for centering */}
      </div>

      {/* Summary stats */}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-2xl font-bold">{liveState.ideasDiscussed}</p>
            <p className="text-xs text-muted-foreground">Ideas Discussed</p>
          </div>
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{liveState.ideasUnderstood}</p>
            <p className="text-xs text-muted-foreground">At 10/10</p>
          </div>
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-2xl font-bold">{understoodPercent}%</p>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </div>
        </div>

        {/* Calibration summary placeholder */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <p className="font-medium text-blue-900">Calibration Summary</p>
          </div>
          <p className="text-sm text-blue-700">
            {liveState.ideasDiscussed === 0
              ? 'No ideas discussed yet. Go back to Live mode to start.'
              : `You've discussed ${liveState.ideasDiscussed} idea${liveState.ideasDiscussed === 1 ? '' : 's'} with ${partnerName}.`}
          </p>
        </div>
      </div>

      {/* Ideas list and flags */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Ideas Discussed
        </h2>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground animate-pulse">
            Loading session data...
          </div>
        ) : liveState.ideasDiscussed === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No ideas discussed yet.</p>
            <Button variant="outline" className="mt-4" onClick={onToggleMode}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go to Live Mode
            </Button>
          </div>
        ) : (
          <>
            {/* Ideas summary */}
            {Array.from({ length: liveState.ideasDiscussed }, (_, i) => (
              <div
                key={i}
                className="border rounded-lg p-4 bg-background hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Idea #{i + 1}</span>
                  {i < liveState.ideasUnderstood ? (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      10/10
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      In progress
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Transcript will be available in a future update.
                </p>
              </div>
            ))}

            {/* Flags section */}
            {flagTurns.length > 0 && (
              <div className="pt-4 border-t">
                <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-3">
                  Flags Raised ({flagTurns.length})
                </h2>
                <div className="space-y-2">
                  {flagTurns.map((turn) => (
                    <div
                      key={turn.id}
                      className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                    >
                      <Flag className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{turn.actorName}</span>
                      <span className="text-muted-foreground">flagged:</span>
                      <span className="text-blue-600">
                        {turn.flag?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        Round {turn.roundNumber}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary stats for flags */}
            {(myFlags.length > 0 || partnerFlags.length > 0) && (
              <div className="text-xs text-muted-foreground pt-2">
                You raised {myFlags.length} flag{myFlags.length !== 1 ? 's' : ''} •{' '}
                {partnerName} raised {partnerFlags.length} flag{partnerFlags.length !== 1 ? 's' : ''}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button className="w-full" onClick={onToggleMode}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Live Mode
        </Button>
      </div>
    </div>
  );
}
