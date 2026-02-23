/**
 * @file my-sessions-page.tsx
 * @description P405: /sessions — view past live session history.
 * View stack: list → session detail → round summary (all inline, no drawers).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '@/auth';
import { getUserSessions, type SessionSummary } from '@/app/data/sessions-service';
import { SessionList } from '@/app/components/sessions/session-list';
import { RoundSummaryScreen } from '@/app/components/partners/round-summary-screen';
import type { SessionHistoryItem } from '@/app/types';

// ─── View state ───────────────────────────────────────────────────────────────

type SessionView =
  | { type: 'list' }
  | { type: 'session'; session: SessionSummary }
  | { type: 'round'; session: SessionSummary; roundIndex: number };

// ─── Round row ────────────────────────────────────────────────────────────────

function RoundRow({ item, index, onClick }: { item: SessionHistoryItem; index: number; onClick?: () => void }) {
  const isSkipped = !!item.skipped;

  if (isSkipped || !onClick) {
    return (
      <li className={`flex items-start gap-3 py-3 px-4 ${isSkipped ? 'opacity-60' : ''}`}>
        {isSkipped
          ? <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          : <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {item.title || `Round ${index + 1}`}
          </p>
          {isSkipped && <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>}
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full flex items-start gap-3 py-3 px-4 hover:bg-muted/50 transition-colors text-left"
      >
        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {item.title || `Round ${index + 1}`}
          </p>
          {item.checkerRating !== undefined && item.responderRating !== undefined && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Checker: {item.checkerRating}, You: {item.responderRating}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      </button>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MySessionsPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [view, setView] = useState<SessionView>({ type: 'list' });

  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (!user) {
      navigate('/login?redirect=/sessions', { replace: true });
    }
  }, [user, isLoading, sessionChecked, navigate]);

  const fetchSessions = useCallback(async () => {
    if (!user?.id) return;
    setFetchState('loading');
    try {
      const data = await getUserSessions(user.id);
      setSessions(data);
      setFetchState('idle');
    } catch {
      setFetchState('error');
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchSessions();
  }, [user?.id, fetchSessions]);

  if (!sessionChecked || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const goBack = () => {
    if (view.type === 'round') setView({ type: 'session', session: view.session });
    else if (view.type === 'session') setView({ type: 'list' });
  };

  const roundItem = view.type === 'round' ? view.session.sessionHistory[view.roundIndex] : null;
  const headerTitle =
    view.type === 'list' ? 'Session History'
    : view.type === 'session' ? `${formatDate(view.session.date)} · ${view.session.partnerName}`
    : roundItem?.storyData ? `Round ${view.roundIndex + 1}` // story card shows the content — no duplicate
    : roundItem?.title || `Round ${view.roundIndex + 1}`;

  return (
    <main
      aria-label="Session History"
      className="container mx-auto px-4 lg:px-8 pt-24 pb-24 max-w-2xl"
    >
      <div className="flex items-center gap-2 mb-6">
        {view.type === 'list' ? (
          <button
            onClick={() => navigate('/events')}
            className="p-1 -ml-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Back to Events"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        ) : (
          <button
            onClick={goBack}
            className="p-1 -ml-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
        <h1 className={`font-bold text-foreground ${view.type === 'list' ? 'text-2xl' : 'text-lg truncate'}`}>
          {headerTitle}
        </h1>
      </div>

      {view.type === 'list' && (
        <SessionList
          sessions={sessions}
          isLoading={fetchState === 'loading'}
          isError={fetchState === 'error'}
          onRetry={fetchSessions}
          onSessionClick={(s) => setView({ type: 'session', session: s })}
        />
      )}

      {view.type === 'session' && (
        <div>
          {view.session.sessionHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-3">No round details available for this session.</p>
          ) : (
            <ul>
              {view.session.sessionHistory.map((item, i) => (
                <RoundRow
                  key={i}
                  item={item}
                  index={i}
                  onClick={item.skipped ? undefined : () => setView({ type: 'round', session: view.session, roundIndex: i })}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {view.type === 'round' && (
        <div className="flex justify-center">
          <RoundSummaryScreen
            item={view.session.sessionHistory[view.roundIndex]}
            storyData={view.session.sessionHistory[view.roundIndex]?.storyData}
            onBack={goBack}
            hideBack
          />
        </div>
      )}
    </main>
  );
}
