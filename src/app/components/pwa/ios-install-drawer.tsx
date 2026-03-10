/**
 * @file ios-install-drawer.tsx
 * @description P493: Bottom drawer with step-by-step iOS "Add to Home Screen" instructions.
 * Shown on iOS Safari where beforeinstallprompt is not available.
 */
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Share, Plus, CheckCircle2 } from 'lucide-react';

interface IosInstallDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function IosInstallDrawer({ open, onClose }: IosInstallDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DrawerContent>
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-lg font-semibold">
            Add ClarityPledge to your Home Screen
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-6 pb-2 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Share className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">1. Tap the Share button</p>
              <p className="text-xs text-muted-foreground">In Safari's bottom toolbar</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">2. Scroll down and tap "Add to Home Screen"</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">3. Tap "Add" to confirm</p>
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button onClick={onClose} className="w-full">
            Got it
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
