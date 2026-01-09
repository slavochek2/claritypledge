import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RequiresLoginDialogProps {
  open: boolean;
  email: string;
  onSendLoginLink: () => void;
  onUseDifferentEmail: () => void;
  isLoading?: boolean;
}

export function RequiresLoginDialog({
  open,
  email,
  onSendLoginLink,
  onUseDifferentEmail,
  isLoading = false,
}: RequiresLoginDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This email has an account</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            <strong>{email}</strong> is already registered.
            To join this session, please log in first.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onUseDifferentEmail} disabled={isLoading}>
            Use Different Email
          </Button>
          <Button onClick={onSendLoginLink} disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send Login Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
