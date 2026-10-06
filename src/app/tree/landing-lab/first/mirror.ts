/**
 * Screen 5, the mirror: an AI rehearsal of one part of the practice. The visitor writes a
 * sentence or two, the mirror explains the meaning back, the visitor rates it.
 *
 * NOT CONNECTED. `explainBack` is the one seam the page talks to, and in this build it
 * always rejects with `MirrorNotConnected`. Connecting it is a separate step that needs
 * the founder's approval of the model, the key handling, the limits, and the wording of
 * what happens to the visitor's text. Until then the link to this screen is hidden unless
 * `MIRROR_CONNECTED` is true or the address carries `?mirror=preview`.
 */

/** Flip only when a real endpoint sits behind `explainBack`. */
export const MIRROR_CONNECTED = false;

/** Three explain-backs at most, the first one included. */
export const MAX_ATTEMPTS = 3;

export class MirrorNotConnected extends Error {
  readonly name = "MirrorNotConnected";
  constructor() {
    super("The mirror has no endpoint in this build.");
  }
}

/**
 * Returns the mirror's explain-back of `text`. `feedback` is the visitor's note on what
 * the previous attempt missed. The mirror never scores, praises, advises, agrees or
 * disagrees; it only restates the meaning.
 */
export function explainBack(text: string, feedback?: string): Promise<string> {
  void text;
  void feedback;
  return Promise.reject(new MirrorNotConnected());
}

/** Whether the link to the mirror is rendered under the demonstration. */
export function mirrorLinkVisible(search: string, connected: boolean = MIRROR_CONNECTED): boolean {
  if (connected) return true;
  return new URLSearchParams(search).get("mirror") === "preview";
}

/** Another attempt is offered only below 10 and while attempts remain. */
export function canRetry(attemptsMade: number, lastRating: number): boolean {
  return lastRating < 10 && attemptsMade < MAX_ATTEMPTS;
}
