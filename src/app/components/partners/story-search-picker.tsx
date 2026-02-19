import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { StoryWithPoints } from '@/app/types';

interface StorySearchPickerProps {
  stories: StoryWithPoints[];
  onSelectStory: (storyId: string, title: string) => void;
  disabled?: boolean;
}

export function StorySearchPicker({ stories, onSelectStory, disabled = false }: StorySearchPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close results when clicking outside the container
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  if (stories.length === 0) {
    return null;
  }

  const filtered = query
    ? stories.filter((story) => story.content.toLowerCase().includes(query.toLowerCase()))
    : [];

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    setOpen(value.length > 0);
  }

  function handleSelect(story: StoryWithPoints) {
    const preview = story.content.length > 80 ? story.content.slice(0, 80) + '…' : story.content;
    onSelectStory(story.id, preview);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={() => {
            if (query.length > 0) setOpen(true);
          }}
          disabled={disabled}
          placeholder="Search your stories…"
          aria-label="Search your stories."
          className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Results dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="max-h-[280px] overflow-y-auto">
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
          </div>
        </div>
      )}
    </div>
  );
}
