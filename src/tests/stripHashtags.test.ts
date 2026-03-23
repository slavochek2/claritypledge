import { describe, it, expect } from 'vitest';
import { stripHashtags } from '@/lib/utils';

describe('stripHashtags', () => {
  // ── With explicit tags ─────────────────────────────────────────────────────

  it('strips provided tags from content', () => {
    expect(stripHashtags('I want partners #partners', ['partners'])).toBe('I want partners');
  });

  it('strips multiple tags', () => {
    expect(stripHashtags('About #leadership and #trust', ['leadership', 'trust'])).toBe('About and');
  });

  it('is case-insensitive', () => {
    expect(stripHashtags('Check #Partners here', ['partners'])).toBe('Check here');
  });

  // ── Without explicit tags (fallback extraction) ────────────────────────────

  it('falls back to extracting hashtags from text when tags is undefined', () => {
    expect(stripHashtags('I want partners who can. #partners')).toBe('I want partners who can.');
  });

  it('falls back to extracting hashtags from text when tags is empty array', () => {
    expect(stripHashtags('I want partners who can. #partners', [])).toBe('I want partners who can.');
  });

  it('returns content unchanged when no hashtags in text and tags is empty', () => {
    expect(stripHashtags('No tags here', [])).toBe('No tags here');
  });

  it('returns content unchanged when no hashtags in text and tags is undefined', () => {
    expect(stripHashtags('No tags here')).toBe('No tags here');
  });

  it('strips multiple hashtags via fallback', () => {
    expect(stripHashtags('Good #leadership and #trust', [])).toBe('Good and');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('does not strip partial matches', () => {
    expect(stripHashtags('Check #st7 not #st77', ['st7'])).toBe('Check not #st77');
  });

  it('collapses multiple spaces after stripping', () => {
    expect(stripHashtags('A #tag B', ['tag'])).toBe('A B');
  });

  it('trims leading/trailing whitespace after stripping', () => {
    expect(stripHashtags('#tag rest of text', ['tag'])).toBe('rest of text');
  });
});
