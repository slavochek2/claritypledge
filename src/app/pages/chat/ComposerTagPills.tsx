/**
 * @file ComposerTagPills.tsx
 * @description P1621: the boxes and points mentioned in the message, one pill each above the text field. A box pill: the box icon, the title and a remove button (a 40px hit area).
 * Round 2: a point pill reads the box icon, then "Box · point text", the text cut with an ellipsis by CSS and in full in a tooltip (hover, and keyboard focus on the label).
 */
import { X } from 'lucide-react';
import { BoxIcon } from '@/app/components/canvas/canvas-box-icon';
import { CANVAS_CHIP } from '@/app/components/canvas/canvas-pill-styles';
import { CANVAS_BOXES, type CanvasBoxTag } from '@/lib/canvas-boxes';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './chat-kit';
import { keyBox, keyText, tagTitle } from './composer-tags';

/** A pill's tag is the stored text's claim: only a real box gets the box icon (a hand-edited or old value must never crash the composer). */
const isBoxTag = (tag: string): tag is CanvasBoxTag => CANVAS_BOXES.some(b => b.tag === tag);

export function ComposerTagPills({ tags, onRemove }: { tags: string[]; onRemove: (tag: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <ul className="flex flex-wrap items-center gap-1.5 px-2 pt-1" data-testid="composer-tag-pills">
        {tags.map(key => {
          const box = keyBox(key);
          const text = keyText(key);
          const name = text ? `${tagTitle(key)} · ${text}` : tagTitle(key);
          return (
            <li key={key} className={cn(CANVAS_CHIP, 'flex min-w-0 max-w-full items-center gap-1 py-0 pl-1 pr-0')} data-testid="composer-tag-pill">
              {isBoxTag(box) ? <BoxIcon tag={box} className="h-6 w-6" /> : <span className="w-2" aria-hidden />}
              {text ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* A focus stop so the tooltip opens by keyboard too (the full text is otherwise cut). */}
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                    <span tabIndex={0} className={cn('min-w-0 truncate rounded', FOCUS_RING)} data-testid="composer-tag-pill-label">{name}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs break-words">{name}</TooltipContent>
                </Tooltip>
              ) : <span className="min-w-0 truncate" data-testid="composer-tag-pill-label">{name}</span>}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(key)} className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', FOCUS_RING)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
