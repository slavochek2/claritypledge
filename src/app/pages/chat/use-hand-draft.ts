/**
 * @file use-hand-draft.ts
 * @description P1621 round 2: what a pending Clone's first HAND write does to get a draft. It opens the draft from the version being cloned through `startCanvasThread` (the opener the first
 * message and the mirror's menu share; `canvas_draft_open`), then hands the writer the draft's id and revision. The page then moves to the draft through the SAME `openedDraft` the first
 * message uses (`moveTo`), called by the writer once its write has been answered, so the move never races the write. `moveTo` is once per draft. Unsaved text is keyed by the canvas, which the Clone and
 * its draft share, so no buffer moves when the draft appears.
 * "Start over" (the pending Clone replaces another base's open draft): `openCanvasDraftReplacing` discards it and opens the new one in ONE transaction, repeat-safe, with the revision the J4
 * sheet read; a stale or busy answer makes nothing and keeps the text.
 * A draft belongs to the clone that asked for it (canvas, version, replaced draft): the in-flight call and the draft already made are keyed by it, so switching to another version never
 * hands it the first one's draft, and a result that arrives after the switch never moves the page.
 * A double click shares one in-flight call, so one draft is made. A draft that already exists for this pending clone (a first write made it, the page has not moved yet) is reused with its
 * revision read fresh. `open_elsewhere` (the canvas already has an open draft): when that draft was started from this same version it is resumed (a lost
 * answer on the first open); otherwise nothing is made, the writer shows a sentence and keeps the text.
 */
import { useEffect, useMemo, useRef } from 'react';
import { OPEN_ELSEWHERE_TEXT, type EnsureDraft, type HandDraftResult } from '@/app/components/canvas/canvas-hand-draft';
import { CanvasDraftRefusal, getCanvasDraftRevision, listMyCanvasVersions, openCanvasDraftReplacing } from '@/app/data/canvas-draft-service';
import { canvasStartErrorText, startCanvasThread } from './canvas-start';
import { registerCanvasThread } from './canvas-thread-registry';

interface Made { clone: string; version: string; draftId: string; versionName: string | null; moved: boolean }

/** The other base's draft a "Start over" replaces, as the J4 sheet read it. */
export interface HandReplace { id: string; revision: number }

// A refusal of Start over because the draft changed: the sentence the editors already use.
const STALE_TEXT = 'This draft changed while you were editing. Save again to apply your text.';

export function useHandDraft(pending: { version: string; replace?: HandReplace | null } | null, projectTag: string | undefined, onOpened: (versionName: string) => void): EnsureDraft | null {
  const inflight = useRef<{ clone: string; promise: Promise<HandDraftResult> } | null>(null);
  // One entry per clone: a late answer for one never overwrites another's.
  const made = useRef(new Map<string, Made>());
  const opened = useRef(onOpened);
  opened.current = onOpened;
  const version = pending?.version ?? null;
  const replaceId = pending?.replace?.id ?? null;
  const replaceRevision = pending?.replace?.revision ?? 0;
  const clone = version && projectTag ? `${projectTag}|${version}|${replaceId ?? ''}` : null;
  // Whether the page that asked is still on screen: a write that finishes after the owner left the workspace moves nothing.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // The clone the page is on NOW: a result for another one is stale.
  const current = useRef(clone);
  current.current = clone;
  return useMemo<EnsureDraft | null>(() => {
    if (!version || !projectTag || !clone) return null;
    // Once per draft: two writes that finish together navigate once. Without a version name there is nowhere to go, so the draft stays known and the next write reuses it.
    const moveTo = (m: Made) => () => {
      if (m.moved || !alive.current || current.current !== m.clone) return;   // a stale clone, or a page that has gone, never moves it
      m.moved = true;
      if (!m.versionName) return;
      if (made.current.get(m.clone) === m) made.current.delete(m.clone);
      opened.current(m.versionName);
    };
    const make = async (): Promise<HandDraftResult> => {
      try {
        const known = made.current.get(clone);
        if (known) {
          const m = known;
          return { ok: true, draftId: m.draftId, revision: await getCanvasDraftRevision(m.draftId), versionName: m.versionName, moveTo: moveTo(m) };
        }
        const from = (await listMyCanvasVersions()).find(v => v.canvasName === projectTag && v.name === version);
        if (!from) return { ok: false, text: canvasStartErrorText(null) };
        let r;
        if (replaceId) {
          const answer = await openCanvasDraftReplacing(from.id, replaceId, replaceRevision);
          if ('ok' in answer) return { ok: false, text: answer.refused === 'stale_view' ? STALE_TEXT : canvasStartErrorText(new CanvasDraftRefusal('RUN_ACTIVE')) };
          registerCanvasThread(answer.threadRootId);   // the mirror must know this thread before any message or answer reaches it
          r = answer;
        } else {
          r = await startCanvasThread(from.id);
          // A lost answer on the first open leaves the draft made and this clone not knowing it, so the retry meets it as "open elsewhere". The opener only ever finds the OWNER's own
          // draft: when it was started from this very version it is this clone's draft, resumed. Any other open draft keeps the sentence.
          if (r.status === 'open_elsewhere' && !(typeof r.fromSeq === 'number' && r.fromSeq === from.seq)) return { ok: false, text: OPEN_ELSEWHERE_TEXT };
        }
        const m: Made = { clone, version, draftId: r.draftId, versionName: r.versionName, moved: false };
        made.current.set(clone, m);
        return { ok: true, draftId: r.draftId, revision: r.revision, versionName: r.versionName, moveTo: moveTo(m) };
      } catch (e) {
        return { ok: false, text: canvasStartErrorText(e) };
      }
    };
    return () => {
      if (inflight.current?.clone === clone) return inflight.current.promise;
      const promise = make().finally(() => { if (inflight.current?.promise === promise) inflight.current = null; });
      inflight.current = { clone, promise };
      return promise;
    };
  }, [clone, version, projectTag, replaceId, replaceRevision]);
}
