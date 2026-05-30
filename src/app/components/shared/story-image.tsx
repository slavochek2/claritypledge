"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";

interface StoryImageProps {
  src: string;
  authorName: string;
  onChangeImage?: () => void;
  onRemoveImage?: () => void;
  className?: string;
  /** P852 Round-E: image fit policy. 'cover' (default) preserves 4:3 framing and crops
   * for feed/social rhythm. 'contain' drops the 4:3 lock and scales-to-fit — use for
   * diagrams/process images where edge content must remain visible (e.g., letter reading). */
  fit?: 'cover' | 'contain';
}

export function StoryImage({
  src,
  authorName,
  onChangeImage,
  onRemoveImage,
  className,
  fit = 'cover',
}: StoryImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isAuthorMode = !!(onChangeImage || onRemoveImage);
  const alt = `Supporting image for ${authorName}'s story`;

  function handleClick(e: React.MouseEvent) {
    // Always stop propagation so parent card click doesn't fire
    e.stopPropagation();
    // Always open lightbox — card-level click handles navigation
    setLightboxOpen(true);
  }

  return (
    <>
      <div
        className={cn(
          "group relative items-start overflow-hidden rounded-lg",
          className
        )}
      >
        {/* Image — always wrapped in button for a11y + lightbox */}
        <button
          type="button"
          onClick={handleClick}
          aria-label="View full-size image"
          className={cn(
            "w-full cursor-pointer bg-transparent p-0 border-0",
            "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none rounded-lg"
          )}
        >
          <img
            src={src}
            alt={alt}
            className={cn(
              "w-full rounded-lg",
              fit === 'contain' ? 'object-contain' : 'object-cover'
            )}
            style={fit === 'cover' ? { aspectRatio: '4/3' } : undefined}
          />
        </button>

        {/* Author overlay — desktop only */}
        {isAuthorMode && (
          <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100 md:block">
            <div className="flex gap-4">
              {onChangeImage && (
                <button
                  type="button"
                  onClick={onChangeImage}
                  className="text-sm font-medium text-white hover:text-white/80"
                >
                  Change image
                </button>
              )}
              {onRemoveImage && (
                <button
                  type="button"
                  onClick={onRemoveImage}
                  className="text-sm font-medium text-white hover:text-white/80"
                >
                  Remove image
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Author controls — mobile only */}
      {isAuthorMode && (
        <div className="mt-2 flex gap-4 md:hidden">
          {onChangeImage && (
            <button
              type="button"
              onClick={onChangeImage}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Change image
            </button>
          )}
          {onRemoveImage && (
            <button
              type="button"
              onClick={onRemoveImage}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Remove image
            </button>
          )}
        </div>
      )}

      {/* Lightbox for reader mode */}
      <ImageLightbox
        src={src}
        alt={alt}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  );
}
