/**
 * @file PublishReplyOpen.tsx
 * @description P1536 W4: the Publish reply in the mirror chat's own thread view carries "Open canvas" (secondary), to the PUBLISHED
 * version the thread's own draft became (3c S3c.15: read through the thread, since a clone's root attaches its BASE version). Inside the canvas workspace's thread panel there is no Open at all (the canvas is the
 * other pane), so ThreadPanel draws this only outside it.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { getCanvasRootCard } from '@/app/data/canvas-draft-service';
import { OPEN_CANVAS_LABEL } from './canvas-publish-reply';

export function PublishReplyOpen({ rootId, versionId, viewerId }: { rootId: string; versionId: string; viewerId: string }) {
  const { pathname, search } = useLocation();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getCanvasRootCard(rootId, versionId, viewerId)
      .then((card) => { if (live) setHref(card?.href ?? null); })
      .catch(() => { if (live) setHref(null); });
    return () => { live = false; };
  }, [rootId, versionId, viewerId]);
  if (!href) return null;
  return (
    <div className="px-4 py-1">
      {/* W7: Open is the canvas page's one secondary look. */}
      <Link to={href} state={{ from: `${pathname}${search}` }} className={CANVAS_SECONDARY_PILL} data-testid="publish-reply-open">{OPEN_CANVAS_LABEL}</Link>
    </div>
  );
}
