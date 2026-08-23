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
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import { MicOff, Sparkles, ShieldOff, Loader2, Users } from 'lucide-react';
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
  const { code: urlCode } = useParams<{ code?: string }>();
  const { user, isLoading: authLoading, sessionChecked } = useAuth();

  const [view, setView] = useState<ViewState>('loading');
  const [consentGiven, setConsentGiven] = useState(false);
  const [room, setRoom] = useState<TranscribeRoom | null>(null);
  const [member, setMember] = useState<TranscribeRoomMember | null>(null);
  const [members, setMembers] = useState<TranscribeRoomMember[]>([]);
  const [messages, setMessages] = useState<TranscribeMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);

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
          await uploadRoomAudioChunk(roomForCapture.code, memberForCapture.displayName, blob, num, isLast);
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
      setJoinError('Could not access your microphone. You can still join and read the chat.');
    }
  }, [speechSupported, startListening]);

  const handleDecline = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

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
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
  }, []);

  if (!sessionChecked || authLoading || view === 'loading') {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground" data-testid="transcribe-loading">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!user) return null;

  if (view === 'consent' || view === 'joining') {
    return (
      <div className="max-w-md mx-auto px-4 py-8" data-testid="transcribe-consent-screen">
        <FocusHeader onBack={handleDecline} label="Leave" aria-label="Leave" />
        <h1 className="text-xl font-semibold mb-2">Join the transcription room</h1>
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
      <div className="max-w-md mx-auto px-4 py-8 text-center" data-testid="transcribe-ended-screen">
        <h1 className="text-xl font-semibold mb-2">Session ended</h1>
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
    <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-4rem)]" data-testid="transcribe-room-screen">
      <FocusHeader onBack={() => void handleEndSession()} label="Leave" aria-label="Leave room" />

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3" data-testid="transcribe-roster">
        <Users className="w-3.5 h-3.5" />
        <span>{members.length} in the room: {members.map((m) => m.displayName).join(', ') || '—'}</span>
      </div>

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

      {!speechSupported ? (
        <p className="text-xs text-muted-foreground text-center py-3" data-testid="transcribe-unsupported">
          Live text isn't available on this browser. Your audio is still being recorded — the
          corrected transcript will arrive the same as everyone else's.
        </p>
      ) : (
        <div
          className={`flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold ${
            isListening
              ? 'bg-muted text-foreground border border-border'
              : 'bg-red-50 text-red-800 border-2 border-red-500'
          }`}
          data-testid="transcribe-listening-indicator"
          role="status"
        >
          {isListening ? (
            <>
              {/* design-system.md "Destructive Actions (Red)": red-500 pulsing dot is the
                  documented recording-indicator pattern — reused as the recording cue on
                  a calm/neutral banner, so it reads distinctly from both the alert-bordered
                  "dropped" status below AND the solid-red "End session" action button. */}
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
              Listening — your words are going in
            </>
          ) : (
            <>
              {/* Bordered/light fill, not solid — a STATUS message, deliberately never
                  solid-filled red like the "End session" button below it, so the two
                  can't be confused for each other when both are red and stacked. */}
              <MicOff className="w-4 h-4" />
              Reconnecting microphone...
            </>
          )}
        </div>
      )}

      {/* Prominent, dedicated stop control — the small FocusHeader "End" link above stays
          for discoverability, but ending a live recording session is a high-consequence
          action (you are being recorded) and deserves the same full-width, unmissable
          weight as every other primary action on this page, matching the reference. */}
      <Button
        onClick={() => void handleEndSession()}
        variant="destructive"
        className="w-full min-h-[44px] mt-3"
        data-testid="transcribe-end-session-button"
      >
        End session
      </Button>
    </div>
  );
}
