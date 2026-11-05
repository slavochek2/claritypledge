/**
 * @file canvas-box-title.tsx
 * @description P1621: a box's title row. On the owner's canvas it is a real button INSIDE the box's heading that says whether the box is selected (`aria-pressed`); Enter or
 * Space selects or deselects it, and it is where Escape and Cancel return focus. For anyone who cannot select (a reader, a signed-out visitor) it is plain text: a button there
 * would be a dead control.
 */
import type { Ref } from 'react';
import type { CanvasBoxTag } from '@/lib/canvas-boxes';
import { BoxIcon } from './canvas-box-icon';
import { boxTitleTestId } from './canvas-box-ids';

export function BoxTitle({ tag, title, headingId, empty, selectable, selected, onToggle, buttonRef }: {
  tag: CanvasBoxTag;
  title: string;
  headingId: string;
  empty: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const colour = empty && !selected ? 'text-foreground/60' : 'text-foreground';
  const content = (
    <>
      <BoxIcon tag={tag} className={empty ? 'opacity-60' : ''} />
      <span className="min-w-0 break-words">{title}</span>
    </>
  );
  return (
    <h3 id={headingId} className={`min-w-[6.5rem] flex-1 text-sm font-semibold ${colour}`}>
      {selectable ? (
        <button
          ref={buttonRef}
          type="button"
          aria-pressed={selected}
          onClick={onToggle}
          data-testid={boxTitleTestId(tag)}
          className="flex min-h-10 w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {content}
        </button>
      ) : (
        <span className="flex min-h-10 items-center gap-2">{content}</span>
      )}
    </h3>
  );
}
