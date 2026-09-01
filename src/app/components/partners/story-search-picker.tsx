import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { StoryWithPoints } from '@/app/types';

interface StorySearchPickerProps {
  stories: StoryWithPoints[];
  onSelectStory: (storyId: string, title: string) => void;
  disabled?: boolean;
  onCancel?: () => void;
}

export function StorySearchPicker({ stories, onSelectStory, disabled = false, onCancel }: StorySearchPickerProps) {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when picker mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click-outside dismiss
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel?.();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onCancel]);

  if (stories.length === 0) return null;

  const filtered = query
    ? stories.filter((story) => story.content.toLowerCase().includes(query.toLowerCase()))
    : stories;

  function handleSelect(story: StoryWithPoints) {
    const preview = story.content.length > 80 ? story.content.slice(0, 80) + '…' : story.content;
    onSelectStory(story.id, preview);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="w-full max-w-xs mx-auto">
      {/* Search input — prototype-style rounded with blue focus ring */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Search your stories…"
          aria-label="Search your stories."
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 disabled:opacity-50"
        />
      </div>

      {/* Story cards — individually styled like prototype */}
      <div className="mt-2 space-y-1.5">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            No stories match &ldquo;{query}&rdquo;
          </p>
        ) : (
          filtered.slice(0, 6).map((story) => {
            const preview = story.content.length > 80 ? story.content.slice(0, 80) + '…' : story.content;
            const pointCount = story.points.length;
            return (
              <button
                key={story.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelect(story)}
                className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-gray-300 text-sm transition-all disabled:opacity-50"
              >
                <span className="block truncate text-foreground">{preview}</span>
                {pointCount > 0 && (
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {pointCount} {pointCount === 1 ? 'point' : 'points'}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Cancel */}
      <button
        type="button"
        onClick={() => { setQuery(''); onCancel?.(); }}
        className="text-xs text-gray-400 hover:text-gray-600 mx-auto block mt-3 min-h-[44px] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
