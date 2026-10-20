/**
 * VideoLightbox (P1517) — a full-viewport player for a bucket mp4, the video twin of ImageLightbox.
 * The tile that opens it stays poster + play button; the <video> mounts only while this is open
 * (Radix unmounts the content on close, which also stops playback). Sound on, native controls,
 * inline on iOS. Closes on the X, Escape, or a tap on the backdrop. The content layer is
 * pointer-events-none so a backdrop tap lands on the Overlay (Radix treats it as outside); the video
 * and the X opt back in, so releasing a scrubber drag off the video can never close it.
 */
import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface VideoLightboxProps {
  src: string;
  poster: string;
  /** Names the video for assistive tech and titles the dialog. */
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoLightbox({ src, poster, alt, open, onOpenChange }: VideoLightboxProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="video-lightbox-overlay"
          className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          aria-describedby={undefined}
          // Radix sets inline pointer-events:auto on a modal layer, which beats the class below; the
          // inline style here is spread after it, so the full-viewport layer lets backdrop taps through.
          style={{ pointerEvents: 'none' }}
          onOpenAutoFocus={(e) => {
            // Land on the player, not the X, so Space/K and the arrow keys drive the clip.
            e.preventDefault();
            videoRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          {/* Captions are optional for these clips (same as Mp4VideoFacade). */}
          <div className="pointer-events-auto">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={(el) => {
              videoRef.current = el;
              // Belt and braces for iOS, which can ignore autoPlay on an unmuted video.
              el?.play?.()?.catch?.(() => {});
            }}
            tabIndex={0}
            src={src}
            poster={poster}
            aria-label={alt}
            controls
            autoPlay
            playsInline
            className="max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] object-contain"
          />
          </div>
          <DialogPrimitive.Close className="pointer-events-auto fixed right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
