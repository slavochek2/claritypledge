import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { StoryWithPoints } from '@/app/types';

interface StorySearchPickerProps {
  stories: StoryWithPoints[];
  onSelectStory: (storyId: string, title: string) => void;
  disabled?: boolean;
  /** P600: Called when user dismisses the picker */
  onCancel?: () => void;
}

export function StorySearchPicker({ stories, onSelectStory, disabled = false, onCancel }: StorySearchPickerProps) {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // P600: Auto-focus input when picker mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (stories.length === 0) {
    return null;
  }

  // Show all stories when query is empty, filter when typing
  const filtered = query
    ? stories.filter((story) => story.content.toLowerCase().includes(query.toLowerCase()))
    : stories;

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
  }

  function handleSelect(story: StoryWithPoints) {
    const preview = story.content.length > 80 ? story.content.slice(0, 80) + '…' : story.content;
    onSelectStory(story.id, preview);
    setQuery('');
  }

  function handleCancel() {
    setQuery('');
    onCancel?.();
  }

  return (
    <div ref={containerRef} className="w-full max-w-xs mx-auto">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          disabled={disabled}
          placeholder="Search your stories…"
          aria-label="Search your stories."
          className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Results — always visible when picker is shown */}
      <div className="mt-1 w-full rounded-md border border-border bg-popover shadow-md">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground px-3 py-2">
            No stories match &ldquo;{query}&rdquo;
          </p>
        ) : (
          filtered.slice(0, 6).map((story) => {
            const preview =
              story.content.length > 80 ? story.content.slice(0, 80) + '…' : story.content;
            const pointCount = story.points.length;
            return (
              <button
                key={story.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(story)}
                aria-label={story.content}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex-1 truncate text-foreground">{preview}</span>
                <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                  {pointCount} {pointCount === 1 ? 'point' : 'points'}
                </span>
              </button>
            );
          })
        )}
        {/* Cancel button */}
        <button
          type="button"
          onClick={handleCancel}
          className="w-full text-center px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-b-md border-t border-border transition-colors min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
