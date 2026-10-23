/**
 * @file artifact-row.tsx
 * @description P1545 WP3: one row of the Artifacts list. Type disc, title (the row's link), ONE meta
 * line, visibility icon on own items, unread dot on Shared with you only, "…" menu at the top right.
 * Nothing else is drawn: no recipients, no counts, no fixed button (a tap opens the item).
 */
import { Link } from 'react-router-dom';
import { LayoutDashboard, Mail } from 'lucide-react';
import { InlineVisibilityIcon } from '@/app/components/shared/visibility-badge';
import { ArtifactRowMenu } from './artifact-row-menu';
import type { ArtifactRow as Row } from './artifacts-view-model';

/** A letter is a filled blue disc with an envelope; a canvas is the canvas page's pale blue disc with a grid. */
export function TypeDisc({ kind }: { kind: Row['kind'] }) {
  const Icon = kind === 'canvas' ? LayoutDashboard : Mail;
  const tone = kind === 'canvas' ? 'bg-blue-100 text-blue-600 ring-1 ring-inset ring-blue-300' : 'bg-blue-600 text-white';
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
  onOpen: (row: Row) => void;
  onChanged: () => void;
}

const TITLE_CLASS =
  'line-clamp-2 break-words rounded-sm text-base leading-snug text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ArtifactListRow({ row, userSlug, onOpen, onChanged }: Props) {
  const titleWeight = row.unread ? 'font-semibold' : 'font-medium';
  return (
    <li
      data-testid="artifact-row"
      data-kind={row.kind}
      data-unread={row.unread ? 'true' : undefined}
      className="relative flex min-h-[4.5rem] items-start gap-3 px-1 py-3 transition-colors hover:bg-accent/50"
    >
      <TypeDisc kind={row.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {row.visibility && (
            <span className="mt-1 shrink-0">
              <InlineVisibilityIcon visibility={row.visibility} />
            </span>
          )}
          <h3 className="min-w-0 flex-1">
            {row.href ? (
              // The link stretches over the whole row; the "…" sits above it (z-10), so it never opens the item.
              <Link
                to={row.href}
                onClick={() => onOpen(row)}
                className={`${TITLE_CLASS} ${titleWeight} after:absolute after:inset-0 after:content-['']`}
              >
                {row.title}
              </Link>
            ) : (
              <span className={`${TITLE_CLASS} ${titleWeight}`}>{row.title}</span>
            )}
          </h3>
          {row.unread && (
            <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" role="img" aria-label="Unread" />
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground" data-testid="artifact-meta">
          {row.meta}
        </p>
      </div>
      <ArtifactRowMenu row={row} userSlug={userSlug} onChanged={onChanged} />
    </li>
  );
}
