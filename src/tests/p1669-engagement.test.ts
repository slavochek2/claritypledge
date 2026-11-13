/**
 * P1669 — visible-time heartbeat, measured from timestamps. A scripted 60-second visible stay must
 * produce events spanning at least 50 seconds (the Done-When); a visit shorter than one interval
 * still reports its length on leaving; time is counted only while visible and per page; a route
 * change is noticed within one local check and reported for the page that was left; an idle tab
 * stops at the cap; a hidden tab sends nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEngagement, heartbeatAllowed, sendToMixpanel, HEARTBEAT_SECONDS, CAP_SECONDS, CHECK_MS, MAX_LEAVES } from '@/lib/engagement';

function harness(opts: { visible?: boolean; path?: string } = {}) {
  const sent: Array<{ event: string; props: Record<string, unknown>; beacon: boolean }> = [];
  const state = { visible: opts.visible ?? true, path: opts.path ?? '/feed', t: 1_000_000 };
  let views = 0;
  let intervalMs = 0;
  const h = createEngagement({
    send: (event, props, beacon) => sent.push({ event, props, beacon }),
    isVisible: () => state.visible,
    pathname: () => state.path,
    now: () => state.t,
    newViewId: () => `v${++views}`,
    setInterval: (_fn, ms) => {
      intervalMs = ms;
      return 1;
    },
    onVisibility: () => {},
  });
  /** Let `s` seconds pass with the 1-second local check running, as the browser would. */
  const run = (s: number) => {
    for (let i = 0; i < s; i++) {
      state.t += 1000;
      h.check();
    }
  };
  return { sent, state, run, ...h, intervalMs: () => intervalMs };
}

const engaged = (sent: Array<{ event: string; props: Record<string, unknown> }>) =>
  sent.filter((s) => s.event === 'page_engaged').map((s) => s.props.seconds_visible);

describe('P1669 engagement heartbeat', () => {
  it('a 60-second visible stay: heartbeats at 30 and 60, then one page_left by beacon', () => {
    const h = harness();
    expect(h.intervalMs()).toBe(CHECK_MS);
    h.run(60);
    expect(engaged(h.sent)).toEqual([30, 60]);
    h.visibility(false);
    h.visibility(false);
    expect(h.sent.filter((s) => s.event === 'page_left')).toEqual([
      { event: 'page_left', props: { seconds_visible: 60, page_path: '/feed', view_id: 'v1' }, beacon: true },
    ]);
  });

  it('a 12-second visit still reports its length on leaving', () => {
    const h = harness();
    h.run(12);
    h.visibility(false);
    expect(h.sent).toEqual([{ event: 'page_left', props: { seconds_visible: 12, page_path: '/feed', view_id: 'v1' }, beacon: true }]);
  });

  it('only visible time counts: hidden time is not added', () => {
    const h = harness();
    h.run(10);
    h.visibility(false);
    h.state.visible = false;
    h.run(300);
    h.state.visible = true;
    h.visibility(true);
    h.run(20);
    expect(engaged(h.sent)).toEqual([30]);
  });

  it('after a hide and a return, the next leave is reported too (with the whole visible time)', () => {
    const h = harness();
    h.run(10);
    h.visibility(false);
    h.state.visible = false;
    h.run(60);
    h.state.visible = true;
    h.visibility(true);
    h.run(15);
    h.state.path = '/events';
    h.run(1);
    // 10 before hiding, 15 after returning, plus the 1 s until the route change is noticed.
    expect(h.sent.filter((s) => s.event === 'page_left').map((s) => s.props.seconds_visible)).toEqual([10, 26]);
  });

  it('app switching cannot run up leaves: at most MAX_LEAVES per page, and only with new visible time', () => {
    const h = harness();
    for (let i = 0; i < 10; i++) {
      h.run(5);
      h.visibility(false);
      h.visibility(false);
      h.visibility(true);
    }
    const leaves = h.sent.filter((s) => s.event === 'page_left').map((s) => s.props.seconds_visible);
    expect(leaves).toEqual([5, 10, 15]);
    expect(leaves).toHaveLength(MAX_LEAVES);
  });

  it('per page view: at most CAP/HEARTBEAT heartbeats + MAX_LEAVES leaves (the Cost Budget bound)', () => {
    const h = harness();
    for (let i = 0; i < 100; i++) {
      h.run(HEARTBEAT_SECONDS);
      h.visibility(false);
      h.visibility(true);
    }
    expect(h.sent.length).toBeLessThanOrEqual(CAP_SECONDS / HEARTBEAT_SECONDS + MAX_LEAVES);
  });

  it('the production sender calls the SDK as a method (a detached track loses its this)', () => {
    const calls: unknown[][] = [];
    const sdk = {
      track(this: unknown, ...a: unknown[]) {
        if (this !== sdk) throw new Error('track called without its SDK receiver');
        calls.push(a);
      },
    };
    (window as unknown as { mixpanel: unknown }).mixpanel = sdk;
    try {
      sendToMixpanel('page_engaged', { seconds_visible: 30 }, false);
      sendToMixpanel('page_left', { seconds_visible: 31, page_path: '/feed' }, true);
    } finally {
      delete (window as unknown as { mixpanel?: unknown }).mixpanel;
    }
    expect(calls).toEqual([
      ['page_engaged', { seconds_visible: 30 }],
      ['page_left', { seconds_visible: 31, page_path: '/feed' }, { transport: 'sendBeacon', send_immediately: true }],
    ]);
  });

  it('repeat visits to one path are told apart, and the max per view_id is the visit length', () => {
    const h = harness();
    h.run(40);
    h.state.path = '/groups/cm';
    h.run(5);
    h.state.path = '/feed';
    h.run(35);
    h.visibility(false);
    const byView = new Map<string, number>();
    for (const s of h.sent) {
      if (s.props.page_path === '/groups/cm') continue;
      const v = String(s.props.view_id);
      byView.set(v, Math.max(byView.get(v) ?? 0, Number(s.props.seconds_visible)));
    }
    // The /feed views, kept apart: each route change is noticed one check (1 s) later, so the first
    // view gets that second (41) and the second view starts one second into its stretch (34).
    expect([...byView.entries()].filter(([v]) => v !== 'v2')).toEqual([['v1', 41], ['v3', 34]]);
  });

  it('after the hide allowance is used up, leaving for another route still reports the closing total', () => {
    const h = harness();
    for (let i = 0; i < MAX_LEAVES; i++) {
      h.run(5);
      h.visibility(false);
      h.visibility(true);
    }
    h.run(200);
    h.state.path = '/events';
    h.run(1);
    expect(h.sent.filter((s) => s.event === 'page_left').map((s) => s.props.seconds_visible)).toEqual([5, 10, 15, 216]);
  });

  it('closing the page after the hide allowance is used up still reports the closing total', () => {
    const h = harness();
    for (let i = 0; i < MAX_LEAVES; i++) {
      h.run(5);
      h.visibility(false);
      h.visibility(true);
    }
    h.run(10);
    h.visibility(false);
    h.visibility(false, true);
    expect(h.sent.filter((s) => s.event === 'page_left').map((s) => s.props.seconds_visible)).toEqual([5, 10, 15, 25]);
  });

  it('a route change while the tab is hidden sends nothing (a hidden tab makes no requests)', () => {
    // The shape that used to send: the hide allowance used up, new visible time the last hide could
    // not report, then the route changes behind the hidden tab (Codex round 4).
    const h = harness();
    for (let i = 0; i < MAX_LEAVES; i++) {
      h.run(5);
      h.visibility(false);
      h.visibility(true);
    }
    h.run(5);
    h.visibility(false);
    h.state.visible = false;
    const before = h.sent.length;
    h.state.path = '/login';
    h.run(2);
    expect(h.sent.length).toBe(before);
  });

  it('past the cap no leave repeats the capped value', () => {
    const h = harness();
    h.run(CAP_SECONDS + 100);
    h.visibility(false);
    h.visibility(true);
    h.run(100);
    h.visibility(false);
    expect(h.sent.filter((s) => s.event === 'page_left').map((s) => s.props.seconds_visible)).toEqual([CAP_SECONDS]);
  });

  it('a hidden tab sends nothing, and a page never seen sends no page_left', () => {
    const h = harness({ visible: false });
    h.run(120);
    h.visibility(false);
    expect(h.sent).toEqual([]);
  });

  it('a route change is reported within one check, for the page that was left, then counts from zero', () => {
    const h = harness();
    h.run(20);
    h.state.path = '/groups/cm';
    h.run(1);
    expect(h.sent).toEqual([{ event: 'page_left', props: { seconds_visible: 21, page_path: '/feed', view_id: 'v1' }, beacon: false }]);
    h.run(30);
    expect(h.sent.at(-1)).toEqual({ event: 'page_engaged', props: { seconds_visible: 30, view_id: 'v2' }, beacon: false });
  });

  it('stops at the cap so an idle open tab cannot run up volume', () => {
    const h = harness();
    h.run(CAP_SECONDS + 600);
    expect(h.sent.length).toBe(CAP_SECONDS / HEARTBEAT_SECONDS);
    h.visibility(false);
    expect(h.sent.at(-1)?.props.seconds_visible).toBe(CAP_SECONDS);
  });

  it('only people and our own webdriver smokes send heartbeats', () => {
    expect(heartbeatAllowed(undefined)).toBe(true);
    expect(heartbeatAllowed('')).toBe(true);
    expect(heartbeatAllowed('webdriver')).toBe(true);
    for (const r of ['crawler_ua', 'headless_ua', 'headless_window']) expect(heartbeatAllowed(r)).toBe(false);
  });

  it('the production entry point checks the bot tag before starting', () => {
    const src = readFileSync('src/lib/engagement.ts', 'utf8');
    const entry = src.slice(src.indexOf('export function startEngagementTracking'));
    expect(entry.indexOf('heartbeatAllowed(window.__p1669Bot)')).toBeGreaterThan(-1);
    expect(entry.indexOf('heartbeatAllowed(window.__p1669Bot)')).toBeLessThan(entry.indexOf('createEngagement('));
    expect(src).toContain("transport: 'sendBeacon'");
    expect(entry).toContain('send: sendToMixpanel');
    expect(entry).toContain("addEventListener('pagehide', () => fn(false, true))");
  });

  it('properties are counts and the left page path only', () => {
    const h = harness();
    h.run(30);
    h.visibility(false);
    expect(h.sent.map((s) => Object.keys(s.props))).toEqual([['seconds_visible', 'view_id'], ['seconds_visible', 'page_path', 'view_id']]);
  });
});
