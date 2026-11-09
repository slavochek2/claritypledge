/**
 * @file p1650-share-options.test.ts
 * @description P1650 review fixes: the people rows of the Share field across the 2-to-3 character transition.
 *   - while a searchable query has no answer yet, the preloaded people that match stay on screen (no blank, no flash)
 *   - once the server answers, its people come first, and a loaded person who matches is still shown if it left them out
 *   - the client narrows the way the server matches: whole-name prefix, any-word prefix, handle prefix (never a substring)
 * Each "not shown" has a control showing the same call for the person who must be shown.
 */
import { describe, it, expect } from 'vitest';
import type { ProfileSearchResult } from '@/app/data/agreements-service';
import { buildOptions } from '@/app/components/canvas/canvas-share-options';

const P = (profileId: string, name: string, slug: string | null): ProfileSearchResult => ({ profileId, name, slug, avatarUrl: null, avatarColor: '#123456', hasPledged: false, isVerified: true });
const ANA = P('p1', 'Ana Maria Lopez', 'ana-lopez');
const JEAN = P('p2', 'Jean-Luc Picard', 'jl');
const SEAN = P('p3', "Sean O'Brien", 'sean');
const PEOPLE = [ANA, JEAN, SEAN];
const NO_TARGETS = { events: [], groups: [] };
const has = () => false;

const rows = (query: string, found: ProfileSearchResult[] = [], hasSearched = false) =>
  buildOptions({ query, people: PEOPLE, found, hasSearched, targets: NO_TARGETS, has }).map(o => o.label);

describe('the 2-to-3 character transition', () => {
  it('two characters narrow the loaded people; the third keeps them while the search has not answered', () => {
    expect(rows('ez')).toEqual([]); // CONTROL: "ez" is a prefix of no word of any name or handle
    expect(rows('ma')).toEqual(['Ana Maria Lopez']);
    expect(rows('mar', [], false)).toEqual(['Ana Maria Lopez']); // 3 characters, no answer yet: not blank
  });

  it('a stale answer for an earlier query is not used until the search has answered THIS query', () => {
    expect(rows('mar', [SEAN], false)).toEqual(['Ana Maria Lopez']);
  });

  it('an empty answer (including the throttled one) still shows a loaded person who matches; CONTROL: one who does not match stays out', () => {
    expect(rows('mar', [], true)).toEqual(['Ana Maria Lopez']);
    expect(rows('zzz', [], true)).toEqual([]);
  });

  it('the server\'s people come first, the matching loaded person follows once, with no duplicate', () => {
    const outsider = P('p9', 'Maria Zed', 'zed');
    expect(rows('mar', [outsider, ANA], true)).toEqual(['Maria Zed', 'Ana Maria Lopez']);
  });
});

describe('the client matches like the server: word or handle prefix, never a substring', () => {
  it('any word of the name, after a space, hyphen or apostrophe', () => {
    expect(rows('lop')).toEqual(['Ana Maria Lopez']);
    expect(rows('luc')).toEqual(['Jean-Luc Picard']);
    expect(rows('brien')).toEqual(["Sean O'Brien"]);
  });
  it('the whole name, with a space', () => {
    expect(rows('ana m')).toEqual(['Ana Maria Lopez']);
  });
  it('a prefix of the unsplit name that starts at its start or right after any separator, so it may span a separator', () => {
    expect(rows("o'brien")).toEqual(["Sean O'Brien"]);
    expect(rows('jean-luc')).toEqual(['Jean-Luc Picard']);
    expect(rows('maria l')).toEqual(['Ana Maria Lopez']);
    expect(rows('luc p')).toEqual(['Jean-Luc Picard']);
    expect(rows('rien')).toEqual([]); // CONTROL: mid-word, after no separator
    expect(rows("n o'")).toEqual([]); // CONTROL: starts mid-word ("Sean O'" has "n" before the space)
  });
  it('a handle prefix', () => {
    expect(rows('jl')).toEqual(['Jean-Luc Picard']);
    expect(rows('ana-')).toEqual(['Ana Maria Lopez']);
  });
  it('NOT a substring inside a word: "ar" is inside "Maria" and "uc" inside "Luc", yet neither is a prefix of any word', () => {
    expect(rows('ar')).toEqual([]);
    expect(rows('uc')).toEqual([]);
  });
  it('a query with @ shows no people and an empty field shows them all', () => {
    expect(rows('ana@example.com', [], true)).toEqual([]);
    expect(rows('')).toEqual(['Ana Maria Lopez', 'Jean-Luc Picard', "Sean O'Brien"]);
  });
});
