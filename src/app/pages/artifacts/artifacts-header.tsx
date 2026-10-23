/**
 * @file artifacts-header.tsx
 * @description P1545 WP3: the Artifacts title row. Title, a search icon that expands IN PLACE (the title
 * and "New artifact" never move), and the New artifact menu (Letter private / public as today's draft
 * menu, then Canvas).
 */
import { useEffect, useRef } from 'react';
import { Globe, LayoutDashboard, Lock, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ContentVisibility } from '@/app/types';

const ICON_BUTTON =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
  searchOpen: boolean;
  query: string;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onQuery: (q: string) => void;
  creating: boolean;
  onCreateLetter: (visibility: ContentVisibility) => void;
}

export function ArtifactsHeader({ searchOpen, query, onOpenSearch, onCloseSearch, onQuery, creating, onCreateLetter }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <header data-page-header className="mb-4 flex min-h-10 items-center gap-2">
      <h1 className="shrink-0 text-xl font-bold text-foreground sm:text-2xl">Artifacts</h1>

      {/* The search takes the free space between the title and the button: an icon at its right end when
          closed, a field filling it when open. Neither neighbour moves. */}
      <div className="flex min-w-0 flex-1 justify-end">
        {searchOpen ? (
          <div className="relative w-full min-w-0 sm:max-w-sm" role="search">
            {/* The magnifier is dropped on phones: the field needs the room (it sits between the title and New). */}
            <Search className="pointer-events-none absolute left-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground sm:block" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => onQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onCloseSearch(); }}
              placeholder="Search titles"
              aria-label="Search artifacts by title"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background pl-3 pr-9 text-base sm:pl-8 sm:pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              type="button"
              onClick={onCloseSearch}
              aria-label="Close search"
              className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onOpenSearch} aria-label="Search artifacts" className={ICON_BUTTON}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="New artifact" className="h-10 shrink-0 gap-1.5 bg-blue-500 px-3 text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">New artifact</span>
            <span className="sm:hidden">New</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={16} className="w-72 max-w-[calc(100vw-32px)]">
          <DropdownMenuItem disabled={creating} onSelect={() => onCreateLetter('private')} className="min-h-12 items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Letter (private draft)</span>
              <span className="text-xs text-muted-foreground">Only people you share with can see this</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={creating} onSelect={() => onCreateLetter('public')} className="min-h-12 items-start gap-3">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Letter (public draft)</span>
              <span className="text-xs text-muted-foreground">Visible on your profile</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* [FOUNDER DECISION: copy] No canvas can be created from the app yet: a canvas is its owner's points
              under a reserved `canvas_<name>` tag that only the service role writes, and an owner's canvas with
              no points reads as not found. P1536 (a new mirror thread) is the creation flow; until it lands the
              entry is visible and says so instead of leading to a dead page. */}
          <DropdownMenuItem disabled className="min-h-12 items-start gap-3">
            <LayoutDashboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Canvas</span>
              <span className="text-xs text-muted-foreground">Not available yet</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
