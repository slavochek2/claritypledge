import { GlobeIcon, LockIcon } from 'lucide-react';
import type { StoryVisibility } from '@/app/types';

export const VISIBILITY_OPTIONS: {
  value: StoryVisibility;
  icon: typeof GlobeIcon;
  label: string;
  tooltip: string;
}[] = [
  { value: 'public', icon: GlobeIcon, label: 'Public', tooltip: 'Anyone can view this.' },
  { value: 'private', icon: LockIcon, label: 'Private', tooltip: 'Only people you explicitly share with can view this.' },
];
