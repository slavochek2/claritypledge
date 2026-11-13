/**
 * P1628 Phase 0 — automation traffic (navigator.webdriver) must be tagged `is_automation: true`
 * on every Mixpanel event and must not be session-recorded, so "real visitor" can be filtered in
 * Mixpanel. The SDK stays initialised under automation because the prod health and CSP smokes
 * depend on it, and the smokes opt back in to the recorder with window.__p1628KeepRecorderForSmoke
 * so a recorder-only CSP break stays detectable.
 *
 * Runs the verbatim P1304 + P1325 + P1628 blocks from index.html (the snippet is not importable),
 * the way the P1325 canary does. The mutation control edits the REAL index.html text, not a
 * synthetic fixture (epistemic gates 7 and 7d).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');

const CODE = 'QX7K2M';
const TOKEN = 'pkce_FAKE-TOKEN-HASH-FOR-TESTS';

interface WindowOpts {
  webdriver?: boolean | undefined;
  flag?: boolean;
  noNavigator?: boolean;
}

function makeWindow(pathname: string, opts: WindowOpts) {
  const w: Record<string, unknown> = { location: { pathname, search: '', hash: '' } };
  if (!opts.noNavigator) w.navigator = opts.webdriver === undefined ? {} : { webdriver: opts.webdriver };
  if (opts.flag !== undefined) w.__p1628KeepRecorderForSmoke = opts.flag;
  return w;
}

function loadBlock(pathname: string, opts: WindowOpts = {}, source: string = html) {
  const p1304 = source.match(/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//);
  const p1325 = source.match(/\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//);
  const p1628 = source.match(/\/\* P1628-BEGIN[\s\S]*?\/\* P1628-END \*\//);
  if (!p1304) throw new Error('P1304 block missing from index.html');
  if (!p1325) throw new Error('P1325 block missing from index.html');
  if (!p1628) throw new Error('P1628 block missing from index.html');
  const run = new Function(
    'window',
    `${p1304[0]}; ${p1325[0]}; ${p1628[0]}; return { noRecord: p1325NoRecord, hook: p1628BeforeSend };`,
  );
  return run(makeWindow(pathname, opts)) as {
    noRecord: boolean;
    hook: (item: { event: string; properties: Record<string, unknown> }) => {
      event: string;
      properties: Record<string, unknown>;
    };
  };
}

const item = () => ({ event: 'x', properties: { $current_url: 'https://claritypledge.com/' } });

describe('P1628: automation is tagged and not recorded', () => {
  it('automation without the smoke flag: not recorded, every event tagged', () => {
    const { noRecord, hook } = loadBlock('/', { webdriver: true });
    expect(noRecord).toBe(true);
    expect(hook(item()).properties.is_automation).toBe(true);
  });

  it('automation with the smoke flag: recorder on for an ordinary route, events still tagged', () => {
    const { noRecord, hook } = loadBlock('/', { webdriver: true, flag: true });
    expect(noRecord).toBe(false);
    expect(hook(item()).properties.is_automation).toBe(true);
  });

  it('automation with the flag explicitly false or any non-true value: not recorded', () => {
    expect(loadBlock('/', { webdriver: true, flag: false }).noRecord).toBe(true);
    for (const flag of [0, 'true', 1, null]) {
      const w = makeWindow('/', { webdriver: true });
      w.__p1628KeepRecorderForSmoke = flag;
      const p = [/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//, /\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//, /\/\* P1628-BEGIN[\s\S]*?\/\* P1628-END \*\//].map((r) => html.match(r)![0]);
      const out = new Function('window', `${p.join('; ')}; return p1325NoRecord;`)(w);
      expect(out, `flag ${String(flag)} must not opt in`).toBe(true);
    }
  });

  it.each(['/live/QX7K2M', '/transcribe/QX7K2M', '/auth/verify', '/auth/callback', '/admin', '/admin/users', '/chats', '/chats/abc', '/home'])(
    'CONTROL: the smoke flag never turns recording on for %s',
    (pathname) => {
      expect(loadBlock(pathname, { webdriver: true, flag: true }).noRecord).toBe(true);
      expect(loadBlock(pathname, { webdriver: true }).noRecord).toBe(true);
    },
  );

  it('a human (webdriver false or absent): recorded on an ordinary route, no is_automation key at all', () => {
    for (const opts of [{ webdriver: false }, { webdriver: undefined }, { noNavigator: true }] as WindowOpts[]) {
      const { noRecord, hook } = loadBlock('/', opts);
      expect(noRecord).toBe(false);
      const out = hook(item());
      expect('is_automation' in out.properties).toBe(false);
      expect(JSON.stringify(out)).not.toContain('is_automation');
    }
  });

  it('a human with the flag set is still not tagged (the flag only affects recording)', () => {
    const { hook } = loadBlock('/', { webdriver: false, flag: true });
    expect('is_automation' in hook(item()).properties).toBe(false);
  });

  it('the hook output still redacts a room code and a token_hash, and carries the tag', () => {
    const { hook } = loadBlock('/', { webdriver: true });
    const out = hook({
      event: '$mp_web_page_view',
      properties: {
        $current_url: `https://claritypledge.com/live/${CODE}`,
        $referrer: `https://claritypledge.com/auth/verify?token_hash=${TOKEN}&type=email`,
      },
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain(CODE);
    expect(text).not.toContain(TOKEN);
    expect(out.properties.is_automation).toBe(true);
  });

  it('human events are redacted too (the tag composes with redaction, it does not replace it)', () => {
    const { hook } = loadBlock('/', { webdriver: false });
    const out = JSON.stringify(hook({ event: 'e', properties: { u: `https://claritypledge.com/live/${CODE}` } }));
    expect(out).not.toContain(CODE);
  });
});

describe('P1628: init wiring', () => {
  function runInit(source: string, opts: WindowOpts, pathname = '/') {
    const script = source.match(/<script type="text\/javascript">\s*if \(window\.location\.hostname[\s\S]*?<\/script>/);
    if (!script) throw new Error('Mixpanel init script missing from index.html');
    const body = script[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    const calls: Record<string, unknown>[] = [];
    const mixpanel = { __SV: 1, init: (_t: string, o: Record<string, unknown>) => calls.push(o) };
    const window = { ...makeWindow(pathname, opts), mixpanel } as Record<string, unknown>;
    (window.location as Record<string, unknown>).hostname = 'claritypledge.com';
    new Function('window', 'document', 'mixpanel', body)(window, {}, mixpanel);
    return calls;
  }

  it('wires p1628BeforeSend as the hook and keeps the recording switch byte-identical', () => {
    // P1669 composed the hook again: p1669BeforeSend tags bots, and starts by calling p1628BeforeSend.
    expect(html).toMatch(/hooks:\s*\{\s*before_send_events:\s*p1669BeforeSend\s*\}/);
    expect(html).toMatch(/function p1669BeforeSend\(item\) \{\s*var redacted = p1628BeforeSend\(item\);/);
    expect(html).toMatch(/record_sessions_percent:\s*p1325NoRecord\s*\?\s*0\s*:\s*100/);
  });

  it('never skips mixpanel.init under automation, and the captured options carry the tagging hook', () => {
    for (const flag of [undefined, true]) {
      const calls = runInit(html, { webdriver: true, flag });
      expect(calls).toHaveLength(1);
      const hooks = calls[0].hooks as { before_send_events: (i: unknown) => { properties: Record<string, unknown> } };
      expect(hooks.before_send_events(item()).properties.is_automation).toBe(true);
      expect(calls[0].record_sessions_percent).toBe(flag === true ? 100 : 0);
    }
  });

  it('records a human visit at 100 and never tags it', () => {
    const calls = runInit(html, { webdriver: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].record_sessions_percent).toBe(100);
  });

  it('CONTROL (mutates the real index.html): removing the stamping line makes the tag assertion fail', () => {
    const mutated = html.replace(/\n[^\n]*out\.properties\.is_automation = true;[^\n]*/, '');
    expect(mutated).not.toBe(html);
    const { hook } = loadBlock('/', { webdriver: true }, mutated);
    expect(hook(item()).properties.is_automation).not.toBe(true);
  });

  it('CONTROL (mutates the real index.html): dropping the webdriver check records automation', () => {
    const mutated = html.replace(/var p1628Automation = [^\n]*/, 'var p1628Automation = false;');
    expect(mutated).not.toBe(html);
    expect(loadBlock('/', { webdriver: true }, mutated).noRecord).toBe(false);
  });
});
