/**
 * @file celebration-install-link.tsx
 * @description P493: Inline install CTA for the agreement celebration dialog.
 * Replaces the old "Start a /live session →" link. No dismiss button (non-intrusive inline).
 */
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { IosInstallDrawer } from './ios-install-drawer';
import { useState } from 'react';
import { analytics } from '@/lib/mixpanel';

export function CelebrationInstallLink() {
  const { isInstalled, canPrompt, isIOS, isDesktop, promptInstall } = usePwaInstall();
  const [iosDrawerOpen, setIosDrawerOpen] = useState(false);

  // Don't render if already installed, desktop, or can't install
  if (isInstalled || isDesktop || (!canPrompt && !isIOS)) return null;

  const handleClick = async () => {
    analytics.track('pwa_install_prompted', { source: 'celebration' });
    if (isIOS) {
      analytics.track('pwa_ios_instructions_shown', { source: 'celebration' });
      setIosDrawerOpen(true);
    } else {
      await promptInstall('celebration');
    }
  };

  return (
    <>
      <div>
        <button
          onClick={handleClick}
          className="text-sm text-[#0044CC] hover:underline"
        >
          Install app for quick access →
        </button>
      </div>
      <IosInstallDrawer open={iosDrawerOpen} onClose={() => setIosDrawerOpen(false)} />
    </>
  );
}
