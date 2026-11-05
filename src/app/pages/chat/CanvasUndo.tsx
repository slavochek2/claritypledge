/**
 * @file CanvasUndo.tsx
 * @description P1536 D7, J6, D15: the three small things Undo draws in a canvas thread.
 *  - `CanvasUndoButton`: "Undo", the secondary blue-outline pill (P1621), under the mirror's reply of the newest applied run.
 *  - `CanvasUndoWaits`: while an update runs, the same spot is a status, never a disabled button (D15).
 *  - `CanvasUndoneMark`: the owner message whose run was undone stays in the thread, marked (J6); it is never material again.
 */
import { CANVAS_CANCEL_TEXT, CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { UNDONE_MARK, UNDO_LABEL, UNDO_LOAD_FAILED_TEXT, UNDO_RETRY_LABEL, UNDO_WAITS_LABEL } from './canvas-thread-copy';

/** A message row's text starts 62px in (its margin and padding, the avatar column and the gap): Undo and its mark line up under the words, not under the avatar. */
const TEXT_COLUMN = 'pl-[62px] pr-4';

export function CanvasUndoButton({ busy, onUndo }: { busy: boolean; onUndo: () => void }) {
  return (
    <div className={TEXT_COLUMN} data-testid="canvas-undo-spot">
      <button type="button" className={CANVAS_SECONDARY_PILL} aria-busy={busy} data-testid="canvas-undo" onClick={onUndo}>
        {UNDO_LABEL}
      </button>
    </div>
  );
}

export function CanvasUndoWaits() {
  return (
    <div className={TEXT_COLUMN} data-testid="canvas-undo-spot">
      <p role="status" className="-ml-2 flex h-11 items-center px-2 text-sm text-muted-foreground" data-testid="canvas-undo-waits">{UNDO_WAITS_LABEL}</p>
    </div>
  );
}

/** The read that says where Undo goes failed: said in the same spot, with a Try again (ghost, rule 3). */
export function CanvasUndoRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={`${TEXT_COLUMN} flex flex-wrap items-center gap-x-1`} data-testid="canvas-undo-retry">
      <p role="status" className="text-sm text-muted-foreground">{UNDO_LOAD_FAILED_TEXT}</p>
      <button type="button" className={CANVAS_CANCEL_TEXT} data-testid="canvas-undo-retry-button" onClick={onRetry}>{UNDO_RETRY_LABEL}</button>
    </div>
  );
}

export function CanvasUndoneMark() {
  return <p className="pb-1 pl-[62px] pr-4 text-xs text-muted-foreground" data-testid="canvas-undone-mark">{UNDONE_MARK}</p>;
}
