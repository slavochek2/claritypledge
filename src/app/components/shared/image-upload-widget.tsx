/**
 * @file image-upload-widget.tsx
 * @description P591: Image upload widget for story supporting images.
 *
 * Handles file selection, validation, HEIC conversion, resize, preview,
 * change, and remove. Returns processed blob to parent — parent decides
 * when/how to upload.
 *
 * State machine: idle → processing → done → (error resets to idle)
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  validateImageFormat,
  validateImageSize,
  processImageForUpload,
} from '@/lib/image-upload';

// ── Types ────────────────────────────────────────────────────────────────────

type WidgetState = 'idle' | 'processing' | 'done';

export interface ImageUploadWidgetProps {
  /** Current image URL — existing story image or local preview */
  imageUrl?: string | null;
  /** Called when image is processed and ready (blob + local preview URL) */
  onImageReady: (blob: Blob, previewUrl: string) => void;
  /** Called when user removes the image */
  onImageRemoved: () => void;
  /** Disable interactions (e.g. during form submission) */
  disabled?: boolean;
}

// ── File accept string ───────────────────────────────────────────────────────

const FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,.heic,.HEIC';

// ── Component ────────────────────────────────────────────────────────────────

export function ImageUploadWidget({
  imageUrl,
  onImageReady,
  onImageRemoved,
  disabled = false,
}: ImageUploadWidgetProps) {
  const [state, setState] = useState<WidgetState>(
    imageUrl ? 'done' : 'idle'
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    imageUrl ?? null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewRef = useRef<string | null>(null);

  // Clean up object URLs to prevent memory leaks
  const revokeLocalPreview = useCallback(() => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
  }, []);

  const openFilePicker = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!file) return;

      // Validate format
      const formatResult = validateImageFormat(file);
      if (!formatResult.valid) {
        toast.error('Please use JPEG, PNG, or WebP format (max 5MB)');
        return;
      }

      // Validate size
      const sizeResult = validateImageSize(file);
      if (!sizeResult.valid) {
        toast.error('Please use JPEG, PNG, or WebP format (max 5MB)');
        return;
      }

      // Show immediate preview from the raw file
      revokeLocalPreview();
      const rawPreview = URL.createObjectURL(file);
      localPreviewRef.current = rawPreview;
      setPreviewUrl(rawPreview);
      setState('processing');

      try {
        const result = await processImageForUpload(file);

        // Create preview from processed blob (may differ from raw if resized/converted)
        revokeLocalPreview();
        const processedPreview = URL.createObjectURL(result.blob);
        localPreviewRef.current = processedPreview;
        setPreviewUrl(processedPreview);
        setState('done');

        onImageReady(result.blob, processedPreview);
      } catch (err) {
        revokeLocalPreview();
        setPreviewUrl(null);
        setState('idle');

        const message =
          err instanceof Error ? err.message : 'Upload failed. Please try again.';

        // Map known processing errors to UI contract strings
        if (message.includes('Could not process')) {
          toast.error('Could not process this image. Try a different file.');
        } else if (message.includes('JPEG, PNG, or WebP')) {
          toast.error('Please use JPEG, PNG, or WebP format (max 5MB)');
        } else {
          toast.error('Upload failed. Please try again.');
        }
      }
    },
    [onImageReady, revokeLocalPreview]
  );

  const handleRemove = useCallback(() => {
    revokeLocalPreview();
    setPreviewUrl(null);
    setState('idle');
    onImageRemoved();
  }, [onImageRemoved, revokeLocalPreview]);

  // ── Render: idle state ───────────────────────────────────────────────────

  if (state === 'idle') {
    return (
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={handleFileSelected}
          tabIndex={-1}
          aria-hidden="true"
        />
        <Button
          type="button"
          variant="ghost"
          onClick={openFilePicker}
          disabled={disabled}
          aria-label="Add a supporting image to your story"
          className="flex items-center gap-2 text-muted-foreground"
        >
          <ImagePlus size={18} aria-hidden="true" />
          <span>
            Add image{' '}
            <span className="text-xs text-muted-foreground/70">(optional)</span>
          </span>
        </Button>
      </div>
    );
  }

  // ── Render: processing state ─────────────────────────────────────────────

  if (state === 'processing') {
    return (
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          onChange={handleFileSelected}
          tabIndex={-1}
          aria-hidden="true"
        />
        <div className="relative inline-block rounded-lg overflow-hidden">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Upload preview — processing"
              className="w-full max-h-[300px] rounded-lg object-contain opacity-60"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2
              size={32}
              className="animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </div>
        <div aria-live="polite" className="sr-only">
          Processing image...
        </div>
      </div>
    );
  }

  // ── Render: done state ───────────────────────────────────────────────────

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={handleFileSelected}
        tabIndex={-1}
        aria-hidden="true"
      />
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Story upload preview"
          className="w-full max-h-[300px] rounded-lg object-contain"
        />
      )}
      <div className="mt-2 flex gap-4">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={disabled}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Change image
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <div aria-live="polite" className="sr-only">
        Image uploaded
      </div>
    </div>
  );
}
