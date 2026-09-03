import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getVersionChain } from '@/app/data/points-service-real';
import type { ChainPoint } from '@/app/data/points-service-real';

interface PointVersionHistoryProps {
  /** UUID of the current point being viewed */
  pointId: string;
}

function formatDate(isoString?: string): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * P800: Expandable version history panel on point detail page.
 * Fetches the full ancestor-to-head chain and renders each version.
 * Only rendered when the chain has more than one entry.
 */
export function PointVersionHistory({ pointId }: PointVersionHistoryProps) {
  const navigate = useNavigate();
  const [chain, setChain] = useState<ChainPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getVersionChain(pointId).then((result) => {
      if (!cancelled) {
        setChain(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [pointId]);

  if (loading || chain.length <= 1) return null;

  return (
    <div data-testid="point-version-history" className="mb-4 rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        <span>Version history ({chain.length} versions)</span>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {expanded && (
        <ol className="border-t border-border divide-y divide-border">
          {chain.map((entry, idx) => {
            const isCurrent = entry.id === pointId;
            const isHead = entry.superseded_by === null;
            return (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-xs font-mono text-muted-foreground w-5 flex-shrink-0">v{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm break-words',
                        isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {entry.statement ?? '—'}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {entry.created_at && (
                        <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
                      )}
                      {isCurrent && (
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">(viewing)</span>
                      )}
                      {isHead && !isCurrent && (
                        <button
                          onClick={() => navigate(`/point/${entry.id}`)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline underline-offset-2"
                        >
                          View current →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

