/**
 * @file live-session-banner.tsx
 * @description P23 V9: Simple centered header - "Clarity Meeting with [Partner]"
 * V10: Added exit button (X) in top-left corner
 * V12: Added sound toggle button (right side)
 */
import { X, Volume2, VolumeX } from 'lucide-react';
import { capitalizeName } from './shared';
import { useSoundEnabled } from '@/hooks/use-sound';

interface LiveSessionBannerProps {
  partnerName: string;
  onExit?: () => void;
}

export function LiveSessionBanner({ partnerName, onExit }: LiveSessionBannerProps) {
  const displayPartnerName = capitalizeName(partnerName);
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();

  return (
    <div className="px-4 py-3 border-b relative">
      {onExit && (
        <button
          onClick={onExit}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
          aria-label="Exit meeting"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      )}
      <p className="text-sm text-muted-foreground text-center">
        Clarity Meeting with {displayPartnerName}
      </p>
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
        aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
      >
        {soundEnabled ? (
          <Volume2 className="h-5 w-5 text-muted-foreground" />
        ) : (
          <VolumeX className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
