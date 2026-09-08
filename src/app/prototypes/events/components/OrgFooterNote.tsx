import { renderMarkdownSafe } from '@/lib/markdown';

interface OrgFooterNoteProps {
  /** Null when the org has no standing note — never a value the caller must remember not to render. */
  note: string | null;
}

/**
 * P1264: the organiser's standing note, as the last block on every event page.
 *
 * It began as a hand-typed "PS." paragraph at the end of one hike's description.
 * Two things were wrong with that. The words are the same on every event the org
 * runs, so per-event text means retyping and drift; and anything inside the
 * description necessarily renders BEFORE the blocks that follow it, so the aside
 * could never sit where an aside belongs — after the group-chat button.
 *
 * Rendered through renderMarkdownSafe like the description, so a link here gets
 * the same protocol allowlist. Deliberately NOT given the description's chip
 * treatment: this is a remark, not an action, and a solid pill inside it reads as
 * an advert (the same call the founder made for the link when it lived inline).
 * The `event-org-note` class carries plain-link styling instead.
 *
 * Rendered as a sibling card BELOW the event card, not as the closing paragraph
 * inside it — the words are identical on every event the org runs, so sitting
 * inside one event's description made a standing note read as this hike's
 * sign-off. No heading: it is a footnote to the page, and a section header would
 * promote it to the rank of "What to bring".
 */
export function OrgFooterNote({ note }: OrgFooterNoteProps) {
  if (!note || note.trim().length === 0) return null;

  return (
    <div
      className="event-org-note prose prose-sm max-w-none text-muted-foreground text-sm italic bg-card rounded-xl border border-border shadow-sm p-6 mb-6"
      data-testid="org-footer-note"
      dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(note) }}
    />
  );
}
