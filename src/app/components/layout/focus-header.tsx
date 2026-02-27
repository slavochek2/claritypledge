/**
 * @file focus-header.tsx
 * @description Shared back-navigation header for focus/detail pages.
 *
 * Focus pages (story detail, point detail, agreement, chat) hide the bottom
 * nav and show this header instead. See docs/ux-patterns.md — Navigation Architecture.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FocusHeaderProps {
  onBack: () => void;
}

export function FocusHeader({ onBack }: FocusHeaderProps) {
  return (
    <Button
      variant="ghost"
      onClick={onBack}
      className="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-[44px] px-3"
      aria-label="Go back"
    >
      <ArrowLeft size={16} />
      Back
    </Button>
  );
}
