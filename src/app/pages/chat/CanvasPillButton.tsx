/**
 * @file CanvasPillButton.tsx
 * @description The canvas thread's one secondary action under a message (Try again; Review terms is a filled Button, design-system rule 8): the design system's <Button> in the canvas
 * secondary pill look, disabled with `busyLabel` while its action runs.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { cn } from '@/lib/utils';

export function CanvasPillButton({ label, busyLabel, busy = false, onClick, testId, className }: {
  label: ReactNode; busyLabel?: ReactNode; busy?: boolean; onClick: () => void; testId: string; className?: string;
}) {
  return (
    <Button type="button" variant="outline" className={cn(CANVAS_SECONDARY_PILL, className)} disabled={busy} aria-busy={busy} onClick={onClick} data-testid={testId}>
      {busy && busyLabel ? busyLabel : label}
    </Button>
  );
}
