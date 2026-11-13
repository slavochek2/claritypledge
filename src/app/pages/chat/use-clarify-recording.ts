/**
 * P1631: Clarify on the live recording (the Clarify button on the recording banner). `press()` asks the server for a thread on this person's own read set of the room
 * (a table's round, their own lines, or the whole room in a DM or group: the server decides, once, at the press), then opens the Mirror beside the room's chat exactly as the
 * chat-row Clarify does. `pending` is true while the press is in flight, so the button can be disabled.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { startRecordingClarify, type StartClarifyChatResult } from '@/app/data/clarify-service';
import { RECORDING_NOTHING_YET_TOAST } from '@/app/components/session/capture-copy';
import { CLARIFY_FAILED_TOAST } from './clarify-copy';
import { pressClarify } from './clarify-press';
import { trackClarifyStart } from './clarify-run';
import { chatPath } from './chat-view-model';

export function useClarifyRecording(roomId: string | null, conversationId: string | null): { press: () => void; pending: boolean } {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const press = useCallback(() => {
    if (!roomId || !conversationId || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const startedAt = locationRef.current.pathname;
    void (async () => {
      try {
        const answer: StartClarifyChatResult = await trackClarifyStart(async (threadKnown) => {
          const r = await startRecordingClarify(roomId);
          if (r.status === 'started') threadKnown(r.threadRootId);
          return r;
        });
        if (answer.status === 'empty') {
          toast(RECORDING_NOTHING_YET_TOAST);
          return;
        }
        pressClarify({
          start: () => Promise.resolve(answer),
          navigate, here: () => locationRef.current, alive: () => mounted.current,
          startedAt, openOn: chatPath(conversationId), run: true,
        });
      } catch {
        toast.error(CLARIFY_FAILED_TOAST);
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    })();
  }, [roomId, conversationId, navigate]);
  return { press, pending };
}
