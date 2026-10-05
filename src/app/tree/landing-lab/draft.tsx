import type { ReactNode } from "react";

const UNDERLINE = "underline decoration-dotted decoration-1 underline-offset-4";

/**
 * Marks agent-written placeholder copy so the founder can tell it apart from his own
 * words at a glance. Dotted underline plus a small "draft" tag. Founder-authored lines
 * are rendered bare.
 *
 * The tag has a FIXED size. Sized relative to its parent it grew with a headline and
 * collided with the last line of it.
 *
 * The tag carries the full colour of its text. Dimmed, it measured under 3.4:1 contrast.
 *
 * The tag is also bound to the LAST WORD of the text, so a line break can never fall
 * between the text and its tag. Left free, the tag wrapped onto a line of its own.
 */
export function Draft({ children }: { children: ReactNode }) {
  const tag = (
    <span
      aria-hidden
      className="ml-1 inline-block align-top text-[9px] font-medium uppercase leading-none tracking-wider no-underline"
    >
      draft
    </span>
  );

  if (typeof children === "string") {
    const text = children.trimEnd();
    const cut = text.lastIndexOf(" ");
    const head = cut === -1 ? "" : text.slice(0, cut + 1);
    const lastWord = cut === -1 ? text : text.slice(cut + 1);
    return (
      <span data-draft-copy title="Agent draft. Founder decision.">
        {head && <span className={UNDERLINE}>{head}</span>}
        <span className="whitespace-nowrap">
          <span className={UNDERLINE}>{lastWord}</span>
          {tag}
        </span>
      </span>
    );
  }

  return (
    <span data-draft-copy title="Agent draft. Founder decision.">
      <span className={UNDERLINE}>{children}</span>
      {tag}
    </span>
  );
}
