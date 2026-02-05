import { describe, it, expect } from 'vitest';
import { resolveShortLink, listShortLinks } from '@/app/data/short-links';

describe('resolveShortLink', () => {
  it('resolves known codes', () => {
    expect(resolveShortLink('article')).toBe('/article');
    expect(resolveShortLink('3gaps')).toContain('#the-three-asymmetries');
  });

  it('is case-insensitive', () => {
    expect(resolveShortLink('ARTICLE')).toBe('/article');
    expect(resolveShortLink('Article')).toBe('/article');
    expect(resolveShortLink('3GAPS')).toContain('#the-three-asymmetries');
  });

  it('handles trailing slashes', () => {
    expect(resolveShortLink('article/')).toBe('/article');
    expect(resolveShortLink('3gaps/')).toContain('#the-three-asymmetries');
  });

  it('returns null for unknown codes', () => {
    expect(resolveShortLink('nonexistent')).toBeNull();
    expect(resolveShortLink('random123')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveShortLink('')).toBeNull();
  });

  it('all asymmetry codes point to the same section', () => {
    const target = resolveShortLink('3gaps');
    expect(resolveShortLink('role')).toBe(target);
    expect(resolveShortLink('info')).toBe(target);
    expect(resolveShortLink('vuln')).toBe(target);
  });
});

describe('listShortLinks', () => {
  it('returns array of code/target pairs', () => {
    const links = listShortLinks();
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });

  it('each entry has code and target properties', () => {
    const links = listShortLinks();
    links.forEach(link => {
      expect(link).toHaveProperty('code');
      expect(link).toHaveProperty('target');
      expect(typeof link.code).toBe('string');
      expect(typeof link.target).toBe('string');
    });
  });

  it('all targets are relative paths', () => {
    const links = listShortLinks();
    links.forEach(link => {
      expect(link.target.startsWith('/')).toBe(true);
      expect(link.target.startsWith('//')).toBe(false);
    });
  });
});
