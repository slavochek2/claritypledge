/**
 * @file celebration-dialog.tsx
 * @description P422: Celebration dialog shown when a Clarity Partner Agreement
 * becomes active (partner signs). Renders the certificate in celebration variant
 * alongside a calendar CTA and navigation action.
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
import { AddToCalendarButton } from '@/app/components/shared/add-to-calendar-button';
import { CelebrationInstallLink } from '@/app/components/pwa/celebration-install-link';

interface CelebrationDialogProps {
  open: boolean;
  onClose: () => void;
  agreement: ClarityAgreement;
  onViewAgreement: () => void;
}

export function CelebrationDialog({
  open,
  onClose,
  agreement,
  onViewAgreement,
}: CelebrationDialogProps) {
  const partnerName = agreement.partner?.name ?? agreement.partnerDisplayName ?? 'your partner';

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
            partnerName={partnerName}
            partnerSignedAt={agreement.partnerSignedAt}
            termsText={agreement.termsText}
            creatorProfileUrl={agreement.creator?.slug ? `/p/${agreement.creator.slug}` : null}
            partnerProfileUrl={agreement.partner?.slug ? `/p/${agreement.partner.slug}` : null}
          />
        </div>

        {/* Calendar CTA */}
        <div className="text-center space-y-3">
          <AddToCalendarButton
            event={{
              title: `Clarity /live session with ${partnerName}`,
              description: 'Our first /live session under the Clarity Partner Agreement',
            }}
          />
          <CelebrationInstallLink />
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
