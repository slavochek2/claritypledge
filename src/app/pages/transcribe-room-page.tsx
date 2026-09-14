/**
 * @file transcribe-room-page.tsx
 * @description P1149: /transcribe — the live room transcription chat.
 *
 * A room of signed-in people, each on their own device, transcribing into one shared,
 * attributed chat while their audio simultaneously lands in the ML bucket. See
 * features/p1149_live_room_transcription_chat.md.
 *
 * No me/everyone filter in v1 (founder decision, 2026-08-23) — every finalized message
 * from every participant renders in one shared list, in spoken order.
 *
 * P1307 Decision 7: this page no longer holds a microphone. Capture belongs to the one
 * app-level owner (RoomCaptureProvider), so leaving this page — for the meet page, a profile,
 * the feed — no longer ends a person's contribution, and the bar shows it is still running.
 *   - While a capture for this room runs (or no code names another room), the page renders the
 *     room view directly: no consent screen, no join, no second recording, no teardown when the
 *     page unmounts.
 *   - When nothing is running, the consent → join flow is the one it always was; the join goes
 *     through the provider so there is still exactly one capture owner.
 *   - End ends THIS person's capture. No client ends a room for anyone else — the server-side
 *     sweep ends it once everyone has stopped.
 *   - P1236 Decision 7 still holds: there is no browser speech recognizer and no interim text
 *     anywhere here; live text arrives only as the server's rows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { BottomBackButton } from '@/app/components/layout/bottom-back-button';
import { useGoBack } from '@/app/hooks/use-go-back';
import { Button } from '@/components/ui/button';
import { Sparkles, ShieldOff, Loader2, Users, LogOut, ArrowDown } from 'lucide-react';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import { analytics } from '@/lib/mixpanel';
import {
  getRoomByCode,
  subscribeToRoomMembers,
  subscribeToRoomMessages,
  type TranscribeRoomMember,
  type TranscribeMessage,
} from '@/app/data/transcribe-service';
import { useRoomCapture, type CapturePhase } from '@/app/contexts/room-capture-context';
import { RoomCaptureBarSlot } from '@/app/components/session/room-capture-bar';
import { mergeConsecutiveSpeakerRows } from '@/app/components/session/transcript-merge';

type ViewState = 'loading' | 'consent' | 'joining' | 'room' | 'ended';

/** A capture that exists for this person, whether this tab holds the microphone or not. */
const RUNNING_PHASES: ReadonlySet<CapturePhase> = new Set(['capturing', 'stalled', 'paused', 'observing']);

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TranscribeRoomPage() {
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  const { user, isLoading: authLoading, sessionChecked } = useAuth();
  const capture = useRoomCapture();

  // P1304: the room code in this URL is a join capability, and Mixpanel's
  // recorder sends the raw URL with every replay batch.
  useEffect(() => {
    if (urlCode) analytics.stopSessionRecording();
  }, [urlCode]);

  const [view, setView] = useState<ViewState>('loading');
  const [consentGiven, setConsentGiven] = useState(false);
  const [members, setMembers] = useState<TranscribeRoomMember[]>([]);
  const [messages, setMessages] = useState<TranscribeMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Joined, but the microphone could not open: the room is still readable, as it always was
  // on this page. Nothing is captured, and the server has recorded this person's end.
  const [readOnlyRoomId, setReadOnlyRoomId] = useState<string | null>(null);

  const captureRunning = capture.roomId !== null && RUNNING_PHASES.has(capture.phase);
  // /transcribe with no code while capturing shows the running room and never enters a second
  // one. A code that names a DIFFERENT room is a real request to switch rooms: consent first.
  const codeMatchesRunningRoom =
    !urlCode || (capture.roomCode ?? '').toUpperCase() === urlCode.toUpperCase();
  const showRunningRoom = captureRunning && codeMatchesRunningRoom && view !== 'ended';
  const showReadOnlyRoom = !showRunningRoom && readOnlyRoomId !== null && view !== 'ended';
  const roomId = showRunningRoom ? capture.roomId : showReadOnlyRoom ? readOnlyRoomId : null;

  // P1294: the list follows new lines, and stops following the moment the reader scrolls up.
  // Keyed on a SCALAR, never on `messages` itself — the subscription replaces that array
  // wholesale on every realtime event and on a 15s reconciliation poll. The newest id is in the
  // key so a removal and an arrival in the same update cannot leave the list unfollowed.
  const {
    containerRef: chatRef,
    onScroll: onChatScroll,
    isAtBottom,
    scrollToBottom,
  } = useStickToBottom<HTMLDivElement>(`${messages.length}:${messages[messages.length - 1]?.id ?? ''}`);

  // ── Auth gate (DW-1) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionChecked || authLoading) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(urlCode ? `/transcribe/${urlCode}` : '/transcribe')}`, { replace: true });
      return;
    }
    setView((v) => (v === 'loading' ? 'consent' : v));
  }, [user, authLoading, sessionChecked, navigate, urlCode]);

  // ── A capture that ended elsewhere (the bar's End, the cap, the room ending) ─
  // Not while this page's own join is in flight: a join whose microphone then fails passes
  // through capturing and back to idle, and that must land in the read-only room, not on
  // "Session ended".
  const wasInRoomRef = useRef(false);
  const joiningRef = useRef(false);
  useEffect(() => {
    if (joiningRef.current) return;
    if (showRunningRoom) {
      wasInRoomRef.current = true;
    } else if (wasInRoomRef.current && !captureRunning && capture.phase === 'idle') {
      wasInRoomRef.current = false;
      setView('ended');
    }
  }, [showRunningRoom, captureRunning, capture.phase]);

  // ── Roster + chat subscriptions for the room on screen ────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsubMembers = subscribeToRoomMembers(roomId, setMembers);
    const unsubMessages = subscribeToRoomMessages(roomId, setMessages);
    return () => {
      unsubMembers();
      unsubMessages();
    };
  }, [roomId]);

  /**
   * The consent screen's escape hatch is a BACK button, not a "Leave" (founder, 2026-08-31).
   * Founder, P1307 testing: every screen here gets "Go back" at the top and the bottom, like
   * /stake, leading to wherever the person came from. Leaving the running room this way does
   * not end capture — the app-level owner keeps it and the bar shows it (P1307 D7). Arrivals
   * with nothing behind them land on the home page, as before.
   */
  const handleBack = useGoBack('/');

  const handleJoin = useCallback(async () => {
    if (!user || !consentGiven) return;
    setView('joining');
    setJoinError(null);
    const displayName = user.name || user.email || 'Participant';
    joiningRef.current = true;
    try {
      let result;
      if (urlCode) {
        const existing = await getRoomByCode(urlCode);
        if (!existing) {
          setJoinError('This room could not be found.');
          setView('consent');
          return;
        }
        result = await capture.startCapture({ eventId: existing.eventId, displayName, room: existing });
      } else {
        result = await capture.startCapture({ eventId: null, displayName });
      }
      if (!result.started && result.reason === 'microphone' && result.room) {
        // The pre-P1307 page behaved exactly this way: in the room, reading, not recorded.
        wasInRoomRef.current = false;
        setReadOnlyRoomId(result.room.id);
        setView('room');
        return;
      }
      if (!result.started) {
        // [FOUNDER DECISION: copy] — same placeholder wording the join path already used.
        setJoinError('Could not start a room. Please try again.');
        setView('consent');
        return;
      }
      setReadOnlyRoomId(null);
      setView('room');
    } catch (err) {
      console.error('[transcribe] join failed:', err);
      setJoinError(err instanceof Error ? err.message : 'Failed to join the room.');
      setView('consent');
    } finally {
      joiningRef.current = false;
    }
  }, [user, consentGiven, urlCode, capture]);

  const handleEndSession = useCallback(async () => {
    // A read-only room has no capture to end; the server already recorded the end.
    if (showRunningRoom && roomId) await capture.endMyCapture(roomId);
    wasInRoomRef.current = false;
    setReadOnlyRoomId(null);
    setView('ended');
  }, [showRunningRoom, roomId, capture]);

  const mergedRows = useMemo(() => mergeConsecutiveSpeakerRows(messages), [messages]);

  if (!sessionChecked || authLoading || view === 'loading') {
    return (
      <div
        className="flex items-center justify-center h-full pt-[calc(4rem+env(safe-area-inset-top))] lg:pt-[calc(5rem+env(safe-area-inset-top))] text-muted-foreground"
        data-testid="transcribe-loading"
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!user) return null;

  if (view === 'ended') {
    return (
      // isLivePage (clarity-landing-layout.tsx) covers all of /transcribe and removes <main>'s
      // top padding, so non-room screens clear the fixed nav themselves.
      <div
        className="max-w-md mx-auto px-4 py-8 text-center h-full overflow-y-auto pt-[calc(4rem+env(safe-area-inset-top)+2rem)] lg:pt-[calc(5rem+env(safe-area-inset-top)+2rem)]"
        data-testid="transcribe-ended-screen"
      >
        <div className="text-left">
          <FocusHeader onBack={handleBack} />
        </div>
        <h1 className="text-xl font-semibold mb-2 font-['Playfair_Display']">Session ended</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {/* [FOUNDER DECISION: copy] */}
          The room&rsquo;s audio has been saved.
        </p>
        {members.length > 0 && (
          <p className="text-xs text-muted-foreground mb-6" data-testid="transcribe-ended-roster">
            Was in the room: {members.map((m) => m.displayName).join(', ')}
          </p>
        )}
        <Button
          onClick={() => navigate('/sessions')}
          variant="outline"
          className="min-h-11 border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          Go to my sessions
        </Button>
        <BottomBackButton onBack={handleBack} testId="transcribe-bottom-back" />
      </div>
    );
  }

  if (!showRunningRoom && !showReadOnlyRoom) {
    return (
      <div
        className="max-w-md mx-auto px-4 py-8 h-full overflow-y-auto pt-[calc(4rem+env(safe-area-inset-top)+2rem)] lg:pt-[calc(5rem+env(safe-area-inset-top)+2rem)]"
        data-testid="transcribe-consent-screen"
      >
        <FocusHeader onBack={handleBack} />
        <h1 className="text-xl font-semibold mb-2 font-['Playfair_Display']">Join the transcription room</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {/* [FOUNDER DECISION: copy] — P1236 removed a "corrected transcript afterwards" promise
              from this screen because nothing kept it. Restore one only once the saved transcript
              is live and verified. */}
          Your spoken words will be transcribed live and shown to everyone in this room,
          attributed to you with a timestamp. The room&rsquo;s audio is recorded.
        </p>

        <button
          type="button"
          onClick={() => setConsentGiven((prev) => !prev)}
          aria-pressed={consentGiven}
          className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 mb-6 min-h-11 text-left transition-colors ${
            consentGiven
              ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'border-border text-muted-foreground hover:bg-muted'
          }`}
          data-testid="transcribe-recording-toggle"
        >
          {consentGiven ? (
            <Sparkles className="w-5 h-5 text-blue-500 shrink-0" />
          ) : (
            <ShieldOff className="w-5 h-5 shrink-0" />
          )}
          <span className="font-medium">
            {consentGiven ? 'Recorded and visible to everyone in this room' : 'Not yet agreed — tap to agree'}
          </span>
        </button>

        {joinError && <p className="text-sm text-red-600 mb-4" data-testid="transcribe-join-error">{joinError}</p>}

        <Button
          onClick={() => void handleJoin()}
          disabled={!consentGiven || view === 'joining'}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white min-h-11"
          data-testid="transcribe-join-button"
        >
          {view === 'joining' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {view === 'joining' ? 'Joining...' : 'Join room'}
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-4">
          By joining, you agree to our{' '}
          <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms</a>{' '}
          and{' '}
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a>.
        </p>
        <BottomBackButton onBack={handleBack} testId="transcribe-bottom-back" />
      </div>
    );
  }

  // The running room.
  const speaking = capture.speakingMemberIds;
  const lastRow = mergedRows[mergedRows.length - 1];

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="transcribe-room-screen">
      {/* Same sticky-bar-over-the-fixed-nav technique as /live's session banner (P1149). */}
      <div className="sticky top-0 z-50 h-[calc(4rem+env(safe-area-inset-top))] lg:h-[calc(5rem+env(safe-area-inset-top))] bg-background border-b border-border pt-[env(safe-area-inset-top)] shrink-0">
        <div className="container mx-auto px-4 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <ClarityLogo size="sm" />
            <button
              type="button"
              onClick={() => void handleEndSession()}
              aria-label="End Session"
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg px-3 h-9 transition-colors"
              data-testid="transcribe-end-session-button"
            >
              <LogOut className="h-4 w-4" />
              <span>End Session</span>
            </button>
          </div>
        </div>
      </div>

      {/* P1307 D9: this page has its own header, so it gives the bar its own in-flow place. */}
      <div className="shrink-0">
        <RoomCaptureBarSlot />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col flex-1 min-h-0 w-full">
        {/* Founder, 2026-09-14: the top Back sits in the content column and reads "Back", the
            same control as the join and ended screens and /stake — not an arrow in the header.
            Leaving does not end capture (P1307 D7); End Session does. */}
        <div className="shrink-0" data-testid="transcribe-top-back">
          <FocusHeader onBack={handleBack} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1" data-testid="transcribe-roster">
          <Users className="w-3.5 h-3.5" />
          <span>
            {members.length} in the room:{' '}
            {members.map((m) => (speaking.has(m.id) ? `${m.displayName} …` : m.displayName)).join(', ') || '—'}
          </span>
        </div>

        {showReadOnlyRoom ? (
          <p
            className="text-xs py-2 px-3 rounded-lg font-semibold bg-red-50 text-red-800 border-2 border-red-500 mb-3"
            data-testid="transcribe-mic-error"
            role="status"
          >
            {/* [FOUNDER DECISION: copy] — the page's existing placeholder, unchanged. */}
            Could not access your microphone. You can still read the chat.
          </p>
        ) : capture.phase === 'stalled' ? (
          <p
            className="text-xs py-2 px-3 rounded-lg font-semibold bg-red-50 text-red-800 border-2 border-red-500 mb-3"
            data-testid="transcribe-mic-error"
            role="status"
          >
            Live text has stalled — your words are still being recorded.
          </p>
        ) : (
          <div
            className="flex items-center gap-1.5 mb-3 text-xs text-muted-foreground"
            data-testid="transcribe-listening-indicator"
            role="status"
          >
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shrink-0" aria-hidden="true" />
            Listening — your words appear here a few seconds after you say them
          </div>
        )}

        <div className="relative flex-1 min-h-0 mb-4">
          <div
            ref={chatRef}
            onScroll={onChatScroll}
            className="h-full overflow-y-auto space-y-3"
            data-testid="transcribe-chat"
          >
            {mergedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="transcribe-empty-room">
                You're first here. Words will appear as people speak.
              </p>
            ) : (
              mergedRows.map((row) => {
                const speaker = members.find((m) => m.id === row.memberId);
                const stillSpeaking = row === lastRow && speaking.has(row.memberId);
                return (
                  <div key={row.key} className="text-sm" data-testid="transcribe-message">
                    <span className="font-medium">{speaker?.displayName ?? 'Someone'}</span>{' '}
                    <span className="text-xs text-muted-foreground">{formatTime(row.spokenAt)}</span>
                    <p>
                      {row.text}
                      {stillSpeaking && (
                        <span className="text-muted-foreground" aria-label="still speaking" data-testid="transcribe-speaking">
                          {' '}…
                        </span>
                      )}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Only while detached; not a primary action and never full-width (P955). */}
          {!isAtBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              aria-label="Jump to newest"
              data-testid="transcribe-jump-to-newest"
              className="absolute bottom-2 right-2 w-11 h-11 rounded-full border bg-background shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <ArrowDown className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <BottomBackButton onBack={handleBack} testId="transcribe-bottom-back" className="mt-0 shrink-0" />
      </div>
    </div>
  );
}
