/**
 * @file canvas-card-actions.tsx
 * @description P1621: the action row at the bottom of a card on the owner's open draft: Edit, then Open, both with icons, quiet grey with a hover, at least 40px. It exists only while the
 * card's box is selected (the card shows its words first and its actions when asked). Edit is absent while the agent is working; Open is always there.
 */
import { ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stripHashtags } from '@/lib/utils';
import type { PointWithUserPosition } from '@/app/types';
import { CANVAS_QUIET_ACTION } from './canvas-pill-styles';
import { cardEditTestId } from './canvas-point-edit-store';

export function CanvasCardActions({ point, canEdit, onEdit, onOpen }: {
  point: PointWithUserPosition;
  canEdit: boolean;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const words = stripHashtags(point.statement, point.tags);
  return (
    <div className="flex items-center justify-end gap-1 border-t px-1" data-box-control data-testid={`canvas-card-actions-${point.id}`}>
      {canEdit && (
        <Button type="button" variant="ghost" onClick={onEdit} aria-label={`Edit: ${words}`} data-testid={cardEditTestId(point.id)} className={CANVAS_QUIET_ACTION}>
          <Pencil className="h-4 w-4" aria-hidden />Edit
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onOpen} aria-label={`Open: ${words}`} data-testid={`canvas-card-open-${point.id}`} className={CANVAS_QUIET_ACTION}>
        Open<ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
