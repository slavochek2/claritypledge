/**
 * The look of a shared-artifact card in a chat: a rounded bordered row with a blue icon disc, a title and one line
 * under it. One home for the classes, so the shared-canvas card and the canvas version card cannot drift apart.
 */
export const ARTIFACT_CARD = 'mt-1 flex w-full max-w-md items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left';
export const ARTIFACT_DISC = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700';

/** A small, honest placeholder row: what it is, never an empty box (a card that could not load, or is not the viewer's). */
export const ATTACHMENT_NOTE = 'mt-1 flex max-w-md items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm text-muted-foreground';
