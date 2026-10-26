/**
 * @file artifacts-header.tsx
 * @description P1545 WP3: the Artifacts title row. Title, a search icon that expands IN PLACE (the title
 * and "New letter" never move), and, on the Letters tab only, the blue "New letter" button. A tap asks
 * "Who can read it?" (Private: only people you send it to; Public: anyone with the link; the draft's
 * visibility is set at creation and governs who can see its stories). Canvases show no New until P1536.
 */
import { useEffect, useRef, useState } from 'react';
import { Globe, Lock, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ContentVisibility } from '@/app/types';

const ICON_BUTTON =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
  searchOpen: boolean;
  query: string;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onQuery: (q: string) => void;
  /** The Letters tab is showing: only then is there a New button. */
  showNewLetter: boolean;
  creating: boolean;
  onCreateLetter: (visibility: ContentVisibility) => void;
}

export function ArtifactsHeader({ searchOpen, query, onOpenSearch, onCloseSearch, onQuery, showNewLetter, creating, onCreateLetter }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [askOpen, setAskOpen] = useState(false);
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <header data-page-header className="mb-4 flex min-h-10 items-center gap-1.5 sm:gap-2">
      <h1 className="shrink-0 text-xl font-bold text-foreground sm:text-2xl">Artifacts</h1>

      {/* The search takes the free space between the title and the button: an icon at its right end when
          closed, a field filling it when open. Neither neighbour moves. */}
      <div className="flex min-w-0 flex-1 justify-end">
        {searchOpen ? (
          <div className="relative w-full min-w-[130px] sm:max-w-sm" role="search">
            {/* One field at every width: a compact magnifier, then the text. */}
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => onQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onCloseSearch(); }}
              placeholder="Search titles"
              aria-label="Search artifacts by title"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background pl-7 pr-10 text-base focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              type="button"
              onClick={onCloseSearch}
              aria-label="Close search"
              className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600"
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

      {showNewLetter && (
        <Button
          aria-label="New letter"
          disabled={creating}
          onClick={() => setAskOpen(true)}
          className="h-10 shrink-0 gap-1.5 px-2.5 sm:px-3"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {/* "New letter" from 360px up, "New" below. With the search field open the long label waits for sm and the
              narrowest phones drop to the "+", so the field keeps its width. */}
          <span className={searchOpen ? 'hidden sm:inline' : 'hidden min-[360px]:inline'}>New letter</span>
          <span className={searchOpen ? 'sm:hidden max-[340px]:hidden' : 'min-[360px]:hidden'}>New</span>
        </Button>
      )}

      {/* No close animation, as ConfirmDialog (a close that lands in a hidden tab would leave the page unclickable). */}
      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent
          hideCloseButton
          aria-describedby={undefined}
          className="w-[calc(100%-2rem)] max-w-sm rounded-xl shadow-xl sm:rounded-xl data-[state=closed]:!animate-none"
          overlayClassName="data-[state=closed]:!animate-none"
        >
          <DialogHeader>
            <DialogTitle>Who can read it?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" disabled={creating} className="h-auto min-h-14 flex-col items-start justify-center gap-0.5 py-2" onClick={() => { setAskOpen(false); onCreateLetter('private'); }}>
              <span className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" aria-hidden="true" />Private</span>
              <span className="pl-6 text-sm font-normal text-muted-foreground">Only people you send it to</span>
            </Button>
            <Button variant="outline" disabled={creating} className="h-auto min-h-14 flex-col items-start justify-center gap-0.5 py-2" onClick={() => { setAskOpen(false); onCreateLetter('public'); }}>
              <span className="flex items-center gap-2 font-semibold"><Globe className="h-4 w-4" aria-hidden="true" />Public</span>
              <span className="pl-6 text-sm font-normal text-muted-foreground">Anyone with the link</span>
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
