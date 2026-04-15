/**
 * @file start-clarity-session-button.tsx
 * @description P703: "Start a clarity session" button shown below each story card
 * in the StoryWalk view — sender only. Creates a letter-sourced /live session with
 * pre-loaded baseline ratings and sends an inbox invite to the receiver.
 *
 * Disabled (tooltip: "Invite already pending") when an open invite already exists
 * for this receiver. Navigates to /live/<code> on success.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/mixpanel';
import {
  createClaritySession,
  createLiveInvite,
  checkOpenInviteForReceiver,
} from '@/app/data/api';

interface StartClaritySessionButtonProps {
  senderId: string;
  receiverId: string;
  letterId: string;
  storyId: string;
  senderName: string;
}

export function StartClaritySessionButton({
  senderId,
  receiverId,
  letterId,
  storyId,
  senderName,
}: StartClaritySessionButtonProps) {
  const navigate = useNavigate();
  const [invitePending, setInvitePending] = useState(false);
  const [creating, setCreating] = useState(false);

  const checkInvite = useCallback(async () => {
    const exists = await checkOpenInviteForReceiver(receiverId);
    setInvitePending(exists);
  }, [receiverId]);

  useEffect(() => {
    checkInvite();
  }, [checkInvite]);

  const handleStart = async () => {
    if (creating || invitePending) return;
    setCreating(true);
    try {
      const session = await createClaritySession(senderName, senderId, false, undefined, {
        sourceLetterId: letterId,
        sourceStoryId: storyId,
        targetListenerId: receiverId,
      });
      await createLiveInvite(session.id, receiverId);
      analytics.track('letter_live_session_started', {
        letter_id: letterId,
        story_id: storyId,
        session_code: session.code,
      });
      navigate(`/live/${session.code}`);
    } catch (err) {
      console.error('[P703] Failed to start letter-sourced session:', err);
      setCreating(false);
    }
  };

  const isDisabled = invitePending || creating;
  const tooltipText = invitePending ? 'Invite already pending' : undefined;

  return (
    <div className="flex justify-center">
      <Button
        onClick={() => void handleStart()}
        disabled={isDisabled}
        title={tooltipText}
        className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px] gap-2"
        data-testid="start-clarity-session-btn"
      >
        <Video className="w-4 h-4" />
        Start a clarity session
      </Button>
    </div>
  );
}
