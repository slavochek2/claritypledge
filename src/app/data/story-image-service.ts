/**
 * @file story-image-service.ts
 * @description P591: Upload service for story supporting images.
 *
 * Orchestrates: client-side processing → signed URL request → GCS upload.
 * Uses the Supabase edge function `generate-story-image-url` for signed URLs.
 */

import { processImageForUpload } from '@/lib/image-upload';

// ── Types ────────────────────────────────────────────────────────────────────

interface SignedUrlResponse {
  signedUrl: string;
  publicUrl: string;
}

// ── Upload Service ───────────────────────────────────────────────────────────

/**
 * Uploads a story supporting image through the full pipeline:
 * 1. Process image (validate, convert HEIC, resize)
 * 2. Request signed URL from edge function
 * 3. PUT processed blob to GCS via signed URL
 *
 * @returns The public GCS URL for the uploaded image.
 */
export async function uploadStoryImage(
  storyId: string,
  file: File,
  token: string
): Promise<string> {
  // Step 1: Process image (validate format/size, convert HEIC, resize)
  const result = await processImageForUpload(file);

  // Step 2: Get signed URL from edge function
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/generate-story-image-url`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let signedUrlResponse: SignedUrlResponse;
  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        storyId,
        contentType: result.blob.type,
        fileName: file.name,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to get signed upload URL: ${error.error || response.statusText}`);
    }

    signedUrlResponse = await response.json();
  } finally {
    clearTimeout(timeoutId);
  }

  // Step 3: PUT processed blob to GCS signed URL
  const uploadController = new AbortController();
  const uploadTimeoutId = setTimeout(() => uploadController.abort(), 30000);

  try {
    const uploadResponse = await fetch(signedUrlResponse.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': result.blob.type,
        'x-goog-content-length-range': '1,5242880',
      },
      body: result.blob,
      signal: uploadController.signal,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Image upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
      );
    }
  } finally {
    clearTimeout(uploadTimeoutId);
  }

  return signedUrlResponse.publicUrl;
}
