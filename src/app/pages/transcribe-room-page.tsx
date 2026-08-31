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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import { MicOff, Sparkles, ShieldOff, Loader2, Users, LogOut } from 'lucide-react';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import {
  createRoom,
  getRoomByCode,
  joinRoom,
  endRoom,
  sendFinalMessage,
  subscribeToRoomMembers,
  subscribeToRoomMessages,
  type TranscribeRoomMember,
  type TranscribeMessage,
  type TranscribeRoom,
} from '@/app/data/transcribe-service';
import { uploadRoomAudioChunk } from '@/app/data/api';

type ViewState = 'loading' | 'consent' | 'joining' | 'room' | 'ended';

const CHUNK_INTERVAL_MS = 30000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TranscribeRoomPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { code: urlCode } = useParams<{ code?: string }>();
  const { user, isLoading: authLoading, sessionChecked } = useAuth();

  const [view, setView] = useState<ViewState>('loading');
  const [consentGiven, setConsentGiven] = useState(false);
  const [room, setRoom] = useState<TranscribeRoom | null>(null);
  const [member, setMember] = useState<TranscribeRoomMember | null>(null);
  const [members, setMembers] = useState<TranscribeRoomMember[]>([]);
  const [messages, setMessages] = useState<TranscribeMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Separate from joinError: startCapture's catch fires AFTER view is already 'room'
  // (handleJoin sets view before calling startCapture), so joinError — only rendered on
  // the consent screen — would silently swallow this. Rendered in the room view's own
  // listening indicator instead (P1149 finish-review MEDIUM).
  const [micError, setMicError] = useState<string | null>(null);

  // Gate 0 / Risks: opt-in auto-restart, so a dropped recognizer recovers instead of
  // dying silently. The dedicated "dropped and restarting" UI state below is what makes
  // a dead recognizer visible rather than silent (spec UX Notes).
  const {
    transcript,
    interimTranscript,
    isListening,
    isSupported: speechSupported,
    startListening,
    stopListening,
    liveTextStopped,
    lastRecognitionError,
  } = useSpeechToText('en-US', { autoRestart: true });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chunkNumberRef = useRef(0);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // How much of the hook's cumulative `transcript` has already been sent as a message —
  // only the newly-appended (finalized) suffix is ever sent, one utterance at a time.
  const sentLengthRef = useRef(0);

  // ── Auth gate (DW-1) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionChecked || authLoading) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(urlCode ? `/transcribe/${urlCode}` : '/transcribe')}`, { replace: true });
      return;
    }
    setView((v) => (v === 'loading' ? 'consent' : v));
  }, [user, authLoading, sessionChecked, navigate, urlCode]);

  // ── Roster + chat subscriptions once we've joined a room ───────────────
  useEffect(() => {
    if (!room) return;
    const unsubMembers = subscribeToRoomMembers(room.id, setMembers);
    const unsubMessages = subscribeToRoomMessages(room.id, setMessages);
    return () => {
      unsubMembers();
      unsubMessages();
    };
  }, [room]);

  // ── Broadcast finalized utterances only — interim text never leaves the browser (DW-4) ──
  // `transcript` only grows when the hook commits a FINAL result (see onresult in
  // useSpeechToText.ts); interimTranscript is read only for local display above and is
  // never passed to sendFinalMessage anywhere in this file.
  useEffect(() => {
    if (!room || !member) return;
    const newText = transcript.slice(sentLengthRef.current).trim();
    if (newText) {
      sentLengthRef.current = transcript.length;
      void sendFinalMessage(room.id, member.id, newText);
    }
  }, [transcript, room, member]);

  const startCapture = useCallback(async (roomForCapture: TranscribeRoom, memberForCapture: TranscribeRoomMember) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      chunkNumberRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      const flush = async (isLast: boolean) => {
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        const num = chunkNumberRef.current++;
        try {
          await uploadRoomAudioChunk(roomForCapture.code, memberForCapture.displayName, memberForCapture.id, blob, num, isLast);
        } catch (err) {
          console.error('[transcribe] chunk upload failed:', err);
        }
      };

      recorder.start();
      chunkIntervalRef.current = setInterval(() => {
        recorder.requestData();
        void flush(false);
      }, CHUNK_INTERVAL_MS);

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void flush(true);
      };

      if (speechSupported) {
        startListening();
      }
    } catch (err) {
      console.error('[transcribe] failed to start capture:', err);
      setMicError('Could not access your microphone. You can still read the chat.');
    }
  }, [speechSupported, startListening]);

  /**
   * The consent screen's escape hatch is a BACK button, not a "Leave" (founder,
   * 2026-08-31: "leave makes no sense if I'm on transcribe and I just landed
   * there because I typed /transcribe"). Nothing has been joined at this point,
   * so there is nothing to leave — the user is being asked a question and wants
   * to go back to wherever they were.
   *
   * `location.key === 'default'` is react-router's marker for the FIRST entry in
   * this app's history — a typed URL, a bookmark, an external link. There is no
   * in-app page behind it, so `history.back()` would leave the site entirely;
   * those land on the home page instead. Everything else really does go back.
   */
  const handleBack = useCallback(() => {
    if (location.key === 'default') navigate('/', { replace: true });
    else navigate(-1);
  }, [navigate, location.key]);

  const handleJoin = useCallback(async () => {
    if (!user || !consentGiven) return;
    setView('joining');
    setJoinError(null);
    try {
      const displayName = user.name || user.email || 'Participant';
      let joinedRoom: TranscribeRoom;
      let joinedMember: TranscribeRoomMember;

      if (urlCode) {
        const existing = await getRoomByCode(urlCode);
        if (!existing) {
          setJoinError('This room could not be found.');
          setView('consent');
          return;
        }
        joinedRoom = existing;
        joinedMember = await joinRoom(existing.id, user.id, displayName);
      } else {
        const created = await createRoom(user.id, displayName);
        joinedRoom = created.room;
        joinedMember = created.member;
      }

      setRoom(joinedRoom);
      setMember(joinedMember);
      setView('room');
      void startCapture(joinedRoom, joinedMember);
    } catch (err) {
      console.error('[transcribe] join failed:', err);
      setJoinError(err instanceof Error ? err.message : 'Failed to join the room.');
      setView('consent');
    }
  }, [user, consentGiven, urlCode, startCapture]);

  const handleEndSession = useCallback(async () => {
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    stopListening();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (room) {
      try {
        await endRoom(room.id);
      } catch (err) {
        console.error('[transcribe] end room failed:', err);
      }
    }
    setView('ended');
  }, [room, stopListening]);

  useEffect(() => () => {
    // Navigating away without clicking "End Session" (SPA route change, browser back) must
    // stop the mic the same way handleEndSession does — otherwise recording continues past
    // what the consent screen promised. recorder.onstop already stops the raw stream tracks.
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  if (!sessionChecked || authLoading || view === 'loading') {
    return (
      // Same nav-clearance fix as the consent/ended screens below — see comment there.
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

  if (view === 'consent' || view === 'joining') {
    return (
      // isLivePage (clarity-landing-layout.tsx) now covers all of /transcribe, not just
      // the room sub-state — it stops giving <main> automatic top padding so the room's
      // own sticky bar can overlap the fixed site nav. This screen doesn't have that bar,
      // so it needs to clear the nav itself (same convention /live's own pre-join screens
      // use — e.g. live-mode-view.tsx CONTENT_LAYOUT's own pt-8/pt-16). overflow-y-auto
      // and h-full compensate for <main> now being overflow-hidden too.
      <div
        className="max-w-md mx-auto px-4 py-8 h-full overflow-y-auto pt-[calc(4rem+env(safe-area-inset-top)+2rem)] lg:pt-[calc(5rem+env(safe-area-inset-top)+2rem)]"
        data-testid="transcribe-consent-screen"
      >
        <FocusHeader onBack={handleBack} />
        <h1 className="text-xl font-semibold mb-2 font-['Playfair_Display']">Join the transcription room</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your spoken words will be transcribed live and shown to everyone in this room,
          attributed to you with a timestamp. A corrected transcript is produced afterward and
          added to your session history.
        </p>

        <button
          type="button"
          onClick={() => setConsentGiven((prev) => !prev)}
          aria-pressed={consentGiven}
          className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 mb-6 min-h-[44px] text-left transition-colors ${
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
          className="w-full bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
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
      </div>
    );
  }

  if (view === 'ended') {
    return (
      // Same nav-clearance fix as the consent screen above — see comment there.
      <div
        className="max-w-md mx-auto px-4 py-8 text-center h-full overflow-y-auto pt-[calc(4rem+env(safe-area-inset-top)+2rem)] lg:pt-[calc(5rem+env(safe-area-inset-top)+2rem)]"
        data-testid="transcribe-ended-screen"
      >
        <h1 className="text-xl font-semibold mb-2 font-['Playfair_Display']">Session ended</h1>
        <p className="text-sm text-muted-foreground mb-6">
          A corrected transcript is being produced and will appear in your session history when ready.
        </p>
        {members.length > 0 && (
          <p className="text-xs text-muted-foreground mb-6" data-testid="transcribe-ended-roster">
            Was in the room: {members.map((m) => m.displayName).join(', ')}
          </p>
        )}
        <Button
          onClick={() => navigate('/sessions')}
          variant="outline"
          className="min-h-[44px] border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          Go to my sessions
        </Button>
      </div>
    );
  }

  // view === 'room'
  return (
    <div className="flex flex-col h-full min-h-0" data-testid="transcribe-room-screen">
      {/* P1149 (2026-08-24 founder review): matches /live's live-session-banner.tsx —
          same sticky-bar-over-the-fixed-nav technique (see clarity-landing-layout.tsx
          isLivePage), same End Session control (LogOut icon, muted text, red only on
          hover). Replaces the site nav's "Start a Clarity Session" CTA while in a room,
          and is now the SOLE exit action — the full-width red button that used to sit
          at the bottom is gone. Two controls for the same action was exactly the
          "Leave" vs "End session" duplication removed earlier in this same review; a
          second one re-introduced here just at a different position would repeat it. */}
      <div className="sticky top-0 z-50 h-[calc(4rem+env(safe-area-inset-top))] lg:h-[calc(5rem+env(safe-area-inset-top))] bg-background border-b border-border pt-[env(safe-area-inset-top)] shrink-0">
        <div className="container mx-auto px-4 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <ClarityLogo size="sm" />
            <button
              type="button"
              onClick={() => void handleEndSession()}
              aria-label="End Session"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg px-3 h-9 transition-colors"
              data-testid="transcribe-end-session-button"
            >
              <LogOut className="h-4 w-4" />
              <span>End Session</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col flex-1 min-h-0 w-full">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1" data-testid="transcribe-roster">
          <Users className="w-3.5 h-3.5" />
          <span>{members.length} in the room: {members.map((m) => m.displayName).join(', ') || '—'}</span>
        </div>

        {micError ? (
          <p
            className="text-xs py-2 px-3 rounded-lg font-semibold bg-red-50 text-red-800 border-2 border-red-500 mb-3"
            data-testid="transcribe-mic-error"
            role="status"
          >
            {micError}
          </p>
        ) : !speechSupported ? (
          <p className="text-xs text-muted-foreground text-center py-3" data-testid="transcribe-unsupported">
            Live text isn't available on this browser. Your audio is still being recorded — the
            corrected transcript will arrive the same as everyone else's.
          </p>
        ) : (
          <div
            className={`flex items-center gap-1.5 mb-3 text-xs ${
              isListening
                ? 'text-muted-foreground'
                : 'flex-wrap py-2 px-3 rounded-lg font-semibold bg-red-50 text-red-800 border-2 border-red-500'
            }`}
            data-testid="transcribe-listening-indicator"
            role="status"
          >
            {isListening ? (
              <>
                {/* design-system.md reserves red for destructive actions — a passive
                    "listening" status isn't one, and it collided with the End Session
                    control below. Blue matches /live's own recording indicator
                    (live-mode-view.tsx RecordingIndicator: "Session recorded for AI
                    Insights", bg-blue-50/text-blue-700/text-blue-500 dot) — same
                    passive-recording concept, same color, now genuinely consistent
                    with the one precedent that already exists for it. */}
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shrink-0" aria-hidden="true" />
                Listening — your words are going in
              </>
            ) : liveTextStopped ? (
              <>
                {/* P1196: the terminal state. Automatic restarts are exhausted — on iOS
                    they cannot succeed at all, because Safari only lets recognition
                    start from a user gesture. This tap IS that gesture, and it is the
                    only thing that can bring live text back on a phone. Audio upload is
                    unaffected either way, which the copy says so nobody stops the
                    session believing the recording died with the live text. */}
                <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Live text stopped. Your audio is still recording.</span>
                <button
                  type="button"
                  onClick={startListening}
                  className="ml-auto min-h-[40px] px-3 rounded-lg border-2 border-red-500 bg-white text-red-800 font-semibold"
                  data-testid="transcribe-resume-live-text"
                >
                  Resume live text
                </button>
                {lastRecognitionError && (
                  <span className="w-full font-normal opacity-80" data-testid="transcribe-speech-error">
                    ({lastRecognitionError})
                  </span>
                )}
              </>
            ) : (
              <>
                {/* Bordered/light fill, not solid — a STATUS message, deliberately never
                    solid-filled red like a destructive button, so the two can't be
                    confused for each other. Kept at full prominence (unlike the calm
                    "Listening" state above) because a dropped connection is the one
                    state that must stay unmissable. */}
                <MicOff className="w-4 h-4" />
                Reconnecting microphone...
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 mb-4" data-testid="transcribe-chat">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="transcribe-empty-room">
              You're first here. Words will appear as people speak.
            </p>
          ) : (
            messages.map((msg) => {
              const speaker = members.find((m) => m.id === msg.memberId);
              return (
                <div key={msg.id} className="text-sm" data-testid="transcribe-message">
                  <span className="font-medium">{speaker?.displayName ?? 'Someone'}</span>{' '}
                  <span className="text-xs text-muted-foreground">{formatTime(msg.spokenAt)}</span>
                  <p>{msg.text}</p>
                </div>
              );
            })
          )}
          {interimTranscript && (
            <p className="text-sm italic text-muted-foreground" data-testid="transcribe-interim">
              {interimTranscript}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
