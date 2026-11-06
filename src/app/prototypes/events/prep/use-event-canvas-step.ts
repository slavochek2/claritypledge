/**
 * @file use-event-canvas-step.ts
 * @description P1529 UAT round 2: the state of preparation's canvas step, lifted out of the card so the page draws the ONE primary in its
 * bottom bar while the live room's card keeps an inline button. Six states (A..F); sharing stays its own tap (D9: nothing is shared in
 * the background; Publish returning to the step does NOT share). All strings are DRAFT copy.
 * Published canvases come from `listMyCanvasVersions` (list_my_canvas_versions only returns versions with `published_at IS NOT NULL`);
 * `listMyCanvases` also returns draft-only canvases (an open draft), which is what tells B (an open draft) from A.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { canvasService } from '@/app/data/canvas-service';
import { listMyCanvasVersions } from '@/app/data/canvas-draft-service';
import { getMyEventCanvas, setEventCanvas, type MyEventCanvas } from '@/app/data/event-mastermind-service';
import { CANVAS_WORKSPACE_WIDE_QUERY } from '@/app/components/canvas/canvas-workspace-context';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { useStartCanvas } from '@/app/pages/chat/use-start-canvas';
import { isNetworkBlip, NetworkBlipError } from '@/lib/network-blip';

export type CanvasStepState = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export interface PublishedCanvas { name: string; label: string }
export interface StepAction { label: string; run: () => void; busy?: boolean }

export function useEventCanvasStep(eventId: string, opts: { returnToPreparation?: boolean; onContinue?: () => void; onSkip?: () => void }) {
  const { returnToPreparation = false, onContinue, onSkip } = opts;
  const [mine, setMine] = useState<MyEventCanvas | null>(null);
  const [published, setPublished] = useState<PublishedCanvas[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  const { start, dialog } = useStartCanvas(returnToPreparation ? { returnAfterPublish: true } : undefined);

  // A failed read is an error with Retry: it must never look like "no canvas yet".
  const read = useCallback(async () => {
    try {
      const [current, versions, all] = await Promise.all([getMyEventCanvas(eventId), listMyCanvasVersions(), canvasService.listMyCanvases()]);
      const seen = new Set<string>();
      const list: PublishedCanvas[] = [];
      for (const v of versions) { // newest published version first
        if (seen.has(v.canvasName)) continue;
        seen.add(v.canvasName);
        list.push({ name: v.canvasName, label: v.canvasTitle || v.canvasName });
      }
      setMine(current);
      setPublished(list);
      setHasDraft(all.some(c => !seen.has(c.name)));
      setReadFailed(false);
    } catch {
      setReadFailed(true);
    }
    setLoaded(true);
  }, [eventId]);
  useEffect(() => { void read(); }, [read]);

  const share = useCallback(async (name: string) => {
    setBusy(true);
    try {
      const result = await setEventCanvas(eventId, name);
      if (result.status === 'refused') toast.error('Your Clarity Canvas is fixed now that round 1 has started.');
      setChanging(false);
      await read();
    } catch (e) {
      toast.error(e instanceof NetworkBlipError || isNetworkBlip(e as Error) ? 'Could not reach the server. Check your connection and try again.' : 'Only a published Clarity Canvas of yours can be shared with this event.');
    } finally {
      setBusy(false);
    }
  }, [eventId, read]);

  const chosen = mine?.shared ? mine : null;
  const selected = published.find(p => p.name === picked)?.name ?? published[0]?.name ?? null; // newest preselected
  const selectedLabel = published.find(p => p.name === selected)?.label ?? '';
  const sharedLabel = chosen ? published.find(p => p.name === chosen.name)?.label || chosen.name : '';

  const view = useMemo(() => {
    if (!loaded || readFailed) return null;
    const make: StepAction = { label: 'Make a different one', run: () => void start() };
    let state: CanvasStepState;
    let title: string;
    let body: ReactNode;
    let primary: StepAction | null = null;
    let secondary: StepAction | null = null;
    if (chosen && !changing) {
      state = chosen.fixed ? 'F' : 'E';
      // [FOUNDER DECISION: copy, proposed]
      title = 'Your Clarity Canvas is shared';
      // [FOUNDER DECISION: copy, proposed] (F: existing copy)
      body = chosen.fixed ? "You're ready. The host can add you to a coming round." : `“${sharedLabel}” is shared with this event.`;
      if (onContinue) primary = { label: 'Continue', run: onContinue };
      if (!chosen.fixed) secondary = { label: 'Change', run: () => setChanging(true) };
    } else if (published.length === 0) {
      if (hasDraft) {
        state = 'B';
        title = 'Finish your Clarity Canvas'; // [FOUNDER DECISION: copy, proposed]
        body = "Your draft isn't published yet. Publish it to finish this step."; // [FOUNDER DECISION: copy, proposed]
        primary = { label: 'Continue your draft', run: () => void start() }; // [FOUNDER DECISION: copy, proposed]
      } else {
        state = 'A';
        title = 'Create your Clarity Canvas now'; // founder's title
        // [FOUNDER DECISION: copy, proposed]
        body = `About 15 minutes with your mirror.${wide ? '' : " It's easier on a desktop."}`;
        primary = { label: 'Create your canvas', run: () => void start() }; // [FOUNDER DECISION: copy, proposed]
        if (onSkip) secondary = { label: 'Skip for now', run: onSkip }; // [FOUNDER DECISION: copy, proposed]
      }
    } else if (published.length === 1 && published[0]) {
      const only = published[0];
      state = 'C';
      title = 'Share your Clarity Canvas'; // [FOUNDER DECISION: copy, proposed]
      body = `“${only.label}” is ready. Share it with this event's attendees.`; // [FOUNDER DECISION: copy, proposed]
      primary = { label: 'Share with this event', run: () => void share(only.name), busy }; // [FOUNDER DECISION: copy, proposed]
      secondary = make; // [FOUNDER DECISION: copy, proposed]
    } else {
      state = 'D';
      title = 'Share a Clarity Canvas'; // [FOUNDER DECISION: copy, proposed]
      body = 'Pick the one to share with this event.'; // [FOUNDER DECISION: copy, proposed]
      primary = { label: `Share “${selectedLabel}” with this event`, run: () => selected && void share(selected), busy }; // [FOUNDER DECISION: copy, proposed]
      secondary = { label: 'Make a new one', run: () => void start() }; // [FOUNDER DECISION: copy, proposed]
    }
    return { state, title, body, primary, secondary };
  }, [loaded, readFailed, chosen, changing, published, hasDraft, wide, onContinue, onSkip, start, share, busy, selected, selectedLabel, sharedLabel]);

  return { loaded, readFailed, retry: read, view, published, selected, setPicked, sharedLabel, chosen, dialog };
}
