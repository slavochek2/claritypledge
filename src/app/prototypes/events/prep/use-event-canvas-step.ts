/**
 * @file use-event-canvas-step.ts
 * @description P1529 UAT round 2: the state of preparation's canvas step, lifted out of the card so the page draws the ONE primary in its
 * bottom bar while the live room's card keeps an inline button. Seven states (A..G, see canvas-step-view); sharing stays its own tap (D9:
 * nothing is shared in the background; Publish returning to the step does NOT share). All strings are DRAFT copy.
 * Published canvases come from `listMyCanvasVersions` (only versions with `published_at IS NOT NULL`); an OPEN draft comes from the owner's own
 * `canvas_drafts` rows (`listMyOpenCanvasDrafts`, state 'open', the most worked first): that is what tells B from A, and it is the draft "Continue your draft" reopens.
 * One action in flight at a time: it shows its busy label and no other action is tappable.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { canvasService } from '@/app/data/canvas-service';
import { listMyCanvasVersions } from '@/app/data/canvas-draft-service';
import { listMyOpenCanvasDrafts, type OpenCanvasDraft } from '@/app/data/canvas-open-drafts';
import { getMyEventCanvas, setEventCanvas, type MyEventCanvas } from '@/app/data/event-mastermind-service';
import { CANVAS_WORKSPACE_WIDE_QUERY } from '@/app/components/canvas/canvas-workspace-context';
import { canvasStartErrorText } from '@/app/pages/chat/canvas-start';
import { workspaceHref } from '@/app/pages/chat/canvas-links';
import { useChat } from '@/app/pages/chat/chat-state';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { useStartCanvas } from '@/app/pages/chat/use-start-canvas';
import { isNetworkBlip, NetworkBlipError } from '@/lib/network-blip';
import { buildStepView, type MakeAction, type PublishedCanvas } from './canvas-step-view';

export type { CanvasStepState, PublishedCanvas, StepAction } from './canvas-step-view';

const NETWORK_TEXT = 'Could not reach the server. Check your connection and try again.';
const SHARE_FAILED_TEXT = "Couldn't share your Clarity Canvas. Try again."; // [FOUNDER DECISION: copy, proposed]

const failed = (e: unknown) => toast.error(e instanceof NetworkBlipError || isNetworkBlip(e as Error) ? NETWORK_TEXT : SHARE_FAILED_TEXT);

export function useEventCanvasStep(eventId: string, opts: { returnToPreparation?: boolean; onContinue?: () => void; prepStep?: { step: number; total: number } }) {
  const { returnToPreparation = false, onContinue, prepStep } = opts;
  const [mine, setMine] = useState<MyEventCanvas | null>(null);
  const [published, setPublished] = useState<PublishedCanvas[]>([]);
  const [openDraft, setOpenDraft] = useState<OpenCanvasDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  const { start, dialog } = useStartCanvas({ returnAfterPublish: returnToPreparation, prepStep, eventId });
  const chat = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;
  const slug = chat.authors[chat.userId]?.slug ?? null;

  // A failed read is an error with Retry: it must never look like "no canvas yet".
  const read = useCallback(async () => {
    try {
      const [current, versions, drafts] = await Promise.all([getMyEventCanvas(eventId), listMyCanvasVersions(), listMyOpenCanvasDrafts()]);
      const seen = new Set<string>();
      const list: PublishedCanvas[] = [];
      for (const v of versions) { // newest published version first
        if (seen.has(v.canvasName)) continue;
        seen.add(v.canvasName);
        list.push({ name: v.canvasName, label: v.canvasTitle || v.canvasName });
      }
      setMine(current);
      setPublished(list);
      setOpenDraft(drafts[0] ?? null);
      setReadFailed(false);
    } catch {
      setReadFailed(true);
    }
    setLoaded(true);
  }, [eventId]);
  useEffect(() => { void read(); }, [read]);
  /** Retry shows the skeleton again while the re-read runs (no second tap), and a second failure shows the error again. */
  const retry = useCallback(() => { if (pending) return Promise.resolve(); setLoaded(false); return read(); }, [read, pending]);

  /** Reopens the person's existing open draft (never `start()`, which would make a new canvas): the workspace on it, as use-start-canvas opens one. */
  const continueDraft = useCallback(async () => {
    if (!openDraft) return;
    await chat.refresh().catch(() => null); // the workspace's chat needs the mirror in the list, as use-start-canvas does
    if (!slug) { toast.error(canvasStartErrorText(null)); return; }
    navigate(workspaceHref(slug, openDraft.canvasName, openDraft.versionName), { state: { from: here, ...(returnToPreparation ? { afterPublish: here, ...(prepStep ? { prepStep } : {}) } : {}), afterPublishEvent: eventId } });
  }, [openDraft, slug, chat, navigate, here, returnToPreparation, prepStep, eventId]);

  const share = useCallback(async (name: string) => {
    try {
      const result = await setEventCanvas(eventId, name);
      if (result.status === 'refused') toast.error('Your Clarity Canvas is fixed now that round 1 has started.');
      await read();
    } catch (e) { failed(e); }
  }, [eventId, read]);
  /** Round 1 has started: the same canvas goes back to the event through share_canvas (set_event_canvas refuses once rounds count). */
  const shareAgain = useCallback(async (name: string) => {
    try {
      await canvasService.shareCanvas(name, 'event', eventId);
    } catch (e) { failed(e); } // shareCanvas throws on a refusal: say so, then show what the server now holds
    await read();
  }, [eventId, read]);

  const mk: MakeAction = (id, label, busyLabel, run) => ({
    id,
    label: pending === id && busyLabel ? busyLabel : label,
    run: () => {
      if (pending) return;
      if (busyLabel === null) { void run(); return; } // instant: a navigation or a local toggle has no in-flight state
      setPending(id);
      void Promise.resolve(run()).finally(() => setPending(null));
    },
    disabled: pending !== null,
  });

  const selected = published.find(p => p.name === picked)?.name ?? published[0]?.name ?? null; // newest preselected
  const sharedLabel = mine?.shared ? published.find(p => p.name === mine.name)?.label || mine.name : '';
  const view = !loaded || readFailed ? null : buildStepView({
    mine, published, hasOpenDraft: !!openDraft, wide, selected, onContinue, mk,
    go: { start, continueDraft, share, shareAgain },
  });

  return { loaded, readFailed, retry, busy: pending !== null, view, published, selected, setPicked, sharedLabel, chosen: mine?.shared ? mine : null, dialog };
}
