/**
 * P1631: the owner's own position write on a draft point, the way every point card writes it (P1420): checked in order, an unanswered write is settled by asking the
 * server (never rolled back at once), a newer click owns the display, and a changed server value is taken once no write is pending. Moved out of ClarifyDraftCard unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { OwnerPosition } from '@/app/data/clarify-service';
import { UNRESOLVED_WRITE_MESSAGE, isNetworkWriteFailure } from '@/app/hooks/use-online-write-guard';
import { networkMark } from '@/lib/network-outcome';
import {
  beginPositionWrite, endPositionWrite, isLatestPositionWrite, recordConfirmedPosition, sendPositionWrite, settlePositionWrite,
} from '@/app/data/position-write-outcome';
import type { PositionType } from '@/app/types';

export function useOwnerPosition(userId: string, pointId: string, serverValue: OwnerPosition) {
  const [position, setPosition] = useState<OwnerPosition>(serverValue);
  const saved = useRef<OwnerPosition>(serverValue);
  const pendingWrites = useRef(0);
  // a server value that arrived while a write was pending: applied when the write settles, never lost
  const latestServer = useRef<OwnerPosition>(serverValue);
  const serverMovedDuringWrite = useRef(false);
  const unmounted = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    latestServer.current = serverValue;
    if (pendingWrites.current > 0) {
      serverMovedDuringWrite.current = true;
      return;
    }
    saved.current = serverValue;
    setPosition(serverValue);
  }, [serverValue]);
  const choose = async (picked: PositionType | null) => {
    const next = picked === position ? null : picked;
    const generation = beginPositionWrite(userId, pointId);
    const isLatest = () => isLatestPositionWrite(userId, pointId, generation);
    pendingWrites.current += 1;
    setPosition(next);
    try {
      const sentAt = networkMark();
      try {
        await sendPositionWrite(userId, pointId, next, generation);
        if (isLatest()) saved.current = next; // an older write's late success is not the baseline
      } catch (err) {
        if (!isNetworkWriteFailure(err, sentAt)) {
          if (!isLatest()) return;
          setPosition(saved.current);
          toast.error('Failed to save position.');
          return;
        }
        // sent, never answered: it may have landed. Ask the server. Nothing thrown here may escape the click.
        try {
          const outcome = await settlePositionWrite({ userId, pointId, generation, expected: next, signal: unmounted.current.signal });
          if (outcome.kind === 'superseded') return;
          if (outcome.kind === 'confirmed') {
            saved.current = next;
            recordConfirmedPosition(userId, pointId, generation, next);
            return;
          }
          setPosition(saved.current);
          toast.error(outcome.kind === 'rejected' ? 'Your position was not saved. Try again.' : UNRESOLVED_WRITE_MESSAGE);
        } catch {
          if (!isLatest()) return;
          setPosition(saved.current);
          toast.error(UNRESOLVED_WRITE_MESSAGE);
        }
      }
    } finally {
      pendingWrites.current -= 1;
      endPositionWrite(userId, pointId);
      if (pendingWrites.current === 0 && serverMovedDuringWrite.current) {
        serverMovedDuringWrite.current = false;
        saved.current = latestServer.current;
        setPosition(latestServer.current);
      }
    }
  };
  /** The server's answer is known (an edit cleared the position): show it now, whatever was picked locally. A server value that did not change would never reach the effect above. */
  const reset = (value: OwnerPosition) => {
    saved.current = value;
    latestServer.current = value;
    setPosition(value);
  };
  return { position, choose, reset };
}
