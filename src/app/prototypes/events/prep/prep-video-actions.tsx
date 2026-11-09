/**
 * @file prep-video-actions.tsx
 * @description Videos are required in every preparation flow: the bar offers "Play the video" until the person has pressed Play, then
 * "Continue" (they need not finish the clip). There is no skip. The one exception is a clip that cannot load: it must not trap the person,
 * so a load error also offers Continue (recorded as not watched). Shared by the event preparation, /prepare and the group join.
 */
import { forwardRef, useCallback, useState } from 'react';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { StepActions } from './prep-ui';

export function useClipState<K extends string>() {
  const [played, setPlayed] = useState<Partial<Record<K, boolean>>>({});
  const [failed, setFailed] = useState<Partial<Record<K, boolean>>>({});
  const markPlayed = useCallback((clip: K) => () => setPlayed((p) => ({ ...p, [clip]: true })), []);
  const markFailed = useCallback((clip: K) => () => setFailed((p) => ({ ...p, [clip]: true })), []);
  /** Which try each clip is on: the page uses it as the Clip's `key`, so a retry mounts the player afresh (back on its poster). */
  const [attempt, setAttempt] = useState<Partial<Record<K, number>>>({});
  const retry = useCallback((clip: K) => {
    setFailed((p) => ({ ...p, [clip]: false }));
    setPlayed((p) => ({ ...p, [clip]: false }));
    setAttempt((a) => ({ ...a, [clip]: (a[clip] ?? 0) + 1 }));
  }, []);
  return { played, failed, markPlayed, markFailed, attempt, retry };
}

/** `onContinue(true)`: the person played the clip; `false`: it could not load, so nothing counts as watched. */
export const VideoActions = forwardRef<HTMLDivElement, {
  played: boolean; failed: boolean; onPlay: () => void; onContinue: (watched: boolean) => void;
  /** After a load error: mounts the clip again and presses Play for the person. */
  onRetry?: () => void;
}>(function VideoActions({ played, failed, onPlay, onContinue, onRetry }, ref) {
  return (
    <StepActions ref={ref}>
      {played || failed ? (
        <>
          {failed && <p role="status" className="pb-2 text-center text-sm text-muted-foreground" data-testid="video-load-error">The video could not load. You can try again or continue.</p>}
          <LetterPrimaryCta label="Continue" onClick={() => onContinue(played && !failed)} />
          {failed && onRetry && <LetterPrimaryCta label="Try the video again" onClick={onRetry} variant="secondary" />}
        </>
      ) : (
        <LetterPrimaryCta label="Play the video" onClick={onPlay} />
      )}
    </StepActions>
  );
});
