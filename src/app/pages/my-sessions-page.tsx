/**
 * @file my-sessions-page.tsx
 * @description P405: /sessions — view past live session history.
 * P495: Added transcript row + transcript view (View 4).
 * View stack: list → session detail → round summary | transcript (all inline, no drawers).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, XCircle, ChevronRight, Copy, Check, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { useAuth } from '@/auth';
import { getUserSessions, type SessionSummary } from '@/app/data/sessions-service';
import { fetchSessionTranscript, retryTranscription } from '@/app/data/api';
import { SessionList } from '@/app/components/sessions/session-list';
import { RoundSummaryScreen } from '@/app/components/partners/round-summary-screen';
import type { SessionHistoryItem, SessionTranscript } from '@/app/types';

// ─── View state ───────────────────────────────────────────────────────────────

type SessionView =
  | { type: 'list' }
  | { type: 'session'; session: SessionSummary }
  | { type: 'round'; session: SessionSummary; roundIndex: number }
  | { type: 'transcript'; session: SessionSummary };

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

// ─── Transcript Row (P495) ──────────────────────────────────────────────────

function TranscriptRow({
  session,
  onCopy,
  onOpen,
  onRetry,
}: {
  session: SessionSummary;
  onCopy: () => void;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Don't show for private sessions or sessions with no transcription job
  if (session.isPrivate || session.transcriptStatus === null) return null;

  const handleCopy = async () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      onRetry();
    } finally {
      setTimeout(() => setRetrying(false), 2000);
    }
  };

  // Processing/pending state
  if (session.transcriptStatus === 'processing' || session.transcriptStatus === 'pending') {
    return (
      <div
        className="flex items-center gap-3 py-3 px-4 border-t"
        aria-label="Session transcript, status: processing"
        aria-busy="true"
      >
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
        <span className="text-sm text-muted-foreground">Transcript processing...</span>
      </div>
    );
  }

  // Failed state
  if (session.transcriptStatus === 'failed') {
    return (
      <div
        className="flex items-center gap-3 py-3 px-4 border-t"
        aria-label="Session transcript, status: failed"
      >
        <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
        <span className="text-sm text-destructive">Transcript failed</span>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          aria-label="Retry transcription"
        >
          <RefreshCw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} />
          Retry
        </button>
      </div>
    );
  }

  // Completed/ready state
  return (
    <div
      className="flex items-center gap-3 py-3 px-4 border-t"
      aria-label="Session transcript, status: ready"
    >
      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
      <span className="text-sm font-medium text-foreground">Transcript</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          aria-label="Copy transcript to clipboard"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          aria-label="Open full transcript"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </button>
      </div>
      {/* aria-live region for copy feedback */}
      <div aria-live="polite" className="sr-only">
        {copied ? 'Transcript copied to clipboard' : ''}
      </div>
    </div>
  );
}

// ─── Transcript View (P495 — View 4) ────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTranscriptForCopy(transcript: SessionTranscript): string {
  return transcript.segments
    .map((seg) => `${seg.speaker_label} [${formatTimestamp(seg.start)}]: ${seg.text}`)
    .join('\n');
}

function TranscriptView({
  session,
  onBack,
}: {
  session: SessionSummary;
  onBack: () => void;
}) {
  const [transcript, setTranscript] = useState<SessionTranscript | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSessionTranscript(session.id).then((data) => {
      if (!cancelled) {
        setTranscript(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [session.id]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const handleCopy = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(formatTranscriptForCopy(transcript));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[P495] Failed to copy transcript');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!transcript || transcript.segments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No speech detected in this recording.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Transcript header with copy button */}
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          aria-label="Copy transcript to clipboard"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* aria-live region for copy feedback */}
      <div aria-live="polite" className="sr-only" role="status">
        {copied ? 'Transcript copied to clipboard' : ''}
      </div>

      {/* Segments */}
      <div className="space-y-4">
        {transcript.segments.map((segment, i) => (
          <article
            key={i}
            aria-label={`${segment.speaker_label} at ${formatTimestamp(segment.start)}`}
            className="text-sm"
          >
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-semibold text-foreground">{segment.speaker_label}</span>
              <span className="text-xs text-muted-foreground">{formatTimestamp(segment.start)}</span>
            </div>
            <p className="text-foreground/90 leading-relaxed">{segment.text}</p>
          </article>
        ))}
      </div>
    </div>
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
    return <ClarityPageLoader />;
  }

  if (!user) return null;

  const goBack = () => {
    if (view.type === 'round') setView({ type: 'session', session: view.session });
    else if (view.type === 'transcript') setView({ type: 'session', session: view.session });
    else if (view.type === 'session') setView({ type: 'list' });
  };

  // Copy transcript from session detail (uses fetchSessionTranscript)
  const handleCopyTranscript = async (sessionId: string) => {
    try {
      const transcript = await fetchSessionTranscript(sessionId);
      if (transcript && transcript.segments.length > 0) {
        const text = formatTranscriptForCopy(transcript);
        await navigator.clipboard.writeText(text);
      }
    } catch {
      console.error('[P495] Failed to copy transcript');
    }
  };

  const handleRetryTranscription = async (sessionId: string) => {
    try {
      await retryTranscription(sessionId);
      // Refresh sessions to update status
      fetchSessions();
    } catch {
      console.error('[P495] Failed to retry transcription');
    }
  };

  const roundItem = view.type === 'round' ? view.session.sessionHistory[view.roundIndex] : null;
  const headerTitle =
    view.type === 'list' ? 'Session History'
    : view.type === 'session' ? `${formatDate(view.session.date)} · ${view.session.partnerName}`
    : view.type === 'transcript' ? 'Transcript'
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

          {/* P495: Transcript row */}
          <TranscriptRow
            session={view.session}
            onCopy={() => handleCopyTranscript(view.session.id)}
            onOpen={() => setView({ type: 'transcript', session: view.session })}
            onRetry={() => handleRetryTranscription(view.session.id)}
          />
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

      {view.type === 'transcript' && (
        <TranscriptView
          session={view.session}
          onBack={goBack}
        />
      )}
    </main>
  );
}
