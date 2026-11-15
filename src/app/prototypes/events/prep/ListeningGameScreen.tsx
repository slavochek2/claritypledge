/**
 * @file ListeningGameScreen.tsx
 * @description P1685 — the one Listening Game screen shared by PreparePage and EventPrepPage: the video, a heading
 * and four rule lines, with its own pinned action bar (Play the video, a small "Continue without video" link,
 * then Continue once played). Records no part, so skipping it is safe.
 */
import { forwardRef, useEffect, useRef, useState } from 'react';
import { Mp4VideoFacade } from '@/app/components/shared/mp4-video-facade';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { PLAYBACK_RATE, watchSeconds } from './prep-plan';
import { StepActions, Title } from './prep-ui';
import { LISTENING_GAME_COPY, listeningGamePosterUrl, listeningGameVideoUrl } from './listening-game';

export const ListeningGameScreen = forwardRef<HTMLDivElement, {
  onContinue: () => void;
  /** False pauses a playing video (the learning hidden inside the room). */
  active?: boolean;
}>(function ListeningGameScreen({ onContinue, active = true }, barRef) {
  const [played, setPlayed] = useState(false);
  const [playRequest, setPlayRequest] = useState(0);
  const clipRef = useRef<HTMLDivElement>(null);
  // The bar's "Play the video" presses the poster's own button.
  useEffect(() => {
    if (playRequest > 0) clipRef.current?.querySelector<HTMLButtonElement>('button')?.click();
  }, [playRequest]);
  return (
    <section className="space-y-5" data-testid="listening-game">
      <Title>{LISTENING_GAME_COPY.heading}</Title>
      <div data-testid="clip-listening-game" ref={clipRef}>
        <Mp4VideoFacade
          look="story"
          src={listeningGameVideoUrl()}
          poster={listeningGamePosterUrl()}
          posterAlt={LISTENING_GAME_COPY.posterAlt}
          playLabel={LISTENING_GAME_COPY.playLabel}
          durationSeconds={watchSeconds('listeningGame')}
          pulse={!played}
          onPlay={() => setPlayed(true)}
          playbackRate={PLAYBACK_RATE}
          paused={!active}
        />
      </div>
      <ul className="space-y-2 text-base leading-relaxed text-foreground" data-testid="listening-game-rules">
        {LISTENING_GAME_COPY.rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
      <StepActions ref={barRef}>
        {played ? (
          <LetterPrimaryCta label="Continue" onClick={onContinue} />
        ) : (
          <>
            <LetterPrimaryCta label="Play the video" onClick={() => setPlayRequest((n) => n + 1)} />
            <LetterPrimaryCta label="Continue without video" onClick={onContinue} variant="secondary" />
          </>
        )}
      </StepActions>
    </section>
  );
});
