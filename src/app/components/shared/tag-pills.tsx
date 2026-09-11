/**
 * @file tag-pills.tsx
 * @description P491: Shared TagPills component — renders tag pills as clickable links or display-only spans.
 *
 * Context-aware:
 * - 'feed' | 'profile' | 'detail': renders <Link to="/feed?tag=X"> with hover states
 * - 'live': renders <span> elements with muted styling, no interactivity
 *
 * Handles:
 * - Long tag truncation (>20 chars → ellipsis + title tooltip)
 * - Overflow (>8 tags → "+N more" pill)
 * - Empty/undefined tags gracefully
 */

import { Link } from 'react-router-dom';

export type TagPillsContext = 'feed' | 'live' | 'profile' | 'detail';

interface TagPillsProps {
  tags?: string[];
  /** P630: System tags to display alongside user tags */
  systemTags?: string[];
  context: TagPillsContext;
  /** Currently active tag filter — renders as no-op if clicked */
  activeTag?: string;
  className?: string;
}

const MAX_VISIBLE_TAGS = 8;

/* P1296 item 10 — pill text is `foreground/60`, not `muted-foreground`. Every pill sits on its
   own `bg-muted`, and muted-foreground on muted measured 4.40:1 — under AA's 4.5:1 for this
   14px text, on every surface a tag appears, not only the quoted point card where visual QA
   first measured it. foreground/60 over muted computes to about 5.1:1. */
const MAX_TAG_LENGTH = 20;

/**
 * Shared tag pills component.
 * Renders tags as clickable links (feed/profile/detail) or display-only spans (live).
 */
export function TagPills({ tags, systemTags, context, activeTag, className = '' }: TagPillsProps) {
  // P630: Merge user tags + system tags for display, deduplicated
  const allTags = [...new Set([...(tags || []), ...(systemTags || [])])];
  if (allTags.length === 0) return null;

  const isInteractive = context !== 'live';
  const visibleTags = allTags.slice(0, MAX_VISIBLE_TAGS);
  const overflowCount = allTags.length - MAX_VISIBLE_TAGS;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {visibleTags.map((tag) => {
        const displayTag = tag.length > MAX_TAG_LENGTH
          ? tag.slice(0, MAX_TAG_LENGTH) + '...'
          : tag;
        const isActive = activeTag === tag;

        if (!isInteractive) {
          return (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm text-foreground/60"
              title={tag.length > MAX_TAG_LENGTH ? tag : undefined}
            >
              #{displayTag}
            </span>
          );
        }

        if (isActive) {
          // Active tag in feed — render as non-interactive highlighted pill
          return (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 ring-1 ring-blue-300 px-2.5 py-0.5 text-sm"
              title={tag.length > MAX_TAG_LENGTH ? tag : undefined}
              aria-label={`Currently filtering by tag: ${tag}`}
            >
              #{displayTag}
            </span>
          );
        }

        return (
          <Link
            key={tag}
            to={`/feed?tag=${encodeURIComponent(tag)}`}
            className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm text-foreground/60 hover:bg-blue-50 hover:text-blue-600 transition-colors max-w-[200px] truncate"
            title={tag.length > MAX_TAG_LENGTH ? tag : undefined}
            aria-label={`Filter feed by tag: ${tag}`}
            onClick={(e) => e.stopPropagation()}
          >
            #{displayTag}
          </Link>
        );
      })}
      {overflowCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm text-foreground/60">
          +{overflowCount} more
        </span>
      )}
    </div>
  );
}
