/**
 * @file canvas-card-actions.tsx
 * @description P1621: the action row at the bottom of a card on the owner's open draft (and on a pending Clone, round 2): Edit, Open, Mention in chat, Remove, quiet grey with a hover, at
 * least 40px, wrapping at narrow widths. It exists only while the card's box is selected (the card shows its words first and its actions when asked). Edit and Remove are absent while
 * the agent is working; Open is always there; Mention in chat is per point and exists only where the workspace carries the mention (the owner's).
 */
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pointKey } from '@/app/pages/chat/composer-tags';
import { stripHashtags } from '@/lib/utils';
import type { PointWithUserPosition } from '@/app/types';
import { MentionInChatButton } from './canvas-mention-in-chat';
import { CANVAS_QUIET_ACTION } from './canvas-pill-styles';
import { cardEditTestId, cardRemoveTestId } from './canvas-point-edit-store';

export function CanvasCardActions({ point, tag, canEdit, onEdit, onOpen, onRemove }: {
  point: PointWithUserPosition;
  /** the box the card sits in: what a mention of the point names */
  tag: string;
  canEdit: boolean;
  onEdit: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const words = stripHashtags(point.statement, point.tags);
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1 border-t px-1" data-box-control data-testid={`canvas-card-actions-${point.id}`}>
      {canEdit && (
        <Button type="button" variant="ghost" onClick={onEdit} aria-label={`Edit: ${words}`} data-testid={cardEditTestId(point.id)} className={CANVAS_QUIET_ACTION}>
          <Pencil className="h-4 w-4" aria-hidden />Edit
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onOpen} aria-label={`Open: ${words}`} data-testid={`canvas-card-open-${point.id}`} className={CANVAS_QUIET_ACTION}>
        Open<ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
      <MentionInChatButton card tag={pointKey(tag, words)} title={words} testId={`canvas-card-mention-${point.id}`} />
      {canEdit && (
        <Button type="button" variant="ghost" onClick={onRemove} aria-label={`Remove: ${words}`} data-testid={cardRemoveTestId(point.id)} className={CANVAS_QUIET_ACTION}>
          <Trash2 className="h-4 w-4" aria-hidden />Remove
        </Button>
      )}
    </div>
  );
}
