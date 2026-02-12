/**
 * P135: Event Waiting Room — Dedicated page for waiting for target to join sub-room.
 * Prevents auto-redirect surprise from event page. Provides clear "waiting" context.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { eventsService } from '@/app/data/events-service';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth';
import type { EventSubRoomWithProfiles } from '@/app/types';

export function EventWaitingRoomPage() {
  const { slug, subRoomId } = useParams<{ slug: string; subRoomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subRoom, setSubRoom] = useState<EventSubRoomWithProfiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Fetch sub-room on mount
  const fetchSubRoom = useCallback(async () => {
    if (!subRoomId || !slug) return;

    setLoading(true);
    setError(null);

    try {
      const room = await eventsService.getSubRoomById(subRoomId);

      if (!room) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      // Validate user is logged in and is the initiator
      if (!user?.id) {
        setError('Please log in to view this waiting room');
        setLoading(false);
        return;
      }

      if (room.initiatorId !== user.id) {
        setError('You are not authorized to view this waiting room');
        setLoading(false);
        return;
      }

      // If sub-room already active, navigate to /live immediately
      if (room.status === 'active' && room.sessionCode) {
        navigate(`/live?code=${room.sessionCode}&returnTo=/events/${slug}`);
        return;
      }

      // If sub-room expired or cancelled, show message
      if (room.status === 'expired' || room.status === 'cancelled') {
        setError('This session has expired or been cancelled');
      }

      setSubRoom(room);
    } catch (err) {
      console.error('[EventWaitingRoomPage] Failed to fetch sub-room:', err);
      setError('Failed to load session. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [subRoomId, slug, user?.id, navigate]);

  useEffect(() => {
    fetchSubRoom();
  }, [fetchSubRoom]);

  // Subscribe to sub-room status changes
  useEffect(() => {
    if (!subRoomId) return;

    const channel = supabase
      .channel(`event_sub_room:${subRoomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_sub_rooms',
          filter: `id=eq.${subRoomId}`,
        },
        () => {
          fetchSubRoom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [subRoomId, fetchSubRoom]);

  // Update countdown timer
  useEffect(() => {
    if (!subRoom || subRoom.status !== 'pending') return;

    const updateTimer = () => {
      const now = new Date();
      const expiresAt = new Date(subRoom.expiresAt);
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [subRoom]);

  // Handle cancel
  const handleCancel = async () => {
    if (!subRoomId) return;

    setCancelling(true);
    try {
      await eventsService.cancelSubRoom(subRoomId);
      toast.success('Session cancelled');
      navigate(`/events/${slug}`);
    } catch (err) {
      console.error('[EventWaitingRoomPage] Failed to cancel sub-room:', err);
      toast.error('Failed to cancel session. Please try again.');
      setCancelling(false);
    }
  };

  // Handle copy link
  const handleCopyLink = () => {
    const url = `${window.location.origin}/events/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold mb-2">Unable to Load Session</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link to={`/events/${slug}`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Event
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!subRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
          <Link to={`/events/${slug}`}>
            <Button variant="outline">Back to Event</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link
            to={`/events/${slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to event
          </Link>
        </div>
      </div>

      {/* Waiting Room Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Target Avatar */}
          <PersonAvatar
            name={subRoom.targetName}
            avatarColor={subRoom.targetAvatarColor}
            avatarUrl={subRoom.targetAvatarUrl}
            size="xl"
          />

          {/* Waiting Message */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">
              Waiting for {subRoom.targetName}...
            </h1>
            <p className="text-muted-foreground">
              Tell {subRoom.targetName} to check the event page, or send them the link:
            </p>
          </div>

          {/* Share Link */}
          <Button
            variant="outline"
            onClick={handleCopyLink}
            className="w-full max-w-md"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy event link
          </Button>

          {/* Countdown Timer */}
          {subRoom.status === 'pending' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Session expires in {timeRemaining}</span>
            </div>
          )}

          {/* Expired Message */}
          {(subRoom.status === 'expired' || timeRemaining === 'Expired') && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              Session expired. {subRoom.targetName} didn't join in time.
            </div>
          )}

          {/* Cancel Button */}
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-muted-foreground hover:text-red-600"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Session'}
          </Button>
        </div>
      </div>
    </div>
  );
}
