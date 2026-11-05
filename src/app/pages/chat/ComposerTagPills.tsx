/**
 * @file ComposerTagPills.tsx
 * @description P1621: the boxes mentioned in the message, one pill each above the text field: the box title and a remove button (a 40px hit area).
 */
import { X } from 'lucide-react';
import { CANVAS_CHIP } from '@/app/components/canvas/canvas-pill-styles';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './chat-kit';
import { tagTitle } from './composer-tags';

export function ComposerTagPills({ tags, onRemove }: { tags: string[]; onRemove: (tag: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5 px-2 pt-1" data-testid="composer-tag-pills">
      {tags.map(tag => (
        <li key={tag} className={cn(CANVAS_CHIP, 'flex items-center gap-0.5 py-0 pl-2.5 pr-0')} data-testid="composer-tag-pill">
          <span className="min-w-0 truncate">{tagTitle(tag)}</span>
          <button type="button" aria-label={`Remove ${tagTitle(tag)}`} onClick={() => onRemove(tag)} className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', FOCUS_RING)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
