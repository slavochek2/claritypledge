/**
 * @file canvas-grid.tsx
 * @description The canvas's nine boxes in three rows (P1535). P1621: the rows carry no names or numbers, just a gap between them; the owner can select a box (one at a time), which is how a box
 * shows its actions (canvas-box). P1536: on the owner's draft, an empty box shows the question the drafting agent left for the owner (owner only: readers, and the owner on a
 * published version, see a plain empty box).
 */
import { useRef, type ReactNode } from 'react';
import { CANVAS_LAYERS, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import { BoxEdits, type PointEditConfig } from './canvas-point-edit';
import { CanvasBox } from './canvas-box';
import { BOX_TITLES } from './canvas-page-data';
import { useCanvasWorkspace } from './canvas-workspace-context';
import { useBoxSelection } from './use-box-selection';
import { useContainerColumns, type GridColumns } from './use-container-columns';

export { BoxEdits };

const COLUMN_CLASS: Record<GridColumns, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

/**
 * P1535: three rows of three boxes in one grid — columns follow the container (S3.7: under 520px one, 520 to 719px two, 720px and up three). Every box is shown, filled or not, so the grid
 * keeps its shape. A row is as tall as its tallest box.
 */
export function CanvasGrid({ boxes, renderCard, onMore, questions, changed, edit, openDraftId }: {
  /** null while loading (skeletons) */
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]> | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  onMore: (box: CanvasBoxTag) => void;
  /** P1536, owner's draft only: the question for each empty box, by box tag */
  questions?: Record<string, string>;
  /** D6, the owner's draft only: the box tags whose point set differs from the base version's. */
  changed?: readonly string[];
  /** P1614, the owner's open draft only: the cards can be edited by hand, and a card added (P1621). */
  edit?: PointEditConfig;
  /** the owner's open draft even when a published version is on screen: typed new-card text for it is kept, not shown as gone (P1621) */
  openDraftId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const columns = useContainerColumns(ref);
  // P1621: only the canvas's owner can select a box: the workspace carries Mention in chat for the owner alone, and `edit` exists only on the owner's open draft.
  const { addToChat } = useCanvasWorkspace();
  const selectable = !!edit || !!addToChat;
  const selection = useBoxSelection({ enabled: selectable, userId: edit?.userId, boxes, pageRef: ref });
  return (
    <div ref={ref} className={`grid gap-2 ${COLUMN_CLASS[columns]}`} data-testid="canvas-grid" data-columns={columns} aria-busy={boxes === null}>
      {CANVAS_LAYERS.map((layer, i) => (
        <div key={layer.boxes[0]} className="contents" data-testid="canvas-layer">
          {/* The rows have no names: whitespace between them groups the boxes (founder-approved). */}
          {i > 0 && <div className="col-span-full h-4" aria-hidden data-testid="canvas-layer-gap" />}
          {layer.boxes.map(tag => (
            <CanvasBox
              key={tag}
              tag={tag}
              title={BOX_TITLES.get(tag) ?? tag}
              points={boxes ? boxes.get(tag) ?? [] : null}
              renderCard={renderCard}
              onMore={() => onMore(tag)}
              question={questions?.[tag]}
              changed={changed?.includes(tag) === true}
              edit={edit}
              openDraftId={openDraftId}
              selection={{
                selectable,
                selected: selection.selected === tag,
                focusEditor: selection.focusEditor,
                onToggle: () => selection.toggle(tag),
                onSelect: () => selection.select(tag),
                onDeselect: selection.deselect,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
