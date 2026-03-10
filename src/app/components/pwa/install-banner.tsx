/**
 * @file install-banner.tsx
 * @description P493: Thin blue banner for PWA install prompt, matching AI Insights banner style.
 * Used on the post-/live session end screen for registered users.
 */
import { Smartphone } from 'lucide-react';
import { usePwaInstall, type InstallSource } from '@/hooks/use-pwa-install';
import { IosInstallDrawer } from './ios-install-drawer';
import { useState } from 'react';
import { analytics } from '@/lib/mixpanel';

interface InstallBannerProps {
  source: InstallSource;
  onDismiss?: () => void;
}

export function InstallBanner({ source, onDismiss }: InstallBannerProps) {
  const { isInstalled, canPrompt, isIOS, isDismissed, isDesktop, promptInstall } = usePwaInstall();
  const [iosDrawerOpen, setIosDrawerOpen] = useState(false);

  // Don't show if installed, dismissed, or desktop
  if (isInstalled || isDismissed || isDesktop) return null;
  // Must be able to prompt (Android) or be iOS
  if (!canPrompt && !isIOS) return null;

  const handleClick = async () => {
    analytics.track('pwa_install_prompted', { source });
    if (isIOS) {
      analytics.track('pwa_ios_instructions_shown', { source });
      setIosDrawerOpen(true);
    } else {
      await promptInstall(source);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 py-1.5 px-4 bg-blue-50 border-b border-blue-200">
        <button
          onClick={handleClick}
          className="flex-1 flex items-center justify-center gap-2 text-xs text-blue-700 hover:text-blue-900 transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-500" />
          <span>Install ClarityPledge for quick access</span>
          <span aria-hidden="true">→</span>
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-blue-400 hover:text-blue-600 text-xs px-1"
            aria-label="Dismiss install prompt"
          >
            ✕
          </button>
        )}
      </div>

      <IosInstallDrawer open={iosDrawerOpen} onClose={() => setIosDrawerOpen(false)} />
    </>
  );
}
