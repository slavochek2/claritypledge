/** P1536: joinCarried makes the one message a carry can send, whatever shape its input has. */
import { describe, expect, it } from 'vitest';
import { joinCarried } from '@/app/pages/chat/canvas-carry';

describe('joinCarried', () => {
  it('joins short requests oldest first with a blank line, and leaves nothing out', () => {
    expect(joinCarried(['one', 'two'])).toEqual({ body: 'one\n\ntwo', leftOut: false });
  });
  it('splits an UNSPLIT request over the limit itself: the newest piece goes (under 4,000), the older words are left out, never everything', () => {
    const long = `${'x'.repeat(2500)} ${'y'.repeat(2500)}`; // 5,001 characters in one element
    const out = joinCarried([long]);
    expect(out.body.length).toBeGreaterThan(0);
    expect(out.body.length).toBeLessThanOrEqual(4000);
    expect(out.body).toContain('y'.repeat(2500));
    expect(out.leftOut).toBe(true);
  });
  it('an unsplit newest element does not make an older short one disappear if both fit', () => {
    const out = joinCarried(['first', `${'a'.repeat(1500)} ${'b'.repeat(1500)}`]);
    expect(out.body.startsWith('first')).toBe(true);
    expect(out.leftOut).toBe(false);
  });
  it('nothing in, nothing out', () => {
    expect(joinCarried([])).toEqual({ body: '', leftOut: false });
  });
});
