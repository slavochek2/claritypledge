/**
 * @file letter-primary-cta.tsx
 * @description P852: Shared primary CTA for the letter reading flow.
 *
 * Wraps a centered max-w-sm pill button matching the founder-approved preview
 * sizing. Replaces 5 inline Button instances across letter-flow-content.tsx
 * (Lock in your position ×2, Read story, Next point/chapter ×2) that were
 * w-full and read as edge-to-edge ("too big") on wider viewports.
 *
 * Icon placement: 'lock' = leading (commit semantics), 'arrow' = trailing
 * (advance semantics) — matches the existing inline patterns.
 *
 * Per-phase GATING (showAdvanceButton opacity transition on reveal phases,
 * label-computing IIFEs for "Next point" / "Next chapter" / "Complete Letter")
 * STAYS in the parent. This component owns the button only.
 */

import { Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LetterPrimaryCtaProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: 'lock' | 'arrow';
  /** 'primary' (default) = filled blue pill. 'secondary' = ghost/outline — demoted advance. */
  variant?: 'primary' | 'secondary';
  /** Escape hatch for one-off overrides; merged after the base classes. */
  className?: string;
}

export function LetterPrimaryCta({
  label,
  onClick,
  disabled = false,
  icon,
  variant = 'primary',
  className,
}: LetterPrimaryCtaProps) {
  return (
    <div className="w-full max-w-sm">
      <Button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'w-full rounded-full font-bold text-base min-h-[56px] gap-2',
          variant === 'primary'
            ? 'bg-[#0044CC] hover:bg-[#0033AA] text-white'
            : 'bg-transparent text-[#0044CC]/80 hover:text-[#0044CC] focus-visible:ring-[#0044CC]/40',
          className
        )}
      >
        {icon === 'lock' && <Lock className="w-4 h-4" aria-hidden="true" />}
        <span>{label}</span>
        {icon === 'arrow' && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
      </Button>
    </div>
  );
}
