import { useContext, type ReactNode } from "react";
import { CompactContext } from "./compact";
import { LEAD, TITLE } from "./ui";

/**
 * A screen's title or lead: the element every beat must show whole (`data-first`).
 *
 * Normally it renders in its type role. On a compact screen it becomes a sticky header at
 * the top of the panel instead: 17px at weight 600, on the solid page colour, with a 1px
 * divider under it, and `extra` (the demo's "Made-up example") pinned with it. Content
 * scrolls under it and is clipped at the divider.
 */
export function Heading({
  text,
  role,
  compactText,
  extra,
  level = 1,
  enterClass = "",
}: {
  text: string;
  role: "title" | "lead";
  compactText?: string;
  extra?: ReactNode;
  level?: 1 | 2;
  enterClass?: string;
}) {
  const compact = useContext(CompactContext);
  const Tag = level === 1 ? "h1" : "h2";
  if (compact) {
    return (
      <div data-sticky className="sticky top-0 z-10 border-b border-white/15 bg-[#03050b] pb-1.5">
        <Tag data-first className="text-[17px] font-semibold leading-snug text-white">
          {compactText ?? text}
        </Tag>
        {extra}
      </div>
    );
  }
  const shown = role === "title" ? TITLE : LEAD;
  return (
    <div className={enterClass}>
      {role === "lead" && level === 1 ? (
        <p data-first className={shown}>
          {text}
        </p>
      ) : (
        <Tag data-first className={shown}>
          {text}
        </Tag>
      )}
      {extra}
    </div>
  );
}
