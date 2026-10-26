/**
 * @file artifact-row.tsx
 * @description P1545 WP3: one row of the Artifacts list. Type disc, title, ONE meta line, visibility icon on own
 * items, a dot at the far right while something is new (unread on Received / Shared with me, new activity on Sent),
 * then the action line (artifact-row-actions.tsx). The row body is not a link: only the buttons act. A sent row
 * opens in place (▸) to show each person and their status.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, LayoutDashboard, Mail } from 'lucide-react';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { LetterRecipientsSection } from '@/app/components/letters/letter-recipients-section';
import { ArtifactRowActions } from './artifact-row-actions';
import type { ArtifactRow as Row } from './artifacts-view-model';

/** Letter and canvas carry equal weight: the same pale blue disc, told apart by the icon (solid blue is for actions). */
export function TypeDisc({ kind }: { kind: Row['kind'] }) {
  const Icon = kind === 'canvas' ? LayoutDashboard : Mail;
  const tone = 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200';
  return (
    <span
      data-testid={`artifact-type-${kind}`}
      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}
      aria-hidden="true"
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

interface Props {
  row: Row;
  userSlug: string | null;
  /** A button that opens the item was used (Details, Open): the page clears the row's dot. */
  onOpen: (row: Row) => void;
  onChanged: () => void;
}

export function ArtifactListRow({ row, userSlug, onOpen, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isNew = row.unread || row.hasNew;
  // One weight for read titles in every list; heavier only while something is new (with the dot).
  const titleWeight = isNew ? 'font-semibold' : 'font-normal';
  const people = row.ref.deliveries;
  return (
    <li
      data-testid="artifact-row"
      data-kind={row.kind}
      data-unread={isNew ? 'true' : undefined}
      className="px-1 py-3"
    >
      <div className="flex min-h-[3rem] items-start gap-3">
        {row.state === 'sent' && (
          // Sent rows open in place to show who the letter went to.
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} who it went to: ${row.title}`}
            onClick={() => setExpanded(v => !v)}
            className="-ml-1 flex h-10 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
        <TypeDisc kind={row.kind} />
        <div className="min-w-0 flex-1">
          {/* Not a link: tapping the body does nothing. Only the buttons below act. */}
          <h3 className={`line-clamp-2 break-words text-base leading-snug text-foreground ${titleWeight}`}>{row.title}</h3>
          {/* Visibility opens the meta line, so the title and the line below share one left edge. */}
          {/* items-start: when the line wraps (320px) the icon stays with its FIRST line; mt-[3px] centres the 14px icon on the 20px line. */}
          <div className="mt-0.5 flex items-start gap-1.5 text-sm leading-5 text-muted-foreground">
            {row.visibility && (
              <span className="mt-[3px] flex shrink-0"><InlineVisibilityIcon visibility={row.visibility} /></span>
            )}
            <p data-testid="artifact-meta" className="min-w-0">{row.meta}</p>
          </div>
        </div>
        {/* One place on every row: far right of the text, vertically centred. */}
        {isNew && (
          <span data-testid="artifact-unread-dot" className="h-2.5 w-2.5 shrink-0 self-center rounded-full bg-blue-600" role="img" aria-label={row.unread ? 'Unread' : 'New'} />
        )}
      </div>
      <ArtifactRowActions row={row} userSlug={userSlug} onOpen={onOpen} onChanged={onChanged} />
      {expanded && people && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <LetterRecipientsSection
            letterId={row.ref.letterId ?? ''}
            isPublic={!!row.ref.isPublicLetter}
            deliveries={people}
            newByDelivery={row.ref.newByDelivery ?? {}}
          />
        </div>
      )}
    </li>
  );
}
