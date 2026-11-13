/**
 * P1669 — known non-human traffic is TAGGED is_bot (with bot_reason), never dropped, and not
 * recorded unless the P1628 smoke opt-in is set. has_interacted marks events after the first
 * interaction. utm_* values are cleaned, and the first UTM set seen is stored for sign-up.
 *
 * Runs the verbatim P1304 + P1325 + P1628 + P1669 blocks from index.html (the snippet is not
 * importable), like the P1628 canary. Window fixtures use the values measured on 2026-11-12:
 * headless Chromium 156 (both modes) and a real desktop Chrome, plus real user agents of the
 * privacy and in-app browsers the spec names. Mutation controls edit the REAL index.html text.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');

const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'touchmove', 'wheel'] as const;

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  headlessChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  ddgIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/127.0.0.0 Mobile Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  whatsappInApp: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.25.78',
  messengerIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0.0.40.109;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]',
  cubot: 'Mozilla/5.0 (Linux; Android 13; CUBOT P80 Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  python: 'python-requests/2.32.3',
  bytespider: 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; https://zhanzhang.toutiao.com/)',
  robotPhone: 'Mozilla/5.0 (Linux; Android 12; Robot X1 Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
};

interface Fixture {
  ua: string;
  webdriver?: boolean;
  touch?: number;
  /** [screen w, screen h, avail w, avail h, outer w, outer h, inner w, inner h] */
  geo: [number, number, number, number, number, number, number, number];
  flag?: boolean;
  search?: string;
  pathname?: string;
  stored?: string | null;
  storageThrows?: boolean;
  /** CSS display-mode the page matches (default 'browser'). */
  displayMode?: 'browser' | 'fullscreen' | 'standalone';
}

// Measured 2026-11-12 (see header).
const HEADLESS_GEO: Fixture['geo'] = [1280, 720, 1280, 720, 1280, 720, 1280, 720];
const REAL_CHROME_MAC_GEO: Fixture['geo'] = [1512, 982, 1512, 949, 1512, 779, 1512, 779];
const WINDOWS_TASKBAR_GEO: Fixture['geo'] = [1920, 1080, 1920, 1032, 1920, 1032, 1920, 945];
const PHONE_GEO: Fixture['geo'] = [402, 874, 402, 874, 402, 874, 402, 874];

function blocks(source: string) {
  const names = ['P1304', 'P1325', 'P1628', 'P1669'];
  return names.map((n) => {
    const m = source.match(new RegExp(`/\\* ${n}-BEGIN[\\s\\S]*?/\\* ${n}-END \\*/`));
    if (!m) throw new Error(`${n} block missing from index.html`);
    return m[0];
  });
}

function load(f: Fixture, source: string = html) {
  const listeners = {} as Record<(typeof INPUT_EVENTS)[number], () => void>;
  const store = {} as Record<string, string> & { cp_first_touch_utm: string };
  if (f.stored) store.cp_first_touch_utm = f.stored;
  const [sw, sh, aw, ah, ow, oh, iw, ih] = f.geo;
  const w: Record<string, unknown> = {
    location: { pathname: f.pathname ?? '/', search: f.search ?? '', hash: '' },
    navigator: { userAgent: f.ua, webdriver: f.webdriver ?? false, maxTouchPoints: f.touch ?? 0 },
    screen: { width: sw, height: sh, availWidth: aw, availHeight: ah },
    outerWidth: ow,
    outerHeight: oh,
    innerWidth: iw,
    innerHeight: ih,
    matchMedia: (q: string) => ({ matches: q === `(display-mode: ${f.displayMode ?? 'browser'})` }),
    localStorage: {
      getItem: (k: string) => {
        if (f.storageThrows) throw new Error('blocked');
        return k in store ? store[k] : null;
      },
      setItem: (k: string, v: string) => {
        if (f.storageThrows) throw new Error('blocked');
        store[k] = v;
      },
    },
    addEventListener: (type: keyof typeof listeners, fn: () => void) => {
      listeners[type] = fn;
    },
  };
  if (f.flag !== undefined) w.__p1628KeepRecorderForSmoke = f.flag;
  const run = new Function('window', `${blocks(source).join(';\n')}; return { noRecord: p1325NoRecord, hook: p1669BeforeSend, bot: p1669Bot };`);
  const out = run(w) as {
    noRecord: boolean;
    bot: string;
    hook: (item: { event: string; properties: Record<string, unknown> }) => { event: string; properties: Record<string, unknown> };
  };
  return { ...out, window: w, listeners, store };
}

const ev = (props: Record<string, unknown> = {}) => ({ event: 'x', properties: { $current_url: 'https://claritypledge.com/', ...props } });

describe('P1669: bots are tagged, people are not', () => {
  it.each([
    ['headless Chromium with a spoofed Chrome UA (the prod bot shape)', { ua: UA.chromeMac, geo: HEADLESS_GEO }, 'headless_window'],
    ['headless Windows 1920x1080 with no frame and no taskbar', { ua: UA.chromeWin, geo: [1920, 1080, 1920, 1080, 1920, 1080, 1920, 1080] }, 'headless_window'],
    ['HeadlessChrome UA', { ua: UA.headlessChrome, geo: REAL_CHROME_MAC_GEO }, 'headless_ua'],
    ['webdriver (P1628 automation)', { ua: UA.chromeMac, webdriver: true, geo: REAL_CHROME_MAC_GEO }, 'webdriver'],
    ['Googlebot', { ua: UA.googlebot, geo: REAL_CHROME_MAC_GEO }, 'crawler_ua'],
    ['GPTBot', { ua: UA.gptbot, geo: REAL_CHROME_MAC_GEO }, 'crawler_ua'],
    ['an HTTP library', { ua: UA.python, geo: REAL_CHROME_MAC_GEO }, 'crawler_ua'],
    ['Bytespider', { ua: UA.bytespider, geo: PHONE_GEO, touch: 5 }, 'crawler_ua'],
    ['Slack link preview', { ua: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', geo: REAL_CHROME_MAC_GEO }, 'crawler_ua'],
    ['Bing preview', { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 BingPreview/1.0b', geo: WINDOWS_TASKBAR_GEO }, 'crawler_ua'],
    ['Google-InspectionTool', { ua: 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)', geo: REAL_CHROME_MAC_GEO }, 'crawler_ua'],
  ] as Array<[string, Fixture, string]>)('%s → is_bot, reason %s, not recorded', (_name, f, reason) => {
    const { hook, noRecord, bot } = load(f);
    expect(bot).toBe(reason);
    const out = hook(ev());
    expect(out.properties.is_bot).toBe(true);
    expect(out.properties.bot_reason).toBe(reason);
    expect(noRecord).toBe(true);
  });

  it.each([
    ['real desktop Chrome (measured: frameless window, but the menu bar is there)', { ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO }],
    ['Windows Chrome with a taskbar', { ua: UA.chromeWin, geo: WINDOWS_TASKBAR_GEO }],
    ['Edge', { ua: UA.edgeWin, geo: WINDOWS_TASKBAR_GEO }],
    ['Safari', { ua: UA.safariMac, geo: REAL_CHROME_MAC_GEO }],
    ['Firefox', { ua: UA.firefoxMac, geo: REAL_CHROME_MAC_GEO }],
    ['Brave (Chrome UA)', { ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO }],
    ['iPhone Safari (full-screen geometry, touch)', { ua: UA.iphoneSafari, geo: PHONE_GEO, touch: 5 }],
    ['DuckDuckGo', { ua: UA.ddgIos, geo: PHONE_GEO, touch: 5 }],
    ['Samsung Internet', { ua: UA.samsung, geo: PHONE_GEO, touch: 5 }],
    ['Android Chrome', { ua: UA.androidChrome, geo: PHONE_GEO, touch: 5 }],
    ['WhatsApp in-app browser', { ua: UA.whatsappInApp, geo: PHONE_GEO, touch: 5 }],
    ['Messenger in-app browser', { ua: UA.messengerIos, geo: PHONE_GEO, touch: 5 }],
    ['a Cubot phone ("bot" inside the model name)', { ua: UA.cubot, geo: PHONE_GEO, touch: 5 }],
    ['a "Robot" phone model', { ua: UA.robotPhone, geo: PHONE_GEO, touch: 5 }],
    ['iPadOS with a desktop UA (touch decides)', { ua: UA.safariMac, geo: [1024, 1366, 1024, 1366, 1024, 1366, 1024, 1366], touch: 5 }],
    ['F11 fullscreen with an auto-hidden taskbar at 1920x1080', { ua: UA.chromeWin, geo: [1920, 1080, 1920, 1080, 1920, 1080, 1920, 1080], displayMode: 'fullscreen' }],
    ['an installed app (PWA) window at 1280x720', { ua: UA.chromeWin, geo: HEADLESS_GEO, displayMode: 'standalone' }],
    ['a Mac with an auto-hidden menu bar and a frameless window (not a headless size)', { ua: UA.chromeMac, geo: [1512, 982, 1512, 982, 1512, 982, 1512, 982] }],
  ] as Array<[string, Fixture]>)('%s → no is_bot key, recorded', (_name, f) => {
    const { hook, noRecord, bot } = load(f);
    expect(bot).toBe('');
    const out = hook(ev());
    expect('is_bot' in out.properties).toBe(false);
    expect('bot_reason' in out.properties).toBe(false);
    expect(noRecord).toBe(false);
  });

  it('the smoke opt-in keeps the recorder for tagged automation, and the tag stays', () => {
    const { hook, noRecord } = load({ ua: UA.chromeMac, webdriver: true, geo: HEADLESS_GEO, flag: true });
    expect(noRecord).toBe(false);
    expect(hook(ev()).properties.is_bot).toBe(true);
    expect(hook(ev()).properties.is_automation).toBe(true);
  });

  it('the smoke opt-in never turns recording on for a protected route', () => {
    expect(load({ ua: UA.chromeMac, webdriver: true, geo: HEADLESS_GEO, flag: true, pathname: '/chats/abc' }).noRecord).toBe(true);
  });

  it('redaction still applies through the P1669 hook', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = JSON.stringify(hook(ev({ $current_url: 'https://claritypledge.com/live/QX7K2M?token_hash=pkce_FAKE' })));
    expect(out).not.toContain('QX7K2M');
    expect(out).not.toContain('pkce_FAKE');
  });

  it('MUTATION CONTROLS: each guard is what keeps a real person untagged', () => {
    // Windows at a headless-default size, frameless window, visible taskbar: only the availability check saves it.
    const taskbarFrameless: Fixture = { ua: UA.chromeWin, geo: [1920, 1080, 1920, 1032, 1920, 1032, 1920, 1032] };
    expect(load(taskbarFrameless).bot).toBe('');
    const noAvail = html.replace('p1669Screen.availHeight === p1669Screen.height && p1669Screen.availWidth === p1669Screen.width &&', '');
    expect(noAvail).not.toBe(html);
    expect(load(taskbarFrameless, noAvail).bot).toBe('headless_window');
    // F11 at 1920x1080 with an auto-hidden taskbar: only the display-mode check saves it.
    const f11: Fixture = { ua: UA.chromeWin, geo: [1920, 1080, 1920, 1080, 1920, 1080, 1920, 1080], displayMode: 'fullscreen' };
    const noDisplayMode = html.replace('!touch && !fullscreen && defaultSize', '!touch && defaultSize');
    expect(noDisplayMode).not.toBe(html);
    expect(load(f11, noDisplayMode).bot).toBe('headless_window');
    // The measured real Mac Chrome (frameless, but a menu bar and a non-default size).
    const noSize = html.replace('!touch && !fullscreen && defaultSize', '!touch && !fullscreen');
    expect(load({ ua: UA.chromeMac, geo: [1512, 982, 1512, 982, 1512, 982, 1512, 982] }, noSize).bot).toBe('headless_window');
  });

  it('MUTATION CONTROL: the init must use the P1669 hook, or no event is tagged', () => {
    expect(html).toMatch(/before_send_events:\s*p1669BeforeSend/);
  });
});

describe('P1669: has_interacted', () => {
  it('the first interaction registers it once, for this page load only (track time, not flush time)', () => {
    const { listeners, window: w } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const calls: unknown[][] = [];
    w.mixpanel = { register: (...a: unknown[]) => calls.push(a) };
    for (const t of INPUT_EVENTS) expect(typeof listeners[t], t).toBe('function');
    expect(calls).toEqual([]);
    listeners.wheel();
    listeners.pointerdown();
    expect(calls).toEqual([[{ has_interacted: true }, { persistent: false }]]);
  });

  it('a scroll is not input: the app and scrapers scroll in code', () => {
    const { listeners } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    expect('scroll' in listeners).toBe(false);
  });

  it('the hook itself never sets it (it runs at flush time)', () => {
    const { hook, listeners, window: w } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    w.mixpanel = { register: () => {} };
    listeners.keydown();
    expect('has_interacted' in hook(ev()).properties).toBe(false);
  });
});

describe('P1669: chat ids never reach Mixpanel', () => {
  it.each([
    'https://claritypledge.com/chats/c/0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b',
    'https://claritypledge.com/chats/c/0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b/t/9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d',
    'https://claritypledge.com/chats/c/0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b?m=1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    'https://claritypledge.com/login?redirect=%2Fchats%2Fc%2F0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b%3Fm%3D1a2b3c4d',
  ])('%s', (url) => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = JSON.stringify(hook(ev({ $current_url: url, page_path: new URL(url).pathname, nested: { u: url } })));
    expect(out).not.toMatch(/0f8e9a1b|9a8b7c6d|1a2b3c4d/);
    expect(out).toContain('[id]');
  });

  it('MUTATION CONTROL: without the scrub step in the hook, the chat id goes out', () => {
    const unscrubbed = html.replace('var out = p1669Scrub(redacted, chatEvent);', 'var out = redacted;');
    expect(unscrubbed).not.toBe(html);
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO }, unscrubbed);
    expect(JSON.stringify(hook(ev({ $current_url: 'https://claritypledge.com/chats/c/0f8e9a1b-2c3d' })))).toContain('0f8e9a1b');
  });

  it('a chat page view: the bare query property ("?m=<id>") is scrubbed too, decided per event', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = JSON.stringify(
      hook(ev({ $current_url: 'https://claritypledge.com/chats/c/0f8e9a1b?m=1a2b3c4d', current_url_search: '?m=1a2b3c4d', current_url_path: '/chats/c/0f8e9a1b' })),
    );
    expect(out).not.toMatch(/0f8e9a1b|1a2b3c4d/);
  });

  it('the old /home/c/<id> chat links are scrubbed as well', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = JSON.stringify(hook(ev({ $current_url: 'https://claritypledge.com/home/c/0f8e9a1b/t/9a8b7c6d', page_path: '/home/c/0f8e9a1b' })));
    expect(out).not.toMatch(/0f8e9a1b|9a8b7c6d/);
  });

  it('other paths and an m= param outside chats are untouched', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = hook(ev({ $current_url: 'https://claritypledge.com/events/hike-1?m=2', page_path: '/groups/cm' }));
    expect(out.properties.$current_url).toBe('https://claritypledge.com/events/hike-1?m=2');
    expect(out.properties.page_path).toBe('/groups/cm');
  });

  it('UTM values inside a percent-encoded redirect keep their own parameters apart', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const url = 'https://claritypledge.com/login?redirect=%2Fevents%2Fx%3Futm_source%3Dwhatsapp%26utm_medium%3Ddm%26d%3D1';
    expect(hook(ev({ $current_url: url })).properties.$current_url).toBe(url);
    // Decoded once (a double-encoded %2520 becomes %20, then "20"): the value keeps only safe characters,
    // and the next parameter survives untouched.
    const dirty = 'https://claritypledge.com/login?redirect=%2Fevents%2Fx%3Futm_source%3Dme%2540x.com%26utm_medium%3Ddm';
    expect(hook(ev({ $current_url: dirty })).properties.$current_url).toBe('https://claritypledge.com/login?redirect=%2Fevents%2Fx%3Futm_source%3Dme40x.com%26utm_medium%3Ddm');
  });

  it('UTM values inside a URL are cleaned too, the rest of the URL kept', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = hook(ev({ $current_url: 'https://claritypledge.com/events/x?utm_source=someone%40example.com&utm_medium=dm&d=1' }));
    expect(out.properties.$current_url).toBe('https://claritypledge.com/events/x?utm_source=someoneexample.com&utm_medium=dm&d=1');
  });
});

describe('P1669: UTM values', () => {
  it('cleans utm_* values on any event, including SDK super properties', () => {
    const { hook } = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO });
    const out = hook(ev({ utm_source: 'whats app<script>', $initial_utm_campaign: 'a'.repeat(100), other: 'kept <as is>' }));
    expect(out.properties.utm_source).toBe('whatsappscript');
    expect(out.properties.$initial_utm_campaign).toBe('a'.repeat(64));
    expect(out.properties.other).toBe('kept <as is>');
  });

  it('stores the first UTM set seen, cleaned, and never overwrites it', () => {
    const first = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO, search: '?utm_source=whatsapp&utm_medium=dm&utm_campaign=cm%20run!&x=1' });
    expect(JSON.parse(first.store.cp_first_touch_utm)).toEqual({ utm_source: 'whatsapp', utm_medium: 'dm', utm_campaign: 'cmrun' });
    const again = load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO, search: '?utm_source=facebook', stored: first.store.cp_first_touch_utm });
    expect(JSON.parse(again.store.cp_first_touch_utm).utm_source).toBe('whatsapp');
  });

  it('stores nothing without UTM, and blocked storage does not break init', () => {
    expect(load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO, search: '?x=1' }).store.cp_first_touch_utm).toBeUndefined();
    expect(() => load({ ua: UA.chromeMac, geo: REAL_CHROME_MAC_GEO, search: '?utm_source=a', storageThrows: true })).not.toThrow();
  });
});
