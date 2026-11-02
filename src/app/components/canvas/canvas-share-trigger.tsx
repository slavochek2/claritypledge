/**
 * @file canvas-share-trigger.tsx
 * @description The Share button of canvas-share-control: its look, its lock or globe, its word and the access state read aloud. 3c X4: in the owner's bar Share IS the main
 * action of a published version (filled, design-system rule 9); everywhere else (the reader-less header fallback, a list row) it stays the secondary pill. It keeps its word at
 * every width (B4). Opens the panel itself only where the panel is a sheet; on desktop the popover trigger does.
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Globe, Lock } from 'lucide-react';
import { CANVAS_MAIN_ACTION, CANVAS_SECONDARY_PILL } from './canvas-pill-styles';
import { hiddenTriggerClass, hiddenTriggerProps } from './canvas-share-helpers';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  hideTrigger?: boolean;
  stateId: string;
  access: 'link' | string;
  /** who can open the canvas right now, for assistive technology */
  stateLabel: string;
  main?: boolean;
};

/** A popover or dialog trigger hands its props and ref to this element (asChild), so both pass through to the button. */
export const ShareTrigger = forwardRef<HTMLButtonElement, Props>(function ShareTrigger({ hideTrigger, stateId, access, stateLabel, main = false, ...rest }, ref) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      {...rest}
      {...hiddenTriggerProps(hideTrigger)}
      ref={ref}
      data-testid="canvas-share-control"
      aria-label="Share"
      aria-describedby={stateId}
      title="Share"
      className={`${hiddenTriggerClass(hideTrigger)}${main ? CANVAS_MAIN_ACTION : CANVAS_SECONDARY_PILL}`}
    >
      {/* Open to anyone with the link: a globe, never a lock (a lock says "restricted"). */}
      {access === 'link'
        ? <Globe aria-hidden className="h-4 w-4 shrink-0" data-testid="canvas-share-open-icon" />
        : <Lock aria-hidden className="h-4 w-4 shrink-0" data-testid="canvas-share-lock-icon" />}
      <span>Share</span>
      {/* The state, for assistive technology: who can open the canvas right now. */}
      <span id={stateId} className="sr-only" data-testid="canvas-share-label">{stateLabel}</span>
    </button>
  );
});
