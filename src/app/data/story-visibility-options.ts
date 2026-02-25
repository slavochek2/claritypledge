import { GlobeIcon, LockIcon, UsersIcon } from 'lucide-react';
import type { StoryVisibility } from '@/app/types';

export const VISIBILITY_OPTIONS: {
  value: StoryVisibility;
  icon: typeof GlobeIcon;
  label: string;
  tooltip: string;
}[] = [
  { value: 'public', icon: GlobeIcon, label: 'Public', tooltip: 'Anyone can view this.' },
  {
    value: 'shared',
    icon: UsersIcon,
    label: 'Shared',
    tooltip:
      "Visible to anyone who has registered for an event you've also registered for or hosted — including future registrants.",
  },
  { value: 'private', icon: LockIcon, label: 'Private', tooltip: 'Only people you explicitly share with can view this.' },
];
