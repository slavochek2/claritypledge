/**
 * @file install-card.tsx
 * @description P493: Settings page install card. Always visible regardless of dismiss state.
 * Shows install button, installed state, or unsupported browser message.
 */
import { Smartphone, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { IosInstallDrawer } from './ios-install-drawer';
import { useState } from 'react';
import { analytics } from '@/lib/mixpanel';

export function InstallCard() {
  const { isInstalled, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [iosDrawerOpen, setIosDrawerOpen] = useState(false);

  if (isInstalled) {
    return (
      <div className="p-4 rounded-lg border border-green-200 bg-green-50">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">ClarityPledge is installed</span>
        </div>
      </div>
    );
  }

  const canInstall = canPrompt || isIOS;

  const handleInstall = async () => {
    analytics.track('pwa_install_prompted', { source: 'settings' });
    if (isIOS) {
      analytics.track('pwa_ios_instructions_shown', { source: 'settings' });
      setIosDrawerOpen(true);
    } else {
      await promptInstall('settings');
    }
  };

  return (
    <>
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Install ClarityPledge</p>
            {canInstall ? (
              <>
                <p className="text-xs text-muted-foreground mt-1">
                  Add to your home screen for quick access and offline support.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInstall}
                  className="mt-3"
                >
                  Add to Home Screen
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Open in Chrome or Safari to install.
              </p>
            )}
          </div>
        </div>
      </div>

      <IosInstallDrawer open={iosDrawerOpen} onClose={() => setIosDrawerOpen(false)} />
    </>
  );
}
