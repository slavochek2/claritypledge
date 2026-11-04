/**
 * @file transcript-ready-watcher.tsx
 * @description P1604 (founder final look): after Stop, when the transcript turns ready and the person is somewhere else in the app, a
 * toast "Transcript ready" with an Open action to the thread. No push, no email. Polls only while a room is being watched, at the
 * same pace as the chat's waiting line. Inside the chat itself the waiting line going away is the signal, so no toast there.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { startVisiblePoll } from '@/lib/visible-poll';
import { getMyRoomStates } from '@/app/data/room-transcription-state';
import { getCaptureRoomState } from '@/app/data/transcribe-capture-status';
import { getMyTranscriptThread } from '@/app/data/transcript-thread';
import { parseChatRoute } from '@/app/pages/chat/chat-route';
import { forgetTranscript, readWatched, TRANSCRIPT_READY_OPEN, TRANSCRIPT_READY_TOAST, WATCH_POLL_MS } from './transcript-watch';

export function TranscriptReadyWatcher() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const here = parseChatRoute(pathname).conversationId;

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const check = async () => {
      const watched = readWatched(userId);
      if (watched.length === 0) return;
      const states = await getMyRoomStates(watched.map((w) => w.roomId));
      for (const { roomId } of watched) {
        const state = states.get(roomId)?.state;
        // no answer (a failed read, or not yet): the watch stays; processing: still waiting
        if (cancelled || !state || state === 'processing') continue;
        if (state === 'none') {
          // none is also what a room that is still LIVE reads (A stopped, B continues): keep waiting while it is open
          const room = await getCaptureRoomState(roomId, userId).catch(() => null);
          if (!room || !room.ended) continue;
        }
        forgetTranscript(roomId, userId);   // told once, whatever the outcome
        if (state !== 'ready') continue;    // failed: the chat says so; none: an ended room with nothing to read
        const thread = await getMyTranscriptThread(roomId);
        if (cancelled || (thread && thread.conversationId === here)) continue;
        const target = thread ? `/chats/c/${thread.conversationId}/t/${thread.rootMessageId}` : '/sessions';
        toast(TRANSCRIPT_READY_TOAST, { action: { label: TRANSCRIPT_READY_OPEN, onClick: () => navigate(target) } });
      }
    };
    const stop = startVisiblePoll(() => void check(), WATCH_POLL_MS);
    return () => { cancelled = true; stop(); };
  }, [userId, here, navigate]);

  return null;
}
