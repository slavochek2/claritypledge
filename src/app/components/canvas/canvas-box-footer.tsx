/**
 * @file canvas-box-footer.tsx
 * @description P1621: the row under a box's cards. Add card sits at the left (only while the box is selected, there is room and no run is going), See all N or Show less at the
 * right (whenever the box holds more than one card). A full box says so at the left instead of showing a dead Add card.
 */
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANVAS_QUIET_ACTION } from './canvas-pill-styles';
import { FULL_BOX_TEXT } from './canvas-new-card-copy';
import { boxAddTestId } from './canvas-box-ids';

export interface BoxToggle {
  /** "See all 3" or "Show less" */
  label: string;
  /** Show less: the box is expanded in place */
  expanded: boolean;
  /** the owner's draft expands in place; everyone else opens the side panel */
  inPlace: boolean;
  onClick: () => void;
}

export function CanvasBoxFooter({ tag, showAdd, onAdd, full, toggle }: {
  tag: string;
  showAdd: boolean;
  onAdd: () => void;
  /** the selected box holds all it can: said here, with no Add card */
  full: boolean;
  toggle: BoxToggle | null;
}) {
  if (!showAdd && !full && !toggle) return null;
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 pt-1.5" data-testid="canvas-box-footer">
      {showAdd ? (
        <Button type="button" variant="ghost" onClick={onAdd} data-testid={boxAddTestId(tag)} className={CANVAS_QUIET_ACTION}>
          <Plus className="h-4 w-4" aria-hidden />Add card
        </Button>
      ) : full ? (
        <p className="py-2 text-sm text-foreground/70" data-testid="canvas-box-full">{FULL_BOX_TEXT}</p>
      ) : <span />}
      {toggle && (
        <Button
          type="button"
          variant="ghost"
          id={toggle.inPlace ? undefined : `canvas-more-${tag.replace(':', '-')}`}
          onClick={toggle.onClick}
          aria-haspopup={toggle.inPlace ? undefined : 'dialog'}
          aria-expanded={toggle.inPlace ? toggle.expanded : undefined}
          data-testid={toggle.expanded ? 'canvas-box-less' : 'canvas-box-more'}
          className={`${CANVAS_QUIET_ACTION} ml-auto`}
        >
          {toggle.label}
        </Button>
      )}
    </div>
  );
}
