/**
 * P1652 review fixes (items 8, 9): the shared parser refuses look-alike, invisible and numeric hosts, links nothing glued to a non-ASCII letter,
 * keeps wrapping punctuation out of the address, and ownAppPath never returns a protocol-relative path. Every refusal has a control that links.
 */
import { describe, it, expect } from 'vitest';
import { scanChat, scanUrls } from '@/app/utils/link-scan';
import { ownAppPath } from '@/app/pages/chat/chat-link-targets';

const chat = (t: string) => scanChat(t).filter((s) => s.type === 'link').map((s) => (s.type === 'link' ? s.text : ''));
const story = (t: string) => scanUrls(t).filter((s) => s.type === 'link').map((s) => (s.type === 'link' ? s.text : ''));
const both = (t: string) => ({ chat: chat(t), story: story(t) });

describe('item 8: the raw host text must be plain ASCII', () => {
  it.each([
    ['long s', 'https://ſacebook.com'],
    ['long s, www', 'www.ſacebook.com'],
    ['full-width letter', 'https://ｅvil.com'],
    ['ideographic full stop', 'https://evil。com'],
    ['zero-width space in host', 'https://exa​mple.com'],
    ['Cyrillic', 'https://аpple.com'],
  ])('refuses %s in both modes', (_n, text) => {
    expect(both(text)).toEqual({ chat: [], story: [] });
  });
  it('control: the plain ASCII spellings link', () => {
    expect(both('https://sacebook.com').chat).toEqual(['https://sacebook.com']);
    expect(both('https://evil.com').story).toEqual(['https://evil.com']);
    expect(chat('www.example.com')).toEqual(['www.example.com']);
  });
});

describe('item 8: control and format characters anywhere refuse the link', () => {
  it.each([
    ['right-to-left override in the path', 'https://evil.com/‮moc.elgoog'],
    ['isolate in the path', 'https://evil.com/⁦x'],
    ['zero-width space in the path', 'https://evil.com/a​b'],
    ['soft hyphen in the path', 'https://evil.com/a­b'],
    ['control character in the path', 'https://evil.com/\u0000'],
  ])('refuses %s', (_n, text) => {
    expect(both(text).chat).toEqual([]);
    expect(both(text).story).toEqual([]);
  });
  it('control: the same address without the character links', () => {
    expect(both('https://evil.com/moc.elgoog')).toEqual({ chat: ['https://evil.com/moc.elgoog'], story: ['https://evil.com/moc.elgoog'] });
  });
  it('an override directly before an address links nothing', () => {
    expect(chat('‮https://moc.live')).toEqual([]);
  });
});

describe('item 8: numeric hosts', () => {
  it.each(['http://2130706433', 'http://0x7f.1', 'http://127.1', 'http://0177.0.0.1/x'])('refuses %s', (text) => {
    expect(both(text)).toEqual({ chat: [], story: [] });
  });
  it('a dotted IPv4 host links only when the visible text is the host', () => {
    expect(chat('http://1.1.1.1')).toEqual(['http://1.1.1.1']);
    expect(chat('https://1.1.1.1/')).toEqual(['https://1.1.1.1/']);
    expect(chat('https://1.1.1.1/admin')).toEqual([]);
    expect(story('https://1.1.1.1/admin')).toEqual([]);
  });
});

describe('item 9: a bare domain glued to a non-ASCII letter links nothing, in both modes', () => {
  it.each(['аpple.com', 'bücher.de', 'café.com'])('%s', (text) => {
    expect(both(text)).toEqual({ chat: [], story: [] });
  });
  it('control: ASCII neighbours still link', () => {
    expect(both('apple.com').story).toEqual(['apple.com']);
    expect(both('see apple.com').chat).toEqual(['apple.com']);
  });
});

describe('item 9: wrapping punctuation is not part of the address', () => {
  it.each([
    ['"https://a.com"', 'https://a.com'],
    ["https://a.com'", 'https://a.com'],
    ['[https://a.com]', 'https://a.com'],
    ['{https://a.com}', 'https://a.com'],
    ['“https://a.com”', 'https://a.com'],
  ])('%s', (text, link) => {
    expect(both(text)).toEqual({ chat: [link], story: [link] });
  });
  it('control: punctuation inside a path stays', () => {
    expect(chat('https://a.com/x\'s')).toEqual(["https://a.com/x's"]);
  });
});

describe('item 9: ownAppPath', () => {
  const origin = 'https://claritypledge.com';
  it('returns null for a protocol-relative or backslash path, so it is treated as external', () => {
    expect(ownAppPath('https://claritypledge.com//evil.com', origin)).toBeNull();
    expect(ownAppPath('https://claritypledge.com/\\evil.com', origin)).toBeNull();
    expect(ownAppPath('https://claritypledge.com///evil.com/x', origin)).toBeNull();
  });
  it('control: ordinary paths are still own-app', () => {
    expect(ownAppPath('https://claritypledge.com/story/1?a=b#c', origin)).toBe('/story/1?a=b#c');
    expect(ownAppPath('https://claritypledge.com', origin)).toBe('/');
  });
});
