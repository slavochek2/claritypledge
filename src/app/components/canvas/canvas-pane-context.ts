/**
 * @file canvas-pane-context.ts
 * @description P1536: whether the owner's draft thread is shown beside the canvas page (the route wrapper, pages/canvas/
 * canvas-with-thread.tsx, provides it). The page's parts adapt: Publish steps back to an outline (the thread's own actions
 * lead), the "Revise in chat" link is not needed, and the boxes keep two columns so the narrower column is not crushed.
 */
import { createContext, useContext } from 'react';

/**
 * The widths that can hold the pane: from 1280px. At 1024px the shell's sidebar (248px) and the pane (400px) would leave
 * the canvas about 380px, so there the page keeps its whole width and a link to the thread instead.
 */
export const CANVAS_PANE_QUERY = '(min-width: 1280px)';

export const CanvasPaneContext = createContext(false);

export const useCanvasPaneShown = (): boolean => useContext(CanvasPaneContext);
