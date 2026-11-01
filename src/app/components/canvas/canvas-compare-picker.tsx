/**
 * @file canvas-compare-picker.tsx
 * @description The canvas page's "Compare positions" pill: who to compare with (R14: no link to the full page).
 */
import { ChevronDown } from 'lucide-react';
import type { Person } from '@/app/components/compare/statement-row';
import type { CanvasPerson } from './canvas-page-data';
import { cn } from '@/lib/utils';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';

/** Who to compare with — the compare page's person picker in small (R14: no link to the full page). */
export function ComparePicker({ base, others, withPerson, onCompare }: {
  base: Person | null;
  others: CanvasPerson[];
  withPerson: CanvasPerson | null;
  onCompare: (id: string | null) => void;
}) {
  // Nobody else to compare with: the pill is absent, not disabled (P955).
  if (!base || others.length === 0) return null;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2" data-testid="canvas-controls">
      <label
        // Founder, sixth round: Compare is a main action but read as a grey filter — a blue
        // outline until someone is picked.
        // W7: this pill IS the canvas page's secondary look (CANVAS_SECONDARY_PILL); once someone is picked it softens.
        className={cn(CANVAS_SECONDARY_PILL, 'relative justify-start pl-3 pr-3 focus-within:ring-2 focus-within:ring-blue-500', withPerson && 'border-blue-300 text-blue-800 hover:bg-blue-50')}
        data-testid="canvas-compare-picker"
      >
        {/* Founder, sixth round: only the arrow opened the menu — the words sat beside it. The
            words are now what shows, and the menu lies invisibly over the whole pill, so any tap
            on it opens the list. */}
        <span aria-hidden className="truncate pr-6">
          {withPerson ? <><span className="text-foreground/70">Comparing with </span>{withPerson.name}</> : 'Compare positions'}
        </span>
        <select
          aria-label="Compare positions with"
          value={withPerson?.id ?? ''}
          onChange={e => onCompare(e.target.value || null)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
        >
          {/* Nobody picked: the list holds only people (the placeholder is hidden from it). */}
          {withPerson ? <option value="">No one</option> : <option value="" disabled hidden>Compare positions</option>}
          {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 opacity-70" />
      </label>
    </div>
  );
}
