/**
 * @file ChatLinks.tsx
 * @description P1652: a message's words with their addresses made tappable. The scanner is the shared one (link-scan.ts) in chat mode: the
 * visible text of a link is always its real destination, markdown link syntax stays as typed, and only http and https are emitted.
 * Own-app addresses go through the router in the same tab (Back returns to the chat); every other address opens a new tab.
 * Nothing here changes what is stored: links are worked out while drawing. A tap on a link does not open the message toolbar
 * (MessageRow ignores taps on anchors).
 */
import { Fragment, useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeLinkHref } from '@/app/prototypes/events/location-utils';
import { scanChat } from '@/app/utils/link-scan';
import { ownAppPath } from './chat-link-targets';

/** dir + unicode-bidi isolate: an address's own direction never reorders the words around it. */
const LINK = 'text-blue-600 underline underline-offset-2 hover:text-blue-700 break-words [unicode-bidi:isolate]';

function ChatLink({ href, text }: { href: string; text: string }) {
  const navigate = useNavigate();
  const safe = safeLinkHref(href);
  if (!safe) return <>{text}</>;
  const own = ownAppPath(safe);
  if (own) {
    const go = (e: MouseEvent<HTMLAnchorElement>) => {
      // A modified click (new tab, new window) keeps the browser's own behaviour.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(own);
    };
    return <a href={safe} dir="ltr" onClick={go} className={LINK}>{text}</a>;
  }
  return <a href={safe} dir="ltr" target="_blank" rel="noopener noreferrer" className={LINK}>{text}</a>;
}

/** `spoken`: transcriptions and voice transcripts (a bare domain links only on the app's own domain). */
export function ChatWords({ text, spoken = false }: { text: string; spoken?: boolean }) {
  const segments = useMemo(() => scanChat(text, { spoken }), [text, spoken]);
  return (
    <>
      {segments.map((s, i) => (s.type === 'text' ? <Fragment key={i}>{s.value}</Fragment> : <ChatLink key={i} href={s.href} text={s.text} />))}
    </>
  );
}
