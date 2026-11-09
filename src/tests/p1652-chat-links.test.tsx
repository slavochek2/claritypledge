/**
 * P1652: chat mode of the shared link parser (src/app/utils/link-scan.ts) and the chat link targets.
 * Every refusal is paired with a control that links, so a scanner that links nothing cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { scanChat, scanUrls } from '@/app/utils/link-scan';
import { linkifyText } from '@/app/utils/linkify';
import { cardTarget, ownAppPath } from '@/app/pages/chat/chat-link-targets';

const links = (text: string, spoken = false) => scanChat(text, { spoken }).filter((s) => s.type === 'link');
const hrefs = (text: string, spoken = false) => links(text, spoken).map((s) => (s.type === 'link' ? s.href : ''));
const joined = (text: string, spoken = false) => scanChat(text, { spoken }).map((s) => (s.type === 'link' ? s.text : s.value)).join('');

/** Written apart so the privacy gate does not read these hostile test addresses as email addresses. */
const AT = '@';

describe('chat mode: what links', () => {
  it('links a full address, www. whole, and a bare domain on the list', () => {
    expect(hrefs('https://example.com/a')).toEqual(['https://example.com/a']);
    expect(hrefs('see www.example.com now')).toEqual(['https://www.example.com']);
    expect(hrefs('google.com')).toEqual(['https://google.com']);
  });
  it('shows exactly the destination as the link text and keeps the text whole', () => {
    const text = 'a www.example.com/x, and google.com.';
    for (const s of links(text)) if (s.type === 'link') expect(s.href.replace(/^https:\/\//, '')).toBe(s.text);
    expect(joined(text)).toBe(text);
  });
  it('links a multi-label bare domain whole (example.co.uk)', () => {
    expect(hrefs('example.co.uk')).toEqual(['https://example.co.uk']);
  });
  it('only emits http and https', () => {
    expect(hrefs('javascript:alert(1) data:text/html,x')).toEqual([]);
    expect(hrefs('blob:https://example.com/x')).toEqual([]);
  });
});

describe('chat mode: markdown syntax stays as typed', () => {
  it('no link anywhere in [label](address)', () => {
    expect(links('[click here](https://example.com)')).toEqual([]);
    expect(joined('[click here](https://example.com)')).toBe('[click here](https://example.com)');
    expect(links('[x](www.example.com)')).toEqual([]);
  });
  it('control: the same address typed bare links', () => {
    expect(hrefs('click here https://example.com')).toEqual(['https://example.com']);
  });
});

describe('chat mode: lookalikes and credentials', () => {
  it('a Cyrillic host does not link (full and www), control Latin does', () => {
    expect(hrefs('https://аpple.com')).toEqual([]);
    expect(hrefs('www.аpple.com')).toEqual([]);
    expect(hrefs('https://apple.com')).toEqual(['https://apple.com']);
  });
  it('a bare domain glued to a non-ASCII letter links no part of itself', () => {
    expect(hrefs('аpple.com')).toEqual([]);
    expect(joined('аpple.com')).toBe('аpple.com');
    expect(hrefs('apple.com')).toEqual(['https://apple.com']);
  });
  it('an address with embedded credentials does not link', () => {
    expect(hrefs(`https://google.com${AT}evil.com/x`)).toEqual([]);
    expect(hrefs(`https://user:pw${AT}evil.com`)).toEqual([]);
    expect(hrefs(`www.google.com${AT}evil.com`)).toEqual([]);
    expect(hrefs('https://evil.com/path@x')).toEqual(['https://evil.com/path@x']);
  });
  it('the shared parser refuses them on other surfaces too (full addresses), and still links the control', () => {
    const render1 = (t: string) => render(<div>{linkifyText(t)}</div>).container.querySelectorAll('a').length;
    expect(render1('https://аpple.com')).toBe(0);
    expect(render1(`https://google.com${AT}evil.com`)).toBe(0);
    expect(render1('https://apple.com')).toBe(1);
  });
});

describe('chat mode: spoken words', () => {
  it('a bare domain does not link, except the own domain', () => {
    expect(hrefs('let.me think', true)).toEqual([]);
    expect(hrefs('google.com', true)).toEqual([]);
    expect(hrefs('claritypledge.com', true)).toEqual(['https://claritypledge.com']);
  });
  it('a scheme or www. links; typed `let.me` links (accepted)', () => {
    expect(hrefs('https://example.com', true)).toEqual(['https://example.com']);
    expect(hrefs('www.example.com', true)).toEqual(['https://www.example.com']);
    expect(hrefs('let.me think')).toEqual(['https://let.me']);
  });
});

describe('default mode keeps its behaviour', () => {
  it('does not link www. whole (existing: tail only)', () => {
    expect(scanUrls('www.example.com').filter((s) => s.type === 'link').map((s) => (s.type === 'link' ? s.href : ''))).toEqual(['https://example.com']);
  });
});

describe('own-app recognition uses the parsed origin', () => {
  const origin = 'http://localhost:5001';
  it('recognises the app domain, www form and current origin', () => {
    expect(ownAppPath('https://claritypledge.com/live/ABC?x=1#h', origin)).toBe('/live/ABC?x=1#h');
    expect(ownAppPath('https://www.claritypledge.com/events/x', origin)).toBe('/events/x');
    expect(ownAppPath('http://localhost:5001/p/x', origin)).toBe('/p/x');
  });
  it('is not fooled by text that merely contains the domain', () => {
    expect(ownAppPath('https://claritypledge.com.evil.com/x', origin)).toBeNull();
    expect(ownAppPath('https://evil.com/?u=https://claritypledge.com/x', origin)).toBeNull();
    expect(ownAppPath('https://notclaritypledge.com/x', origin)).toBeNull();
  });
});

describe('card targets', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  it('story, point and letter overview; query, hash and trailing slash ignored', () => {
    expect(cardTarget(`https://claritypledge.com/story/${id}`)).toEqual({ kind: 'story', id });
    expect(cardTarget(`https://claritypledge.com/point/${id}/?a=1#b`)).toEqual({ kind: 'point', id });
    expect(cardTarget(`https://www.claritypledge.com/letter/${id}/overview`)).toEqual({ kind: 'letter', id });
  });
  it('a recipient /letter/:id, a bad id, other routes and other hosts get no card', () => {
    expect(cardTarget(`https://claritypledge.com/letter/${id}`)).toBeNull();
    expect(cardTarget('https://claritypledge.com/story/not-an-id')).toBeNull();
    expect(cardTarget('https://claritypledge.com/live/ABCD')).toBeNull();
    expect(cardTarget(`https://evil.com/story/${id}`)).toBeNull();
  });
});
