import type { PositionType } from '@/app/types';

// Short labels for active button display (intensity notation).
// Lives outside PositionButton.tsx so callers don't trip react-refresh.
export const POSITION_SHORT_LABELS: Record<PositionType, string> = {
  strongly_disagree: 'Disagree+',
  disagree: 'Disagree',
  somewhat_disagree: 'Disagree−',
  unsure: 'Unsure',
  somewhat_agree: 'Agree−',
  agree: 'Agree',
  strongly_agree: 'Agree+',
};
