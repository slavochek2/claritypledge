/**
 * @file focus-header.tsx
 * @description Shared back button for focus/detail pages (story, point, agreement, chat).
 *
 * Focus pages hide the bottom nav and show this instead of inline per-page back buttons.
 * See docs/ux-patterns.md — "Browse vs Focus Navigation" pattern.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FocusHeaderProps {
  onBack: () => void;
  /** Custom label shown after the arrow. Defaults to "Back". */
  label?: string;
  /** Override the button's aria-label. Defaults to "Go back". */
  'aria-label'?: string;
}

export function FocusHeader({ onBack, label, 'aria-label': ariaLabel }: FocusHeaderProps) {
  return (
    <Button
      variant="ghost"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-11 px-3"
      aria-label={ariaLabel ?? 'Go back'}
    >
      <ArrowLeft className="w-4 h-4" />
      {label ?? 'Back'}
    </Button>
  );
}
