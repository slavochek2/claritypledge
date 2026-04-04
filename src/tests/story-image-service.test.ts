/**
 * @file story-image-service.test.ts
 * Unit tests for src/app/data/story-image-service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock image-upload module
vi.mock('../lib/image-upload', () => ({
  processImageForUpload: vi.fn(),
}));

import { processImageForUpload } from '../lib/image-upload';
import { uploadStoryImage } from '../app/data/story-image-service';

const mockProcessImage = vi.mocked(processImageForUpload);

describe('uploadStoryImage', () => {
  const mockFile = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });
  const mockToken = 'bearer-token-123';
  const mockStoryId = 'story-abc';

  beforeEach(() => {
    vi.clearAllMocks();

    mockProcessImage.mockResolvedValue({
      blob: new Blob(['processed'], { type: 'image/webp' }),
      width: 800,
      height: 600,
    });
  });

  it('calls processImageForUpload with the file', async () => {
    // Mock fetch for signed URL + upload
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          signedUrl: 'https://storage.googleapis.com/signed',
          publicUrl: 'https://storage.googleapis.com/public/photo.webp',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    await uploadStoryImage(mockStoryId, mockFile, mockToken);

    expect(mockProcessImage).toHaveBeenCalledWith(mockFile);
  });

  it('requests signed URL with correct params', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          signedUrl: 'https://signed-url',
          publicUrl: 'https://public-url',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    await uploadStoryImage(mockStoryId, mockFile, mockToken);

    // First call = signed URL request
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/generate-story-image-url');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe(`Bearer ${mockToken}`);

    const body = JSON.parse(options.body);
    expect(body.storyId).toBe(mockStoryId);
    expect(body.contentType).toBe('image/webp');
  });

  it('uploads processed blob to signed URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          signedUrl: 'https://storage.googleapis.com/signed',
          publicUrl: 'https://storage.googleapis.com/public/photo.webp',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    await uploadStoryImage(mockStoryId, mockFile, mockToken);

    // Second call = GCS upload
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('https://storage.googleapis.com/signed');
    expect(options.method).toBe('PUT');
    expect(options.headers['Content-Type']).toBe('image/webp');
  });

  it('returns the public URL on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          signedUrl: 'https://signed',
          publicUrl: 'https://public/result.webp',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadStoryImage(mockStoryId, mockFile, mockToken);
    expect(result).toBe('https://public/result.webp');
  });

  it('throws when signed URL request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'Invalid token' }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadStoryImage(mockStoryId, mockFile, mockToken))
      .rejects.toThrow('Failed to get signed upload URL');
  });

  it('throws when GCS upload fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          signedUrl: 'https://signed',
          publicUrl: 'https://public/result.webp',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
      });

    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadStoryImage(mockStoryId, mockFile, mockToken))
      .rejects.toThrow('Image upload failed: 413 Payload Too Large');
  });
});
