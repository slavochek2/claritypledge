import { CheckCircle2, XCircle, ChevronRight, MicIcon } from 'lucide-react';
import type { SessionSummary } from '@/app/data/sessions-service';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Link } from 'react-router-dom';

// ─── Date grouping ────────────────────────────────────────────────────────────

function formatGroupDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatRowTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function groupByDay(sessions: SessionSummary[]): Array<{ label: string; items: SessionSummary[] }> {
  const map = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = new Date(s.date).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(s);
  }
  return Array.from(map.entries()).map(([, items]) => ({
    label: formatGroupDate(items[0].date),
    items,
  }));
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SessionSkeleton() {
  return (
    <ul aria-label="Loading sessions" aria-busy="true" className="space-y-2">
      {[1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-4 rounded-lg animate-pulse">
          <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-1/4" />
          </div>
          <div className="h-4 bg-muted rounded w-12" />
        </li>
      ))}
    </ul>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center" aria-label="No past sessions">
      <MicIcon className="w-12 h-12 text-muted-foreground/40 mb-4" />
      <h2 className="text-lg font-medium text-foreground mb-2">No sessions yet</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        Start your first session to see your history here.
      </p>
      <Link
        to="/live"
        className="inline-flex items-center justify-center text-sm font-semibold h-10 px-6 rounded-md bg-blue-500 hover:bg-blue-600 text-white transition-colors gap-2"
      >
        <MicIcon className="w-4 h-4" />
        Start a Clarity Session
      </Link>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <XCircle className="w-10 h-10 text-destructive/60 mb-3" />
      <p className="text-sm text-foreground mb-3">
        Couldn't load your sessions. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: SessionSummary;
  onClick: (session: SessionSummary) => void;
}

function SessionRow({ session, onClick }: SessionRowProps) {
  // P813: a session is "abandoned" when it has no completed rounds AND no
  // completed transcript. These are shown de-emphasized (not hidden) so the
  // history is an honest journal of what happened.
  const isAbandoned = session.roundCount === 0 && session.transcriptStatus !== 'completed';

  const roundsLabel = `${session.roundCount} round${session.roundCount !== 1 ? 's' : ''}`;
  const label = isAbandoned
    ? `Session with ${session.partnerName} on ${formatGroupDate(session.date)} — no rounds completed`
    : `Session with ${session.partnerName} on ${formatGroupDate(session.date)} — ${roundsLabel}`;

  return (
    <li>
      <button
        onClick={() => onClick(session)}
        className={`w-full flex items-center gap-3 px-4 py-4 min-h-[64px] rounded-lg hover:bg-muted/50 active:bg-muted transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2${isAbandoned ? ' opacity-60' : ''}`}
        aria-label={label}
      >
        <GravatarAvatar name={session.partnerName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm truncate">{session.partnerName}</p>
          <p className="text-xs text-muted-foreground">{formatRowTime(session.date)}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isAbandoned ? (
            <span className="text-xs text-muted-foreground">no rounds completed</span>
          ) : (
            <span className="flex items-center gap-1 text-sm font-medium text-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              {roundsLabel}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
        </div>
      </button>
    </li>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface SessionListProps {
  sessions: SessionSummary[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSessionClick: (session: SessionSummary) => void;
}

export function SessionList({ sessions, isLoading, isError, onRetry, onSessionClick }: SessionListProps) {
  if (isLoading) return <SessionSkeleton />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (sessions.length === 0) return <EmptyState />;

  const groups = groupByDay(sessions);

  return (
    <div aria-live="polite" aria-label={`${sessions.length} sessions loaded`}>
      {groups.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-2">
            {group.label}
          </p>
          <ul>
            {group.items.map((session) => (
              <SessionRow key={session.id} session={session} onClick={onSessionClick} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
