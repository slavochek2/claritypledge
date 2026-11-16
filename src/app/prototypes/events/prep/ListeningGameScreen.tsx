/**
 * @file ListeningGameScreen.tsx
 * @description P1685 — the Listening Game step, shared by PreparePage and EventPrepPage: the written rules above the
 * video, then the pinned bar every required preparation video uses (Play the video, then Continue; no skip; a clip that
 * cannot load offers Continue and Try again). `onContinue(true)` = the person played it, `false` = it could not load.
 */
import { forwardRef, useMemo, useState } from 'react';
import { watchSeconds } from './prep-plan';
import { Clip, Title, type ClipMedia } from './prep-ui';
import { useClipState, VideoActions } from './prep-video-actions';
import { LISTENING_GAME_COPY, listeningGamePosterUrl, listeningGameVideoUrl } from './listening-game';

export const ListeningGameScreen = forwardRef<HTMLDivElement, {
  onContinue: (watched: boolean) => void;
  /** False pauses a playing video (the learning hidden inside the room). */
  active?: boolean;
}>(function ListeningGameScreen({ onContinue, active = true }, barRef) {
  const clips = useClipState<'game'>();
  const [playRequest, setPlayRequest] = useState(0);
  const media = useMemo<ClipMedia>(() => ({
    id: 'listening-game',
    src: listeningGameVideoUrl(),
    poster: listeningGamePosterUrl(),
    posterAlt: LISTENING_GAME_COPY.posterAlt,
    playLabel: LISTENING_GAME_COPY.playLabel,
    seconds: watchSeconds('listeningGame'),
  }), []);
  return (
    <section className="space-y-5" data-testid="listening-game">
      <div className="space-y-3">
        <Title>{LISTENING_GAME_COPY.heading}</Title>
        <p className="text-base leading-relaxed text-foreground" data-testid="listening-game-intro">{LISTENING_GAME_COPY.intro}</p>
        <ol className="list-decimal space-y-2 pl-5 text-base leading-relaxed text-foreground" data-testid="listening-game-rules">
          {LISTENING_GAME_COPY.rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ol>
      </div>
      <Clip
        key={clips.attempt.game ?? 0}
        media={media}
        pulse={!clips.played.game}
        onPlay={clips.markPlayed('game')}
        onError={clips.markFailed('game')}
        playRequest={playRequest}
        paused={!active}
      />
      <VideoActions
        ref={barRef}
        played={!!clips.played.game}
        failed={!!clips.failed.game}
        onPlay={() => setPlayRequest((n) => n + 1)}
        onContinue={onContinue}
        onRetry={() => { clips.retry('game'); setPlayRequest((n) => n + 1); }}
      />
    </section>
  );
});
