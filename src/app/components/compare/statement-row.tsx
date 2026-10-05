/**
 * @file statement-row.tsx
 * @description P1337: one statement with two people's positions — the compare page's row, and
 * (founder walkthrough 6) the same row inside the event room's table card. Stance columns reuse
 * the letters vocabulary (letter-reveal-ordinal.tsx): blue on both sides, never green/red.
 */
import type { ReactNode } from 'react';
import { ChevronRight, Pin } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { cn } from '@/lib/utils';
import { POSITION_FIRST_PERSON, POSITION_FULL_LABELS, type CompareRow } from '@/lib/compare-positions';

export interface Person {
  name: string;
  photoUrl?: string;
  avatarColor?: string;
  hasPledged: boolean;
}

/** letter-reveal-ordinal.tsx StanceColumn — avatar + name above, blue stance pill as the hero. */
export function StanceColumn({ person, label }: { person: Person; label: string }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
        <GravatarAvatar
          name={person.name}
          photoUrl={person.photoUrl}
          avatarColor={person.avatarColor}
          isPledger={person.hasPledged}
          size="sm"
          className="!w-6 !h-6 !text-[10px]"
        />
        <span className="text-xs text-[#1A1A1A]/50 truncate">{person.name}</span>
      </div>
      <span className="inline-block max-w-full text-base font-semibold text-blue-700 bg-blue-100 rounded-full px-4 py-2 text-center leading-snug">
        {label}
      </span>
    </div>
  );
}

/**
 * One statement with both positions. The card is a link that opens the point in a new tab;
 * `trailing` sits OUTSIDE the anchor, so a control there never triggers the link.
 */
export function StatementRow({
  row,
  me,
  them,
  trailing,
  meInFirstPerson = true,
  compact = false,
}: {
  row: CompareRow;
  me: Person;
  them: Person;
  trailing?: ReactNode;
  /** false for an onlooker (the table's observer): both columns read in the third person. */
  meInFirstPerson?: boolean;
  /** Inside another card (the event room's table card): less nested padding, so at 320px the
   * statement keeps a readable line length (visual QA). */
  compact?: boolean;
}) {
  return (
    <li className="bg-white rounded-xl border border-border">
      <a
        href={`/point/${row.pointId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', compact ? 'p-2.5' : 'p-4')}
      >
        {/* letter-point-card.tsx — the statement, pinned, in its own contained card */}
        <div className={cn('rounded-lg border border-border bg-gray-50', compact ? 'p-3' : 'p-4')}>
          <div className={cn('flex items-start', compact ? 'gap-2' : 'gap-3')}>
            <div className={cn('w-6 h-6 rounded-full bg-blue-100 items-center justify-center flex-shrink-0 text-blue-600 mt-0.5', compact ? 'hidden min-[375px]:flex' : 'flex')}>
              <Pin size={12} className="rotate-45" />
            </div>
            <p className={cn('font-medium text-[#1A1A1A] flex-1 min-w-0 break-words leading-snug', compact ? 'text-base' : 'text-lg')}>
              {row.statement}
            </p>
            <ChevronRight size={18} className="shrink-0 mt-1 text-[#1A1A1A]/30" aria-hidden />
          </div>
        </div>

        <div className={cn('flex items-start', compact ? 'mt-3 gap-2' : 'mt-4 gap-4')}>
          <StanceColumn person={me} label={(meInFirstPerson ? POSITION_FIRST_PERSON : POSITION_FULL_LABELS)[row.mine]} />
          <div className="w-px self-stretch bg-gray-200" />
          <StanceColumn person={them} label={POSITION_FULL_LABELS[row.theirs]} />
        </div>
      </a>
      {trailing && <div className={compact ? 'px-2.5 pb-2.5' : 'px-4 pb-4'}>{trailing}</div>}
    </li>
  );
}
