// Layout fit gate for /tree/landing-first. Exits 1 when any rule below is broken.
//
// Walks every beat (guessing on the demo's guess beat), the mirror, the fork, the four
// endings and both forms at 320x568, 375x740 and 1440x900. Before every measurement the
// pointer is moved to the top-left corner, so no hover state is captured (F6).
//
// At each resting state:
//  R1 newest: the last [data-newest] sits fully inside the visible panel (below a stuck
//     sticky line, above the footer), or, taller than that, has its top edge at the top.
//  R2 covered: no interactive element in the panel overlaps the footer.
//  R3 fork: every fork button is fully inside the viewport and above the footer.
//  R4 scene: the scene height is the same on every beat of the same screen.
//  R5 width: at desktop the document is as wide as the viewport.
//  R6 sliced: no [data-card] is cut by the top edge of the visible panel.
//  F1 overlay: no element with a CSS gradient background or a CSS mask overlaps any text
//     or control.
//  F2 first line: when a screen opens, the first line of its [data-first] element is fully
//     inside the visible panel.
//  F3 demo: on every demo beat after the first explain-back, the statement, the current
//     explain-back and, once revealed, its rating are all fully inside the visible panel.
//  F4 footer: no footer label runs to a second line.
//  F5 slots: per viewport, Back's left edge is at one x on every screen that shows it, and
//     the primary button's right edge likewise.
//  G1 footer zone: the footer box runs from the top of the progress line (or the footer's
//     top) to the bottom of the viewport and has a solid background. At rest, at the top
//     scroll end and at the bottom scroll end, no text line and no control outside the
//     footer is cut by the panel's bottom edge or overlaps the footer box.
//  G2 title: on every beat, the screen's title or lead ([data-first]) is fully visible,
//     with no part cut by the top bar.
//  G3 clearance: at the bottom scroll end the last content element ends at least 12px
//     above the footer box.
//  G4 footer actions: every filled primary button on the page sits in the footer's right
//     slot, flush with the text column's right edge; Back sits in the footer's left slot;
//     every screen except screen 1 has Back.
//  G5 scene by space (phones): the scene size of each band screen is the largest that fits
//     its tallest beat. Absent: the tallest beat plus the 72px strip would not have fit.
//     A strip: the tallest beat plus the band would not have fit. Heights are observed by
//     this gate on every beat, not read from the page's own measurement.
//  G6 dividers: no two visible horizontal dividers are closer than 48px with no text and no
//     control between them. A divider is a rule, not a box: an element with a top or
//     bottom border and no side borders (the compact header's, the footer's). Lines of
//     elements scrolled out of the panel do not count.
//  F7 anchor (desktop): across the beats of one screen, the top edge of [data-first] does
//     not move. Each beat is compared at its first observation.
//
// Usage: node src/app/tree/landing-lab/first/fit.gate.mjs   (dev server on :5847)
import { chromium } from 'playwright';

const BASE = process.env.FIT_URL ?? 'http://localhost:5847/tree/landing-first?mirror=preview';
const VIEWS = [
  { name: '320x568', width: 320, height: 568, mobile: true },
  { name: '375x740', width: 375, height: 740, mobile: true },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
];
const SETTLE = 900;
const failures = [];
let checks = 0;

async function measure(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main[data-screen]');
    const panel = document.querySelector('[data-panel]');
    const footer = document.querySelector('[data-footer]');
    const scene = document.querySelector('[data-scene]');
    const pr = panel.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    const sticky = panel.querySelector('[data-sticky]');
    const stuck = sticky && Math.abs(sticky.getBoundingClientRect().top - pr.top) < 1.5;
    const areaTop = pr.top + (stuck ? sticky.getBoundingClientRect().height : 0);
    const areaBottom = Math.min(pr.bottom, fr.top);
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
    };
    const inside = (r) => r.top >= areaTop - 1 && r.bottom <= areaBottom + 1;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[inert]');
    };
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

    const all = panel.querySelectorAll('[data-newest]');
    const newest = all[all.length - 1];

    const controls = [...main.querySelectorAll('button, a, input, select, textarea, [role=radio]')].filter(vis);
    // Clipped to the panel first: a control scrolled past the panel's edge is hidden by
    // the panel, not covered by the footer.
    const clip = (r) => ({ ...r, top: Math.max(r.top, pr.top), bottom: Math.min(r.bottom, pr.bottom) });
    const covered = controls
      .filter((el) => panel.contains(el))
      .filter((el) => { const c = clip(box(el)); return c.bottom > c.top && overlap(c, box(footer)); })
      .map((el) => (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40));

    const sliced = [...panel.querySelectorAll('[data-card]')]
      .filter(vis)
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.top < areaTop - 1 && r.bottom > areaTop + 1).length;

    // F1: gradient backgrounds and masks against text and controls.
    const layers = [...main.querySelectorAll('*')].filter((el) => {
      if (!vis(el)) return false;
      const s = getComputedStyle(el);
      const mask = s.maskImage || s.webkitMaskImage || 'none';
      return /gradient/.test(s.backgroundImage) || (mask && mask !== 'none');
    });
    const textRects = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !vis(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) textRects.push({ r, n, t: n.textContent.trim().slice(0, 30) });
    }
    const overlays = [];
    for (const layer of layers) {
      const lr = box(layer);
      const hitText = textRects.find(({ r, n }) => !layer.contains(n) && overlap(lr, r));
      const hitControl = controls.find((c) => !layer.contains(c) && !c.contains(layer) && overlap(lr, box(c)));
      if (hitText || hitControl) overlays.push(`${layer.tagName}.${String(layer.className).slice(0, 40)} over "${hitText ? hitText.t : hitControl.innerText.trim().slice(0, 30)}"`);
    }

    // F2: the first line of [data-first].
    const first = panel.querySelector('[data-first]');
    let firstLine = null;
    if (first) {
      const range = document.createRange();
      range.selectNodeContents(first);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      const r = rects[0] ?? first.getBoundingClientRect();
      firstLine = { top: Math.round(r.top), bottom: Math.round(r.bottom), inside: inside(r) };
    }

    // F3: the demo trio.
    const trio = ['statement', 'explain-back', 'rating'].map((k) => {
      const el = panel.querySelector(`[data-demo="${k}"]`);
      return el ? { k, inside: inside(el.getBoundingClientRect()) } : null;
    }).filter(Boolean);

    // F4: footer labels on one line.
    const wrapped = [...footer.querySelectorAll('button, a')].filter(vis).filter((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      return tops.size > 1;
    }).map((el) => el.innerText.trim());

    // F5: the two slots.
    const back = footer.querySelector('[data-slot="back"] button');
    const primary = footer.querySelector('[data-slot="primary"] > *');

    const forkButtons = main.dataset.screen === 'fork'
      ? [...panel.querySelectorAll('li > button')].map((b) => {
          const r = b.getBoundingClientRect();
          return { t: b.innerText.trim(), inside: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.bottom <= fr.top + 0.5 };
        })
      : [];

    // G2: the title or lead, whole.
    const firstBox = first ? first.getBoundingClientRect() : null;
    const titleWhole = firstBox ? firstBox.top >= pr.top - 0.5 && firstBox.bottom <= areaBottom + 0.5 : false;

    // G6: dividers.
    const dividers = [];
    for (const el of main.querySelectorAll('*')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) continue;
      const r = el.getBoundingClientRect();
      for (const [w, c, y] of [[cs.borderTopWidth, cs.borderTopColor, r.top], [cs.borderBottomWidth, cs.borderBottomColor, r.bottom]]) {
        if (parseFloat(w) < 0.5 || c === 'transparent' || /,\s*0\)$/.test(c)) continue;
        if (panel.contains(el) && (y < pr.top - 0.5 || y > pr.bottom + 0.5)) continue;
        dividers.push({ y, left: r.left, right: r.right });
      }
    }
    dividers.sort((a, b) => a.y - b.y);
    // Text and controls, clipped to the panel when they live in it: hidden content below
    // the fold cannot fill a gap.
    const clipTo = (r, inPanel) => (inPanel ? { top: Math.max(r.top, pr.top), bottom: Math.min(r.bottom, pr.bottom) } : { top: r.top, bottom: r.bottom });
    const between = [
      ...textRects.map(({ r, n }) => clipTo(r, panel.contains(n))),
      ...controls.map((c) => clipTo(c.getBoundingClientRect(), panel.contains(c))),
    ].filter((x) => x.bottom > x.top);
    const emptyGaps = [];
    for (let i = 1; i < dividers.length; i++) {
      const a = dividers[i - 1];
      const b = dividers[i];
      const gap = b.y - a.y;
      if (gap < 0.5 || gap >= 48) continue;
      const filled = between.some((r) => r.bottom > a.y + 0.5 && r.top < b.y - 0.5);
      if (!filled) emptyGaps.push(Math.round(gap));
    }

    // G4: filled primaries and Back.
    const bar = footer.querySelector('[data-bar]');
    const barBox = bar ? bar.getBoundingClientRect() : fr;
    const filled = [...main.querySelectorAll('button, a')].filter(vis).filter((el) => getComputedStyle(el).backgroundColor === 'rgb(37, 99, 235)');
    const strayPrimaries = filled.filter((el) => !el.closest('[data-slot="primary"]')).map((el) => el.innerText.trim());
    const slotted = footer.querySelector('[data-slot="primary"] > *');
    const primaryFlush = slotted ? Math.abs(slotted.getBoundingClientRect().right - barBox.right) <= 1 : null;
    const backInFooter = [...footer.querySelectorAll('[data-slot="back"] button, [data-slot="back"] a')].filter(vis).length > 0;
    const backElsewhere = [...main.querySelectorAll('button, a')].filter(vis).filter((el) => el.innerText.trim() === 'Back' && !footer.contains(el)).length;

    // G5 inputs: the content block's height and the room below the top bar.
    const content = (panel.querySelector('[data-content]') ?? panel.querySelector(':scope > div > .shrink-0'));
    const header = document.querySelector('header');

    return {
      emptyGaps,
      titleWhole,
      firstTop: firstBox ? Math.round(firstBox.top) : null,
      strayPrimaries,
      primaryFlush,
      backInFooter,
      backElsewhere,
      contentH: Math.round(content.getBoundingClientRect().height),
      room: Math.round(innerHeight - header.getBoundingClientRect().bottom - fr.height),
      screen: main.dataset.screen,
      beat: main.dataset.beat,
      sceneH: Math.round(scene.getBoundingClientRect().height * 10) / 10,
      area: [Math.round(areaTop), Math.round(areaBottom)],
      newest: newest ? { top: Math.round(newest.getBoundingClientRect().top), bottom: Math.round(newest.getBoundingClientRect().bottom), h: Math.round(newest.getBoundingClientRect().height) } : null,
      covered,
      sliced,
      overlays,
      firstLine,
      trio,
      wrapped,
      backLeft: back ? Math.round(back.getBoundingClientRect().left) : null,
      primaryRight: primary ? Math.round(primary.getBoundingClientRect().right) : null,
      forkButtons,
      docW: Math.min(document.documentElement.clientWidth, document.body.clientWidth, main.getBoundingClientRect().width),
      innerW: innerWidth,
    };
  });
}

/** G1 and G3 at the current scroll position. */
async function zone(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main[data-screen]');
    const panel = document.querySelector('[data-panel]');
    const footer = document.querySelector('[data-footer]');
    const progress = footer.querySelector('[data-progress]');
    const pr = panel.getBoundingClientRect();
    const boxTop = (progress ?? footer).getBoundingClientRect().top;
    const bg = getComputedStyle(footer).backgroundColor;
    const solid = /^rgb\(/.test(bg) || /, 1\)$/.test(bg);
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('[inert]');
    };
    const items = [];
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !vis(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) items.push({ r, t: n.textContent.trim().slice(0, 30) });
    }
    for (const el of panel.querySelectorAll('button, a, input, select, textarea')) if (vis(el)) items.push({ r: el.getBoundingClientRect(), t: `<${el.tagName.toLowerCase()}> ${(el.innerText || '').trim().slice(0, 24)}` });
    const edge = pr.bottom;
    const cut = items.filter(({ r }) => r.top < edge - 0.5 && r.bottom > edge + 0.5).map((i) => i.t);
    const over = items.filter(({ r }) => {
      const top = Math.max(r.top, pr.top);
      const bottom = Math.min(r.bottom, pr.bottom);
      return bottom - top > 0.5 && bottom > boxTop + 0.5;
    }).map((i) => i.t);
    const content = (panel.querySelector('[data-content]') ?? panel.querySelector(':scope > div > .shrink-0'));
    const clearance = Math.round(boxTop - content.getBoundingClientRect().bottom);
    return { solid, bg, cut, over, clearance, scrollTop: Math.round(panel.scrollTop), screen: main.dataset.screen };
  });
}

/**
 * The two scroll ends. Probing them scrolls the panel, which changes where the next beat
 * comes to rest, so they are probed in a separate pass from the natural walk (see run()).
 */
async function zones(page) {
  const rest = await page.evaluate(() => document.querySelector('[data-panel]').scrollTop);
  const out = {};
  const scrollTo = async (y) => {
    await page.evaluate((v) => { const p = document.querySelector('[data-panel]'); p.scrollTop = v === 'end' ? p.scrollHeight : v; }, y);
    await page.waitForTimeout(400);
    return zone(page);
  };
  out.top = await scrollTo(0);
  out.end = await scrollTo('end');
  await scrollTo(rest);
  return out;
}

function judgeEnds(view, label, m) {
  const fail = (rule, detail) => failures.push(`${view.name} ${label} [${m.screen}:${m.beat}] ${rule}: ${detail}`);
  for (const [where, z] of Object.entries(m.zones)) {
    for (const t of z.cut) fail('G1 footer', `${where}: "${t}" cut by the footer edge`);
    for (const t of z.over) fail('G1 footer', `${where}: "${t}" inside the footer box`);
  }
  if (m.zones.end.clearance < 12) fail('G3 clearance', `last content ends ${m.zones.end.clearance}px above the footer`);
}

function judge(view, label, m, ctx) {
  const fail = (rule, detail) => failures.push(`${view.name} ${label} [${m.screen}:${m.beat}] ${rule}: ${detail}`);
  checks++;
  const [top, bottom] = m.area;
  if (!m.newest) fail('R1 newest', 'no [data-newest] element');
  else {
    const fits = m.newest.top >= top - 1 && m.newest.bottom <= bottom + 1;
    const tallTop = m.newest.h > bottom - top && Math.abs(m.newest.top - top) <= 16;
    if (!fits && !tallTop) fail('R1 newest', `newest ${m.newest.top}..${m.newest.bottom} outside visible ${top}..${bottom}`);
  }
  if (m.covered.length) fail('R2 covered', `under the footer: ${m.covered.join(' / ')}`);
  for (const b of m.forkButtons) if (!b.inside) fail('R3 fork', `"${b.t}" not fully visible`);
  const seen = ctx.sceneHeights.get(m.screen);
  if (seen === undefined) ctx.sceneHeights.set(m.screen, m.sceneH);
  else if (Math.abs(seen - m.sceneH) > 1) fail('R4 scene', `height ${m.sceneH} differs from ${seen} on an earlier beat`);
  if (!view.mobile && m.docW < m.innerW) fail('R5 width', `document ${m.docW} narrower than viewport ${m.innerW}`);
  if (m.sliced) fail('R6 sliced', `${m.sliced} card(s) cut by the top edge`);
  for (const o of m.overlays) fail('F1 overlay', o);
  const opened = ctx.lastScreen !== m.screen;
  ctx.lastScreen = m.screen;
  if (opened && ctx.forward) {
    if (!m.firstLine) fail('F2 first line', 'no [data-first] element');
    else if (!m.firstLine.inside) fail('F2 first line', `first line ${m.firstLine.top}..${m.firstLine.bottom} outside visible ${top}..${bottom}`);
  }
  if (m.screen === 'demo' && Number(m.beat) >= 1) {
    for (const t of m.trio) if (!t.inside) fail('F3 demo', `${t.k} not fully visible`);
  }
  for (const w of m.wrapped) fail('F4 footer', `"${w}" wraps`);
  if (m.backLeft !== null) ctx.backLefts.add(m.backLeft);
  // G1, G3
  for (const [where, z] of Object.entries(m.zones)) {
    if (!z.solid) fail('G1 footer', `footer background not solid (${z.bg})`);
    for (const t of z.cut) fail('G1 footer', `${where}: "${t}" cut by the footer edge`);
    for (const t of z.over) fail('G1 footer', `${where}: "${t}" inside the footer box`);
  }
  // G6
  for (const gap of m.emptyGaps) fail('G6 dividers', `two dividers ${gap}px apart with nothing between`);
  // G2
  if (!m.titleWhole) fail('G2 title', 'title or lead not fully visible');
  // G4
  for (const t of m.strayPrimaries) fail('G4 footer actions', `filled primary "${t}" outside the footer`);
  if (m.primaryFlush === false) fail('G4 footer actions', 'primary not flush with the column edge');
  if (m.backElsewhere) fail('G4 footer actions', 'Back outside the footer');
  if (m.screen !== 'promise' && !m.backInFooter) fail('G4 footer actions', 'no Back in the footer');
  // G5 and F7 inputs, judged after the walk
  const s = ctx.screens.get(m.screen) ?? { tallest: 0, sceneH: m.sceneH, room: m.room, firstTops: new Set() };
  s.tallest = Math.max(s.tallest, m.contentH);
  // F7 compares beats: the first observation of each beat, not later states of the same
  // beat (a form's preview appearing is not a beat).
  s.seenBeats ??= new Set();
  if (m.firstTop !== null && !s.seenBeats.has(m.beat)) s.firstTops.add(m.firstTop);
  s.seenBeats.add(m.beat);
  ctx.screens.set(m.screen, s);
  if (m.primaryRight !== null) ctx.primaryRights.add(m.primaryRight);
}

async function run(browser, view, pass) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    isMobile: view.mobile,
    hasTouch: view.mobile,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ctx = { sceneHeights: new Map(), lastScreen: null, forward: true, backLefts: new Set(), primaryRights: new Set(), screens: new Map() };
  const at = async (label, forward = true) => {
    ctx.forward = forward;
    await page.mouse.move(0, 0);
    await page.waitForTimeout(SETTLE);
    const m = await measure(page);
    if (pass === 'ends') {
      m.zones = await zones(page);
      judgeEnds(view, label, m);
      return;
    }
    m.zones = { rest: await zone(page) };
    judge(view, label, m, ctx);
  };
  const click = (name) => page.getByRole('button', { name, exact: true }).click();
  try {
    await walk(page, at, click);
  } catch (error) {
    // A step the page would not let a visitor take (a covered button, a missing control)
    // is a failure too, recorded with every rule violation found before it.
    failures.push(`${view.name} walk aborted: ${String(error).split('\n')[0]}`);
  }
  if (pass === 'ends') {
    if (errors.length) failures.push(`${view.name} page errors: ${errors.join(' | ')}`);
    await context.close();
    return;
  }
  // G5: on phones, each band screen's scene is the largest size that fits its tallest beat.
  const HERO = new Set(['promise', 'story']);
  const NONE = new Set(['mirror', 'work-yes', 'room-elsewhere']);
  const PAD = 28; // the panel content's padding, pt-3 plus pb-4
  const STRIP = 72;
  const band = Math.min(220, Math.max(96, 0.22 * view.height));
  if (view.mobile) {
    for (const [screen, s] of ctx.screens) {
      if (HERO.has(screen) || NONE.has(screen)) continue;
      const need = s.tallest + PAD;
      if (s.sceneH < 1 && need + STRIP <= s.room) failures.push(`${view.name} G5 scene: ${screen} has no scene, but its tallest beat (${s.tallest}px) plus the ${STRIP}px strip fits in ${s.room}px`);
      if (Math.abs(s.sceneH - STRIP) <= 1 && need + band <= s.room) failures.push(`${view.name} G5 scene: ${screen} shows the strip, but the ${Math.round(band)}px band fits`);
    }
  } else {
    for (const [screen, s] of ctx.screens) {
      if (s.firstTops.size > 1) failures.push(`${view.name} F7 anchor: ${screen} first element moves between beats: ${[...s.firstTops].join(', ')}`);
    }
  }
  if (ctx.backLefts.size > 1) failures.push(`${view.name} F5 slots: Back's left edge varies: ${[...ctx.backLefts].join(', ')}`);
  if (ctx.primaryRights.size > 1) failures.push(`${view.name} F5 slots: primary's right edge varies: ${[...ctx.primaryRights].join(', ')}`);
  if (errors.length) failures.push(`${view.name} page errors: ${errors.join(' | ')}`);
  await context.close();
}

async function walk(page, at, click) {
  const hasNext = async () => (await page.getByRole('button', { name: 'Next', exact: true }).count()) > 0;
  const where = () => page.evaluate(() => {
    const m = document.querySelector('main[data-screen]');
    return `${m.dataset.screen}:${m.dataset.beat}`;
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await at('start');
  for (let guard = 0; guard < 40 && (await hasNext()); guard++) {
    const pos = await where();
    const link = page.getByRole('button', { name: 'Try it on something of your own with an AI rehearsal' });
    if (pos === 'demo:2') {
      await click('7');
      await at('guessed');
      continue;
    }
    if (pos === 'demo:5' && (await link.count())) {
      await link.click();
      await at('mirror');
      await page.locator('textarea').first().fill('When I say the plan is fine, I mean I stopped arguing.');
      await click('Explain it back');
      await at('mirror result');
      await click('Continue');
      await at('back from mirror');
      continue;
    }
    await click('Next');
    await at('next');
  }
  await click('Use it on a stuck conversation at work');
  await at('work');
  await click('Yes, I can');
  await at('pilot form');
  await page.locator('textarea').first().fill('A planning meeting nobody believes in');
  await click('Preview what would be sent');
  await at('pilot preview');
  await click('Back');
  await at('work again', false);
  await click('No, someone else would');
  await at('forward invite');
  await click('Back');
  await click('Back');
  await at('fork again', false);
  await click('Try it with one person you know');
  await at('one');
  await click('Back');
  await click('Join a group event');
  await at('room');
  // "Yes, show me the next event" leaves the page for the events list: check its target.
  const eventsHref = await page.getByRole('link', { name: 'Yes, show me the next event', exact: true }).getAttribute('href');
  if (eventsHref !== '/events') failures.push(`room: "Yes, show me the next event" links to ${eventsHref}, not /events`);
  await click('No, I am somewhere else');
  await at('room elsewhere form');
  await page.locator('input[type=email]').fill('someone@example.com');
  await click('Preview what would be sent');
  await at('room elsewhere preview');
  await click('Back');
  await click('Back');
  await at('fork again', false);
  await click('Watch or read first');
  await at('examples');
}

const browser = await chromium.launch();
try {
  for (const v of VIEWS) {
    await run(browser, v, 'rest');
    await run(browser, v, 'ends');
  }
} finally {
  await browser.close();
}
console.log(`fit: ${checks} states checked, ${failures.length} failure(s)`);
for (const f of failures) console.log('  FAIL ' + f);
process.exit(failures.length ? 1 : 0);
