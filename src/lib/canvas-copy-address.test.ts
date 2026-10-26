import { describe, it, expect } from 'vitest';
import { canvasCopyAddress } from './canvas-copy-address';

describe('canvasCopyAddress', () => {
  it('a link-public canvas carries the token in the fragment', () => {
    expect(canvasCopyAddress('https://x.test/p/me/canvas/a', 'link', 'tok')).toBe('https://x.test/p/me/canvas/a#k=tok');
  });
  it('a link-public canvas with no known token has no address to copy', () => {
    expect(canvasCopyAddress('https://x.test/p/me/canvas/a', 'link', null)).toBeNull();
    expect(canvasCopyAddress('https://x.test/p/me/canvas/a', 'link', undefined)).toBeNull();
  });
  it('a restricted canvas copies the plain address, token or not', () => {
    expect(canvasCopyAddress('https://x.test/p/me/canvas/a', 'restricted', null)).toBe('https://x.test/p/me/canvas/a');
    expect(canvasCopyAddress('https://x.test/p/me/canvas/a', 'restricted', 'tok')).toBe('https://x.test/p/me/canvas/a');
  });
});
