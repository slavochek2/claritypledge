/**
 * @file letter-stale-terms-modal.tsx
 * @description P683: Blocking consent modal for authenticated users whose
 * accepted_terms_version is older than CURRENT_TERMS_VERSION. Writes to
 * terms_acceptances and updates profiles.accepted_terms_version before allowing
 * the letter to open.
 */

import { useEffect, useState } from 'react';
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
import { TermsChangeList, TermsMissedChanges, TermsTitle } from '@/app/components/legal/terms-change-list';
import type { TermsChangeSummary } from '@/app/content/terms-changes';
import { termsPrompt } from '@/app/content/terms-prompt';
import { getAcceptedTermsVersion } from '@/app/data/terms-accepted';
import { useAuth } from '@/auth/AuthContext';

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
  const [missed, setMissed] = useState<TermsChangeSummary[]>([]);
  const { user } = useAuth();
  const userId = user?.id;

  // Earlier versions needing consent that this person skipped. A failed read shows only the current one.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    getAcceptedTermsVersion(userId)
      .then((accepted) => {
        if (!cancelled) setMissed(termsPrompt(accepted).missed);
      })
      .catch((err) => console.error('[letter-reading] Accepted terms read failed:', err));
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

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
        className="flex max-h-[100dvh] flex-col sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="leading-snug"><TermsTitle /></DialogTitle>
          <DialogDescription>
            Our Terms and Privacy Policy are updated. To open this letter, you need to agree to them.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <TermsChangeList />
          <TermsMissedChanges missed={missed} />
        </div>

        <div className="space-y-4 py-2">
          <div className="flex gap-4 text-sm">
            <Link
              to="/terms-of-service"
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy-policy"
              target="_blank"
              className="text-blue-600 hover:underline"
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
          <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
            Not now
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!checked || isLoading}
            aria-disabled={!checked || isLoading}
          >
            {isLoading ? 'Saving...' : 'Agree and continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
