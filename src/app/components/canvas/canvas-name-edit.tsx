/**
 * @file canvas-name-edit.tsx
 * @description P1536 W8: the canvas's name in the owner's header, with ✎. The pencil makes the name an inline input: Enter or leaving the field
 * saves, Escape puts the old name back, an empty name puts the old name back, and 60 characters is the most it takes. It changes the display title
 * only (the address stays). A name that cannot be renamed (a reader, a canvas with no record) is plain text with no ✎. The save itself, its
 * optimistic show and its rollback are the owner's (use-canvas-rename); this component only asks. Below 1280px the input lies OVER the rest of
 * row 1 (the owner bar's row 1 is its positioned parent): from after the back button to the row's right edge, so the picker and tag are
 * not squeezed to make room and the owner sees what they type.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Pencil } from 'lucide-react';
import { CANVAS_TITLE_MAX } from '@/lib/canvas-boxes';

const NAME = 'min-w-0 truncate text-base font-semibold text-foreground';
/** Below 1280px: over row 1, from the back button's edge (40px; 32px below 640px) to the row's right edge (3c X13: the spot moved to row 2, so row 1 holds only the back button, the name, the picker and the tag). */
const OVERLAY = 'max-xl:absolute max-xl:inset-y-0 max-xl:my-auto max-xl:left-10 max-sm:left-8 max-xl:right-0 max-xl:z-10';

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
      // select-all with the caret at the START (a backward selection), so a long name reads from its first letter instead of scrolling to its tail
      onFocus={e => { const el = e.currentTarget; el.setSelectionRange(0, el.value.length, 'backward'); requestAnimationFrame(() => { el.scrollLeft = 0; }); }}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => finish(true)}
      className={`${OVERLAY} h-10 min-w-0 flex-1 xl:w-[26rem] xl:flex-none rounded-md border border-input bg-background px-2 text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
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
