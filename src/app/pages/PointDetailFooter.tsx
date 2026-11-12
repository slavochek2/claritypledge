/**
 * @file PointDetailFooter.tsx
 * @description The point page's footer: the story call to action on the left and Share on the right (the profile story card pattern).
 * P1631: a private point published to a chat has no link and takes no story, so both are hidden there; every other point keeps them.
 */
import { useNavigate } from 'react-router-dom';
import { ShareButton } from '@/app/components/shared';
import { usePointChatShared } from './use-point-chat-shared';

export function PointDetailFooter({ point, signedIn, hasOwnStory }: {
  point: { id: string; statement: string; visibility?: string | null };
  signedIn: boolean;
  hasOwnStory: boolean;
}) {
  const navigate = useNavigate();
  const chatPublished = usePointChatShared(point.id, point.visibility === 'private');
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      {signedIn && !hasOwnStory && !chatPublished ? (
        <button
          onClick={() => navigate(`/create?pointId=${point.id}`)}
          className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          + Add a story
        </button>
      ) : (
        <span />
      )}
      {!chatPublished && <ShareButton type="point" id={point.id} description={point.statement.slice(0, 100)} />}
    </div>
  );
}
