/**
 * @file canvas-audience.tsx
 * @description P1515: the one visibility idea of a Clarity Canvas, in words and in one icon.
 *
 * A canvas is Private; its owner chooses who else sees it. Everything inside inherits that: the
 * shared icon marks the canvas header, each point card and each story inside, and the composer says
 * who will read what is written. A point's or story's own public/private flag does not decide who
 * reads it on the canvas, so no per-item lock is shown here.
 *
 * The words are in src/lib/canvas-audience-copy.ts ([FOUNDER DECISION] copy).
 */
import { Users } from 'lucide-react';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';

/** The shared icon: small, quiet, named for screen readers and on hover or tap. */
export function SharedIcon({ label, className = '' }: { label: string; className?: string }) {
  return (
    <MobileTooltip content={label}>
      <span
        role="img"
        aria-label={label}
        data-testid="canvas-shared-icon"
        className={`inline-flex items-center align-text-bottom text-blue-600 ${className}`.trim()}
      >
        <Users size={14} aria-hidden="true" />
      </span>
    </MobileTooltip>
  );
}
