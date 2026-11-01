/**
 * @file use-held-send.ts
 * @description P1536 W0: a Send made while the thread's answer is not known yet WAITS, then goes the way the answer says; it is never refused for being early.
 * The answer is a route: the draft takes it (the draft's own send), the thread turned out to be plain (the chat's own send), the read failed or found
 * no draft (said once, the composer keeps the text), or not known yet (wait). Waiting Sends keep their order. A backstop ends a wait that never
 * resolves the way a failed read does, and leaving the thread ends it silently.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import { DRAFT_ERROR_TEXT } from './canvas-thread-copy';
import type { CanvasThreadStatus } from './use-canvas-thread';

/** The longest a Send waits for its thread's answer before it is treated as a failed read. */
export const HELD_SEND_MAX_MS = 20_000;

export type SendRoute =
  | { kind: 'wait' }
  | { kind: 'draft'; send: (body: string) => Promise<boolean> }
  | { kind: 'plain' }
  | { kind: 'failed' };

/** Whether a canvas thread's Send cannot be the chat's own yet: drafting not known to be off, and the draft not known to be closed. */
function canvasUndecided(canvasRoot: boolean, canvasOn: boolean | null, canvas: { draft: CanvasDraft } | null): boolean {
  return canvasRoot && canvasOn !== false && !(canvas && canvas.draft.state !== 'open');
}

/**
 * Where a Send goes, from what the panel knows. `rootPending`: the thread's root has not loaded, so it could be a canvas thread or a plain one.
 * A canvas thread whose read failed or found no draft is `failed`; one still reading, or whose drafting availability is not confirmed, `wait`s.
 */
export function sendRouteOf(a: {
  onSend: ((body: string) => Promise<boolean>) | null; rootPending: boolean; canvasRoot: boolean; canvasOn: boolean | null;
  canvas: { draft: CanvasDraft } | null; readStatus: CanvasThreadStatus;
}): SendRoute {
  if (a.onSend) return { kind: 'draft', send: a.onSend };
  const undecided = canvasUndecided(a.canvasRoot, a.canvasOn, a.canvas);
  if (undecided && a.canvasOn === true && (a.readStatus === 'error' || a.readStatus === 'none')) return { kind: 'failed' };
  return a.rootPending || undecided ? { kind: 'wait' } : { kind: 'plain' };
}

/** The thread's Send for the panel: the draft's own when it takes one, null (the chat's own send) for a plain thread, else the waiting one. */
export function sendOfRoute(route: SendRoute, hold: (body: string) => Promise<boolean>, pending: boolean): ((body: string) => Promise<boolean>) | null {
  if (pending) return hold;
  if (route.kind === 'draft') return route.send;
  return route.kind === 'plain' ? null : hold;
}

interface Held {
  body: string;
  settle: (ok: boolean) => void;
}

/**
 * `hold(body)` is the Send of a thread whose route is not `plain`/`draft` yet (or `failed`): it resolves with what the Composer needs (false
 * gives the text back). `pending` is true while a Send waits. `sendPlain` is the chat's own send, used when the thread turns out to be plain.
 */
export function useHeldSend(route: SendRoute, sendPlain: (body: string) => unknown): { hold: (body: string) => Promise<boolean>; pending: boolean } {
  const queue = useRef<Held[]>([]);
  const routeNow = useRef(route);
  routeNow.current = route;
  const plainNow = useRef(sendPlain);
  plainNow.current = sendPlain;
  const draining = useRef(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const stopTimer = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const failAll = (say: boolean) => {
    const failed = queue.current.splice(0);
    stopTimer();
    if (say && failed.length > 0) toast.error(DRAFT_ERROR_TEXT.FAILED);
    failed.forEach((h) => h.settle(false));
    if (alive.current) setPending(false);
  };
  /** The backstop for the Sends still queued; one at a time. */
  const armTimer = () => {
    timer.current ??= setTimeout(() => failAll(true), HELD_SEND_MAX_MS);
  };
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length > 0 && alive.current) {
        const r = routeNow.current;
        if (r.kind === 'wait') return armTimer(); // the answer went away again with Sends still queued: the backstop must still end them
        stopTimer();
        if (r.kind === 'failed') return failAll(true);
        const item = queue.current.shift() as Held;
        if (r.kind === 'plain') {
          plainNow.current(item.body);
          item.settle(true);
        } else item.settle(await r.send(item.body).catch(() => false));
      }
      if (queue.current.length === 0) {
        stopTimer();
        if (alive.current) setPending(false);
      }
    } finally {
      draining.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- failAll/stopTimer/armTimer only touch refs and the setter
  }, []);

  // The answer arrived (or changed): send what waited.
  const routeKey = route.kind === 'draft' ? route.send : route.kind;
  useEffect(() => {
    if (queue.current.length > 0) void drain();
  }, [routeKey, drain]);
  // Gone: what waited ends without a word.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      failAll(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only touches refs
  }, []);

  const hold = useCallback((body: string): Promise<boolean> => new Promise<boolean>((settle) => {
    queue.current.push({ body, settle });
    setPending(true);
    armTimer();
    void drain();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- failAll/armTimer only touches refs and the setter
  }), [drain]);
  return { hold, pending };
}
