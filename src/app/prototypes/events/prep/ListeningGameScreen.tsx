/**
 * @file ListeningGameScreen.tsx
 * @description P1685 — the Listening Game step, shared by PreparePage and EventPrepPage: title and subtitle, the video, the
 * roles below it, then the pinned bar every required preparation video uses (Play the video, then Continue; no skip; a clip that
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
      <div className="space-y-2">
        <Title>{LISTENING_GAME_COPY.heading}</Title>
        <p className="text-base leading-relaxed text-muted-foreground" data-testid="listening-game-intro">{LISTENING_GAME_COPY.subtitle}</p>
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
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground" data-testid="listening-game-rules-heading">{LISTENING_GAME_COPY.rolesHeading}</h2>
        <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground" data-testid="listening-game-rules">
          {LISTENING_GAME_COPY.roles.map((role) => (
            <li key={role.name}><strong className="font-semibold">{role.name}</strong> {role.text}</li>
          ))}
        </ul>
        <p className="text-base leading-relaxed text-foreground" data-testid="listening-game-closing">{LISTENING_GAME_COPY.closing}</p>
      </div>
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
