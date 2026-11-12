/**
 * P1670 — the hero example of the /tree/landing-fable* pages as a picture with no words: people
 * agree, yet they do not mean the same thing. Covered here: that nothing in it is visible text,
 * what a screen reader gets instead, how the data decides each person's shape, the single pass
 * that never loops, and the still final frame under reduced motion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';

// The two environment facts the component reads. jsdom has no layout and one cached media query,
// so both are set per test here; everything else in framer-motion is the real library.
const env = vi.hoisted(() => ({ reduce: false, inView: false }));
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => env.reduce,
  useInView: () => env.inView,
}));

import { AgreedGraphic } from '@/app/tree/landing-lab/fable/fable-agreed';
import { AGREED_DWELL_MS } from '@/app/tree/landing-lab/fable/fable-motion';
import { AGREED_BUILDERS, AGREED_CHANGE, type AgreedExample } from '@/app/tree/landing-lab/fable/fable-content';

const EXAMPLES = [['builders', AGREED_BUILDERS], ['change managers', AGREED_CHANGE]] as const;

const card = () => screen.getByTestId('agreed-graphic');
const figures = () => [...card().querySelectorAll<SVGGElement>('[data-figure]')];
const reveals = () => figures().map((f) => `${f.dataset.figure}: ${f.dataset.reveal}`);
const expected = (example: AgreedExample, seen: boolean) => example.people.map((p) => `${p.name}: ${seen ? 'shown' : 'hidden'}`);
/** The speech bubbles, as "who: how visible". jsdom has no layout, so the opacity framer-motion wrote on the SVG group is what a reader would see. */
const yeses = () => figures().map((f) => `${f.dataset.figure}: ${f.querySelector<SVGGElement>('[data-yes]')!.getAttribute('opacity')}`);
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

/** Every piece of text a sighted reader can see: text nodes outside the screen-reader-only blocks. */
function visibleWords(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const words: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && !node.parentElement?.closest('.sr-only')) words.push(text);
  }
  return words;
}

beforeEach(() => {
  env.reduce = false;
  env.inView = false;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe.each(EXAMPLES)('P1670 hero picture: %s', (_name, example) => {
  it('shows no words at all: no sentence, no names, no count, no per-person lines, no "Illustration"', () => {
    env.reduce = true;
    render(<AgreedGraphic example={example} />);
    expect(visibleWords(card())).toEqual([]);
    expect(card().querySelector('svg text')).toBeNull();
    expect(card().textContent).not.toContain('Illustration');
  });

  it('control: the visible-words check sees text that is not screen-reader-only', () => {
    render(<div data-testid="agreed-graphic"><p className="sr-only">hidden</p><p>{example.people[0]!.did}</p></div>);
    expect(visibleWords(card())).toEqual([example.people[0]!.did]);
  });

  it('gives a screen reader the sentence, who agreed, what each person did and the closing line, each once', () => {
    render(<AgreedGraphic example={example} />);
    const text = card().textContent!;
    const once = (s: string) => text.split(s).length - 1;
    const [agreed, outcomes] = within(card()).getAllByRole('list');
    expect(agreed).toHaveAccessibleName('Who agreed');
    expect(within(agreed!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(example.people.map((p) => p.name));
    expect(within(outcomes!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(example.people.map((p) => `${p.name} ${p.did}`));
    for (const s of [example.said, example.agreed, example.later, example.punchline, ...example.people.map((p) => p.did)]) {
      expect(`${s}: ${once(s)}`).toBe(`${s}: 1`);
    }
    // In story order: the sentence, then who agreed, then what each did, then the closing line.
    const order = [example.said, example.agreed, example.people[0]!.did, example.punchline].map((s) => text.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The closing line names the figure; an aria-label would say it twice.
    expect(card().tagName).toBe('FIGURE');
    expect(card()).not.toHaveAttribute('aria-label');
    expect(card().querySelector('figcaption')?.textContent).toBe(example.punchline);
    // The drawing itself is decoration.
    const drawings = [...card().querySelectorAll('svg')];
    expect(drawings).toHaveLength(1);
    expect(drawings[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws each person once, in order: the same yes for everyone, a different shape in every head', () => {
    env.reduce = true;
    render(<AgreedGraphic example={example} />);
    expect(figures().map((f) => `${f.dataset.figure}: ${f.dataset.outcome}, ${f.dataset.picture}`)).toEqual(example.people.map((p) => `${p.name}: ${p.outcome}, ${p.picture}`));
    // One speech bubble each, and every one is the same markup.
    const said = figures().map((f) => f.querySelectorAll('[data-yes]'));
    expect(said.map((s) => s.length)).toEqual(example.people.map(() => 1));
    expect(new Set(said.map((s) => s[0]!.innerHTML)).size).toBe(1);
    // No two people hold the same shape.
    expect(new Set(figures().map((f) => f.dataset.shape)).size).toBe(example.people.length);
  });

  it('uses only greys and one blue: the yes is the only blue thing, and no banned colour appears', () => {
    env.reduce = true;
    render(<AgreedGraphic example={example} />);
    const markup = card().innerHTML;
    expect(markup).not.toMatch(/green|amber|orange|yellow|purple|#[0-9a-f]{3,8}\b|rgb\(/i);
    const blue = [...card().querySelectorAll('[class*="blue"]')];
    expect(blue).toHaveLength(example.people.length);
    for (const b of blue) {
      expect(b.getAttribute('class')).toBe('text-blue-600');
      expect(b.closest('[data-yes]')).not.toBeNull();
    }
  });

  it('waits off-screen with nobody saying anything, and sets no timer', () => {
    render(<AgreedGraphic example={example} />);
    expect(card().dataset.phase).toBe('reset');
    expect(reveals()).toEqual(expected(example, false));
    expect(yeses()).toEqual(example.people.map((p) => `${p.name}: 0`));
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(card().dataset.phase).toBe('reset');
  });

  it('in view: everyone says yes, then the shapes show, then the final frame is held for good (plays once)', () => {
    env.inView = true;
    render(<AgreedGraphic example={example} />);
    expect(card().dataset.phase).toBe('reset');

    advance(AGREED_DWELL_MS.reset);
    expect(card().dataset.phase).toBe('agree');
    expect(reveals()).toEqual(expected(example, false));

    advance(AGREED_DWELL_MS.agree);
    expect(card().dataset.phase).toBe('later');
    expect(reveals()).toEqual(expected(example, true));

    advance(AGREED_DWELL_MS.later);
    expect(card().dataset.phase).toBe('close');
    expect(reveals()).toEqual(expected(example, true));

    // It never loops: no timer is left, and a minute later the final frame is still up.
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(card().dataset.phase).toBe('close');
    expect(reveals()).toEqual(expected(example, true));
  });

  it('reduced motion: the final frame is there from the first render and nothing is ever scheduled', () => {
    env.reduce = true;
    env.inView = true;
    render(<AgreedGraphic example={example} />);
    expect(card().dataset.phase).toBe('close');
    expect(reveals()).toEqual(expected(example, true));
    expect(yeses()).toEqual(example.people.map((p) => `${p.name}: 1`));
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(card().dataset.phase).toBe('close');
  });
});

describe('P1670 hero picture: the story comes from the data', () => {
  it('every person in each example had something different in mind', () => {
    for (const example of [AGREED_BUILDERS, AGREED_CHANGE]) expect(new Set(example.people.map((p) => p.picture)).size).toBe(example.people.length);
  });

  it('control: two people with the same picture get the same shape, and the others keep their own', () => {
    env.reduce = true;
    const people = AGREED_BUILDERS.people.map((p) => (p.name === 'Sam' ? { ...p, picture: 'steps' as const } : p));
    render(<AgreedGraphic example={{ ...AGREED_BUILDERS, people }} />);
    const shape = (name: string) => figures().find((f) => f.dataset.figure === name)!.dataset.shape;
    expect(shape('Sam')).toBe(shape('Maya'));
    expect(new Set(['Maya', 'Jon', 'Priya'].map(shape)).size).toBe(3);
  });

  it('is unhurried and then still: about three and a half seconds from the first yes, and no dwell after the final frame', () => {
    const play = AGREED_DWELL_MS.agree + AGREED_DWELL_MS.later;
    expect(play).toBeGreaterThanOrEqual(3000);
    expect(play).toBeLessThanOrEqual(6000);
    expect(Object.keys(AGREED_DWELL_MS).sort()).toEqual(['agree', 'later', 'reset']);
  });
});
