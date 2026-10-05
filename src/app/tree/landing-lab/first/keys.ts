/**
 * The keyboard rule for advancing, from JOURNEY.md section 4:
 * Space, Enter and the down arrow advance only when focus is on the page body or on Next.
 * Anywhere else (a link, a fork button, a text field) the key keeps its ordinary meaning.
 *
 * Focus on Next is split in two. Enter and Space already press a focused button, so the
 * page leaves them to the button ("native"); handling them again would advance twice.
 * The down arrow does nothing on a button by itself, so the page handles it ("advance").
 */

export type FocusTarget = "body" | "next" | "other";

export type KeyAction = "advance" | "native" | "ignore";

export interface KeyInput {
  key: string;
  focus: FocusTarget;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  /** Held-down key repeating. One press is one step. */
  repeat?: boolean;
}

const ADVANCE_KEYS = new Set([" ", "Spacebar", "Enter", "ArrowDown"]);

export function keyAction(input: KeyInput): KeyAction {
  if (!ADVANCE_KEYS.has(input.key)) return "ignore";
  if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return "ignore";
  if (input.repeat) return "ignore";
  if (input.focus === "other") return "ignore";
  if (input.focus === "next" && input.key !== "ArrowDown") return "native";
  return "advance";
}

/** Classifies the focused element against the page body and the Next button. */
export function focusTarget(active: Element | null, doc: Document, nextButton: Element | null): FocusTarget {
  if (active === null || active === doc.body || active === doc.documentElement) return "body";
  if (nextButton !== null && active === nextButton) return "next";
  return "other";
}
