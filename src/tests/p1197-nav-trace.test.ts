import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  installNavTrace,
  isNavTraceRequested,
  redactUrl,
  __resetNavTraceForTests,
} from '@/lib/nav-trace';

/**
 * P1197: the nav trace exists to name the code path that navigates a user to /feed
 * during a slow load. These tests bind the two properties that make it trustworthy:
 * it records every URL change when asked, and it is *completely absent* when not.
 */

const nativePushState = window.history.pushState;
const nativeReplaceState = window.history.replaceState;

function setUrl(search: string) {
  window.history.replaceState = nativeReplaceState;
  window.history.pushState = nativePushState;
  nativeReplaceState.call(window.history, {}, '', `/${search}`);
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetNavTraceForTests();
  window.history.pushState = nativePushState;
  window.history.replaceState = nativeReplaceState;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  window.history.pushState = nativePushState;
  window.history.replaceState = nativeReplaceState;
});

function traceLines(): string[] {
  return logSpy.mock.calls
    .map((c) => String(c[0]))
    .filter((m) => m.startsWith('[navtrace]'));
}

describe('flag absent — the instrument must not exist at all', () => {
  beforeEach(() => setUrl(''));

  it('does not install', () => {
    expect(isNavTraceRequested()).toBe(false);
    expect(installNavTrace()).toBe(false);
  });

  it('leaves history.pushState and replaceState as the native functions', () => {
    installNavTrace();
    expect(window.history.pushState).toBe(nativePushState);
    expect(window.history.replaceState).toBe(nativeReplaceState);
  });

  it('prints nothing, even across navigations', () => {
    installNavTrace();
    window.history.pushState({}, '', '/org/cm');
    window.history.replaceState({}, '', '/feed');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(traceLines()).toEqual([]);
  });

  it('ignores a value other than 1', () => {
    setUrl('?navtrace=0');
    expect(installNavTrace()).toBe(false);
    setUrl('?navtrace=true');
    expect(installNavTrace()).toBe(false);
  });
});

describe('flag present — every URL change is recorded', () => {
  beforeEach(() => {
    setUrl('?navtrace=1');
    expect(installNavTrace()).toBe(true);
  });

  it('announces its own install with the initial URL', () => {
    expect(traceLines()[0]).toContain('installed at');
    expect(traceLines()[0]).toContain('navtrace=1');
  });

  it('records a pushState with target, timestamp and a stack', () => {
    logSpy.mockClear();
    window.history.pushState({}, '', '/org/cm');
    const [line] = traceLines();
    expect(line).toContain('pushState → /org/cm');
    expect(line).toMatch(/\[navtrace\] \d+\.\d+ms/);
    // The stack is what turns "something navigated" into "this line navigated".
    expect(line.split('\n').length).toBeGreaterThan(1);
    expect(line).toMatch(/\bat\b/);
  });

  it('records a replaceState — the shape <Navigate replace> compiles to', () => {
    logSpy.mockClear();
    window.history.replaceState({}, '', '/feed');
    expect(traceLines()[0]).toContain('replaceState → /feed');
  });

  it('records popstate (back/forward)', () => {
    logSpy.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(traceLines()[0]).toContain('popstate →');
  });

  it('still performs the navigation it traces', () => {
    window.history.pushState({}, '', '/org/cm');
    expect(window.location.pathname).toBe('/org/cm');
  });

  it('is idempotent — a second install cannot double-log', () => {
    expect(installNavTrace()).toBe(true);
    logSpy.mockClear();
    window.history.pushState({}, '', '/letters');
    expect(traceLines()).toHaveLength(1);
  });

  it('keeps tracing after the flag leaves the URL', () => {
    // The app drops ?navtrace=1 on its first navigation. That first navigation is
    // the event under investigation, so the trace must survive losing its own flag.
    window.history.replaceState({}, '', '/feed');
    expect(isNavTraceRequested()).toBe(false);
    logSpy.mockClear();
    window.history.pushState({}, '', '/org/cm');
    expect(traceLines()[0]).toContain('pushState → /org/cm');
  });
});

describe('gesture attribution — the signal that survives minification', () => {
  beforeEach(() => {
    setUrl('?navtrace=1');
    expect(installNavTrace()).toBe(true);
    logSpy.mockClear();
  });

  it('reports sinceClick=never for a navigation with no preceding click', () => {
    // This is the P1197 leading hypothesis: the click never registered and the
    // ordinary redirect fired on its own. It must be readable off one line.
    window.history.replaceState({}, '', '/feed');
    expect(traceLines()[0]).toContain('sinceClick=never');
  });

  it('attributes a navigation that followed a link click to that link', () => {
    const a = document.createElement('a');
    a.setAttribute('href', '/org/cm');
    document.body.appendChild(a);
    a.click();
    logSpy.mockClear();
    window.history.pushState({}, '', '/org/cm');
    const [line] = traceLines();
    expect(line).toContain('clicked=/org/cm');
    expect(line).toMatch(/sinceClick=\d+ms/);
    a.remove();
  });

  it('surfaces the bounce shape — clicked one target, navigated to another', () => {
    const a = document.createElement('a');
    a.setAttribute('href', '/org/cm');
    document.body.appendChild(a);
    a.click();
    logSpy.mockClear();
    window.history.replaceState({}, '', '/feed');
    // The reported symptom, legible in a single trace line.
    expect(traceLines()[0]).toContain('replaceState → /feed');
    expect(traceLines()[0]).toContain('clicked=/org/cm');
    a.remove();
  });

  it('records a click that was not on a link', () => {
    document.body.click();
    logSpy.mockClear();
    window.history.pushState({}, '', '/x');
    expect(traceLines()[0]).toContain('clicked=(non-link)');
  });

  it('does not listen for clicks when the flag is absent', () => {
    __resetNavTraceForTests();
    setUrl('');
    installNavTrace();
    const a = document.createElement('a');
    a.setAttribute('href', '/org/cm');
    document.body.appendChild(a);
    a.click();
    logSpy.mockClear();
    window.history.pushState({}, '', '/org/cm');
    expect(traceLines()).toEqual([]);
    a.remove();
  });
});

describe('recorded link targets carry no querystring', () => {
  beforeEach(() => {
    setUrl('?navtrace=1');
    expect(installNavTrace()).toBe(true);
  });

  it('strips a redirect param from the recorded target', () => {
    const a = document.createElement('a');
    a.setAttribute('href', '/login?redirect=/letters&token=SECRET123');
    document.body.appendChild(a);
    a.click();
    logSpy.mockClear();
    window.history.pushState({}, '', '/login');
    const [line] = traceLines();
    expect(line).toContain('clicked=/login');
    expect(line).not.toContain('SECRET123');
    expect(line).not.toContain('redirect=');
    a.remove();
  });

  it('strips a hash fragment', () => {
    const a = document.createElement('a');
    a.setAttribute('href', '/manifesto#section-4');
    document.body.appendChild(a);
    a.click();
    logSpy.mockClear();
    window.history.pushState({}, '', '/manifesto');
    expect(traceLines()[0]).toContain('clicked=/manifesto');
    expect(traceLines()[0]).not.toContain('section-4');
    a.remove();
  });
});

/**
 * Six in-app routes navigate with a live access token in the querystring
 * (letter-reading-page.tsx:726, letters-section.tsx:171, three agreement routes).
 * P488 strips those tokens from the address bar precisely because a token in a URL is
 * a leak; printing one to the console would reintroduce it — and LogRocket and Sentry
 * both capture console output, so "console-only" is not the same as "stays local".
 *
 * These exercise the DESTINATION paths, which no click-path test can reach.
 */
describe('no navigation destination leaks a querystring', () => {
  // Deliberately low-entropy: a realistic-looking token trips the gitleaks gate.
  const TOKEN = 'fake-token-value';

  beforeEach(() => {
    setUrl('?navtrace=1');
    expect(installNavTrace()).toBe(true);
    logSpy.mockClear();
  });

  it('redacts a token on pushState (the letter-reading-page shape)', () => {
    window.history.pushState({}, '', `/letter/deliv-1?token=${TOKEN}`);
    const [line] = traceLines();
    expect(line).not.toContain(TOKEN);
    expect(line).toContain('/letter/deliv-1');
    // The marker must survive: a navigation WITH params differs from one without.
    expect(line).toContain('?…');
  });

  it('redacts a token on replaceState (the agreement-accept shape)', () => {
    window.history.replaceState({}, '', `/agreements/a-1/accept?token=${TOKEN}`);
    expect(traceLines()[0]).not.toContain(TOKEN);
    expect(traceLines()[0]).toContain('/agreements/a-1/accept');
  });

  it('redacts the querystring on popstate', () => {
    nativeReplaceState.call(window.history, {}, '', `/letter/d?token=${TOKEN}`);
    logSpy.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(traceLines()[0]).not.toContain(TOKEN);
  });

  it('records hashchange, and redacts the fragment', () => {
    // hashchange had no coverage at all before this.
    window.dispatchEvent(
      new HashChangeEvent('hashchange', {
        newURL: `https://x.test/manifesto?token=${TOKEN}#part-2`,
        oldURL: 'https://x.test/manifesto',
      }),
    );
    const [line] = traceLines();
    expect(line).toContain('hashchange →');
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain('part-2');
  });

  it('keeps a bare path untouched — redaction must not damage the common case', () => {
    window.history.pushState({}, '', '/org/cm');
    expect(traceLines()[0]).toContain('pushState → /org/cm ');
    expect(traceLines()[0]).not.toContain('?…');
  });
});

describe('redactUrl', () => {
  it('keeps the path, drops the values, marks their presence', () => {
    expect(redactUrl('/a/b?x=1&y=2')).toBe('/a/b?…');
    expect(redactUrl('/a/b#frag')).toBe('/a/b#…');
    expect(redactUrl('/a/b?x=1#frag')).toBe('/a/b?…#…');
    expect(redactUrl('/a/b')).toBe('/a/b');
  });

  it('handles empty and nullish input without throwing', () => {
    expect(redactUrl(null)).toBe('(none)');
    expect(redactUrl(undefined)).toBe('(none)');
    expect(redactUrl('')).toBe('(none)');
    // A query-only url must not fall through to the raw string.
    expect(redactUrl('?onlyquery=1')).toBe('?…');
    expect(redactUrl('?onlyquery=1')).not.toContain('onlyquery');
  });
});
