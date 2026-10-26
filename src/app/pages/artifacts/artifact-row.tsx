/**
 * @file artifact-row.tsx
 * @description P1545 third pass: one row of the Artifacts list, on one line. [dot] title, then the controls
 * (artifact-row-actions.tsx) right-aligned on the same line; the meta line under the title. No icons.
 *
 * The whole row opens the item: the title is the one link, stretched over the row (overlay link), and the controls sit
 * above it, so no interactive element is nested inside another. Hover tints the row on desktop, a press on phones.
 * The title keeps to one line (ellipsis); the meta line may wrap. At most one dot per row, before the title, with the
 * title bold while something is new.
 */
import { Link } from 'react-router-dom';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { ArtifactRowActions } from './artifact-row-actions';
import type { ArtifactRow as Row } from './artifacts-view-model';

interface Props {
  row: Row;
  userSlug: string | null;
  /** The row was opened: the page clears its dot. */
  onOpen: (row: Row) => void;
  onChanged: () => void;
}

export function ArtifactListRow({ row, userSlug, onOpen, onChanged }: Props) {
  const isNew = row.unread || row.hasNew;
  // Bold only while something is new, with the dot before the title (like an unread chat).
  const titleWeight = isNew ? 'font-semibold' : 'font-normal';
  // A sent letter hands the overview who was new, so their marks still show there once.
  const linkState = row.state === 'sent' ? { newDeliveryIds: row.ref.newDeliveryIds ?? [] } : undefined;
  const titleClass = 'block truncate rounded-sm text-base leading-snug text-foreground focus-visible:outline-none';
  return (
    <li
      data-testid="artifact-row"
      data-kind={row.kind}
      data-unread={isNew ? 'true' : undefined}
      // The whole row opens the item: the title's link stretches over it; the controls are raised above (z-10).
      className="relative rounded-lg px-2 py-3 transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <div className="flex items-center gap-2">
        {isNew && (
          <span data-testid="artifact-unread-dot" className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" role="img" aria-label={row.unread ? 'Unread' : 'New'} />
        )}
        <h3 className={`min-w-0 flex-1 ${titleWeight}`}>
          {row.href ? (
            <Link
              to={row.href}
              state={linkState}
              onClick={() => onOpen(row)}
              className={`${titleClass} after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring`}
              title={row.title}
            >
              {row.title}
            </Link>
          ) : (
            <span className={titleClass} title={row.title}>{row.title}</span>
          )}
        </h3>
        <ArtifactRowActions row={row} userSlug={userSlug} onChanged={onChanged} />
      </div>
      {/* The visibility icon opens the meta line. items-start: when the line wraps (320px) the icon stays with its
          FIRST line; mt-[3px] centres the 14px icon on the 20px line. */}
      <div className="mt-0.5 flex items-start gap-1.5 text-sm leading-5 text-muted-foreground">
        {row.visibility && (
          <span className="mt-[3px] flex shrink-0"><InlineVisibilityIcon visibility={row.visibility} /></span>
        )}
        <p data-testid="artifact-meta" className="min-w-0">{row.meta}</p>
      </div>
    </li>
  );
}
