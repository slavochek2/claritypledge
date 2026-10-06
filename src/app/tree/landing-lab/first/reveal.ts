/**
 * Scrolling the text panel so the newest beat is in view.
 *
 * The visible area of the panel is its box minus a sticky header at the top (screen 4)
 * and minus the panel's bottom padding, which is the room the bottom bar overlays. After
 * every change the last `[data-newest]` element is brought fully into that area. If it is
 * taller than the area, its top edge is placed at the top of the area. Then no
 * `[data-card]` may be left sliced by the top edge: the panel moves to show that card
 * whole if the newest still fits, else past it. Moving past it can need more scroll room
 * than the content has (the newest card is the last thing on the page); then a spacer at
 * the end of the content, `[data-spacer]`, grows by the difference.
 */

const MARGIN = 4;

interface Box {
  top: number;
  bottom: number;
}

/** An element's box in the panel's scroll coordinates. */
function boxIn(scroller: HTMLElement, el: Element): Box {
  const s = scroller.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - s.top + scroller.scrollTop;
  return { top, bottom: top + r.height };
}

export interface VisibleArea {
  /** Space pinned at the top by a sticky header, in px. */
  stickyTop: number;
  /** Space covered at the bottom by the bar, in px. */
  barBottom: number;
}

export function visibleArea(scroller: HTMLElement): VisibleArea {
  const sticky = scroller.querySelector<HTMLElement>("[data-sticky]");
  const pad = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
  return { stickyTop: sticky ? sticky.offsetHeight : 0, barBottom: pad };
}

/**
 * The scrollTop that shows `newest` whole below the sticky header and above the bar, or
 * its top edge at the top when it cannot fit. Pure arithmetic, exported for testing.
 * The result may exceed `maxScroll` only to move past a card that would be sliced; the
 * caller then extends the scroll range.
 */
export function targetScroll(
  current: number,
  viewHeight: number,
  area: VisibleArea,
  newest: Box,
  cards: Box[],
  maxScroll: number,
): number {
  const viewTop = (t: number) => t + area.stickyTop;
  const viewBottom = (t: number) => t + viewHeight - area.barBottom;
  const room = viewHeight - area.stickyTop - area.barBottom - 2 * MARGIN;
  const height = newest.bottom - newest.top;

  let t = current;
  if (height > room) t = newest.top - area.stickyTop - MARGIN;
  else if (newest.bottom > viewBottom(t) - MARGIN) t = newest.bottom - viewHeight + area.barBottom + MARGIN;
  else if (newest.top < viewTop(t) + MARGIN) t = newest.top - area.stickyTop - MARGIN;
  t = Math.min(maxScroll, Math.max(0, t));

  const fits = (s: number) =>
    newest.top >= viewTop(s) - 0.5 && (height > room || newest.bottom <= viewBottom(s) + 0.5);
  for (const card of cards) {
    const edge = viewTop(t);
    const sliced = card.top < edge - 0.5 && card.bottom > edge + 0.5;
    if (!sliced || card.bottom > newest.bottom) continue;
    const showWhole = Math.max(0, card.top - area.stickyTop - MARGIN);
    const skipPast = card.bottom + MARGIN - area.stickyTop;
    if (fits(showWhole)) t = showWhole;
    else if (fits(skipPast)) t = skipPast;
  }
  return t;
}

export function revealNewest(scroller: HTMLElement): void {
  const spacer = scroller.querySelector<HTMLElement>("[data-spacer]");
  if (spacer) spacer.style.height = "0px";
  const all = scroller.querySelectorAll("[data-newest]");
  const newest = all[all.length - 1];
  if (!newest) return;
  const area = visibleArea(scroller);
  const cards = [...scroller.querySelectorAll("[data-card]")]
    .filter((c) => !c.contains(newest) && !newest.contains(c))
    .map((c) => boxIn(scroller, c));
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const t = targetScroll(scroller.scrollTop, scroller.clientHeight, area, boxIn(scroller, newest), cards, maxScroll);
  if (t > maxScroll && spacer) spacer.style.height = `${Math.ceil(t - maxScroll)}px`;
  if (Math.abs(t - scroller.scrollTop) > 0.5) scroller.scrollTop = t;
}

/** Whether there is content above or below what the panel shows. */
export function scrollEdges(scroller: HTMLElement): { above: boolean; below: boolean } {
  const max = scroller.scrollHeight - scroller.clientHeight;
  return { above: scroller.scrollTop > 1, below: max - scroller.scrollTop > 1 };
}

/**
 * The panel's bottom edge may not cut through a line of text or a control. Given the
 * boxes of every line and control (panel coordinates) and the natural bottom edge, returns
 * how far to raise the edge so it falls in the gap above the first thing it would cut.
 * The raised part shows the solid page colour. Returns 0 when nothing is cut, and 0 when
 * raising would take more than `limit` px (then the content is taller than a line gap
 * allows, and scrolling is the honest answer). Pure, exported for testing.
 */
export function bottomCut(items: Box[], edge: number, limit = 72): number {
  let e = edge;
  for (let i = 0; i < 20; i++) {
    const cut = items.filter((b) => b.top < e - 0.5 && b.bottom > e + 0.5);
    if (cut.length === 0) return Math.max(0, Math.round((edge - e) * 10) / 10);
    e = Math.min(...cut.map((b) => b.top)) - 1;
    if (edge - e > limit) return 0;
  }
  return 0;
}

/** Every text line and control inside the panel, in the panel's viewport coordinates. */
export function lineBoxes(scroller: HTMLElement): Box[] {
  const boxes: Box[] = [];
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) boxes.push({ top: r.top, bottom: r.bottom });
  }
  for (const el of scroller.querySelectorAll("button, a, input, select, textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) boxes.push({ top: r.top, bottom: r.bottom });
  }
  return boxes;
}
