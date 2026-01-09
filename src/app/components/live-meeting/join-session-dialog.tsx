import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface JoinSessionDialogProps {
  open: boolean;
  onJoin: (name: string, email: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function JoinSessionDialog({
  open,
  onJoin,
  onCancel,
  isLoading = false,
}: JoinSessionDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const isValid = name.trim().length > 0 && email.includes('@');

  const handleJoin = () => {
    if (isValid) {
      onJoin(name.trim(), email.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join Clarity Meeting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            This session will be recorded.{' '}
            By joining, you agree to our{' '}
            <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleJoin} disabled={!isValid || isLoading}>
            {isLoading ? 'Joining...' : 'Join Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
