/**
 * @file CanvasCreateBar.tsx
 * @description P1536: the one action at the bottom of the tray, and it drafts straight away. "Create canvas" for a first
 * canvas, "Create new version" for a draft with a base version, "Update draft" for a finished draft that got more material.
 * Its look follows its meaning, never the composer: Create is the filled action, Update draft (Publish is on screen then) an
 * outline. Rendered only once the draft has something to work from, and never disabled (P955).
 */
import { Button } from '@/components/ui/button';
import { CREATE_LABEL, CREATE_VERSION_LABEL, UPDATE_DRAFT_LABEL } from './canvas-thread-copy';

interface Props {
  hasBase: boolean;
  /** A finished draft is being revised: the button reads Update draft. */
  revising?: boolean;
  onRun: () => void;
}

export function CanvasCreateBar({ hasBase, revising = false, onRun }: Props) {
  const label = revising ? UPDATE_DRAFT_LABEL : hasBase ? CREATE_VERSION_LABEL : CREATE_LABEL;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant={revising ? 'outline' : 'default'} className="min-h-11" onClick={() => onRun()}>
        {label}
      </Button>
    </div>
  );
}
