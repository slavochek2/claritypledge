import { Button } from '@/components/ui/button';
import { LegalDocLinks, TermsChangeList } from '@/app/components/legal/terms-change-list';

interface TermsNoticeBannerProps {
  onDismiss: () => void;
  isLoading?: boolean;
}

/**
 * Non-blocking terms update notice (shown when the current version does not
 * require fresh consent). Stays until dismissed: a notice that vanished on its
 * own could not be said to have been seen. Describes the documents only, since
 * it renders over every authed page (P1300).
 */
export function TermsNoticeBanner({ onDismiss, isLoading = false }: TermsNoticeBannerProps) {
  return (
    <section
      aria-label="Terms update"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-lg"
    >
      <div className="mx-auto max-h-[70vh] max-w-lg space-y-3 overflow-y-auto px-4 py-4">
        <p className="font-semibold">We've updated our Terms and Privacy Policy</p>
        <TermsChangeList />
        <LegalDocLinks />
        <p className="text-sm text-muted-foreground">
          By continuing to use Clarity Pledge, you agree to the updated terms.
        </p>
        <Button className="w-full" onClick={onDismiss} disabled={isLoading}>
          Got it
        </Button>
      </div>
    </section>
  );
}
