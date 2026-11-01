/**
 * @file PublishReplyOpen.tsx
 * @description P1536 W4: the Publish reply in the mirror chat's own thread view carries "Open canvas" (secondary), to the PUBLISHED
 * version of the canvas the thread belongs to. Inside the canvas workspace's thread panel there is no Open at all (the canvas is the
 * other pane), so ThreadPanel draws this only outside it.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCanvasVersionCard } from '@/app/data/canvas-draft-service';
import { OPEN_CANVAS_LABEL } from './canvas-publish-reply';

export function PublishReplyOpen({ versionId, viewerId }: { versionId: string; viewerId: string }) {
  const { pathname, search } = useLocation();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getCanvasVersionCard(versionId, viewerId)
      .then((card) => { if (live) setHref(card?.href ?? null); })
      .catch(() => { if (live) setHref(null); });
    return () => { live = false; };
  }, [versionId, viewerId]);
  if (!href) return null;
  return (
    <div className="px-4 py-1">
      <Button asChild variant="secondary" className="min-h-10">
        <Link to={href} state={{ from: `${pathname}${search}` }} data-testid="publish-reply-open">{OPEN_CANVAS_LABEL}</Link>
      </Button>
    </div>
  );
}
