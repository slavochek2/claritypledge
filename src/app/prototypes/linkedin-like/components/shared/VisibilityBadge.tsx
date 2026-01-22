import { Globe, Lock } from 'lucide-react';
import { IdeaVisibility } from '../../data/mock-data';

interface VisibilityBadgeProps {
  visibility: IdeaVisibility;
}

const config = {
  public: { icon: Globe, label: 'Public', className: 'text-gray-500 bg-gray-100' },
  shared: { icon: Lock, label: 'Restricted', className: 'text-gray-600 bg-gray-100' },
  private: { icon: Lock, label: 'Restricted', className: 'text-gray-600 bg-gray-100' },
};

export function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  const { icon: Icon, label, className } = config[visibility];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${className}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}
