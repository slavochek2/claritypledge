/**
 * Mp4VideoFacade — the product's click-to-play player for a self-hosted mp4 (extracted from
 * founder-credibility.tsx's VideoFacade, P1005). The poster and a play button show at rest; the
 * <video> element mounts and loads only on click (no autoplay on render, nothing fetched but
 * the poster), then plays with native controls, inline on iOS.
 *
 * Two looks, one mechanism:
 *  - 'landing' (default): the founder-credibility markup, byte for byte — a rounded-2xl card
 *    with a dimmed poster and a white disc carrying a blue play glyph.
 *  - 'story': StoryVideoPlayer's facade look — rounded-lg black frame, undimmed poster and its
 *    own PosterPlayButton — for a surface where a native clip sits in the same flow as a story
 *    video (P1336 onboarding) and a second play-button language would read as a different thing.
 *
 * `pulse` and `durationSeconds` are opt-in; without them either look renders what it did before.
 */
import { useRef, useState } from 'react';
import { PlayIcon } from 'lucide-react';
import { formatTimecode } from '@/lib/video';
import { PosterPlayButton } from './story-video-player';

export interface Mp4VideoFacadeProps {
  src: string;
  poster: string;
  /** Describes the poster image. */
  posterAlt: string;
  /** Accessible name of the poster's play button. */
  playLabel: string;
  /** WebVTT captions, shown by default when present. */
  captions?: string;
  /** Called once, on the first play. */
  onPlay?: () => void;
  look?: 'landing' | 'story';
  /** A pulsing ring behind the play button while the poster shows. Default false. */
  pulse?: boolean;
  /** Shown as a badge on the poster (m:ss) when set. */
  durationSeconds?: number;
  /** P1336: playback speed once playing (e.g. 1.3). Default: the browser's 1. */
  playbackRate?: number;
}

const FRAME = {
  landing: 'relative aspect-video w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-border bg-black',
  story: 'relative aspect-video w-full overflow-hidden rounded-lg bg-black',
} as const;

export function Mp4VideoFacade({
  src,
  poster,
  posterAlt,
  playLabel,
  captions,
  onPlay,
  look = 'landing',
  pulse = false,
  durationSeconds,
  playbackRate,
}: Mp4VideoFacadeProps) {
  const [playing, setPlaying] = useState(false);
  const firedRef = useRef(false);

  const handlePlay = () => {
    if (!firedRef.current) {
      firedRef.current = true;
      onPlay?.();
    }
    setPlaying(true);
  };

  return (
    <div className={FRAME[look]}>
      {playing ? (
        // Captions are optional: the rule cannot see the conditional <track> below. A clip
        // without captions (the P1336 prototype's local drafts) plays without them.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={src}
          poster={poster}
          ref={(el) => {
            if (el && playbackRate) {
              el.defaultPlaybackRate = playbackRate;
              el.playbackRate = playbackRate;
            }
          }}
          controls
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          {captions && <track kind="captions" src={captions} srcLang="en" label="English" default />}
        </video>
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          aria-label={playLabel}
          className="group absolute inset-0 h-full w-full cursor-pointer"
        >
          <img src={poster} alt={posterAlt} className="absolute inset-0 h-full w-full object-cover" />
          {look === 'story' ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <PosterPlayButton pulse={pulse} />
            </span>
          ) : (
            <>
              <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/30" />
              {pulse && (
                <span
                  className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 animate-ping"
                  aria-hidden="true"
                  data-testid="play-pulse"
                />
              )}
              <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
                <PlayIcon className="h-7 w-7 translate-x-0.5 fill-blue-600 text-blue-600" />
              </span>
            </>
          )}
          {typeof durationSeconds === 'number' && durationSeconds > 0 && (
            // Same badge as StoryVideoPlayer's poster and VideoThumbnailCard.
            <span
              className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white"
              data-testid="video-duration-badge"
            >
              {formatTimecode(durationSeconds)}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
