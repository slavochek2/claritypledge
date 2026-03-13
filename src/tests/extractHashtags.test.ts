import { describe, it, expect } from 'vitest';
import { extractHashtags } from '@/lib/utils';

describe('extractHashtags', () => {
  // ── Basic extraction ──────────────────────────────────────────────────────

  it('extracts single hashtag', () => {
    expect(extractHashtags('Hello #leadership')).toEqual(['leadership']);
  });

  it('extracts multiple hashtags', () => {
    expect(extractHashtags('Hello #leadership #trust')).toEqual(['leadership', 'trust']);
  });

  it('returns empty array when no hashtags', () => {
    expect(extractHashtags('No tags here')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });

  // ── Deduplication & casing ────────────────────────────────────────────────

  it('deduplicates identical hashtags', () => {
    expect(extractHashtags('#trust #trust')).toEqual(['trust']);
  });

  it('deduplicates case-insensitive hashtags', () => {
    expect(extractHashtags('#dup #Dup #DUP')).toEqual(['dup']);
  });

  it('lowercases all extracted tags', () => {
    expect(extractHashtags('#Leadership #TRUST')).toEqual(['leadership', 'trust']);
  });

  // ── Position in text ──────────────────────────────────────────────────────

  it('extracts hashtag at start of text', () => {
    expect(extractHashtags('#leadership is important')).toEqual(['leadership']);
  });

  it('extracts hashtag at end of text', () => {
    expect(extractHashtags('This is about #leadership')).toEqual(['leadership']);
  });

  it('extracts hashtags mixed in text', () => {
    expect(extractHashtags('Great #leadership and #trust in teams')).toEqual(['leadership', 'trust']);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('handles hashtag with numbers', () => {
    expect(extractHashtags('Check #web3 technology')).toEqual(['web3']);
  });

  it('handles hashtag with underscores', () => {
    expect(extractHashtags('About #co_founders')).toEqual(['co_founders']);
  });

  it('ignores lone # with no word after', () => {
    expect(extractHashtags('Cost is # 50')).toEqual([]);
  });

  it('handles multiple spaces between hashtags', () => {
    expect(extractHashtags('#one   #two')).toEqual(['one', 'two']);
  });

  it('handles hashtags on separate lines', () => {
    expect(extractHashtags('Line one #first\nLine two #second')).toEqual(['first', 'second']);
  });

  it('handles hashtag followed by punctuation', () => {
    expect(extractHashtags('About #leadership, #trust.')).toEqual(['leadership', 'trust']);
  });
});
