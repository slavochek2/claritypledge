/**
 * @file canvas-step-view.ts
 * @description P1529 UAT round 2: the pure view of preparation's canvas step (states A..G): title, body and up to three actions per state.
 * `primary` is the step forward, `secondary` a real alternative (outline), `quiet` a way out (Skip for now, Keep ...).
 * All strings are DRAFT copy: [FOUNDER DECISION: copy, proposed] unless marked as the founder's.
 */
import type { ReactNode } from 'react';
import type { MyEventCanvas } from '@/app/data/event-mastermind-service';

export type CanvasStepState = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export interface PublishedCanvas { name: string; label: string }
/** One tappable action. A busy action shows its busy label; `disabled`: some action is in flight, so none is tappable. */
export interface StepAction { id: string; label: string; run: () => void; disabled?: boolean; quiet?: boolean }
export interface StepView { state: CanvasStepState; title: string; body: ReactNode; primary: StepAction | null; secondary: StepAction | null; quiet: StepAction | null }

/** Builds an action; `busyLabel` null: the action is instant (a navigation or a local toggle). */
export type MakeAction = (id: string, label: string, busyLabel: string | null, run: () => unknown, quiet?: boolean) => StepAction;

export interface StepInput {
  mine: MyEventCanvas | null;
  /** The canvases offered for sharing: all published ones, or the others while changing. */
  candidates: PublishedCanvas[];
  /** Every published canvas (names the shared one). */
  published: PublishedCanvas[];
  hasOpenDraft: boolean;
  changing: boolean;
  wide: boolean;
  selected: string | null;
  onContinue?: () => void;
  onSkip?: () => void;
  mk: MakeAction;
  go: { start: () => unknown; continueDraft: () => unknown; share: (name: string) => unknown; shareAgain: (name: string) => unknown; change: () => void; keep: () => void };
}

const labelOf = (list: PublishedCanvas[], name: string) => list.find(p => p.name === name)?.label || name;
const done = (state: CanvasStepState, title: string, body: ReactNode, primary: StepAction | null, secondary: StepAction | null, quiet: StepAction | null = null): StepView => ({ state, title, body, primary, secondary, quiet });

function sharedView(i: StepInput, mine: MyEventCanvas): StepView {
  const { mk, go, onContinue, published } = i;
  const cont = onContinue ? mk('continue', 'Continue', null, onContinue) : null;
  if (mine.fixed) return done('F', 'Your Clarity Canvas is shared', "You're ready. The host can add you to a coming round.", cont, null);
  // One published canvas (the shared one): there is no other to choose, so Change is replaced by what it would lead to.
  const alternative = i.candidates.some(c => c.name !== mine.name) ? mk('change', 'Change', null, go.change) : makeAnother(i, 'Make a different one');
  return done('E', 'Your Clarity Canvas is shared', `“${labelOf(published, mine.name)}” is shared with this event.`, cont, alternative);
}

/** The way to a canvas other than the published ones: an open draft is reopened (a new one would pile up unfinished canvases); otherwise a new canvas is made. */
function makeAnother(i: StepInput, label: string): StepAction {
  return i.hasOpenDraft ? i.mk('continue-draft', 'Continue your draft', 'Opening…', i.go.continueDraft) : i.mk('make', label, 'Opening…', i.go.start);
}

/** Round 1 has started and the chosen canvas lost its grant: set_event_canvas refuses it now, so the same canvas is shared again through share_canvas. */
function reshareView(i: StepInput, mine: MyEventCanvas): StepView {
  const { mk, go, onContinue, published } = i;
  return done('G', "Your Clarity Canvas isn't shared any more", `Share “${labelOf(published, mine.name)}” again so your partners can read it.`,
    mk('share-again', 'Share again', 'Sharing…', () => go.shareAgain(mine.name)),
    onContinue ? mk('continue', 'Continue', null, onContinue) : null);
}

function startView(i: StepInput): StepView {
  const { mk, go, onSkip, wide, hasOpenDraft } = i;
  const skip = onSkip ? mk('skip', 'Skip for now', null, onSkip, true) : null;
  if (hasOpenDraft) {
    // [FOUNDER DECISION: copy, proposed]
    return done('B', 'Finish your Clarity Canvas', "Your draft isn't published yet. Open it and publish it to finish this step.",
      mk('continue-draft', 'Continue your draft', 'Opening…', go.continueDraft), null, skip);
  }
  return done('A', 'Create your Clarity Canvas now', `About 15 minutes with your mirror.${wide ? '' : " It's easier on a desktop."}`,
    mk('create', 'Create your canvas', 'Opening…', go.start), null, skip);
}

function shareView(i: StepInput): StepView {
  const { mk, go, candidates, changing, selected } = i;
  const keep = changing ? mk('keep', `Keep “${labelOf(i.published, i.mine?.name ?? '')}”`, null, go.keep, true) : null;
  const only = candidates.length === 1 ? candidates[0] : undefined;
  if (only) {
    // [FOUNDER DECISION: copy, proposed] changing from a shared canvas: the title and body say what replaces what.
    const [title, body] = changing && i.mine
      ? ['Share a different canvas', `“${only.label}” will replace “${labelOf(i.published, i.mine.name)}” for this event.`]
      : ['Share your Clarity Canvas', `“${only.label}” is ready. Share it with this event's attendees.`];
    return done('C', title, body,
      mk('share', 'Share with this event', 'Sharing…', () => go.share(only.name)), makeAnother(i, 'Make a different one'), keep);
  }
  // [FOUNDER DECISION: copy, proposed] changing from a shared canvas: the same replacement framing as one alternative.
  const [dTitle, dBody] = changing && i.mine
    ? ['Share a different canvas', `Pick the one to replace “${labelOf(i.published, i.mine.name)}” for this event.`]
    : ['Share a Clarity Canvas', 'Pick the one to share with this event.'];
  return done('D', dTitle, dBody,
    mk('share', 'Share with this event', 'Sharing…', () => selected && go.share(selected)), makeAnother(i, 'Make a new one'), keep);
}

export function buildStepView(i: StepInput): StepView {
  const { mine, changing } = i;
  if (mine?.shared && !changing) return sharedView(i, mine);
  if (mine && !mine.shared && mine.fixed) return reshareView(i, mine);
  return i.candidates.length === 0 ? startView(i) : shareView(i);
}
