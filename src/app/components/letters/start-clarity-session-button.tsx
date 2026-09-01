import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, ShieldOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/mixpanel';
import {
  createClaritySession,
  createLiveInvite,
  completeClaritySession,
  cancelLiveInvite,
  getOpenInviteForSender,
  type OpenInviteDetails,
} from '@/app/data/api';
import {
  useLiveSession,
  getActiveSessionFromStorage,
} from '@/app/contexts/live-session-context';

interface StartClaritySessionButtonProps {
  senderId: string;
  receiverId: string;
  letterId: string;
  storyId: string;
  senderName: string;
  deliveryId?: string;
}

export function StartClaritySessionButton({
  senderId,
  receiverId,
  letterId,
  storyId,
  senderName,
  deliveryId,
}: StartClaritySessionButtonProps) {
  const midLetterMode = !!deliveryId;
  const navigate = useNavigate();
  const { activeSessionCode, clearActiveSession } = useLiveSession();
  const [openInvite, setOpenInvite] = useState<OpenInviteDetails | null>(null);
  const [creating, setCreating] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const checkInvite = useCallback(async () => {
    const invite = await getOpenInviteForSender(receiverId);
    setOpenInvite(invite);
  }, [receiverId]);

  useEffect(() => {
    checkInvite();
  }, [checkInvite]);

  // When banner clears externally (non-null → null transition), re-sync invite state.
  const prevCodeRef = useRef(activeSessionCode);
  useEffect(() => {
    const prev = prevCodeRef.current;
    prevCodeRef.current = activeSessionCode;
    if (prev !== null && activeSessionCode === null) {
      checkInvite();
    }
  }, [activeSessionCode, checkInvite]);

  const handleStart = async () => {
    if (creating || openInvite) return;
    setCreating(true);
    try {
      const session = await createClaritySession(senderName, senderId, isPrivate, undefined, {
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
      navigate(`/live/${session.code}?returnTo=${encodeURIComponent('/letters?tab=inbox')}`);
    } catch (err) {
      console.error('[P703] Failed to start letter-sourced session:', err);
      setCreating(false);
    }
  };

  const handleEnd = async () => {
    if (!openInvite || isEnding) return;
    const invite = openInvite;
    setIsEnding(true);
    let ended = false;
    try {
      await completeClaritySession(invite.sessionId);
      ended = true;
    } catch (err) {
      console.error('[P735] completeClaritySession failed:', err);
      try {
        await cancelLiveInvite(invite.sessionId);
        ended = true;
      } catch (cancelErr) {
        console.error('[P735] cancelLiveInvite fallback failed:', cancelErr);
      }
    } finally {
      await checkInvite();
      if (ended) {
        const stored = getActiveSessionFromStorage();
        if (stored && stored.code === invite.code) {
          clearActiveSession();
        }
      }
      setIsEnding(false);
    }
  };

  if (midLetterMode && openInvite) {
    return (
      <Button
        disabled
        title="Invite already pending"
        aria-label="Invite already pending"
        className="w-full"
      >
        <Video className="mr-2 h-4 w-4" />
        Start Clarity Live now
      </Button>
    );
  }

  if (openInvite) {
    const bannerOwnsThisSession = activeSessionCode === openInvite.code;

    if (bannerOwnsThisSession) {
      return (
        <div className="flex flex-col items-center gap-2">
          <Button
            onClick={() => navigate(`/live/${openInvite.code}`)}
            className="bg-blue-500 hover:bg-blue-600 text-white min-h-11 gap-2"
            data-testid="return-to-session-btn"
          >
            <Video className="w-4 h-4" />
            Return to Session
          </Button>
          <span className="text-xs text-muted-foreground">
            Use the top banner to end this session
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3">
        <Button
          onClick={() => navigate(`/live/${openInvite.code}`)}
          className="bg-blue-500 hover:bg-blue-600 text-white min-h-11 gap-2"
          data-testid="return-to-session-btn"
        >
          <Video className="w-4 h-4" />
          Return to Session
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleEnd()}
          disabled={isEnding}
          aria-label={isEnding ? 'Ending session…' : 'End this session'}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-3"
          data-testid="end-session-btn"
        >
          {isEnding ? 'Ending…' : 'End Session'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setIsPrivate(prev => !prev)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        data-testid="recording-toggle"
      >
        {isPrivate ? (
          <>
            <ShieldOff className="w-4 h-4" />
            <span>Private session (no AI insights)</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-blue-600">Session recorded for AI Insights</span>
          </>
        )}
      </button>
      <Button
        onClick={() => void handleStart()}
        disabled={creating}
        className="bg-blue-500 hover:bg-blue-600 text-white min-h-11 gap-2"
        data-testid="start-clarity-session-btn"
      >
        <Video className="w-4 h-4" />
        {midLetterMode ? 'Start Clarity Live now' : 'Start a clarity session'}
      </Button>
    </div>
  );
}
