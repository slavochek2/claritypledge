"use client";

import { useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { analytics } from "@/lib/mixpanel";

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventName?: string;
}

export function ImageLightbox({
  src,
  alt,
  open,
  onOpenChange,
  eventName = "story_image_viewed",
}: ImageLightboxProps) {
  const tracked = useRef(false);
  useEffect(() => {
    if (open && !tracked.current) {
      tracked.current = true;
      analytics.track(eventName, { src });
    }
    if (!open) tracked.current = false;
  }, [open, src, eventName]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          onClick={(e) => e.stopPropagation()}
        />

        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-label="Full-size image view"
          onClick={(e) => {
            // Stop all clicks inside the lightbox from reaching card elements underneath
            e.stopPropagation();
            // Close on backdrop click (click on the content container itself, not the image)
            if (e.target === e.currentTarget) {
              onOpenChange(false);
            }
          }}
          onPointerDownOutside={(e) => e.stopPropagation()}
        >
          {/* Visually hidden title for accessibility */}
          <DialogPrimitive.Title className="sr-only">
            {alt}
          </DialogPrimitive.Title>

          <img
            src={src}
            alt={alt}
            className="max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] object-contain"
          />

          <DialogPrimitive.Close className="fixed right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
