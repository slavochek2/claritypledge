/**
 * @file live-session-banner.tsx
 * @description P23 V9: Simple centered header - "Clarity Meeting with [Partner]"
 */
import { capitalizeName } from './shared';

interface LiveSessionBannerProps {
  partnerName: string;
}

export function LiveSessionBanner({ partnerName }: LiveSessionBannerProps) {
  const displayPartnerName = capitalizeName(partnerName);

  return (
    <div className="px-4 py-3 border-b">
      <p className="text-sm text-muted-foreground text-center">
        Clarity Meeting with {displayPartnerName}
      </p>
    </div>
  );
}
