/**
 * @file MentionPicker.tsx
 * @description P1520: the @ list above the composer. Pure display: the composer owns the query, the active
 * row and what picking does.
 */
import { cn } from '@/lib/utils';
import { HOVER } from './chat-kit';
import type { MentionEntry } from './mention-picker';

interface Props {
  listId: string;
  options: MentionEntry[];
  active: number;
  onPick: (entry: MentionEntry) => void;
}

export function MentionPicker({ listId, options, active, onPick }: Props) {
  return (
    <div className="absolute inset-x-2 bottom-full z-20 mx-auto max-w-3xl lg:inset-x-3">
      <ul id={listId} role="listbox" aria-label="Mention" className="mb-1 overflow-hidden rounded-xl border bg-background py-1 shadow-lg" data-testid="mention-picker">
        {options.map((o, i) => (
          <li
            key={o.id}
            id={`${listId}-${o.id}`}
            role="option"
            aria-selected={i === active}
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onPick(o)}
            onKeyDown={(e) => e.key === 'Enter' && onPick(o)}
            className={cn('flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5', i === active ? 'bg-accent' : HOVER)}
          >
            {o.mark}
            <span className="min-w-0 truncate text-sm">
              <span className="font-semibold text-foreground">{o.label}</span>
              <span className="text-muted-foreground"> · {o.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
