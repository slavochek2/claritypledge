/**
 * @file artifact-row-actions.tsx
 * @description P1545 third pass: the controls on an Artifacts row's title line, and the dialogs they open.
 *
 * The whole row opens the item (artifact-row.tsx); these controls sit above that overlay, right-aligned and vertically
 * centred, and never trigger it. Primary is a small blue OUTLINE button. Every row of a kind lists the same "…" items.
 *
 *   draft            Prepare letter · … (Delete draft)
 *   sent             + Add recipient · … (Copy link when public, Preview, Delete letter)
 *   received         › (quiet; no controls)
 *   own canvas       Share · … (Copy link)
 *   shared canvas    ›
 *
 * A control that is not possible right now stays focusable and clickable (aria-disabled, muted): hover or focus shows
 * its reason as a tooltip, a tap shows it as a toast. Nothing about it is written on the row.
 *
 * Handlers and guards are the old row menu's (docs-service deleteDoc, letters-service deleteLetter); Add recipient opens
 * the overview's own dialog; Share opens the canvas page's own share panel (CanvasShareControl).
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { CanvasShareControl } from '@/app/components/canvas/canvas-share-control';
import { LetterReceiverModal } from '@/app/components/letters/letter-receiver-modal';
import { CARD_FOCUS_RING } from '@/app/components/shared/card-action-classes';
import { docsService } from '@/app/data/docs-service';
import { deleteLetter } from '@/app/data/letters-service';
import { canvasPath, canvasTitle } from '@/lib/canvas-boxes';
import type { ArtifactRow } from './artifacts-view-model';

/** The primary: a small blue outline button, 40px tall. */
const PRIMARY_CLASS =
  `inline-flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-blue-600 bg-background px-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 ${CARD_FOCUS_RING}`;
/** Not possible right now: muted, but still focusable and clickable (it answers with its reason). */
const MUTED_CLASS =
  `inline-flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-400 ${CARD_FOCUS_RING}`;
const ICON_CLASS =
  `flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${CARD_FOCUS_RING}`;

interface MenuItem {
  id: string;
  label: string;
  /** Not possible right now: the item answers with this instead of acting. */
  disabledReason?: string;
  danger?: boolean;
  run: () => void;
}

interface Props {
  row: ArtifactRow;
  userSlug: string | null;
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

export function ArtifactRowActions({ row, userSlug, onChanged }: Props) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'draft' | 'letter' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shareSignal, setShareSignal] = useState(0);

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

  const canvasName = ref.canvasName;
  const canvasLink = canvasName && userSlug ? `${window.location.origin}${canvasPath(userSlug, canvasName)}` : null;
  const canvasShared = !!ref.hasAudience || ref.generalAccess === 'link';
  const publicLetterLink = ref.letterId ? `${window.location.origin}/letter/${ref.letterId}` : null;

  /** A labelled outline control; with a reason it is muted, aria-disabled, and answers with that reason. */
  const control = (label: string, short: string | null, onClick: () => void, reason?: string): ReactNode => {
    const text = short ? (
      <>
        <span className="hidden min-[400px]:inline">{label}</span>
        <span className="min-[400px]:hidden">{short}</span>
      </>
    ) : label;
    if (reason) {
      return (
        <MobileTooltip content={reason}>
          <button type="button" aria-disabled="true" aria-label={name(label)} className={MUTED_CLASS} onClick={() => toast(reason)}>
            {text}
          </button>
        </MobileTooltip>
      );
    }
    return (
      <button type="button" aria-label={name(label)} className={PRIMARY_CLASS} onClick={onClick}>
        {text}
      </button>
    );
  };

  let menu: MenuItem[] = [];
  let main: ReactNode = null;

  switch (row.state) {
    case 'draft':
      menu = [{
        id: 'delete-draft',
        label: 'Delete draft',
        danger: true,
        disabledReason: ref.hasSentLetters ? "Can't delete — letters were sent from this draft." : undefined,
        run: () => setConfirm('draft'),
      }];
      main = control(
        'Prepare letter',
        'Prepare',
        () => navigate(`/letter/${ref.docId}/compose`),
        (ref.storyCount ?? 0) === 0 ? 'Add at least one story first.' : undefined,
      );
      break;
    case 'sent':
      menu = [
        ...(ref.isPublicLetter ? [{ id: 'copy-link', label: 'Copy link', run: () => { if (publicLetterLink) void copy(publicLetterLink); } }] : []),
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
          disabledReason: (ref.deliveryCount ?? 0) > 0 ? "Can't delete — letter has been shared." : undefined,
          run: () => setConfirm('letter'),
        },
      ];
      main = (
        <button type="button" aria-label={name('Add recipient')} className={PRIMARY_CLASS} onClick={() => setAddOpen(true)}>
          <span aria-hidden="true">+</span>
          <span className="hidden min-[400px]:inline">Add recipient</span>
          <span className="min-[400px]:hidden">Add</span>
        </button>
      );
      break;
    case 'received-letter':
    case 'received-canvas':
      // Nothing to press: the whole row opens it. A quiet chevron says so.
      return <ChevronRight data-testid="row-chevron" className="relative z-10 h-5 w-5 shrink-0 text-muted-foreground/70" aria-hidden="true" />;
    case 'canvas':
      menu = [{
        id: 'copy-link',
        label: 'Copy link',
        disabledReason: canvasShared ? undefined : 'Share this canvas first to get a link.',
        run: () => { if (canvasLink) void copy(canvasLink); },
      }];
      main = (
        // The canvas page's own share panel, anchored to this button (its own trigger stays hidden).
        <div className="relative">
          <button type="button" aria-label={name('Share')} className={PRIMARY_CLASS} onClick={() => setShareSignal(n => n + 1)}>
            Share
          </button>
          {canvasName && canvasLink && (
            // pointer-events-none: this box only anchors the panel under the button; it must never take clicks.
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
      );
      break;
  }

  const regular = menu.filter(m => !m.danger);
  const danger = menu.filter(m => m.danger);
  const item = (m: MenuItem) => (
    <DropdownMenuItem
      key={m.id}
      aria-disabled={m.disabledReason ? 'true' : undefined}
      onSelect={() => (m.disabledReason ? toast(m.disabledReason) : m.run())}
      className={`min-h-10 flex-col items-start justify-center gap-0.5 ${
        m.disabledReason ? 'opacity-60' : m.danger ? 'text-destructive focus:text-destructive' : ''
      }`}
    >
      <span>{m.label}</span>
      {m.disabledReason && <span className="max-w-[16rem] whitespace-normal text-xs text-muted-foreground">{m.disabledReason}</span>}
    </DropdownMenuItem>
  );

  return (
    <>
      {/* Raised above the row's overlay link, so a press here never opens the item. */}
      <div data-testid="row-actions" className="relative z-10 flex shrink-0 items-center gap-1.5">
        {main}
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Actions for ${row.title}`} className={ICON_CLASS}>
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-[12rem]">
              {regular.map(item)}
              {danger.length > 0 && regular.length > 0 && <DropdownMenuSeparator />}
              {danger.map(item)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

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
