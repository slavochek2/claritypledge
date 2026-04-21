/**
 * @file gap-banner.tsx
 * @description P673: Extracted from live-mode-view.tsx gap-revealed phase.
 * Blue banner showing point gap badge + insight message.
 * Used by both /live and letter reading flows.
 */

interface GapBannerProps {
  gap: number;
  senderName: string;
  /** True when the sender believes the receiver understands less than they think */
  isOverconfident: boolean;
  /** When true, renders from the checker's (speaker's) perspective */
  isChecker?: boolean;
  className?: string;
}

export function GapBanner({ gap, senderName, isOverconfident, isChecker = false, className = '' }: GapBannerProps) {
  if (gap === 0) {
    // Calibrated — no gap
    const insightMessage = isChecker
      ? <>You believe {senderName} understands <span className="font-bold">exactly as much</span> as they think</>
      : <>{senderName} believes you understand <span className="font-bold">exactly as much</span> as you think</>;

    return (
      <div className={`border border-input bg-muted/50 rounded-lg px-4 py-3 ${className}`}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="bg-green-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">Perfectly calibrated</span>
        </div>
        <p className="text-muted-foreground text-sm text-center">{insightMessage}</p>
      </div>
    );
  }

  const pointLabel = gap === 1 ? 'point' : 'points';
  const gapBadgeText = `${gap} ${pointLabel} gap`;
  const direction = isOverconfident ? 'less' : 'more';

  const insightMessage = isChecker
    ? <>You think {senderName} understands <span className="font-bold">{direction}</span> than they think</>
    : <>{senderName} thinks you understand <span className="font-bold">{direction}</span> than you think</>;

  return (
    <div className={`border border-blue-200 bg-blue-50 rounded-lg px-4 py-3 ${className}`}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="bg-blue-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">{gapBadgeText}</span>
      </div>
      <p className="text-blue-700 text-sm text-center">{insightMessage}</p>
    </div>
  );
}
