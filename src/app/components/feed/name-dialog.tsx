/**
 * @file name-dialog.tsx
 * @description Shared NameDialog component for prompting user name input in idea feed.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { User } from 'lucide-react';

interface NameDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  /** Context-specific description text */
  description?: string;
}

export function NameDialog({
  open,
  onClose,
  onSubmit,
  description = 'Your name will be shown with your votes and ideas.',
}: NameDialogProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      setName(''); // Reset for next use
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName(''); // Reset on close
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What's your name?</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-gray-400" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
          </div>
          <p className="text-sm text-gray-500">{description}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
