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
}

export function FocusHeader({ onBack, label }: FocusHeaderProps) {
  return (
    <Button
      variant="ghost"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-[44px] px-3"
      aria-label="Go back"
    >
      <ArrowLeft size={16} />
      {label ?? 'Back'}
    </Button>
  );
}
