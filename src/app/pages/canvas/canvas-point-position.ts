/** @file canvas-point-position.ts @description P1529: the point panel's step (its box, "2 of 5", previous and next) for an open point. */
import { BOX_TITLES } from '@/app/components/canvas/canvas-page-data';
import { canvasBoxOf, type CanvasBoxTag } from '@/lib/canvas-boxes';

function pointPosition(inBox: ReadonlyArray<{ id: string }> | undefined, id: string): { index: number; total: number } | undefined {
  const at = inBox ? inBox.findIndex(p => p.id === id) : -1;
  return inBox && at >= 0 ? { index: at + 1, total: inBox.length } : undefined;
}

export function openPointStep(
  point: { id: string; systemTags: string[] },
  boxes: ReadonlyMap<CanvasBoxTag, ReadonlyArray<{ id: string }>> | undefined,
  previousId: string | undefined,
  nextId: string | undefined,
  open: (id: string) => void,
) {
  const boxTag = canvasBoxOf(point.systemTags) as CanvasBoxTag;
  return {
    box: BOX_TITLES.get(boxTag),
    boxTag,
    position: pointPosition(boxes?.get(boxTag), point.id),
    onPrevious: previousId ? () => open(previousId) : undefined,
    onNext: nextId ? () => open(nextId) : undefined,
  };
}
