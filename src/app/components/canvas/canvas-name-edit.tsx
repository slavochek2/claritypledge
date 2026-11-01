/**
 * @file canvas-name-edit.tsx
 * @description P1536 W8: the canvas's name in the owner's header, with ✎. The pencil makes the name an inline input: Enter or leaving the field
 * saves, Escape puts the old name back, an empty name puts the old name back, and 60 characters is the most it takes. It changes the display title
 * only (the address stays). A name that cannot be renamed (a reader, a canvas with no record) is plain text with no ✎. The save itself, its
 * optimistic show and its rollback are the owner's (use-canvas-rename); this component only asks.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Pencil } from 'lucide-react';
import { CANVAS_TITLE_MAX } from '@/lib/canvas-boxes';

const NAME = 'min-w-0 truncate text-base font-semibold text-foreground';

export function CanvasNameEdit({ title, canEdit, onSave }: { title: string; canEdit: boolean; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Escape ends the edit without saving, and the blur that follows must not save either.
  const done = useRef(false);
  const begin = () => { done.current = false; setDraft(title); setEditing(true); };
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const next = draft.trim();
    // An empty name, the same name and (defensively; the field already stops at 60) a longer one all put the old name back.
    if (save && next !== '' && next !== title && next.length <= CANVAS_TITLE_MAX) onSave(next);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  if (!canEdit) return <h1 className={NAME} title={title} data-testid="canvas-title">{title}</h1>;
  return editing ? (
    <input
      value={draft}
      maxLength={CANVAS_TITLE_MAX}
      aria-label="Canvas name"
      autoFocus
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => finish(true)}
      className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      data-testid="canvas-title-input"
    />
  ) : (
    <span className="relative flex min-w-0 items-center gap-0.5 max-[359px]:min-h-10">
      <h1 className={NAME} title={title} data-testid="canvas-title">{title}</h1>
      {/* Below 360px the pencil gives way (the row has no room for it): the name itself is the way to rename. */}
      <button type="button" aria-label="Edit name" onClick={begin} className="absolute inset-0 min-[360px]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" data-testid="canvas-rename-name" />
      <button
        type="button"
        aria-label="Rename canvas"
        onClick={begin}
        className="flex h-10 w-8 shrink-0 max-[359px]:hidden items-center justify-center rounded-full text-muted-foreground sm:w-10 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        data-testid="canvas-rename"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}
