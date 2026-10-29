/**
 * @file canvas-point-panel.tsx
 * @description The open point (or a box's list): a side panel on desktop, a full-screen sheet on mobile.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import type { CanvasBoxTag } from '@/lib/canvas-boxes';
import { BoxIcon } from './canvas-box-icon';

/**
 * The open point: a side panel on desktop, a full-screen sheet on mobile — modal on both. The
 * page behind is made `inert` (no focus, no clicks) and a backdrop closes it. Not the Radix
 * dialog: that one locks pointer events on <body>, and the position buttons' menu renders in a
 * portal on <body>, outside the panel. Escape and the close button dismiss it (below 1024px,
 * FocusHeader's back arrow); focus moves in and back. Previous / Next walk the canvas without
 * closing it.
 */
export function PointPanel({ children, onClose, label, viewKey, closeLabel = 'Close point', step, covered = false }: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  /** what the panel shows: a point's id, or `box:<tag>` for a box's list */
  viewKey: string;
  closeLabel?: string;
  step: { box?: string; boxTag?: CanvasBoxTag; onPrevious?: () => void; onNext?: () => void };
  /** A dialog the page opened over the panel (the story composer): its keys are its own. */
  covered?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Read at keydown: the composer's Escape closes it first, and focus falls to <body> before
  // this listener runs — without this, the same Escape would close the panel too (review).
  const coveredRef = useRef(covered);
  coveredRef.current = covered;
  // What is on screen when the panel closes (Previous / Next change it), for returning focus.
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // The box cards remount when the panel closes (a re-read), so the opener is found again by
    // its id ("N more") or its test id (a card, unique per point) rather than kept as an element.
    const openerTestId = opener?.getAttribute('data-testid');
    const openerSelector = opener?.id
      ? `#${CSS.escape(opener.id)}`
      : openerTestId ? `#root [data-testid="${CSS.escape(openerTestId)}"]` : null;
    panelRef.current?.focus();
    // Escape closes the panel — unless focus is in something the card opened above it (the share
    // sheet, a confirmation), which handles its own Escape.
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || coveredRef.current) return;
      // Something inside handled this Escape already (the spread's info popover, an expanded
      // story): it closes only that.
      // Focus on <body> is still "in" the panel: it is modal and #root is inert, so focus can only
      // land there by falling out of it — a popover that closed, a control that went away (review).
      const inPanel = panel.contains(document.activeElement) || document.activeElement === document.body;
      if (e.key === 'Escape' && !e.defaultPrevented && inPanel) onCloseRef.current();
      // Tab wraps inside the panel (the page behind is inert; this keeps focus off the browser
      // chrome too). Only while focus is in the panel — a dialog the card opened keeps its own.
      if (e.key === 'Tab' && inPanel) {
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        )).filter(el => el.offsetParent !== null);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (!panel.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      // The card of the point on screen at close (a box's list: none); else whatever opened the
      // panel, such as "N more" (never <body>, which is what a panel opened from the address starts with).
      const card = document.querySelector<HTMLElement>(`[data-testid="canvas-point-card-${viewKeyRef.current}"]`);
      const reopened = openerSelector ? document.querySelector<HTMLElement>(openerSelector) : null;
      const target = card ?? (opener?.isConnected && opener !== document.body ? opener : reopened);
      target?.focus?.();
    };
    // Opened once per panel; stepping to another point keeps it open (and keeps the opener).
  }, []);

  // A new point (or a box's list) starts at its top. Stepping to the first or last point removes the button just
  // pressed, which drops focus to <body> (outside the panel, where Escape and Tab no longer
  // reach it): take focus back into the panel.
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [viewKey]);

  /* Portalled to the end of <body>, outside the inert #root: above the fixed top nav and
     BottomNav (also z-50, but earlier in the document), and still below the menus and dialogs
     the card opens from inside it, which portal in later. */
  return createPortal(
    <>
      <div aria-hidden data-testid="canvas-panel-backdrop" onClick={onClose} className="fixed inset-0 z-50 hidden bg-black/20 lg:block" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-testid="canvas-point-panel"
        className="fixed inset-0 z-50 flex flex-col bg-background outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] lg:border-l lg:border-border lg:shadow-xl"
      >
        {/* Founder, sixth round: the box name read smaller than the card under it. It is the
            breadcrumb: the box's own icon (as on the canvas), one size up, in a header bar. */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-muted/20 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          {/* Below 1024px the sheet fills the screen: the focus pages' back arrow, closing the
              panel (never leaving the canvas — P1364 drift-guard allowlist). */}
          <span className="pl-2 lg:hidden" data-testid="canvas-panel-back">
            <FocusHeader compact onBack={onClose} aria-label={closeLabel} />
          </span>
          {/* Which box this point sits in: Previous / Next cross from box to box. */}
          <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2" data-testid="canvas-panel-box">
            {step.boxTag && <BoxIcon tag={step.boxTag} />}
            {/* P1535: box titles run to 35 characters; two lines fit them at 320px. */}
            <span className="line-clamp-2 break-words text-base font-semibold tracking-tight text-foreground">{step.box}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="canvas-panel-close"
            className="hidden h-11 w-11 items-center justify-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:flex"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* px-2 on phones: the position buttons drop their labels below a 270px row, and the
            card's own padding and pin column leave about that much at 375px. */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-4">{children}</div>
        {(step.onPrevious || step.onNext) && <nav
          aria-label="Points on this canvas"
          className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]"
        >
          {/* At either end the step is absent, not disabled (no dead controls, P955). Outline: a
              real alternative to reading on (R6). */}
          {step.onPrevious ? (
            <Button variant="outline" onClick={step.onPrevious} className="min-h-11 gap-1 border-blue-600 px-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700" data-testid="canvas-panel-previous">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </Button>
          ) : <span />}
          {step.onNext && (
            <Button variant="outline" onClick={step.onNext} className="min-h-11 gap-1 border-blue-600 px-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700" data-testid="canvas-panel-next">
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </nav>}
      </div>
    </>,
    document.body,
  );
}
