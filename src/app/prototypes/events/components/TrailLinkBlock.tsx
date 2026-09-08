import { Mountain } from 'lucide-react';
import { safeLinkHref } from '../location-utils';

interface TrailLinkBlockProps {
  /** Null when the event has no route link — never a value the caller must remember not to render. */
  url: string | null;
}

/**
 * P1264: the hike's route link, as a button rather than a sentence buried in
 * the description — the same treatment P1194 gave the group chat.
 *
 * Deliberately NOT full width. The RSVP button is the page's one full-width
 * primary (P955); a second bar of the same size competes with it. This one
 * sizes to its own label, like GroupChatBlock.
 *
 * Deliberately has no locked state, unlike GroupChatBlock. The route is
 * decision-support for someone who has not yet registered — gating it behind
 * RSVP would defeat the reason it exists. It is either public (there is a
 * URL) or absent; there is no third state to render.
 */
export function TrailLinkBlock({ url }: TrailLinkBlockProps) {
  if (!url) return null;

  const href = safeLinkHref(url);
  if (!href) return null;

  return (
    <div className="mb-6">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="trail-link"
        className="inline-flex items-center justify-center gap-2.5 h-11 px-5 rounded-full font-semibold text-sm
          border border-border bg-card text-foreground hover:bg-muted transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Mountain className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        {/* Founder-chosen, P1264. Mirrors the page's existing "View on Maps" so the
            two external links read as a pair. Names the destination before the tap,
            which is the same reason GroupChatBlock carries the messaging app's mark. */}
        View on AllTrails
      </a>
    </div>
  );
}
