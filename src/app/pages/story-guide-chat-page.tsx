/**
 * @file story-guide-chat-page.tsx
 * @description P425: Page shell for AI-guided story creation chat.
 * Auth-gated. Reads ?from=position&pointId=XYZ URL params.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { StoryGuideChat } from '@/app/components/story-guide/StoryGuideChat';
import { pointsService } from '@/app/data/points-service';
import type { StoryDraft } from '@/app/components/story-guide/StoryGuideChat';

export function StoryGuideChatPage() {
  const { user, isLoading } = useAuth();
  const [searchParams] = useSearchParams();

  const from = searchParams.get('from');
  const pointId = searchParams.get('pointId') ?? undefined;
  const isPositionTriggered = from === 'position' && !!pointId;

  const [pointText, setPointText] = useState<string | undefined>(undefined);
  const [userPosition, setUserPosition] = useState<string | undefined>(undefined);
  const [pointLoading, setPointLoading] = useState(isPositionTriggered);

  // Fetch point data when position-triggered
  useEffect(() => {
    if (!isPositionTriggered || !pointId || !user) return;

    setPointLoading(true);

    pointsService.getPointWithUserPosition(pointId, user.id)
      .then(point => {
        if (point) {
          setPointText(point.statement);
          if (point.userPosition?.position) {
            setUserPosition(String(point.userPosition.position));
          }
        }
        // If point not found — proceed without context chip (graceful degradation)
      })
      .catch(() => {
        // Graceful degradation: proceed without context
      })
      .finally(() => setPointLoading(false));
  }, [isPositionTriggered, pointId, user]);

  // Auth gate — wait for auth to resolve
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signup" replace />;
  }

  const handleStoryConfirmed = (_draft: StoryDraft) => {
    // toast is already shown inside StoryGuideChat after save
    // onStoryConfirmed is the parent notification hook — nothing extra needed for Flow A/B
    void _draft;
  };

  return (
    <div className="max-w-2xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
      {pointLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : (
        <StoryGuideChat
          pointId={pointId}
          pointText={pointText}
          userPosition={userPosition}
          onStoryConfirmed={handleStoryConfirmed}
        />
      )}
    </div>
  );
}
