/**
 * P1445 D — the position control's groups and labels, shared by the presentational PositionButtons
 * and CP's single PositionButton (a constants module of its own, so both component files only export
 * components — react-refresh).
 */
import type { PositionType, PositionButtonGroup } from '@/app/types';
import { Check, X, HelpCircle } from 'lucide-react';

// Position labels for display (full - used in dropdowns)
export const POSITION_LABELS: Record<PositionType, string> = {
  strongly_disagree: 'Strongly Disagree',
  disagree: 'Disagree',
  somewhat_disagree: 'Somewhat Disagree',
  unsure: 'Unsure',
  somewhat_agree: 'Somewhat Agree',
  agree: 'Agree',
  strongly_agree: 'Strongly Agree',
};


// Button group configuration
export interface ButtonGroupConfig {
  label: string;
  icon: typeof Check;
  defaultPosition: PositionType;
  positions: PositionType[];
  activeClass: string;
  inactiveClass: string;
}

export const BUTTON_GROUPS: Record<PositionButtonGroup, ButtonGroupConfig> = {
  disagree: {
    label: 'Disagree',
    icon: X,
    defaultPosition: 'disagree',
    positions: ['somewhat_disagree', 'disagree', 'strongly_disagree'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
  unsure: {
    label: 'Unsure',
    icon: HelpCircle,
    defaultPosition: 'unsure',
    positions: ['unsure'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
  agree: {
    label: 'Agree',
    icon: Check,
    defaultPosition: 'agree',
    positions: ['somewhat_agree', 'agree', 'strongly_agree'],
    activeClass: 'bg-blue-600 text-white',
    inactiveClass: 'bg-white text-gray-700 hover:bg-gray-50',
  },
};

