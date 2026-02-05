import { Globe, Lock } from 'lucide-react';
import { MobileTooltip } from './MobileTooltip';
import { IdeaVisibility } from '../../data/mock-data';

interface VisibilityBadgeProps {
  visibility: IdeaVisibility;
  /** Show only icon (default) or icon + label */
  showLabel?: boolean;
  /** Icon size in pixels */
  size?: number;
}

const config = {
  public: { icon: Globe, label: 'Public', description: 'Anyone can see this', className: 'text-gray-500 bg-gray-100' },
  shared: { icon: Lock, label: 'Restricted', description: 'Only event participants can see', className: 'text-gray-600 bg-gray-100' },
  private: { icon: Lock, label: 'Restricted', description: 'Only you can see this', className: 'text-gray-600 bg-gray-100' },
};

export function VisibilityBadge({ visibility, showLabel = false, size = 12 }: VisibilityBadgeProps) {
  const { icon: Icon, label, description, className } = config[visibility];

  if (showLabel) {
    return (
      <MobileTooltip content={description}>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${className}`}>
          <Icon size={size} />
          {label}
        </span>
      </MobileTooltip>
    );
  }

  return (
    <MobileTooltip content={description}>
      <span className="text-gray-400">
        <Icon size={size} />
      </span>
    </MobileTooltip>
  );
}
