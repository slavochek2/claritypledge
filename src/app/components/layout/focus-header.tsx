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

export function FocusHeader({ fallback, onBack, label, 'aria-label': ariaLabel }: FocusHeaderProps) {
  // Hooks run unconditionally; with `onBack` the fallback is never used.
  const goBack = useGoBack(fallback ?? '/');
  return (
    <Button
      variant="ghost"
      onClick={onBack ?? goBack}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-11 px-3"
      aria-label={ariaLabel ?? 'Go back'}
    >
      <ArrowLeft className="w-4 h-4" />
      {label ?? 'Back'}
    </Button>
  );
}
