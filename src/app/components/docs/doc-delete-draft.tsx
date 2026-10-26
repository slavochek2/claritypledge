/**
 * @file doc-delete-draft.tsx
 * @description P1545: "Delete draft" inside the draft editor (it used to sit in the Artifacts row's "…"). Same guard,
 * disabled reason and confirm dialog as that menu had; a low-weight red text button at the bottom of the page, never a
 * second primary. After a delete the author lands on Artifacts, Letters, Drafts.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { docsService } from '@/app/data/docs-service';
import { ARTIFACTS_LETTERS_DRAFTS } from '@/app/pages/artifacts/legacy-redirect-targets';

const SENT_REASON = "Can't delete — letters were sent from this draft.";

interface Props {
  docId: string;
  title: string;
  /** Letters were sent from this draft: Delete is shown disabled with the reason. */
  hasSentLetters: boolean;
}

export function DocDeleteDraft({ docId, title, hasSentLetters }: Props) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await docsService.deleteDoc(docId);
      toast.success('Draft deleted');
      setConfirming(false);
      // Replace: Back from the Drafts list must not return to a draft that no longer exists.
      navigate(ARTIFACTS_LETTERS_DRAFTS, { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message === 'SEALED_LETTERS_EXIST') {
        toast.error(SENT_REASON);
      } else {
        toast.error("Couldn't delete draft.");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 border-t pt-4">
      <Button
        type="button"
        variant="ghost"
        disabled={hasSentLetters}
        onClick={() => setConfirming(true)}
        className="min-h-10 px-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
      >
        Delete draft
      </Button>
      {hasSentLetters && <p className="px-2 text-xs text-muted-foreground">{SENT_REASON}</p>}
      <ConfirmDialog
        open={confirming}
        onOpenChange={open => { if (!open) setConfirming(false); }}
        title="Delete draft"
        description={`Are you sure you want to delete “${title}”? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        isLoading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
