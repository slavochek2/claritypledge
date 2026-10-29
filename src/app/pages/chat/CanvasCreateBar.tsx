/**
 * @file CanvasCreateBar.tsx
 * @description P1536: the one action at the bottom of the tray, and it drafts straight away. "Create canvas" for a first
 * canvas, "Create new version" for a draft with a base version, "Update draft" for a finished draft that got more material.
 * It is the one filled primary, except while the composer has text (Send is the primary then). Rendered only once the draft
 * has something to work from, and never disabled (P955).
 */
import { Button } from '@/components/ui/button';
import { CREATE_LABEL, CREATE_VERSION_LABEL, UPDATE_DRAFT_LABEL } from './canvas-thread-copy';

interface Props {
  hasBase: boolean;
  /** A finished draft is being revised: the button reads Update draft. */
  revising?: boolean;
  /** The composer has text: Send is the one primary, so this steps back to an outline. */
  composing?: boolean;
  onRun: () => void;
}

export function CanvasCreateBar({ hasBase, revising = false, composing = false, onRun }: Props) {
  const label = revising ? UPDATE_DRAFT_LABEL : hasBase ? CREATE_VERSION_LABEL : CREATE_LABEL;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant={composing ? 'outline' : 'default'} className="min-h-11" onClick={() => onRun()}>
        {label}
      </Button>
    </div>
  );
}
