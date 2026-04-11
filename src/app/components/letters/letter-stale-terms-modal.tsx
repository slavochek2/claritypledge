/**
 * @file letter-stale-terms-modal.tsx
 * @description P683: Blocking consent modal for authenticated users whose
 * accepted_terms_version is older than CURRENT_TERMS_VERSION. Writes to
 * terms_acceptances and updates profiles.accepted_terms_version before allowing
 * the letter to open.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';

interface LetterStaleTermsModalProps {
  open: boolean;
  onAccept: () => Promise<void> | void;
  onCancel: () => void;
}

export function LetterStaleTermsModal({
  open,
  onAccept,
  onCancel,
}: LetterStaleTermsModalProps) {
  const [checked, setChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAccept = async () => {
    if (!checked || isLoading) return;
    setIsLoading(true);
    try {
      await onAccept();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Updated Terms</DialogTitle>
          <DialogDescription>
            We&rsquo;ve updated our Terms of Service and Privacy Policy since you last
            agreed. Please review and accept to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-4 text-sm">
            <Link
              to="/terms-of-service"
              target="_blank"
              className="text-[#0044CC] hover:underline"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy-policy"
              target="_blank"
              className="text-[#0044CC] hover:underline"
            >
              Privacy Policy
            </Link>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="stale-terms-accept"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              disabled={isLoading}
              className="mt-0.5"
            />
            <label
              htmlFor="stale-terms-accept"
              className="text-sm text-[#1A1A1A] leading-snug cursor-pointer select-none"
            >
              I accept the updated Terms of Service and Privacy Policy.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Not now
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!checked || isLoading}
            aria-disabled={!checked || isLoading}
          >
            {isLoading ? 'Saving...' : 'Accept & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
