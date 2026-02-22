/**
 * @file my-sessions-page.tsx
 * @description P405: /sessions — view past live session history
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { getUserSessions, type SessionSummary } from '@/app/data/sessions-service';
import { SessionList } from '@/app/components/sessions/session-list';
import { SessionDetailDrawer } from '@/app/components/sessions/session-detail-drawer';

export function MySessionsPage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);

  // Auth guard — redirect to login when not authenticated
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
    if (user?.id) {
      fetchSessions();
    }
  }, [user?.id, fetchSessions]);

  // Loading: auth check in progress
  if (!sessionChecked || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <main
      aria-label="Session History"
      className="container mx-auto px-4 lg:px-8 pt-24 pb-24 max-w-2xl"
    >
      <h1 className="text-2xl font-bold text-foreground mb-6">Session History</h1>

      <SessionList
        sessions={sessions}
        isLoading={fetchState === 'loading'}
        isError={fetchState === 'error'}
        onRetry={fetchSessions}
        onSessionClick={setSelectedSession}
      />

      <SessionDetailDrawer
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </main>
  );
}
