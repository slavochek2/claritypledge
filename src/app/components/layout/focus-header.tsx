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
 * P1512 — inside the signed-in shell the (non-compact) Back is rendered INTO the shell's top bar, left slot,
 * through a portal, so every page's Back sits at one position with no per-page edit; outside the shell it
 * renders where it is written, exactly as before. `parentName` ("Groups") names the parent ("← Groups")
 * ONLY when Back will actually go there: on a cold arrival, where useGoBack takes the fallback. When
 * it will pop (there is an earlier app entry) the control returns to wherever the reader came from —
 * chat, a profile, anywhere — so it says just "Back" (aria "Go back"). The label and the click read
 * the same decision (useGoBackControl), so they cannot disagree.
 *
 * `compact` (P1337 walkthrough 8): the arrow alone, no label and no bottom margin — for a header
 * row that already carries the page's own chrome (the event room's step bar), as /prepare does.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoBackControl } from '@/app/hooks/use-go-back';
import { ShellBarPortal } from '@/app/components/layout/app-shell/shell-top-bar';
import { useShellBarSlot } from '@/app/components/layout/app-shell/shell-top-bar-context';

type FocusHeaderProps =
  | {
      /** Cold-arrival target: used only when this page is the tab's first history entry. */
      fallback: string;
      /** The parent page's name for the shell bar's "← Groups"; omitted means "← Back". */
      parentName?: string;
      onBack?: never;
      label?: never;
      'aria-label'?: never;
    }
  | {
      /** In-flow step or guarded back ONLY — allowlisted in the P1364 drift guard. */
      onBack: () => void;
      fallback?: never;
      parentName?: never;
      /** In-flow only: custom label shown after the arrow. Defaults to "Back". */
      label?: string;
      /** In-flow only: override the button's aria-label. Defaults to "Go back". */
      'aria-label'?: string;
    };

export function FocusHeader({
  compact = false,
  ...props
}: FocusHeaderProps & { /** Arrow only, no label, no bottom margin. */ compact?: boolean }) {
  const { fallback, onBack, label, parentName, 'aria-label': ariaLabel } = props;
  // Hooks run unconditionally; with `onBack` the fallback is never used.
  const { goBack, willPop, fallbackPath } = useGoBackControl(fallback ?? '/');
  const { inShell } = useShellBarSlot('left');
  const inBar = inShell && !compact;
  // Truthful label: the parent is named only when Back will actually go there (a cold arrival, which takes
  // the fallback). When it will pop, it goes wherever the reader came from, so it just says "Back".
  // The event-night fallback swaps the target for the room, so the parent is named only when the effective
  // fallback is still the page's own.
  const namesParent = !!parentName && !willPop && fallbackPath === (fallback ?? '/');
  const text = namesParent ? parentName : (label ?? 'Back');
  const button = (
    <Button
      type="button"
      variant="ghost"
      onClick={onBack ?? goBack}
      className={
        compact
          ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-foreground hover:bg-muted -ml-2'
          : inBar
            ? // In the shell bar: no bottom margin, 40px target, arrow flush with the content edge.
              'inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-3 px-3'
            : 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-11 px-3'
      }
      aria-label={ariaLabel ?? (namesParent ? `Back to ${parentName}` : 'Go back')}
      data-testid={compact ? 'room-back' : undefined}
    >
      <ArrowLeft className={compact ? 'h-5 w-5' : 'w-4 h-4'} />
      {!compact && text}
    </Button>
  );
  // The compact (room) Back is part of a row the page draws itself; it never moves into the bar.
  return compact ? button : <ShellBarPortal side="left">{button}</ShellBarPortal>;
}
