import { describe, it, expect } from 'vitest';
import { generateSlug } from '@/app/data/api';

describe('generateSlug', () => {
  describe('basic functionality', () => {
    it('converts name to lowercase hyphenated slug', () => {
      expect(generateSlug('John Doe')).toBe('john-doe');
    });

    it('handles single word names', () => {
      expect(generateSlug('Madonna')).toBe('madonna');
    });

    it('handles multiple spaces between words', () => {
      expect(generateSlug('John    Doe')).toBe('john-doe');
    });
  });

  describe('whitespace handling', () => {
    it('trims leading and trailing whitespace', () => {
      expect(generateSlug('  John Doe  ')).toBe('john-doe');
    });

    it('handles mixed whitespace', () => {
      expect(generateSlug('  John   Doe  ')).toBe('john-doe');
    });
  });

  describe('special characters', () => {
    it('removes special characters', () => {
      expect(generateSlug('John @Doe!')).toBe('john-doe');
    });

    it('removes punctuation', () => {
      expect(generateSlug("John's Doe, Jr.")).toBe('johns-doe-jr');
    });

    it('handles parentheses and brackets', () => {
      expect(generateSlug('John (The) Doe [CEO]')).toBe('john-the-doe-ceo');
    });
  });

  describe('unicode characters', () => {
    // P985: accented Latin folds to clean ASCII (was 'jos-garca' — accents were
    // stripped mid-character, freezing the same bug class P985 fixes).
    it('folds accented characters to ASCII', () => {
      expect(generateSlug('José García')).toBe('jose-garcia');
    });

    it('handles mixed unicode and ascii', () => {
      expect(generateSlug('John Müller')).toBe('john-muller');
    });

    // P985: non-Latin scripts survive as a non-empty slug (never "").
    // Persisted slugs are romanized separately via slugifyName().
    it('keeps a non-empty slug for a non-Latin name', () => {
      expect(generateSlug('李明').length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(generateSlug('')).toBe('');
    });

    it('handles whitespace-only string', () => {
      expect(generateSlug('   ')).toBe('');
    });

    it('handles numbers', () => {
      expect(generateSlug('User 123')).toBe('user-123');
    });

    it('handles already-hyphenated names', () => {
      expect(generateSlug('Mary-Jane Watson')).toBe('mary-jane-watson');
    });

    it('handles multiple consecutive hyphens', () => {
      expect(generateSlug('John---Doe')).toBe('john-doe');
    });
  });
});