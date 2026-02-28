/**
 * @file celebration-dialog.tsx
 * @description P422: Celebration dialog shown when a Clarity Partner Agreement
 * becomes active (partner signs). Renders the certificate in celebration variant
 * alongside a Google Calendar CTA and navigation action.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClarityAgreement } from '@/app/data/agreements-service.interface';
import { AgreementCertificate } from './agreement-certificate';

interface CelebrationDialogProps {
  open: boolean;
  onClose: () => void;
  agreement: ClarityAgreement;
  onViewAgreement: () => void;
}

const CALENDAR_URL =
  'https://calendar.google.com/calendar/render?action=TEMPLATE' +
  '&text=Clarity+Partner+%2Flive+Session' +
  '&details=Our+first+%2Flive+session+under+the+Clarity+Partner+Agreement';

export function CelebrationDialog({
  open,
  onClose,
  agreement,
  onViewAgreement,
}: CelebrationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center space-y-2 pb-2">
          <DialogTitle
            className="text-2xl md:text-3xl font-serif tracking-wide text-[#002B5C]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            ✦ Agreement Sealed ✦
          </DialogTitle>
          <p className="text-sm text-[#1A1A1A]/70 font-sans">
            Your Clarity Partner Agreement is now active.
          </p>
        </DialogHeader>

        {/* Certificate */}
        <div className="my-4">
          <AgreementCertificate
            variant="celebration"
            displayId={agreement.displayId}
            creatorName={agreement.creator?.name ?? 'Creator'}
            creatorSignedAt={agreement.createdAt}
            partnerName={agreement.partner?.name ?? 'Partner'}
            partnerSignedAt={agreement.partnerSignedAt}
            termsText={agreement.termsText}
          />
        </div>

        {/* Google Calendar CTA */}
        <div className="text-center">
          <a
            href={CALENDAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#0044CC] hover:underline"
          >
            Add /live session to Google Calendar →
          </a>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onViewAgreement}>
            View Agreement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
