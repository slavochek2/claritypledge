import { describe, it, expect } from 'vitest';
import { extractBannerKeywords } from '@/app/prototypes/events/banner-utils';

describe('extractBannerKeywords', () => {
  describe('strips noise words', () => {
    it('strips "Clarity" from title', () => {
      expect(extractBannerKeywords('Clarity Walk')).not.toContain('clarity');
    });

    it('strips "Lab" from title', () => {
      expect(extractBannerKeywords('Communication Lab')).not.toContain('lab');
    });

    it('strips "Session" from title', () => {
      expect(extractBannerKeywords('Practice Session')).not.toContain('session');
    });

    it('strips "Workshop" from title', () => {
      expect(extractBannerKeywords('Leadership Workshop')).not.toContain('workshop');
    });

    it('strips "Event" from title', () => {
      expect(extractBannerKeywords('Networking Event')).not.toContain('event');
    });

    it('strips hashtag + number patterns (#1, #2)', () => {
      const result = extractBannerKeywords('Clarity Lab #1');
      expect(result).not.toMatch(/#\d/);
    });

    it('strips standalone numbers', () => {
      const result = extractBannerKeywords('Hike 2026');
      expect(result).not.toMatch(/\b\d+\b/);
    });
  });

  describe('retains meaningful words', () => {
    it('returns meaningful words from "Hike in Golden Gate Park"', () => {
      const result = extractBannerKeywords('Hike in Golden Gate Park');
      expect(result).toBeTruthy();
      expect(result.toLowerCase()).toContain('hike');
    });

    it('returns keywords from "Leadership Workshop" (strips Workshop, keeps Leadership)', () => {
      const result = extractBannerKeywords('Leadership Workshop');
      expect(result.toLowerCase()).toContain('leadership');
    });

    it('returns keywords from mixed title "Clarity Improv Session #3"', () => {
      const result = extractBannerKeywords('Clarity Improv Session #3');
      expect(result.toLowerCase()).toContain('improv');
    });
  });

  describe('edge cases', () => {
    it('returns empty string when all words are noise', () => {
      const result = extractBannerKeywords('Clarity Lab Session #1');
      // All words are noise — empty or whitespace-only result
      expect(result.trim()).toBe('');
    });

    it('handles empty string gracefully', () => {
      const result = extractBannerKeywords('');
      expect(result).toBe('');
    });

    it('is case-insensitive for noise words', () => {
      const result = extractBannerKeywords('CLARITY WORKSHOP leadership');
      expect(result.toLowerCase()).toContain('leadership');
      expect(result.toLowerCase()).not.toContain('clarity');
      expect(result.toLowerCase()).not.toContain('workshop');
    });

    it('trims whitespace from result', () => {
      const result = extractBannerKeywords('  Clarity Hike  ');
      expect(result).toBe(result.trim());
    });
  });
});
