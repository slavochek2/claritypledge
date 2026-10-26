/**
 * @file letter-delete.tsx
 * @description P1545: "Delete letter" on the letter overview (it used to sit in the Artifacts row's "…"). The overview
 * offers it only while nobody has the letter; the confirm dialog and messages are the ones that menu had. A low-weight
 * red text button, never a second primary. After a delete the author lands on Artifacts, Letters, Sent.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { deleteLetter } from '@/app/data/letters-service';
import { ARTIFACTS_LETTERS_SENT } from '@/app/pages/artifacts/legacy-redirect-targets';

export function LetterDelete({ letterId }: { letterId: string }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteLetter(letterId);
      toast.success('Letter deleted.');
      setConfirming(false);
      // Replace: Back from the Sent list must not return to a letter that no longer exists.
      navigate(ARTIFACTS_LETTERS_SENT, { replace: true });
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

  return (
    <div className="flex flex-col items-start border-t pt-4">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="min-h-10 px-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
      >
        Delete letter
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={open => { if (!open) setConfirming(false); }}
        title="Delete letter?"
        description="This will remove the published letter and its public link permanently."
        confirmLabel="Delete"
        isLoading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
