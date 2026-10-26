/**
 * @file canvas-copy-address.ts
 * @description P1515: the address "Copy link" copies for a canvas. While the canvas is open to anyone with the link, the
 * address carries the link token in its FRAGMENT (`#k=`, never sent to a server). If the token is not known there is NO
 * address to copy: a tokenless address would not open the canvas for the people it is sent to. A restricted canvas copies
 * the plain address. One home for the rule, read by the share panel and by the Artifacts row.
 */
export function canvasCopyAddress(link: string, generalAccess: 'restricted' | 'link', linkToken: string | null | undefined): string | null {
  if (generalAccess !== 'link') return link;
  return linkToken ? `${link}#k=${linkToken}` : null;
}
