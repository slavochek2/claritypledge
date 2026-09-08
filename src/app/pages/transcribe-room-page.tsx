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
import { Sparkles, ShieldOff, Loader2, Users, LogOut } from 'lucide-react';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { createSerialSender, createSliceRecorder, type SliceRecorder } from '@/lib/audio/slice-recorder';
import {
  createRoom,
  getRoomByCode,
  joinRoom,
  endRoom,
  prewarmSlicePath,
  sendAudioSlice,
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

/**
 * P1152/PV-1 (2026-09-01): on Android, holding a MediaRecorder on the mic starved
 * SpeechRecognition — it opened, received silence, and closed at ~5.3 s with no error of
 * any kind, 14 consecutive times on a physical Galaxy S22 measured over adb. That is why
 * recording was dead code behind RECORD_AUDIO_WHILE_LIVE = false.
 *
 * P1236 Decision 7 removes the contention BY CONSTRUCTION rather than by scheduling the
 * two: SpeechRecognition is the half that cannot share a stream (the Web Speech API opens
 * its own capture and takes no MediaStream argument), so it is gone from this page. One
 * getUserMedia stream now feeds BOTH a Web Audio tap (live slices, sent to the server for
 * transcription) and a MediaRecorder (30 s archival chunks, unchanged path). Re-measured
 * on the same physical S22 2026-09-08: the tap held exactly 48000 frames/second in every
 * second including the one where the recorder attached, and the recorder produced 12
 * non-empty chunks — no degradation at all. Probe: scripts/p1236-stagea-probe/.
 *
 * The flag is deleted rather than flipped: a boolean guarding a hazard that no longer
 * exists is an invitation to re-litigate it.
 *
 * `useSpeechToText` itself is NOT deleted — /chat still uses its default (non-autoRestart)
 * behaviour and is unaffected.
 */

export function TranscribeRoomPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { code: urlCode } = useParams<{ code?: string }>();
  const { user, isLoading: authLoading, sessionChecked } = useAuth();

  const [view, setView] = useState<ViewState>('loading');
  const [consentGiven, setConsentGiven] = useState(false);
  const [room, setRoom] = useState<TranscribeRoom | null>(null);
  // No `member` state: the caller's own membership was only ever read by the
  // sendFinalMessage effect, which is gone with the recognizer. The join result is handed
  // straight to startCapture, and everything rendered comes from the roster subscription.
  const [members, setMembers] = useState<TranscribeRoomMember[]>([]);
  const [messages, setMessages] = useState<TranscribeMessage[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Separate from joinError: startCapture's catch fires AFTER view is already 'room'
  // (handleJoin sets view before calling startCapture), so joinError — only rendered on
  // the consent screen — would silently swallow this. Rendered in the room view's own
  // listening indicator instead (P1149 finish-review MEDIUM).
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chunkNumberRef = useRef(0);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Decision 7: ONE getUserMedia stream, teed to the Web Audio tap and the MediaRecorder.
  // Held so teardown can stop the tracks exactly once, after both consumers are done.
  const streamRef = useRef<MediaStream | null>(null);
  const sliceRecorderRef = useRef<SliceRecorder | null>(null);

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

  // ── Live text now arrives the same way everyone else's does ─────────────
  // There is no local transcript state and no interim text on this page any more. Slices
  // go to the server; the server's rows come back through subscribeToRoomMessages, which
  // this component already renders. That makes Invariant 1 ("interim text never leaves the
  // browser") true by construction rather than by discipline — there is no interim text
  // anywhere in this file to leak.
  //
  // The cost is latency: ~6 s instead of the recognizer's sub-second. The spec accepts it
  // ("slower and working beats instant and absent"), on the founder's answer that "read
  // while talking is not really the case at all".

  /**
   * Decision 7: ONE getUserMedia call, teed two ways.
   *
   * The MediaRecorder branch below is byte-for-byte the archival path that already
   * existed — same 30 s cadence, same uploadRoomAudioChunk, same chunk_NNN.webm object
   * names — it is simply no longer behind a dead flag. Nothing downstream of it changes,
   * which is what keeps ROOM_FILE_NAME_RE and the batch pipeline working.
   *
   * The slice recorder is the new half. It attaches a Web Audio tap to the SAME stream and
   * emits a 5 s WAV every 4 s. Both consumers share one stream because Stage A measured
   * that they can — and because two getUserMedia calls would be two microphone sessions,
   * which is the contention this feature exists to remove.
   */
  const startCapture = useCallback(async (roomForCapture: TranscribeRoom, memberForCapture: TranscribeRoomMember) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // ── Archival: unchanged 30 s WebM chunks to GCS ───────────────────────
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

      // The recorder owns stopping the tracks, because it is the consumer with an
      // explicit end-of-stream obligation (the final chunk must be flushed with
      // isLast=true). The slice recorder is stopped first, in handleEndSession.
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void flush(true);
      };

      // ── Live: 5 s WAV slices to transcribe-slice ──────────────────────────
      // Sent SERIALLY, one in flight at a time. The server assigns spoken_at at insert
      // time and de-duplicates against this member's most recent row, read before a ~2 s
      // Gemini call and written after it — so two overlapping requests from the same
      // member would land in completion order rather than speech order AND both dedupe
      // against the same stale previous. Overlap is not hypothetical: measured p95 is
      // 2.20-2.75 s against a 4 s cadence, and that figure excludes upload.
      //
      // A failed slice is logged and dropped, never retried: a retry would re-send audio
      // the server may already have transcribed. The queue is bounded so a phone that has
      // lost its radio drops slices rather than growing without limit — the archival
      // upload above still carries every second, so only live text degrades.
      const sendSlice = createSerialSender(
        (wav, sequence) => sendAudioSlice(roomForCapture.id, sequence, wav),
        {
          onError: (err, sequence) => console.error(`[transcribe] slice ${sequence} upload failed:`, err),
          onDrop: (sequence) => console.warn(`[transcribe] slice ${sequence} dropped — upload queue full`),
        },
      );
      sliceRecorderRef.current = await createSliceRecorder(stream, {
        onSlice: sendSlice,
        onError: (err) => console.error('[transcribe] slice recorder error:', err),
      });
    } catch (err) {
      console.error('[transcribe] failed to start capture:', err);
      setMicError('Could not access your microphone. You can still read the chat.');
    }
  }, []);

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
        joinedMember = await joinRoom(existing.id, user.id, displayName, consentGiven);
      } else {
        const created = await createRoom(user.id, displayName, consentGiven);
        joinedRoom = created.room;
        joinedMember = created.member;
      }

      setRoom(joinedRoom);
      setView('room');

      // Wake-on-join (Decision 3/6): one no-audio POST, issued AFTER joinRoom resolves and
      // BEFORE startCapture. Gated on the authenticated join rather than on a
      // client-callable "start" endpoint, which is what the Security Review asked for.
      // It is an optimisation — there is no ~30 s GPU cold start left to hide — so a
      // failure here is logged and ignored rather than blocking the room.
      void prewarmSlicePath(joinedRoom.id).catch((err) => {
        console.warn('[transcribe] pre-warm failed (non-fatal):', err);
      });

      void startCapture(joinedRoom, joinedMember);
    } catch (err) {
      console.error('[transcribe] join failed:', err);
      setJoinError(err instanceof Error ? err.message : 'Failed to join the room.');
      setView('consent');
    }
  }, [user, consentGiven, urlCode, startCapture]);

  const handleEndSession = useCallback(async () => {
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    // Order matters: the slice recorder stops first, then the MediaRecorder — whose
    // onstop stops the shared stream's tracks and flushes the final archival chunk. The
    // other order would pull the tracks out from under a tap that is mid-quantum.
    sliceRecorderRef.current?.stop();
    sliceRecorderRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (streamRef.current) {
      // The SAME fallback the unmount cleanup has, and it was missing here. startCapture
      // assigns streamRef BEFORE constructing the recorder, so if `new MediaRecorder` or
      // `recorder.start()` throws, the catch sets micError while the stream stays live and
      // the recorder is null-or-inactive — and then nothing in this function stops the
      // tracks. The user taps "End Session", sees "Session ended", and the microphone
      // indicator stays lit until they navigate away. On a feature whose entire premise is
      // that capture matches a recorded consent, that is the worst place to leave a gap.
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (room) {
      try {
        await endRoom(room.id);
      } catch (err) {
        console.error('[transcribe] end room failed:', err);
      }
    }
    setView('ended');
  }, [room]);

  useEffect(() => () => {
    // Navigating away without clicking "End Session" (SPA route change, browser back) must
    // stop the mic the same way handleEndSession does — otherwise capture continues past
    // what the consent screen promised, and that promise is now also a server-side record.
    // Same order as handleEndSession; recorder.onstop stops the shared stream's tracks.
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    sliceRecorderRef.current?.stop();
    sliceRecorderRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (streamRef.current) {
      // The recorder never started (getUserMedia resolved, MediaRecorder threw), so its
      // onstop will never fire and nothing else would release the microphone.
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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
          className="min-h-11 border-blue-300 text-blue-700 hover:bg-blue-50"
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
        ) : (
          /* P1236 Decision 7: three states collapse into one.
             The old indicator had to distinguish "listening", "reconnecting" and the
             terminal "live text stopped — tap to resume", because the browser recognizer
             could die silently and on iOS could only be restarted by a user gesture. None
             of those states exist now: there is no recognizer to drop, and no gesture that
             could revive one. Capture is a Web Audio tap on a stream we hold, and if that
             fails at all it fails at getUserMedia — which is the micError branch above.

             So this is a plain status line, not a state machine. Blue, matching /live's own
             RecordingIndicator: design-system.md reserves red for destructive actions, and
             a passive recording status is not one. */
          <div
            className="flex items-center gap-1.5 mb-3 text-xs text-muted-foreground"
            data-testid="transcribe-listening-indicator"
            role="status"
          >
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shrink-0" aria-hidden="true" />
            Listening — your words appear here a few seconds after you say them
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
        </div>
      </div>
    </div>
  );
}
