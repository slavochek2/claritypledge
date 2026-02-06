import { Globe, Lock, Users } from 'lucide-react';
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
  labelClassName: string;
}> = {
  public: { icon: Globe, label: 'Public', description: 'Anyone can see this', labelClassName: 'text-muted-foreground bg-muted' },
  shared: { icon: Users, label: 'Shared', description: 'Visible only in /live sessions you share it in', labelClassName: 'text-muted-foreground bg-muted' },
  private: { icon: Lock, label: 'Private', description: 'Only you can see this', labelClassName: 'text-muted-foreground bg-muted' },
};

export function VisibilityBadge({ visibility, showLabel = false, size = 12 }: VisibilityBadgeProps) {
  const { icon: Icon, label, description, labelClassName } = config[visibility];

  if (showLabel) {
    return (
      <MobileTooltip content={description}>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${labelClassName}`}
          aria-label={`Visibility: ${label} — ${description}`}
        >
          <Icon size={size} aria-hidden="true" />
          {label}
        </span>
      </MobileTooltip>
    );
  }

  return (
    <MobileTooltip content={description}>
      <span className="text-muted-foreground inline-flex items-center min-w-[24px] min-h-[24px] justify-center">
        <Icon size={size} aria-label={`${label}: ${description}`} />
      </span>
    </MobileTooltip>
  );
}
