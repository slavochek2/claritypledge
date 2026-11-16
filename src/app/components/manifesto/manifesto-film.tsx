/**
 * P1682 — "The Clarity Tax", the manifesto told as a 2-minute narrated film, at the top of
 * /manifesto. Self-hosted click-to-play (no YouTube player on our pages); the narration is
 * burned into the picture as on-screen text, so no caption track is attached.
 */
import { Mp4VideoFacade } from "@/app/components/shared/mp4-video-facade";
import { publicMediaUrl } from "@/lib/public-media";
import { analytics } from "@/lib/mixpanel";

const MANIFESTO_FILM = {
  src: publicMediaUrl("manifesto/the-clarity-tax-v1.mp4"),
  poster: publicMediaUrl("manifesto/the-clarity-tax-poster-v3.jpg"),
  durationSeconds: 114,
} as const;

/** `location` says which page showed the film (analytics): the manifesto page, or the /prepare success screen (P1685). */
export function ManifestoFilm({ location = "manifesto" }: { location?: "manifesto" | "prepare_end" }) {
  return (
    <Mp4VideoFacade
      src={MANIFESTO_FILM.src}
      poster={MANIFESTO_FILM.poster}
      posterAlt="Two figures joined by a line of light: understanding wins over comfort, fear and ego"
      playLabel="Play the manifesto film, The Clarity Tax"
      durationSeconds={MANIFESTO_FILM.durationSeconds}
      onPlay={() => analytics.track("manifesto_film_play", { location })}
    />
  );
}
