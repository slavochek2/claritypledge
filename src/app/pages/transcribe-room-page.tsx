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
import { RoomHeaderActions, TranscribeCaptureRow } from './transcribe-capture-row';
import { EndedBanner, RoomFrame } from './transcribe-room-frame';
import { TranscribeChatList } from './transcribe-chat-list';
import { TranscribeJoinForm } from './transcribe-join-form';
import { RoomPeople } from '@/app/components/session/room-people';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { EndedEventNote, TranscribeRoomTop } from './transcribe-room-event-links';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
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
import { RoomCaptureBarClaimSilent } from '@/app/components/session/room-capture-bar';
import { useLinksTriggerOverride } from '@/app/components/layout/event-links-context';
import { mergeConsecutiveSpeakerRows } from '@/app/components/session/transcript-merge';

type ViewState = 'loading' | 'consent' | 'joining' | 'room' | 'ended';

/** A capture that exists for this person, whether this tab holds the microphone or not. */
const RUNNING_PHASES: ReadonlySet<CapturePhase> = new Set(['capturing', 'stalled', 'paused', 'observing']);


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
  // The room as it was when the session ended: the text stays on screen and the banner can link to the chat.
  const lastRoom = useRef<{ roomId: string; conversationId: string | null } | null>(null);
  const [endedRoom, setEndedRoom] = useState<{ roomId: string; conversationId: string | null } | null>(null);

  const captureRunning = capture.roomId !== null && RUNNING_PHASES.has(capture.phase);
  // /transcribe with no code while capturing shows the running room and never enters a second
  // one. A code that names a DIFFERENT room is a real request to switch rooms: consent first.
  const codeMatchesRunningRoom =
    !urlCode || (capture.roomCode ?? '').toUpperCase() === urlCode.toUpperCase();
  const showRunningRoom = captureRunning && codeMatchesRunningRoom && view !== 'ended';
  const showReadOnlyRoom = !showRunningRoom && readOnlyRoomId !== null && view !== 'ended';

  /**
   * P1323 R2 — this page's Links-trigger declaration, made from INSIDE the page because the
   * sub-state is only visible here.
   *
   * ADOPT on the views that draw their own sticky header over the nav (the running room and
   * the read-only room): the nav's trigger stands down and this page renders the one trigger
   * in its own header. NULL on the join, loading and ended views — they draw no bespoke
   * header, so the nav serves them normally with no declaration at all.
   *
   * Called unconditionally at the top level, before any of the early returns below, because
   * a hook cannot live behind one. The MODE is what varies.
   */
  // P1388: the running room no longer draws its own header over the nav — its only job was to
  // hold End Session, which now sits beside Pause. So every view of this page is served by the
  // site nav (Tools, avatar) with no declaration, as the join and ended views always were.
  useLinksTriggerOverride(null);
  const roomId = showRunningRoom ? capture.roomId : showReadOnlyRoom ? readOnlyRoomId : view === 'ended' ? endedRoom?.roomId ?? null : null;
  useEffect(() => {
    if (showRunningRoom && capture.roomId) lastRoom.current = { roomId: capture.roomId, conversationId: capture.conversationId ?? null };
  }, [showRunningRoom, capture.roomId, capture.conversationId]);

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
      setEndedRoom(lastRoom.current);
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
   * with nothing behind them land on the home page, as before. (P1364: the components call
   * useGoBack themselves from this fallback.)
   */
  const BACK_FALLBACK = '/';

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
    setEndedRoom(lastRoom.current ?? (roomId ? { roomId, conversationId: null } : null));
    setReadOnlyRoomId(null);
    setView('ended');
  }, [showRunningRoom, roomId, capture]);

  const mergedRows = useMemo(() => mergeConsecutiveSpeakerRows(messages), [messages]);

  // P1586: nothing of the page is drawn yet, so the one page loader.
  if (!sessionChecked || authLoading || view === 'loading') return <ClarityPageLoader />;

  if (!user) return null;

  const speaking = capture.speakingMemberIds;
  const list = (
    <TranscribeChatList rows={mergedRows} members={members} speaking={speaking} chatRef={chatRef} onScroll={onChatScroll} isAtBottom={isAtBottom} scrollToBottom={scrollToBottom} />
  );

  // Stop never navigates (founder): the ended view is the room in place, the controls become a banner, the text stays.
  if (view === 'ended') {
    return (
      <RoomFrame testId="transcribe-room-screen">
        <TranscribeRoomTop running={false} fallback={BACK_FALLBACK} actions={<EndedBanner conversationId={endedRoom?.conversationId ?? null} />} />
        <EndedEventNote />
        {list}
      </RoomFrame>
    );
  }

  if (!showRunningRoom && !showReadOnlyRoom) {
    return (
      <RoomFrame testId="transcribe-consent-screen">
        <TranscribeRoomTop running={false} fallback={BACK_FALLBACK} />
        <TranscribeJoinForm
          consentGiven={consentGiven}
          onToggle={() => setConsentGiven((prev) => !prev)}
          urlCode={urlCode}
          joinError={joinError}
          joining={view === 'joining'}
          onJoin={() => void handleJoin()}
        />
      </RoomFrame>
    );
  }

  // The running room.
  return (
    <RoomFrame testId="transcribe-room-screen" claim={<RoomCaptureBarClaimSilent />}>
      <TranscribeRoomTop
        running={showRunningRoom}
        fallback={BACK_FALLBACK}
        actions={<RoomHeaderActions readOnly={showReadOnlyRoom} onStop={() => void handleEndSession()} />}
      />

      {showReadOnlyRoom ? (
        <>
          {/* The read-only person keeps the roster and a way to leave, which ends nothing: their capture never started. */}
          <div className="flex items-center gap-2 mb-2">
            <RoomPeople members={members} speakingIds={speaking} />
          </div>
          <p
            className="text-xs py-2 px-3 rounded-lg font-semibold bg-red-50 text-red-800 border-2 border-red-500 mb-3"
            data-testid="transcribe-mic-error"
            role="status"
          >
            {/* [FOUNDER DECISION: copy] — the page's existing placeholder, unchanged. */}
            Could not access your microphone. You can still read the chat.
          </p>
        </>
      ) : (
        <TranscribeCaptureRow people={<RoomPeople members={members} speakingIds={speaking} />} />
      )}

      {list}
    </RoomFrame>
  );
}
