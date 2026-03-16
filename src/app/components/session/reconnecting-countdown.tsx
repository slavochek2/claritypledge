/**
 * @file reconnecting-countdown.tsx
 * @description P511 Task 6: Grace-period countdown shown when partner disconnects.
 * Gives the partner up to 120s to return (refresh, network blip, app switch)
 * before the session is considered ended.
 */
import { useState, useEffect, useRef } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ReconnectingCountdownProps {
  /** Display name of the disconnected partner */
  partnerName: string;
  /** When the disconnect was first detected */
  startTime: Date;
  /** Total grace period in seconds (default 120) */
  gracePeriodSeconds: number;
  /** Called when countdown reaches 0 */
  onExpired: () => void;
  /** Called if partner returns during grace period (optional) */
  onPartnerReturned?: () => void;
}

/**
 * Countdown timer shown during the grace period after a partner disconnects.
 * Provides reassurance text and accessible timer with screen reader announcements.
 */
export function ReconnectingCountdown({
  partnerName,
  startTime,
  gracePeriodSeconds,
  onExpired,
}: ReconnectingCountdownProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    return Math.max(0, gracePeriodSeconds - elapsed);
  });
  const [expired, setExpired] = useState(false);
  const expiredCalledRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Tick every second
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const remaining = Math.max(0, gracePeriodSeconds - elapsed);
      setSecondsRemaining(remaining);

      if (remaining <= 0 && !expiredCalledRef.current) {
        expiredCalledRef.current = true;
        setExpired(true);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, gracePeriodSeconds, onExpired]);

  // Format seconds as M:SS
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Color escalation: amber normally, orange below 30s
  const isUrgent = secondsRemaining <= 30 && !expired;
  const countdownColor = expired
    ? 'text-muted-foreground'
    : isUrgent
      ? 'text-orange-600'
      : 'text-amber-600';

  // Screen reader announcements at 30s intervals
  const lastAnnouncedRef = useRef(secondsRemaining);
  const [srAnnouncement, setSrAnnouncement] = useState('');

  useEffect(() => {
    if (expired) {
      setSrAnnouncement(`Session timed out. ${partnerName} did not return.`);
      return;
    }
    // Announce at every 30-second boundary
    const currentBucket = Math.floor(secondsRemaining / 30);
    const lastBucket = Math.floor(lastAnnouncedRef.current / 30);
    if (currentBucket !== lastBucket && secondsRemaining > 0) {
      setSrAnnouncement(
        `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} seconds remaining for ${partnerName} to reconnect.`
      );
    }
    lastAnnouncedRef.current = secondsRemaining;
  }, [secondsRemaining, expired, partnerName, minutes, seconds]);

  if (expired) {
    return (
      <div className="rounded-lg bg-muted/50 p-4 text-center space-y-3" role="status">
        <p className="text-muted-foreground">
          Session timed out. Your partner may have lost connection.
        </p>
        <Link
          to="/live"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 underline"
        >
          View Session Summary
        </Link>
        {/* SR announcement */}
        <span className="sr-only" aria-live="assertive">{srAnnouncement}</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg bg-amber-50/50 p-4 space-y-2"
      role="timer"
      aria-label="Time remaining for partner to reconnect"
    >
      {/* Main line: spinner + message + countdown */}
      <div className="flex items-center gap-2 text-amber-700">
        {prefersReducedMotion ? (
          <WifiOff className="w-4 h-4 text-amber-500 flex-shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-amber-500 flex-shrink-0 animate-spin" />
        )}
        <span>
          Waiting for {partnerName} to return...
        </span>
        <span className={`font-tabular-nums ml-auto ${countdownColor}`}>
          {timeDisplay} remaining
        </span>
      </div>

      {/* Reassurance line */}
      <p className="text-muted-foreground text-sm pl-6">
        They may be refreshing or switching apps. You can keep reviewing your notes.
      </p>

      {/* Screen reader announcements */}
      <span className="sr-only" aria-live="assertive">{srAnnouncement}</span>
    </div>
  );
}

/** Hook to detect `prefers-reduced-motion: reduce` */
function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
