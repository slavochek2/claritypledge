/**
 * @file OpenYourCanvas.tsx
 * @description P1529 G5: the way to the person's own canvas between rounds: a secondary (blue-bordered) button, full width on a phone, under the card's primary (rule 2).
 */
import { Link } from 'react-router-dom';
import { plainCanvasState } from '@/lib/canvas-hrefs';
import { Button } from '@/components/ui/button';

export function OpenYourCanvas({ href, linkState, testId }: { href: string; linkState?: unknown; testId: string }) {
  return (
    <Button asChild variant="outline" className="mt-3 min-h-12 w-full text-base">
      <Link to={href} state={plainCanvasState(linkState)} data-testid={testId}>Open your canvas</Link>
    </Button>
  );
}
