import type { PositionType } from '../../../shared/types';

interface PositionBadgeProps {
  position: PositionType;
  /** Use plural form: "Agrees" vs "Agree" */
  plural?: boolean;
  /** Variant: 'badge' for pill style, 'label' for inline colored text */
  variant?: 'badge' | 'label';
}

/**
 * Displays a position as either a badge pill or inline colored label.
 *
 * Badge variant: gray pill with "Agrees"/"Disagrees"/"Unsure"
 * Label variant: inline colored text "Agree"/"Disagree"/"Unsure"
 */
export function PositionBadge({
  position,
  plural = true,
  variant = 'badge'
}: PositionBadgeProps) {
  const config = {
    agree: {
      singular: 'Agree',
      plural: 'Agrees',
      labelClass: 'text-blue-600'
    },
    disagree: {
      singular: 'Disagree',
      plural: 'Disagrees',
      labelClass: 'text-slate-600'
    },
    dont_know: {
      singular: 'Unsure',
      plural: 'Unsure',
      labelClass: 'text-gray-500'
    },
  };

  const c = config[position];
  const label = plural ? c.plural : c.singular;

  if (variant === 'label') {
    return <span className={c.labelClass}>{label}</span>;
  }

  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
      {label}
    </span>
  );
}
