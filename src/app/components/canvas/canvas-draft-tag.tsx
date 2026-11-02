/**
 * @file canvas-draft-tag.tsx
 * @description P1536 3c X6: "(Draft)" is ONE tag component, so a draft reads the same wherever it is labelled: the mirror-chat card (X10, built here),
 * and, in step 4, the header, the picker's draft row and a Mine row. A pending Clone uses the same tag reading "New draft" (pass it as the children).
 * It is a TAG, not a control: a square-cornered, bordered, filled label that never shrinks (the name beside it gives way first) and has none of the
 * action look (no blue pill, no colour of a status the design system bans), so it cannot be mistaken for a button.
 */
import type { ReactNode } from 'react';

export const DRAFT_TAG_LABEL = 'Draft';

const TAG = 'inline-flex shrink-0 items-center rounded-md border border-foreground/25 bg-muted px-1.5 text-xs font-semibold leading-5 text-foreground';

export function CanvasDraftTag({ children = DRAFT_TAG_LABEL }: { children?: ReactNode }) {
  return (
    <span className={TAG} data-testid="canvas-draft-tag">
      {children}
    </span>
  );
}
