/**
 * @file canvas-step-view.ts
 * @description P1529 UAT round 2: the pure view of preparation's canvas step (states A..G): title, body and up to two actions per state.
 * `primary` is the step forward, `secondary` a real alternative (drawn like "Skip and proceed"). There is no skip and no change of a shared canvas.
 * All strings are DRAFT copy: [FOUNDER DECISION: copy, proposed] unless marked as the founder's.
 */
import { CANVAS_STEP_SECONDS } from './prep-plan';
import type { ReactNode } from 'react';
import type { MyEventCanvas } from '@/app/data/event-mastermind-service';

export type CanvasStepState = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export interface PublishedCanvas { name: string; label: string }
/** One tappable action. A busy action shows its busy label; `disabled`: some action is in flight, so none is tappable. */
export interface StepAction { id: string; label: string; run: () => void; disabled?: boolean }
export interface StepView { state: CanvasStepState; title: string; body: ReactNode; primary: StepAction | null; secondary: StepAction | null }

/** Builds an action; `busyLabel` null: the action is instant (a navigation or a local toggle). */
export type MakeAction = (id: string, label: string, busyLabel: string | null, run: () => unknown) => StepAction;

export interface StepInput {
  mine: MyEventCanvas | null;
  /** Every published canvas: the ones offered for sharing, and the one that names the shared canvas. */
  published: PublishedCanvas[];
  hasOpenDraft: boolean;
  wide: boolean;
  selected: string | null;
  onContinue?: () => void;
  mk: MakeAction;
  go: { start: () => unknown; continueDraft: () => unknown; share: (name: string) => unknown; shareAgain: (name: string) => unknown };
}

const labelOf = (list: PublishedCanvas[], name: string) => list.find(p => p.name === name)?.label || name;
const done = (state: CanvasStepState, title: string, body: ReactNode, primary: StepAction | null, secondary: StepAction | null): StepView => ({ state, title, body, primary, secondary });

/** Shared (E) or fixed once round 1 started (F): the named canvas and one primary, Done. Changing it from here is not offered. */
function sharedView(i: StepInput, mine: MyEventCanvas): StepView {
  const { mk, onContinue, published } = i;
  // [FOUNDER DECISION: copy, proposed] the label "Done"; the founder named the title and the primary.
  const finish = onContinue ? mk('continue', 'Done', null, onContinue) : null;
  if (mine.fixed) return done('F', 'Your Clarity Canvas is shared', "You're ready. The host can add you to a coming round.", finish, null);
  return done('E', 'Your Clarity Canvas is shared', `“${labelOf(published, mine.name)}” is shared with this event.`, finish, null);
}

/** The way to a canvas other than the published ones: an open draft is reopened (a new one would pile up unfinished canvases); otherwise a new canvas is made. */
function makeAnother(i: StepInput, label: string): StepAction {
  return i.hasOpenDraft ? i.mk('continue-draft', 'Continue your draft', 'Opening…', i.go.continueDraft) : i.mk('make', label, 'Opening…', i.go.start);
}

/** Round 1 has started and the chosen canvas lost its grant: set_event_canvas refuses it now, so the same canvas is shared again through share_canvas. */
function reshareView(i: StepInput, mine: MyEventCanvas): StepView {
  const { mk, go, onContinue, published } = i;
  return done('G', "Your Clarity Canvas isn't shared any more", `Share “${labelOf(published, mine.name)}” again so your peers can read it.`,
    mk('share-again', 'Share again', 'Sharing…', () => go.shareAgain(mine.name)),
    onContinue ? mk('continue', 'Continue', null, onContinue) : null);
}

function startView(i: StepInput): StepView {
  const { mk, go, wide, hasOpenDraft } = i;
  if (hasOpenDraft) {
    // [FOUNDER DECISION: copy, proposed]
    return done('B', 'Finish your Clarity Canvas', "Your draft isn't published yet. Open it and publish it, then share it here.",
      mk('continue-draft', 'Continue your draft', 'Opening…', go.continueDraft), null);
  }
  return done('A', 'Create your Clarity Canvas now', `About ${CANVAS_STEP_SECONDS / 60} minutes with your mirror.${wide ? '' : " It's easier on a desktop."}`,
    mk('create', 'Create your canvas', 'Opening…', go.start), null);
}

function shareView(i: StepInput): StepView {
  const { mk, go, published, selected } = i;
  const only = published.length === 1 ? published[0] : undefined;
  if (only) {
    return done('C', 'Share your Clarity Canvas', `“${only.label}” is ready. Share it with this event's attendees.`,
      mk('share', 'Share with event attendees', 'Sharing…', () => go.share(only.name)), makeAnother(i, 'Make a different one'));
  }
  return done('D', 'Share a Clarity Canvas', 'Pick the one to share with this event.',
    mk('share', 'Share with event attendees', 'Sharing…', () => selected && go.share(selected)), makeAnother(i, 'Make a new one'));
}

export function buildStepView(i: StepInput): StepView {
  const { mine } = i;
  if (mine?.shared) return sharedView(i, mine);
  if (mine && !mine.shared && mine.fixed) return reshareView(i, mine);
  return i.published.length === 0 ? startView(i) : shareView(i);
}
