/**
 * P1520: the @ picker's matching, kept apart from the Composer component (Fast Refresh needs a component file to
 * export only components).
 */
import type { ReactNode } from 'react';

/**
 * P1520: one entry of the @ picker. Today only the viewer's own mirror ("<name> · Your mirror (private)"); P1521 adds
 * the channel's members to the same list. Picking an entry never inserts text: it switches the composer's mode.
 */
export interface MentionEntry {
  id: string;
  /** What the picker matches against and shows first (the mirror's name, or "Your mirror"). */
  label: string;
  /** Shown after the label; for the mirror it says it is private. */
  detail: string;
  mark: ReactNode;
  /** Extra words the typed query may match ("mirror" finds a mirror whatever it is called). */
  keywords?: string[];
}

/** The `@query` just before the caret, or null. A query has no spaces and starts a word. */
export function mentionQuery(text: string, caret: number): string | null {
  const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
  return m ? (m[1] ?? '') : null;
}

export function matchMentions(entries: MentionEntry[], query: string): MentionEntry[] {
  const q = query.toLowerCase();
  return entries.filter((e) => [e.label, ...(e.keywords ?? [])].some((w) => w.toLowerCase().startsWith(q)));
}
