/**
 * @file use-container-columns.ts
 * @description P1536 S3.7: the canvas grid's columns follow the width of its own container, not the screen: under 520px one column,
 * 520 to 719px two, 720px and up three. (The workspace gives the canvas a pane that is narrower than the screen, so screen
 * breakpoints would pick too many columns.) Until the container has been measured the grid is one column.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

export type GridColumns = 1 | 2 | 3;

export function columnsForWidth(width: number): GridColumns {
  if (width >= 720) return 3;
  if (width >= 520) return 2;
  return 1;
}

export function useContainerColumns(ref: RefObject<HTMLElement | null>): GridColumns {
  const [columns, setColumns] = useState<GridColumns>(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(columnsForWidth(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}
