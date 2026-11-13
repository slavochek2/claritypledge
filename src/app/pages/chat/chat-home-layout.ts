/**
 * @file chat-home-layout.ts
 * @description The Home page's pane rules (pure), moved out of ChatHomePage: which of the list and the conversation show, and whether the
 * conversation counts as seen. Below lg an open panel hides the conversation behind it, and below xl the Mirror does (P1631, AC 137): what is hidden
 * has not been seen.
 */
export interface HomeLayoutInput {
  conversationOpen: boolean;
  /** A thread, the Mirror or "Points in this chat" is open beside the conversation. */
  showThread: boolean;
  /** The Mirror's Clarify thread is open (or a Mirror-chat thread whose root type is not known yet). */
  clarifyOpen: boolean;
  wide: boolean;
  isDesktop: boolean;
}

export function homeLayout({ conversationOpen, showThread, clarifyOpen, wide, isDesktop }: HomeLayoutInput) {
  const conversationVisible = !showThread || (clarifyOpen ? wide : isDesktop);
  const listClass = !conversationOpen ? 'flex' : showThread ? 'hidden 2xl:flex' : 'hidden lg:flex';
  const paneClass = !conversationOpen ? 'hidden lg:flex' : clarifyOpen ? 'hidden xl:flex' : showThread ? 'hidden lg:flex' : 'flex';
  return { conversationVisible, listClass, paneClass };
}
