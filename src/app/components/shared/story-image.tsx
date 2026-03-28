"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";

interface StoryImageProps {
  src: string;
  authorName: string;
  onClick?: () => void;
  onChangeImage?: () => void;
  onRemoveImage?: () => void;
  className?: string;
}

export function StoryImage({
  src,
  authorName,
  onClick,
  onChangeImage,
  onRemoveImage,
  className,
}: StoryImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isAuthorMode = !!(onChangeImage || onRemoveImage);
  const alt = `Supporting image for ${authorName}'s story`;

  function handleClick() {
    if (onClick) {
      // Navigation callback (feed cards) — fire directly
      onClick();
      return;
    }
    // Both reader and author mode — open lightbox
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
            className="w-full rounded-lg object-cover"
            style={{ aspectRatio: '4/3' }}
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
