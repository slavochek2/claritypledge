import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TermsUpdateDialogProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function TermsUpdateDialog({
  open,
  onAccept,
  onCancel,
  isLoading = false,
}: TermsUpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Updated Terms</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            We've updated our Terms and Privacy Policy.
          </p>

          <p className="text-sm text-muted-foreground">
            This session will be recorded.{' '}
            By continuing, you agree to the updated terms.
          </p>

          <div className="flex gap-4 text-sm">
            <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
              View Terms
            </a>
            <a href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
              View Privacy Policy
            </a>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={onAccept} disabled={isLoading}>
            {isLoading ? 'Continuing...' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
