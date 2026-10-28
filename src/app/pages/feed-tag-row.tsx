/**
 * @file feed-tag-row.tsx
 * @description The feed's tag row: a placeholder while the feed loads, the tag cloud once it has tags.
 * Split out of feed-page.tsx (P1586).
 */

import { Skeleton } from '@/components/ui/skeleton';

interface FeedTagRowProps {
  loading: boolean;
  tagCloud: string[];
  /** How many tags show before "More tags" (owned by feed-page.tsx, P1392). */
  limit: number;
  activeTags: string[];
  showAllTags: boolean;
  onToggleShowAll: () => void;
  onTagClick: (tag: string) => void;
}

export function FeedTagRow({ loading, tagCloud, limit, activeTags, showAllTags, onToggleShowAll, onTagClick }: FeedTagRowProps) {
  return (
    <>
      {/* P1406: while loading, hold the tag row's height so the tabs don't jump down. */}
      {loading && <Skeleton className="mb-4 h-6 w-2/3 rounded-full" data-testid="tag-cloud-placeholder" />}

      {/* Tag cloud (only when we have tags and not loading) */}
      {!loading && tagCloud.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(showAllTags ? tagCloud : tagCloud.slice(0, limit)).map((tag) => {
            const isActive = activeTags.includes(tag);
            return (
              <button
                key={tag}
                role="checkbox"
                aria-checked={isActive}
                onClick={() => onTagClick(tag)}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                    : 'bg-muted text-muted-foreground hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                #{tag}
              </button>
            );
          })}
          {tagCloud.length > limit && (
            <button
              onClick={onToggleShowAll}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm text-blue-600 hover:underline"
            >
              {showAllTags ? 'Fewer tags' : `More tags (${tagCloud.length - limit})`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
