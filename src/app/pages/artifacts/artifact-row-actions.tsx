/**
 * @file artifact-row-actions.tsx
 * @description P1545 second pass: the action line of one Artifacts row, and the dialogs its actions open.
 *
 * Left to right: "…", then the secondary button, then the primary, which sits far right. The row body is not a link:
 * only these buttons act. Primary is a small blue OUTLINE button (never filled in a list); secondary is the cards'
 * outlined Details style. Every row of a kind lists the same "…" items; one not possible right now is shown disabled
 * with its reason as a second line (phones have no hover).
 *
 *   draft            … Delete draft · Edit · Prepare letter
 *   sent, private    … Preview, Delete letter · Details · Add recipient
 *   sent, public     … Preview, Delete letter · Details · Copy link
 *   received         Open (Results once done)
 *   own canvas       … Share, Copy link · Open
 *   shared canvas    Open
 *
 * Handlers and guards are the ones the old row menu had (docs-service deleteDoc, letters-service deleteLetter, the
 * P1515 share panel anchored to the "…" button); Add recipient opens the overview's own dialog.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { CanvasShareControl } from '@/app/components/canvas/canvas-share-control';
import { LetterReceiverModal } from '@/app/components/letters/letter-receiver-modal';
import { CARD_FOCUS_RING, DETAILS_BUTTON_CLASS } from '@/app/components/shared/card-action-classes';
import { docsService } from '@/app/data/docs-service';
import { deleteLetter } from '@/app/data/letters-service';
import { canvasPath, canvasTitle } from '@/lib/canvas-boxes';
import type { ArtifactRow } from './artifacts-view-model';

/** The primary: a small blue outline button, 40px tall. */
const PRIMARY_CLASS =
  `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-blue-600 bg-background px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-50 ${CARD_FOCUS_RING}`;
const SECONDARY_CLASS = `${DETAILS_BUTTON_CLASS} disabled:pointer-events-none disabled:opacity-50`;
const ICON_CLASS =
  `flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${CARD_FOCUS_RING}`;

interface MenuItem {
  id: string;
  label: string;
  /** Shown under the label and the item is disabled. */
  disabledReason?: string;
  danger?: boolean;
  run: () => void;
}

interface Props {
  row: ArtifactRow;
  userSlug: string | null;
  /** A button that opens the item was used (Details, Open): the page clears the row's dot. */
  onOpen: (row: ArtifactRow) => void;
  /** Called after anything that changes the list (delete, add recipient, share change). */
  onChanged: () => void;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied to clipboard');
  } catch {
    toast.error('Failed to copy link');
  }
}

export function ArtifactRowActions({ row, userSlug, onOpen, onChanged }: Props) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'draft' | 'letter' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shareSignal, setShareSignal] = useState(0);
  // Share opens AFTER the menu has closed: the menu hands focus back to its button as it closes, and that
  // focus move would dismiss the share popover if the popover were already open.
  const shareAfterClose = useRef(false);

  const name = (label: string) => `${label}: ${row.title}`;
  const { ref } = row;

  const handleDeleteDraft = async () => {
    if (!ref.docId) return;
    setDeleting(true);
    try {
      await docsService.deleteDoc(ref.docId);
      toast.success('Draft deleted');
      setConfirm(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error && err.message === 'SEALED_LETTERS_EXIST'
        ? "Can't delete — letters were sent from this draft."
        : "Couldn't delete draft.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteLetter = async () => {
    if (!ref.letterId) return;
    setDeleting(true);
    try {
      await deleteLetter(ref.letterId);
      toast.success('Letter deleted.');
      setConfirm(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error && err.message === 'DELIVERIES_EXIST'
        ? "Can't delete — letter has been shared."
        : "Couldn't delete letter.");
    } finally {
      setDeleting(false);
    }
  };

  const openLink = (label: string, className: string, state?: unknown) =>
    row.href ? (
      <Link to={row.href} state={state} aria-label={name(label)} className={className} onClick={() => onOpen(row)}>
        {label}
      </Link>
    ) : (
      <button type="button" disabled aria-label={name(label)} className={className}>{label}</button>
    );

  const canvasName = ref.canvasName;
  const canvasLink = canvasName && userSlug ? `${window.location.origin}${canvasPath(userSlug, canvasName)}` : null;
  const canvasShared = !!ref.hasAudience || ref.generalAccess === 'link';
  const publicLetterLink = ref.letterId ? `${window.location.origin}/letter/${ref.letterId}` : null;

  let menu: MenuItem[] = [];
  let secondary: ReactNode = null;
  let primary: ReactNode = null;
  /** Why the primary is disabled, shown under the line. */
  let primaryReason: string | undefined;

  switch (row.state) {
    case 'draft': {
      const noStories = (ref.storyCount ?? 0) === 0;
      menu = [{
        id: 'delete-draft',
        label: 'Delete draft',
        danger: true,
        disabledReason: ref.hasSentLetters ? "Can't delete — letters were sent from this draft." : undefined,
        run: () => setConfirm('draft'),
      }];
      secondary = (
        <Link to={row.href ?? '#'} aria-label={name('Edit')} className={SECONDARY_CLASS}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Link>
      );
      primaryReason = noStories ? 'Add at least one story first.' : undefined;
      primary = (
        <button
          type="button"
          disabled={noStories}
          aria-label={name('Prepare letter')}
          className={PRIMARY_CLASS}
          onClick={() => navigate(`/letter/${ref.docId}/compose`)}
        >
          Prepare letter
        </button>
      );
      break;
    }
    case 'sent': {
      const isPublic = !!ref.isPublicLetter;
      const hasDeliveries = (ref.deliveries?.length ?? 0) > 0;
      menu = [
        {
          id: 'preview',
          label: 'Preview',
          disabledReason: ref.sourceDocId ? undefined : 'The draft this letter was sealed from is gone.',
          run: () => { if (ref.sourceDocId) window.open(`/letter/${ref.sourceDocId}/preview`, '_blank', 'noopener,noreferrer'); },
        },
        {
          id: 'delete-letter',
          label: 'Delete letter',
          danger: true,
          disabledReason: hasDeliveries ? "Can't delete — letter has been shared." : undefined,
          run: () => setConfirm('letter'),
        },
      ];
      secondary = openLink('Details', SECONDARY_CLASS, { newDeliveryIds: ref.newDeliveryIds ?? [] });
      primary = isPublic ? (
        <button type="button" aria-label={name('Copy link')} className={PRIMARY_CLASS} onClick={() => publicLetterLink && void copy(publicLetterLink)}>
          Copy link
        </button>
      ) : (
        <button type="button" aria-label={name('Add recipient')} className={PRIMARY_CLASS} onClick={() => setAddOpen(true)}>
          Add recipient
        </button>
      );
      break;
    }
    case 'received-letter':
      primary = openLink(row.href && /\/results\?/.test(row.href) ? 'Results' : 'Open', PRIMARY_CLASS);
      break;
    case 'canvas':
      menu = [
        { id: 'share', label: 'Share', run: () => { shareAfterClose.current = true; } },
        {
          id: 'copy-link',
          label: 'Copy link',
          disabledReason: canvasShared ? undefined : 'Share this canvas first to get a link.',
          run: () => { if (canvasLink) void copy(canvasLink); },
        },
      ];
      primary = openLink('Open', PRIMARY_CLASS);
      break;
    case 'received-canvas':
      primary = openLink('Open', PRIMARY_CLASS);
      break;
  }

  const regular = menu.filter(m => !m.danger);
  const danger = menu.filter(m => m.danger);
  const item = (m: MenuItem) => (
    <DropdownMenuItem
      key={m.id}
      disabled={!!m.disabledReason}
      onSelect={() => m.run()}
      className={`min-h-10 flex-col items-start justify-center gap-0.5 ${m.danger && !m.disabledReason ? 'text-destructive focus:text-destructive' : ''}`}
    >
      <span>{m.label}</span>
      {m.disabledReason && <span className="max-w-[16rem] whitespace-normal text-xs text-muted-foreground">{m.disabledReason}</span>}
    </DropdownMenuItem>
  );

  return (
    <>
      <div data-testid="row-actions" className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {menu.length > 0 && (
          <div className="relative">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Actions for ${row.title}`} className={ICON_CLASS}>
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={4}
                className="min-w-[12rem]"
                onCloseAutoFocus={e => {
                  if (!shareAfterClose.current) return;
                  shareAfterClose.current = false;
                  e.preventDefault();
                  setShareSignal(n => n + 1);
                }}
              >
                {regular.map(item)}
                {danger.length > 0 && regular.length > 0 && <DropdownMenuSeparator />}
                {danger.map(item)}
              </DropdownMenuContent>
            </DropdownMenu>
            {row.state === 'canvas' && canvasName && userSlug && canvasLink && (
              // pointer-events-none: this box sits over the "…" button only to anchor the panel; it must never take its clicks.
              <div className="pointer-events-none absolute left-0 top-0">
                <CanvasShareControl
                  name={canvasName}
                  displayTitle={canvasTitle(canvasName)}
                  visibility={canvasShared ? 'shared' : 'private'}
                  generalAccess={ref.generalAccess ?? 'restricted'}
                  entries={null}
                  link={canvasLink}
                  onChanged={onChanged}
                  hideTrigger
                  openSignal={shareSignal}
                />
              </div>
            )}
          </div>
        )}
        {secondary}
        {primary}
      </div>
      {primaryReason && <p className="mt-1 text-right text-xs text-muted-foreground">{primaryReason}</p>}

      <ConfirmDialog
        open={confirm === 'draft'}
        onOpenChange={open => { if (!open) setConfirm(null); }}
        title="Delete draft"
        description={`Are you sure you want to delete “${row.title}”? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        isLoading={deleting}
        onConfirm={() => void handleDeleteDraft()}
      />
      <ConfirmDialog
        open={confirm === 'letter'}
        onOpenChange={open => { if (!open) setConfirm(null); }}
        title="Delete letter?"
        description="This will remove the published letter and its public link permanently."
        confirmLabel="Delete"
        isLoading={deleting}
        onConfirm={() => void handleDeleteLetter()}
      />
      {addOpen && ref.letterId && (
        <LetterReceiverModal
          mode="add-recipient"
          open
          onOpenChange={setAddOpen}
          letterId={ref.letterId}
          onRecipientAdded={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}
