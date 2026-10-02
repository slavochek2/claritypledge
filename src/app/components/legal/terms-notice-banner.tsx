import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TermsChangeList, TermsTitle, TERMS_CONSENT_LINE } from '@/app/components/legal/terms-change-list';

interface TermsNoticeBannerProps {
  onDismiss: () => void;
  isLoading?: boolean;
}

/**
 * Non-blocking terms update notice (shown when the current version does not
 * require fresh consent). Stays until dismissed: a notice that vanished on its
 * own could not be said to have been seen. Describes the documents only, since
 * it renders over every authed page (P1300). Does not take focus.
 */
export function TermsNoticeBanner({ onDismiss, isLoading = false }: TermsNoticeBannerProps) {
  // Sit above the mobile bottom nav when one is rendered, so the nav stays usable.
  const [navOffset, setNavOffset] = useState(0);
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('[data-nav="bottom"]');
    if (!nav) return;
    const update = () => setNavOffset(nav.offsetParent ? nav.offsetHeight : 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-label="Terms update"
      style={{ bottom: navOffset }}
      className={`fixed inset-x-0 z-50 border-t border-border bg-background shadow-sheet ${navOffset ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}
    >
      <div className="mx-auto flex max-w-2xl flex-col px-4 pt-3">
        <p className="text-sm font-semibold">
          <TermsTitle />
        </p>
        <div className="mt-1">
          <TermsChangeList />
        </div>
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{TERMS_CONSENT_LINE}</p>
          <Button className="h-10 shrink-0 bg-blue-600 hover:bg-blue-700" onClick={onDismiss} disabled={isLoading}>
            Accept
          </Button>
        </div>
      </div>
    </section>
  );
}
