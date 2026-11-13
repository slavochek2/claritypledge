/**
 * P1631: what pressing Clarify does once the server has answered, shared by Clarify on a message, Clarify on a chat-list row and New point:
 * the Mirror opens beside the chat on the new thread (a push, so the phone's Back closes it), the open thread rereads its drafts, and the first
 * draft's run starts (not for New point, which waits for the owner's own words).
 */
import type { Location, NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import type { StartClarifyChatResult } from '@/app/data/clarify-service';
import { CLARIFY_BUSY_TOAST, CLARIFY_FAILED_TOAST, CLARIFY_NOTHING_YET_TOAST } from './clarify-copy';
import { runClarifyDraft, touchClarifyThread, trackClarifyStart } from './clarify-run';
import { clarifyPanelPushed, clarifyPushState, withClarifyPanel } from './clarify-panel';

export interface ClarifyPress {
  /** The server call; `threadKnown` registers the new root the moment it is named. */
  start: (threadKnown: (rootId: string) => void) => Promise<StartClarifyChatResult>;
  navigate: NavigateFunction;
  /** The current location, read when the answer arrives. */
  here: () => Location;
  /** False once the pane that pressed has unmounted. */
  alive: () => boolean;
  /** The address the press started on: if the person moved elsewhere meanwhile, nothing navigates (the draft run goes on). */
  startedAt: string;
  /** The chat the Mirror opens beside. */
  openOn: string;
  /** False for New point: no run starts. */
  run: boolean;
}

export function pressClarify(p: ClarifyPress): void {
  void trackClarifyStart(async (threadKnown) => {
    const r = await p.start(threadKnown);
    if (r.status === 'started') threadKnown(r.threadRootId);
    return r;
  }).then(
    (r) => {
      if (r.status === 'empty') {
        toast(CLARIFY_NOTHING_YET_TOAST);
        return;
      }
      if (r.status === 'busy') {
        toast(CLARIFY_BUSY_TOAST);
        return;
      }
      if (r.status !== 'started') return;
      const here = p.here();
      if (p.alive() && here.pathname === p.startedAt) {
        const already = clarifyPanelPushed(here.state);
        p.navigate(
          { pathname: p.openOn, search: withClarifyPanel(p.openOn === here.pathname ? here.search : '', r.threadRootId) },
          already ? { replace: true, state: here.state } : { state: clarifyPushState(here.state) },
        );
      }
      touchClarifyThread(r.threadRootId);
      if (p.run && r.draftId) void runClarifyDraft(r.draftId);
    },
    () => toast.error(CLARIFY_FAILED_TOAST),
  );
}
