/**
 * @file focus-header.tsx
 * @description Shared back button for focus/detail pages (story, point, agreement, chat).
 *
 * Focus pages hide the bottom nav and show this instead of inline per-page back buttons.
 * See docs/ux-patterns.md — "Browse vs Focus Navigation" pattern.
 *
 * P1364 — Back is DECLARED, not hand-written. A page passes `fallback` (where a reader with no
 * prior history entry goes) and this component calls `useGoBack(fallback)` itself, so it
 * returns to wherever the reader came from — including a page outside the app — and only a
 * cold arrival goes to the fallback. `onBack` stays for the allowlisted in-flow and guarded
 * cases only (see src/tests/p1364-back-drift-guard.test.ts).
 *
 * With `fallback` the label is always "Back": a destination-specific label ("Back to profile",
 * …) is false once the control pops history, so that variant takes no label. Only an in-flow
 * `onBack` caller (a prototype step, a wizard) may still name its step.
 *
 * `compact` (P1337 walkthrough 8): the arrow alone, no label and no bottom margin — for a header
 * row that already carries the page's own chrome (the event room's step bar), as /prepare does.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoBack } from '@/app/hooks/use-go-back';

type FocusHeaderProps =
  | {
      /** Cold-arrival target: used only when this page is the tab's first history entry. */
      fallback: string;
      onBack?: never;
      label?: never;
      'aria-label'?: never;
    }
  | {
      /** In-flow step or guarded back ONLY — allowlisted in the P1364 drift guard. */
      onBack: () => void;
      fallback?: never;
      /** In-flow only: custom label shown after the arrow. Defaults to "Back". */
      label?: string;
      /** In-flow only: override the button's aria-label. Defaults to "Go back". */
      'aria-label'?: string;
    };

export function FocusHeader({
  compact = false,
  ...props
}: FocusHeaderProps & { /** Arrow only, no label, no bottom margin. */ compact?: boolean }) {
  const { fallback, onBack, label, 'aria-label': ariaLabel } = props;
  // Hooks run unconditionally; with `onBack` the fallback is never used.
  const goBack = useGoBack(fallback ?? '/');
  return (
    <Button
      variant="ghost"
      onClick={onBack ?? goBack}
      className={
        compact
          ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-muted-foreground hover:text-foreground -ml-2'
          : 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-11 px-3'
      }
      aria-label={ariaLabel ?? 'Go back'}
      data-testid={compact ? 'room-back' : undefined}
    >
      <ArrowLeft className={compact ? 'h-5 w-5' : 'w-4 h-4'} />
      {!compact && (label ?? 'Back')}
    </Button>
  );
}
