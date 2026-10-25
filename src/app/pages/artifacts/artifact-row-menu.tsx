/**
 * @file artifact-row-menu.tsx
 * @description P1545 WP3: the "…" menu on one Artifacts row, plus the dialogs its actions open.
 * Quick actions only (orientation redesign): Add recipients and Preview moved to the letter overview.
 * Handlers and guards are copied from today's drafts-tab.tsx and sent-tab.tsx; the canvas Share
 * opens the P1515 share panel (CanvasShareControl) anchored to the "…" button.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
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
import { docsService } from '@/app/data/docs-service';
import { deleteLetter } from '@/app/data/letters-service';
import { canvasPath, canvasTitle } from '@/lib/canvas-boxes';
import type { ArtifactRow, RowAction } from './artifacts-view-model';

interface Props {
  row: ArtifactRow;
  userSlug: string | null;
  /** Called after anything that changes the list (delete, share change). */
  onChanged: () => void;
}

export function ArtifactRowMenu({ row, userSlug, onChanged }: Props) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'draft' | 'letter' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareSignal, setShareSignal] = useState(0);
  // Share opens AFTER the menu has closed: the menu hands focus back to its button as it closes, and that
  // focus move would dismiss the share popover if the popover were already open.
  const shareAfterClose = useRef(false);

  // No enabled action means nothing to open: a menu holding only a disabled Delete is not drawn at all.
  if (!row.menu.some(a => !a.disabledReason)) return null;

  const handleDeleteDraft = async () => {
    if (!row.ref.docId) return;
    setDeleting(true);
    try {
      await docsService.deleteDoc(row.ref.docId);
      toast.success('Draft deleted');
      setConfirm(null);
      onChanged();
    } catch (err) {
      if (err instanceof Error && err.message === 'SEALED_LETTERS_EXIST') {
        toast.error("Can't delete — letters were sent from this draft.");
      } else {
        toast.error("Couldn't delete draft.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteLetter = async () => {
    if (!row.ref.letterId) return;
    setDeleting(true);
    try {
      await deleteLetter(row.ref.letterId);
      toast.success('Letter deleted.');
      setConfirm(null);
      onChanged();
    } catch (err) {
      if (err instanceof Error && err.message === 'DELIVERIES_EXIST') {
        toast.error("Can't delete — letter has been shared.");
      } else {
        toast.error("Couldn't delete letter.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/letter/${row.ref.letterId}`);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const run = (id: RowAction['id']) => {
    switch (id) {
      case 'prepare-letter':
        navigate(`/letter/${row.ref.docId}/compose`);
        break;
      case 'delete-draft':
        setConfirm('draft');
        break;
      case 'copy-public-link':
        void handleCopyPublicLink();
        break;
      case 'delete-letter':
        setConfirm('letter');
        break;
      case 'share-canvas':
        shareAfterClose.current = true;
        break;
    }
  };

  const regular = row.menu.filter(a => !a.danger);
  const danger = row.menu.filter(a => a.danger);

  const item = (a: RowAction) => (
    <DropdownMenuItem
      key={a.id}
      disabled={!!a.disabledReason}
      onSelect={() => run(a.id)}
      className={`min-h-10 flex-col items-start justify-center gap-0.5 ${
        a.danger && !a.disabledReason ? 'text-destructive focus:text-destructive' : ''
      }`}
    >
      <span>{a.label}</span>
      {a.disabledReason && <span className="max-w-[16rem] whitespace-normal text-xs text-muted-foreground">{a.disabledReason}</span>}
    </DropdownMenuItem>
  );

  const canvasName = row.ref.canvasName;

  // Top right, level with the first title line: the 40px button starts 8px above the row's text.
  return (
    <div className="relative z-10 -mt-2 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${row.title}`}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
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

      {row.state === 'canvas' && canvasName && userSlug && (
        // pointer-events-none: this box sits over the "…" button only to anchor the panel; it must never take its clicks.
        <div className="pointer-events-none absolute right-0 top-0">
          <CanvasShareControl
            name={canvasName}
            displayTitle={canvasTitle(canvasName)}
            visibility={row.ref.hasAudience || row.ref.generalAccess === 'link' ? 'shared' : 'private'}
            generalAccess={row.ref.generalAccess ?? 'restricted'}
            entries={null}
            link={`${window.location.origin}${canvasPath(userSlug, canvasName)}`}
            onChanged={onChanged}
            hideTrigger
            openSignal={shareSignal}
          />
        </div>
      )}

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
    </div>
  );
}
