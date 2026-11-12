/**
 * @file use-capture-banner-height.ts
 * @description The running recording banner is sticky at the top of the page content (room-capture-bar's slot). A canvas header that sticks under it must start
 * below it, or it scrolls half-hidden under the banner. This reads the slot's height as a CSS length for `calc()`: `0px` while no banner shows.
 * The slot is a direct child of the layout's `<main>` and mounts and unmounts as a recording starts and stops (it is not always there), so only `<main>`'s own
 * children are watched (childList, no subtree); the slot itself is watched for its height. The event room needs no such read (room-head-offset.ts).
 */
import { useEffect, useState } from 'react';

const SLOT = '[data-testid="room-capture-slot"]';

/** The slot's height as a CSS length for `calc()`; re-read when the banner appears, goes, or changes height. */
export function useCaptureBannerHeight(): string {
  const [px, setPx] = useState(0);
  useEffect(() => {
    const parent = document.querySelector('main') ?? document.body;
    let watched: Element | null = null;
    const read = () => setPx(Math.round(watched?.getBoundingClientRect().height ?? 0));
    const resizer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    const find = () => {
      const slot = parent.querySelector(`:scope > ${SLOT}`);
      if (slot === watched) return;
      if (watched) resizer?.unobserve(watched);
      watched = slot;
      if (slot) resizer?.observe(slot);
      read();
    };
    find();
    const mutations = new MutationObserver(find);
    mutations.observe(parent, { childList: true });
    return () => { mutations.disconnect(); resizer?.disconnect(); };
  }, []);
  return `${px}px`;
}
