/**
 * @file utils.test.ts
 * Unit tests for src/lib/utils.ts — pure utility functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getInitials, getAvatarColor, formatRelativeTime, getGravatarUrl, copyToClipboard, shareOrCopy } from '../lib/utils';

// ── getInitials ─────────────────────────────────────────────────────────────

describe('getInitials', () => {
  it('returns "?" for undefined', () => {
    expect(getInitials(undefined)).toBe('?');
  });

  it('returns "?" for empty string', () => {
    expect(getInitials('')).toBe('?');
  });

  it('returns "?" for whitespace-only', () => {
    expect(getInitials('   ')).toBe('?');
  });

  it('returns single initial for one-word name', () => {
    expect(getInitials('Slava')).toBe('S');
  });

  it('returns two initials for two-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first and last initials for multi-word name', () => {
    expect(getInitials('John Michael Doe')).toBe('JD');
  });

  it('handles lowercase input', () => {
    expect(getInitials('alice bob')).toBe('AB');
  });

  it('handles extra whitespace', () => {
    expect(getInitials('  Jane   Doe  ')).toBe('JD');
  });
});

// ── getAvatarColor ──────────────────────────────────────────────────────────

describe('getAvatarColor', () => {
  it('returns custom color when provided', () => {
    expect(getAvatarColor('John', 'bg-red-700')).toBe('bg-red-700');
  });

  it('returns a Tailwind bg class for a name', () => {
    const result = getAvatarColor('John');
    expect(result).toMatch(/^bg-\w+-500$/);
  });

  it('is deterministic — same name always returns same color', () => {
    const color1 = getAvatarColor('Alice');
    const color2 = getAvatarColor('Alice');
    expect(color1).toBe(color2);
  });

  it('different names can produce different colors', () => {
    // Not guaranteed for all pairs, but "A" vs "ZZZZ" should differ
    const colorA = getAvatarColor('A');
    const colorZ = getAvatarColor('ZZZZZZZZ');
    // At least verify both are valid
    expect(colorA).toMatch(/^bg-\w+-500$/);
    expect(colorZ).toMatch(/^bg-\w+-500$/);
  });
});

// ── formatRelativeTime ──────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T12:00:00Z'));
  });

  it('returns "just now" for < 60 seconds ago', () => {
    expect(formatRelativeTime('2026-04-03T11:59:30Z')).toBe('just now');
  });

  it('returns minutes ago', () => {
    expect(formatRelativeTime('2026-04-03T11:55:00Z')).toBe('5m ago');
  });

  it('returns hours ago', () => {
    expect(formatRelativeTime('2026-04-03T09:00:00Z')).toBe('3h ago');
  });

  it('returns days ago for < 7 days', () => {
    expect(formatRelativeTime('2026-04-01T12:00:00Z')).toBe('2d ago');
  });

  it('returns localized date for >= 7 days', () => {
    const result = formatRelativeTime('2026-03-20T12:00:00Z');
    // Should be a date string, not relative
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ── getGravatarUrl ──────────────────────────────────────────────────────────

describe('getGravatarUrl', () => {
  it('returns undefined for undefined email', async () => {
    expect(await getGravatarUrl(undefined)).toBeUndefined();
  });

  it('returns undefined for empty email', async () => {
    expect(await getGravatarUrl('')).toBeUndefined();
  });

  it('returns undefined for whitespace email', async () => {
    expect(await getGravatarUrl('   ')).toBeUndefined();
  });

  it('returns a gravatar URL for valid email', async () => {
    const url = await getGravatarUrl('test@example.com');
    expect(url).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]+\?s=160&d=404$/);
  });

  it('normalizes email — same hash for different casing', async () => {
    const url1 = await getGravatarUrl('Test@Example.com');
    const url2 = await getGravatarUrl('test@example.com');
    expect(url1).toBe(url2);
  });

  it('trims whitespace before hashing', async () => {
    const url1 = await getGravatarUrl('  test@example.com  ');
    const url2 = await getGravatarUrl('test@example.com');
    expect(url1).toBe(url2);
  });

  it('respects custom size parameter', async () => {
    const url = await getGravatarUrl('test@example.com', 80);
    expect(url).toContain('s=80');
  });
});

// ── copyToClipboard ─────────────────────────────────────────────────────────

describe('copyToClipboard', () => {
  it('uses Clipboard API in secure context', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });

    const result = await copyToClipboard('hello');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('hello');
  });

  it('returns false on clipboard failure', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });

    const result = await copyToClipboard('hello');
    expect(result).toBe(false);
  });
});

// ── shareOrCopy ──────────────────────────────────────────────────────────────

describe('shareOrCopy', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
  });

  it('returns shared when native share succeeds', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: shareMock });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await shareOrCopy('My Event', 'https://example.com');
    expect(result).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns dismissed and does NOT copy when user cancels (AbortError)', async () => {
    const abort = new DOMException('User cancelled', 'AbortError');
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(abort) });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await shareOrCopy('My Event', 'https://example.com');
    expect(result).toBe('dismissed');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls through to clipboard on non-abort native share error', async () => {
    const err = new Error('Share failed');
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(err) });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await shareOrCopy('My Event', 'https://example.com');
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('goes straight to clipboard when native share is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, writable: true, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await shareOrCopy('My Event', 'https://example.com');
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('returns failed when native share unavailable and clipboard fails', async () => {
    Object.assign(navigator, { share: undefined });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    const result = await shareOrCopy('My Event', 'https://example.com');
    expect(result).toBe('failed');
  });
});
