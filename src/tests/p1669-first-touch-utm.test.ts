/**
 * P1669 — the stored first-touch UTM set is read back for sign-up, re-cleaned (stored data is
 * untrusted), and an absent, corrupt or blocked store yields nothing rather than an error.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFirstTouchUtm, FIRST_TOUCH_UTM_KEY } from '@/lib/utm';
import { withFirstTouch, restoreInteracted } from '@/lib/mixpanel';

describe('readFirstTouchUtm', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('returns the stored set', () => {
    window.localStorage.setItem(FIRST_TOUCH_UTM_KEY, JSON.stringify({ utm_source: 'whatsapp', utm_medium: 'dm', utm_campaign: 'cm-run' }));
    expect(readFirstTouchUtm()).toEqual({ utm_source: 'whatsapp', utm_medium: 'dm', utm_campaign: 'cm-run' });
  });

  it('re-cleans values and drops unknown keys and non-strings', () => {
    window.localStorage.setItem(
      FIRST_TOUCH_UTM_KEY,
      JSON.stringify({ utm_source: 'a b<c>', utm_term: 'x'.repeat(80), email: 'someone@example.com', utm_medium: 5 }),
    );
    expect(readFirstTouchUtm()).toEqual({ utm_source: 'abc', utm_term: 'x'.repeat(64) });
  });

  it('returns nothing when absent, corrupt, or storage is blocked', () => {
    expect(readFirstTouchUtm()).toEqual({});
    window.localStorage.setItem(FIRST_TOUCH_UTM_KEY, '{not json');
    expect(readFirstTouchUtm()).toEqual({});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readFirstTouchUtm()).toEqual({});
  });

  it('profile_created carries the first touch and sets it once on the profile; other events are untouched', () => {
    window.localStorage.setItem(FIRST_TOUCH_UTM_KEY, JSON.stringify({ utm_source: 'whatsapp', utm_campaign: 'cm-run' }));
    const setOnce = vi.fn();
    (window as unknown as { mixpanel: unknown }).mixpanel = { people: { set: vi.fn(), set_once: setOnce } };
    // A later link's campaign (a super property) cannot mix in: the keys the first touch lacked are null.
    expect(withFirstTouch('profile_created', { slug: 'x', utm_source: 'last-touch', utm_medium: 'later' })).toEqual({
      slug: 'x',
      utm_source: 'whatsapp',
      utm_medium: null,
      utm_campaign: 'cm-run',
      utm_content: null,
      utm_term: null,
    });
    expect(setOnce).toHaveBeenCalledWith({ utm_source: 'whatsapp', utm_campaign: 'cm-run' });
    setOnce.mockClear();
    const props = { slug: 'x' };
    expect(withFirstTouch('login_complete', props)).toBe(props);
    expect(setOnce).not.toHaveBeenCalled();
    window.localStorage.clear();
    expect(withFirstTouch('profile_created', props)).toBe(props);
    expect(setOnce).not.toHaveBeenCalled();
  });

  it('sign-out keeps has_interacted for a person who interacted in this page load, and only for them', () => {
    const register = vi.fn();
    const w = window as unknown as { mixpanel: unknown; __p1669Interacted?: boolean };
    w.mixpanel = { register };
    try {
      restoreInteracted();
      expect(register).not.toHaveBeenCalled();
      w.__p1669Interacted = true;
      restoreInteracted();
      expect(register).toHaveBeenCalledWith({ has_interacted: true }, { persistent: false });
    } finally {
      delete w.__p1669Interacted;
    }
    expect(readFileSync(join(__dirname, '../lib/mixpanel.ts'), 'utf8')).toMatch(/window\.mixpanel\.reset\(\);\s*restoreInteracted\(\);/);
    expect(readFileSync(join(__dirname, '../../index.html'), 'utf8')).toContain('window.__p1669Interacted = true;');
  });

  it('uses the same key index.html writes', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain(`'${FIRST_TOUCH_UTM_KEY}'`);
  });
});
