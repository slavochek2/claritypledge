/**
 * @file reconnecting-countdown.tsx
 * @description P511 Task 6: Grace-period countdown shown when partner disconnects.
 * Gives the partner up to 120s to return (refresh, network blip, app switch)
 * before the session is considered ended.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, WifiOff, Check, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

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
  /** Session code for generating the rejoin link + QR */
  sessionCode?: string;
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
  sessionCode,
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

  // Rejoin link + copy state
  const [copied, setCopied] = useState(false);
  const rejoinLink = sessionCode ? `${window.location.origin}/live/${sessionCode}` : '';
  const displayLink = rejoinLink.replace(/^https?:\/\//, '');

  const handleCopy = useCallback(async () => {
    if (!rejoinLink) return;
    try {
      await navigator.clipboard.writeText(rejoinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts — silent
    }
  }, [rejoinLink]);

  // Color escalation: muted normally, orange below 30s
  const isUrgent = secondsRemaining <= 30 && !expired;
  const countdownColor = expired
    ? 'text-muted-foreground'
    : isUrgent
      ? 'text-orange-600'
      : 'text-muted-foreground';

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
      className="rounded-lg bg-muted/50 p-4 space-y-2"
      role="timer"
      aria-label="Time remaining for partner to reconnect"
    >
      {/* Main line: spinner + message + countdown */}
      <div className="flex items-center gap-2 text-foreground">
        {prefersReducedMotion ? (
          <WifiOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-muted-foreground flex-shrink-0 animate-spin" />
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

      {/* Rejoin link + QR so the remaining user can help their partner return */}
      {sessionCode && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Help them rejoin — share this link:
          </p>

          {/* Link row with copy */}
          <div className="flex items-center gap-2 p-2 bg-background rounded-lg border">
            <span className="text-xs font-mono text-muted-foreground truncate flex-1 text-left pl-1">
              {displayLink}
            </span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* QR code */}
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-lg border inline-block">
              <QRCodeSVG value={rejoinLink} size={120} level="M" />
            </div>
          </div>
        </div>
      )}

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
