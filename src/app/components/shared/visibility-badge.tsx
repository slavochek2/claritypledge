import { Globe, Lock } from 'lucide-react';
import { MobileTooltip } from './mobile-tooltip';
import type { StoryVisibility } from '@/app/types';

interface VisibilityBadgeProps {
  visibility: StoryVisibility;
  /** Show only icon (default) or icon + label */
  showLabel?: boolean;
  /** Icon size in pixels */
  size?: number;
}

const config: Record<StoryVisibility, {
  icon: typeof Globe;
  label: string;
  description: string;
  tooltip: string;
  labelClassName: string;
  colorClassName: string;
}> = {
  public: { icon: Globe, label: 'Public', description: 'Anyone can view this.', tooltip: 'Visible to everyone', labelClassName: 'text-muted-foreground bg-muted', colorClassName: 'text-muted-foreground' },
  private: { icon: Lock, label: 'Private', description: 'Only people you share with can see this.', tooltip: 'Only people you share with can see this.', labelClassName: 'text-muted-foreground bg-muted', colorClassName: 'text-amber-600' },
};

export function VisibilityBadge({ visibility, showLabel = false, size = 12 }: VisibilityBadgeProps) {
  const { icon: Icon, label, description, labelClassName } = config[visibility];

  if (showLabel) {
    return (
      <MobileTooltip content={description}>
        {/* P1227: aria-label is prohibited on a generic span (axe aria-prohibited-attr);
            the visible label is the name, the description stays as visually-hidden text. */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${labelClassName}`}>
          <Icon size={size} aria-hidden="true" />
          {label}
          <span className="sr-only"> — {description}</span>
        </span>
      </MobileTooltip>
    );
  }

  return (
    <MobileTooltip content={description}>
      <span
        role="img"
        aria-label={`${label}: ${description}`}
        className="text-muted-foreground inline-flex items-center min-w-[24px] min-h-[24px] justify-center"
      >
        <Icon size={size} aria-hidden="true" />
      </span>
    </MobileTooltip>
  );
}

/**
 * P586: Visibility badge positioned in the top-right corner of a card.
 * The parent card must have `position: relative` (Tailwind: `relative`).
 * Renders a small globe (public) or lock (private) icon with tooltip.
 * NOTE: Currently unused — kept as export for potential future use.
 */
export function CardVisibilityCornerBadge({ visibility }: { visibility?: StoryVisibility }) {
  const v = visibility ?? 'public';
  const { icon: Icon, tooltip, colorClassName } = config[v];

  return (
    <div className="absolute top-2 right-2 z-10">
      <MobileTooltip content={tooltip}>
        <span
          role="img"
          className={`inline-flex items-center ${colorClassName}`}
          aria-label={tooltip}
        >
          <Icon size={14} aria-hidden="true" />
        </span>
      </MobileTooltip>
    </div>
  );
}

/**
 * P586: Inline visibility icon for use within metadata lines or flex rows.
 * Renders a small globe (public, gray) or lock (private, amber) with tooltip.
 */
export function InlineVisibilityIcon({ visibility }: { visibility?: StoryVisibility }) {
  const v = visibility ?? 'public';
  const { icon: Icon, tooltip, colorClassName } = config[v];

  return (
    <MobileTooltip content={tooltip}>
      <span
        role="img"
        className={`inline-flex items-center ${colorClassName}`}
        aria-label={tooltip}
      >
        <Icon size={14} aria-hidden="true" />
      </span>
    </MobileTooltip>
  );
}
