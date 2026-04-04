/**
 * @file partners-utils.test.ts
 * Unit tests for src/app/components/partners/utils.ts
 */

import { describe, it, expect } from 'vitest';
import { capitalizeName, getFirstName } from '../app/components/partners/utils';

describe('capitalizeName', () => {
  it('capitalizes single word', () => {
    expect(capitalizeName('john')).toBe('John');
  });

  it('capitalizes each word', () => {
    expect(capitalizeName('john doe')).toBe('John Doe');
  });

  it('preserves already-capitalized input', () => {
    expect(capitalizeName('Alice Bob')).toBe('Alice Bob');
  });

  it('handles mixed case', () => {
    expect(capitalizeName('jOHN dOE')).toBe('JOHN DOE');
  });

  it('handles empty string', () => {
    expect(capitalizeName('')).toBe('');
  });
});

describe('getFirstName', () => {
  it('extracts and capitalizes first name', () => {
    expect(getFirstName('john doe')).toBe('John');
  });

  it('handles single name', () => {
    expect(getFirstName('alice')).toBe('Alice');
  });

  it('lowercases rest of first name', () => {
    expect(getFirstName('JOHN DOE')).toBe('John');
  });

  it('trims whitespace', () => {
    expect(getFirstName('  bob smith  ')).toBe('Bob');
  });
});
