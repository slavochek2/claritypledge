/**
 * @file listening-game-page.tsx
 * @description P1696 — public /game page: the Listening Game video and roles (same copy and clip as the
 * P1685 preparation step), then "Learn the Clarity practice" (to /prepare) and "Read the manifesto". Signed-out friendly; writes no preparation state.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@/app/components/seo';
import { Button } from '@/components/ui/button';
import { watchSeconds } from '@/app/prototypes/events/prep/prep-plan';
import { Clip, Title, type ClipMedia } from '@/app/prototypes/events/prep/prep-ui';
import { LISTENING_GAME_COPY, ROLE_CARDS, listeningGamePosterUrl, listeningGameVideoUrl } from '@/app/prototypes/events/prep/listening-game';
import { RoleCards } from '@/app/prototypes/events/prep/RoleCards';

export function ListeningGamePage() {
  const media = useMemo<ClipMedia>(() => ({
    id: 'listening-game',
    src: listeningGameVideoUrl(),
    poster: listeningGamePosterUrl(),
    posterAlt: LISTENING_GAME_COPY.posterAlt,
    playLabel: LISTENING_GAME_COPY.playLabel,
    seconds: watchSeconds('listeningGame'),
  }), []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 lg:py-12" data-testid="game-page">
      <SEO
        title="The Listening Game"
        description="Three roles that reveal the gap between what you mean and what the other person understands, in 3 seconds."
        url="/game"
      />
      <section className="space-y-5">
        <div className="space-y-2">
          <Title>{LISTENING_GAME_COPY.heading}</Title>
          <p className="text-base leading-relaxed text-muted-foreground" data-testid="listening-game-intro">{LISTENING_GAME_COPY.subtitle}</p>
        </div>
        <Clip media={media} />
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground" data-testid="listening-game-rules-heading">{LISTENING_GAME_COPY.rolesHeading}</h2>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground" data-testid="listening-game-rules">
            {LISTENING_GAME_COPY.roles.map((role) => (
              <li key={role.name}><strong className="font-semibold">{role.name}</strong> {role.text}</li>
            ))}
          </ul>
          <p className="text-base leading-relaxed text-foreground" data-testid="listening-game-closing">{LISTENING_GAME_COPY.closing}</p>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">{ROLE_CARDS.heading}</h2>
          <RoleCards />
        </div>
        <div className="flex flex-col items-center gap-2 pt-2" data-testid="game-actions">
          <div className="w-full max-w-sm">
            <Button asChild className="min-h-11 w-full rounded-full text-base font-bold">
              <Link to="/prepare">Learn the Clarity practice</Link>
            </Button>
          </div>
          <Link
            to="/manifesto"
            className="inline-flex min-h-11 items-center rounded text-blue-600 underline underline-offset-4 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Read the manifesto
          </Link>
        </div>
      </section>
    </div>
  );
}
