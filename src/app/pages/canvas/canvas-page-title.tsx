/**
 * @file canvas-page-title.tsx
 * @description P1545: the canvas's own name is the title ("Hiring plan for q1", as in Artifacts and the chat card);
 * "Clarity Canvas" is the small label above it.
 */
import { canvasTitle } from '@/lib/canvas-boxes';

export function CanvasPageTitle({ projectTag }: { projectTag: string | null | undefined }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid="canvas-eyebrow">Clarity Canvas</p>
      <h1 className="break-words text-3xl font-bold text-foreground md:text-4xl" data-testid="canvas-title">{projectTag ? canvasTitle(projectTag) : 'Clarity Canvas'}</h1>
    </div>
  );
}
